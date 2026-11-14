/* MockChat Studio — editor core.

   Every editor module hangs off window.Ed. This file owns the shared state
   (the project, the selection, which tab is open, unsaved changes) and the
   small helpers every other module uses: DOM shortcuts, toasts, modals,
   tooltips, path get/set, and the HTML builders for inspector fields.

   Load order (see index.html): core → fields → preview → messages → scenes →
   people → fit → inspector → files → exports → main. A module may call
   functions from any other module at runtime; it must not at load time. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const S = window.Store, R = window.Renderer;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = R.esc;

  const project = S.defaultProject('whatsapp');

  const E = window.Ed = {
    S, R, T: window.Timeline, $, $$, esc,
    caps: (window.api.capabilities && window.api.capabilities()) || { platform: 'electron', fileSystem: true, showInFolder: true },

    // ---- shared state ----------------------------------------------------
    project,
    selectedId: project.messages[1] ? project.messages[1].id : null,
    tab: 'message',
    templateName: '',
    paths: null,
    dirty: false,
    people: [],

    // filled in by the modules that own them
    renderAll: null, renderList: null, renderInspector: null, renderPreview: null, renderSceneStrip: null
  };

  // ------------------------------------------------------- local settings
  // Per-viewer conveniences only (favourite toolbox items, step view). The
  // work itself never lives here.
  E.pref = {
    get(key, fallback) {
      try { const v = localStorage.getItem('mockchat.' + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('mockchat.' + key, JSON.stringify(value)); } catch (e) {}
    }
  };

  // ------------------------------------------------------------- feedback
  E.toast = function (msg, kind, actionLabel, action) {
    const t = $('#toast');
    t.className = kind === 'err' ? 'err show' : 'show';
    setHTML(t, html`${msg}${(actionLabel ? html`<span class="link" id="toastAct">${actionLabel}</span>` : '')}`);
    if (actionLabel) $('#toastAct').onclick = action;
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.className = ''; }, actionLabel ? 8000 : kind === 'err' ? 6000 : 3200);
  };
  // "Couldn't save the template: browser storage is full …" — one wording for
  // every place that writes to storage, so a failed save is never silent
  E.storageError = function (what, err) {
    const name = err && err.name;
    let why;
    if (name === 'QuotaExceededError') why = 'browser storage is full. Delete some templates, or save a project file (Templates → Save project file…) instead';
    else if (E.caps.platform === 'web') why = 'browser storage is full or blocked (a private window, or site data turned off)';
    else why = String(err && err.message || err);
    E.toast('Couldn’t ' + what + ': ' + why, 'err');
  };
  E.status = function (msg, cls) { const el = $('#statusMain'); el.className = cls || ''; el.textContent = msg; };

  // ---------------------------------------------------------- path access
  // Inspector fields name what they edit with a dotted path: "chat.contactName",
  // "msg.anim.delay" (msg = the selected message), "timeline.pace".
  E.selected = () => E.project.messages.find(m => m.id === E.selectedId) || null;
  E.indexOfSel = () => E.project.messages.findIndex(m => m.id === E.selectedId);

  E.getPath = function (path) {
    const parts = path.split('.');
    let obj = E.project;
    if (parts[0] === 'msg') { obj = E.selected(); parts.shift(); if (!obj) return undefined; }
    for (let i = 0; i < parts.length - 1; i++) { obj = obj && obj[parts[i]]; }
    return obj ? obj[parts[parts.length - 1]] : undefined;
  };
  E.setPath = function (path, value) {
    const parts = path.split('.');
    let obj = E.project;
    if (parts[0] === 'msg') { obj = E.selected(); parts.shift(); if (!obj) return; }
    for (let i = 0; i < parts.length - 1; i++) { obj = obj[parts[i]] = obj[parts[i]] || {}; }
    obj[parts[parts.length - 1]] = value;
    E.dirty = true;
  };

  // ALWAYS go through this to replace the message list — never assign to
  // project.messages directly.
  //
  // project.messages is an ALIAS onto project.scenes[active].messages (see
  // Store.bindScene). Assigning a fresh array to it detaches the alias: the
  // scene still holds the old array, and the very next bindScene — which every
  // preview re-render does — points project.messages straight back at it. That
  // is exactly how a deleted message came back on the next click.
  E.setMessages = function (list) {
    const sc = E.project.scenes[E.project.active];
    const arr = S.resolveScene(E.project, E.project.active).messages || sc.messages;
    arr.length = 0;
    Array.prototype.push.apply(arr, list);
    E.project.messages = arr;
    if (E.selectedId && !arr.some(m => m.id === E.selectedId)) {
      E.selectedId = arr.length ? arr[0].id : null;
    }
  };

  // Swap in a whole new project (template loaded, bundle imported).
  E.setProject = function (proj, name) {
    E.project = proj;
    E.templateName = name || (proj.meta && proj.meta.name) || '';
    E.selectedId = proj.messages.length ? proj.messages[0].id : null;
    E.dirty = false;
  };

  // --------------------------------------------------------------- modals
  E.modal = function (title, bodyHTML, footHTML, opts) {
    opts = opts || {};
    const host = $('#modalHost');
    host.__onClose = null;
    setHTML(host, cat(html`<div class="modal-back d-modal d-modal-open"><div class="modal d-modal-box${(opts.cls ? ' ' + opts.cls : '')}`,
      html`" role="dialog" aria-modal="true" aria-label="${title}"><h3>${title}</h3>`,
      html`<div class="mbody">${bodyHTML}</div>${(footHTML ? html`<div class="mfoot">${footHTML}</div>` : '')}</div></div>`));
    host.querySelector('.modal-back').addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('modal-back') && !opts.sticky) E.closeModal();
    });
    // any [data-close] button closes, so no inline onclick is ever needed
    host.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => E.closeModal()));
    return host;
  };
  E.closeModal = function () {
    const host = $('#modalHost');
    if (host.__onClose) { const f = host.__onClose; host.__onClose = null; try { f(); } catch (e) {} }
    host.innerHTML = '';
  };
  E.modalOpen = () => !!$('#modalHost .modal-back');

  E.askName = function (title, def) {
    return new Promise((resolve) => {
      E.modal(title,
        html`<fieldset class="field d-fieldset"><legend class="d-fieldset-legend">Name</legend><input class="d-input d-input-sm" type="text" id="askInput" value="${def || ''}"></fieldset>`,
        html`<button class="d-btn d-btn-sm" id="askCancel">Cancel</button><button class="d-btn d-btn-sm d-btn-primary" id="askOk">Save</button>`);
      const input = $('#askInput');
      input.focus(); input.select();
      const ok = () => { const v = input.value.trim(); E.closeModal(); resolve(v || null); };
      $('#askOk').onclick = ok;
      $('#askCancel').onclick = () => { E.closeModal(); resolve(null); };
      input.onkeydown = (ev) => { if (ev.key === 'Enter') ok(); if (ev.key === 'Escape') { E.closeModal(); resolve(null); } };
    });
  };

  // A styled yes/no, so a question never stops the page with a browser dialog.
  E.confirm = function (title, text, okLabel, danger) {
    return new Promise((resolve) => {
      E.modal(title, html`<div class="field confirm-text">${text}</div>`,
        cat(html`<button class="d-btn d-btn-sm" id="cfNo">Cancel</button>`,
        html`<button class="d-btn d-btn-sm ${(danger ? 'd-btn-error' : 'd-btn-primary')}" id="cfYes">${okLabel || 'OK'}</button>`));
      const done = (v) => { $('#modalHost').__onClose = null; E.closeModal(); resolve(v); };
      $('#cfYes').onclick = () => done(true);
      $('#cfNo').onclick = () => done(false);
      $('#modalHost').__onClose = () => resolve(false);
      setTimeout(() => { const b = $('#cfYes'); if (b) b.focus(); }, 0);
    });
  };

  // ------------------------------------------------------------- tooltips
  // Anything with data-tip gets a styled tooltip on hover or keyboard focus.
  // Long explanations live here instead of taking up room in the panels.
  (function tooltips() {
    let tipEl = null, timer = null, current = null;
    function show(el) {
      const text = el.getAttribute('data-tip');
      if (!text) return;
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
      }
      tipEl.textContent = text;
      tipEl.classList.add('show');
      const r = el.getBoundingClientRect();
      const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2;
      x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
      let y = r.top - th - 8;
      if (y < 6) y = r.bottom + 8;
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';
    }
    function hide() {
      clearTimeout(timer);
      current = null;
      if (tipEl) tipEl.classList.remove('show');
    }
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el === current) return;
      hide();
      if (!el) return;
      current = el;
      timer = setTimeout(() => show(el), 380);
    });
    document.addEventListener('focusin', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el && el.matches(':focus-visible')) { current = el; show(el); }
    });
    document.addEventListener('focusout', hide);
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('.tip[data-tip]');
      if (!el) return;
      e.preventDefault();               // inside a <label>, don't flip its switch
      current = el;
      show(el);
    });
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('scroll', hide, true);
  })();

  // ------------------------------------------------------------- time text
  // Times are stored in ms but shown and typed in seconds: "0.9s" and "15s"
  // read far better than 900ms and 15000ms.
  E.secText = (ms) => {
    const s = (Number(ms) || 0) / 1000;
    return (Math.round(s * 100) / 100).toString();
  };
  E.secLabel = (ms) => E.secText(ms) + 's';
})();
