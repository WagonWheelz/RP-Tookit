/* Wiring: the global input / click / keyboard handlers that every inspector
   field goes through, the platform and theme switches, dragging the
   watermark, and boot. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, $ = E.$, $$ = E.$$;

  // ------------------------------------------------- one panel at a time
  // Below laptop width the three columns become three panels — Messages,
  // Preview, Edit — switched by the bar at the bottom (css/editor.css,
  // "narrow screens"). On wider screens none of this changes anything.
  const NARROW = window.matchMedia('(max-width: 1023px)');
  E.isNarrow = () => NARROW.matches;
  E.showPane = function (pane) {
    $('#app').dataset.pane = pane;
    $$('#mobileNav [data-pane]').forEach(b => {
      b.classList.toggle('on', b.dataset.pane === pane);
      b.classList.toggle('d-dock-active', b.dataset.pane === pane);
      b.setAttribute('aria-current', b.dataset.pane === pane ? 'page' : 'false');
    });
    // the phone is sized to its panel, which was hidden until now
    if (pane === 'preview') requestAnimationFrame(() => E.applyZoom());
  };
  $$('#mobileNav [data-pane]').forEach(b => b.addEventListener('click', () => E.showPane(b.dataset.pane)));
  NARROW.addEventListener('change', () => requestAnimationFrame(() => E.applyZoom()));
  E.showPane('preview');

  // The editor shows emoji as EmojiOne pictures too (core/emoji.js); the phone
  // inside it paints itself in the project's own set.
  window.Emoji.watch($('#app'), { lazy: true });
  window.Emoji.watch($('#modalHost'), { lazy: true });

  // ------------------------------------------- the editor's own light/dark
  // The sun/moon toggle is a daisyUI theme controller: while it is checked,
  // daisyUI's CSS switches the page to the "mockchat-night" theme. All this
  // does is remember the choice (first visit: follow the device).
  const appTheme = $('#appTheme');
  const savedTheme = E.pref.get('appTheme', null);
  // Dark by default; a choice the user has made before still wins.
  appTheme.checked = savedTheme ? savedTheme === 'night' : true;
  appTheme.addEventListener('change', () => E.pref.set('appTheme', appTheme.checked ? 'night' : 'day'));

  E.renderAll = function () {
    E.renderSceneStrip();
    E.renderAddGrid();
    E.renderList();
    E.renderInspector();
    E.renderPreview();
    syncSegs();
  };

  function syncSegs() {
    const p = E.project;
    $$('#platformSeg button').forEach(b => {
      const on = b.dataset.platform === p.platform;
      b.classList.toggle('on', on);
      b.classList.toggle('d-tab-active', on);
      b.classList.toggle('plat-tt', on && S.isTT(p.platform));
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('#themeSeg button').forEach(b => {
      b.classList.toggle('on', b.dataset.theme === p.theme);
      b.classList.toggle('d-tab-active', b.dataset.theme === p.theme);
      b.setAttribute('aria-selected', b.dataset.theme === p.theme ? 'true' : 'false');
    });
  }

  // Paths under chat that describe the PHONE rather than the conversation —
  // they have to hold still across every scene, or the watermark blinks and the
  // clock jumps as the animation moves from one scene to the next.
  function isSharedChatPath(path) {
    if (!path) return false;
    if (/^chat\.(brand|statusBar)\b/.test(path)) return true;
    const m = /^chat\.([A-Za-z0-9_]+)$/.exec(path);
    return !!m && S.SHARED_CHAT_KEYS.indexOf(m[1]) >= 0;
  }

  // ------------------------------------------------------- field edits
  let previewTimer = null;
  // Typing in a text box redraws the phone a beat later rather than on every
  // keystroke — a long conversation in step view is a lot to lay out.
  const previewSoon = () => { clearTimeout(previewTimer); previewTimer = setTimeout(() => { E.renderPreview(); }, 90); };

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.path) return;
    const p = E.project;
    const path = el.dataset.path;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.secs != null) {
      v = Math.round((parseFloat(el.value) || 0) * 1000);
      if (v < 0) v = 0;
    } else if (el.dataset.num != null) v = parseFloat(el.value);
    else v = el.value;
    if (el.dataset.num != null && isNaN(v)) v = 0;
    if (el.tagName === 'SELECT' && /^exportOpts\.(fps|animFps|animEdge)$/.test(path)) v = parseFloat(v);

    // touching a message's timing takes it off automatic pacing
    if (/^msg\.anim\.(typing|delay)$/.test(path) && p.timeline.autoTiming) {
      const m = E.selected();
      if (m && !m.anim.manual) { m.anim.manual = true; setTimeout(E.renderInspector, 0); }
    }

    // the floating-reaction set is edited as a space-separated line
    if (path === 'chat.tt.floaters.emojisText') {
      const list = S.graphemes(String(v)).filter(g => g.trim() && S.isEmojiChar(g));
      p.chat.tt.floaters.emojis = list.length ? list : ['❤️'];
      E.dirty = true;
      previewSoon();
      return;
    }

    E.setPath(path, v);

    // a device frame also carries its screen size
    if (path === 'chat.device') {
      const d = S.DEVICES.find(x => x.id === v);
      if (d) { p.chat.width = d.w; p.chat.height = d.h; }
    }
    // every scene shares one canvas
    if (/^chat\.(device|width|height)$/.test(path)) S.syncSceneGeometry(p);
    // ...and one phone: the watermark, the clock and how big the UI is drawn
    // must not change halfway through the animation
    if (isSharedChatPath(path)) S.syncSharedChat(p);

    const out = el.parentElement && el.parentElement.querySelector('output');
    if (out && el.type === 'range') out.textContent = el.value + (out.textContent.replace(/^[-\d.]+/, '') || '');

    const refresh = el.dataset.refresh || 'preview';
    if (refresh === 'all') E.renderAll();
    else if (refresh === 'inspector') { E.renderInspector(); E.renderPreview(); }
    else if (el.tagName === 'TEXTAREA' || el.type === 'text') { E.renderList(); previewSoon(); }
    else { E.renderPreview(); E.renderList(); }
  });

  // scene name / watch / hold live outside the data-path system
  document.addEventListener('input', (e) => {
    const el = e.target;
    const sc = E.project.scenes[E.project.active];
    if (!sc || !el.dataset) return;
    if (el.dataset.scenename != null) {
      sc.name = el.value; E.dirty = true; E.renderSceneStrip(); return;
    }
    if (el.dataset.scenehold != null) {
      sc.hold = Math.max(0, Math.round((parseFloat(el.value) || 0) * 1000)); E.dirty = true;
      E.updateDuration(); return;
    }
    if (el.dataset.scenewatch != null) {
      sc.watch = Math.max(0, Math.round((parseFloat(el.value) || 0) * 1000)); E.dirty = true;
      E.renderSceneStrip(); E.updateDuration(); return;
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset) return;
    const sc = E.project.scenes[E.project.active];
    if (sc && el.dataset.scenetrans != null) {
      sc.transition = el.value; E.dirty = true; E.renderSceneStrip(); E.updateDuration(); return;
    }
    // gift presets fill in the name, emoji and coin value together
    if (el.dataset.act === 'giftpreset') {
      const g = S.TT_GIFTS.find(x => x.id === el.value);
      const m = E.selected();
      if (!g || !m) return;
      m.giftName = g.name; m.giftIcon = g.icon; m.giftCoins = String(g.coins);
      E.dirty = true; E.renderAll();
      return;
    }
    // a seconds box shows its tidied value once you leave it ("1.50" → "1.5")
    if (el.dataset.secs != null) el.value = E.secText(E.getPath(el.dataset.path));
    // a width typed as "3" is drawn at the 120px minimum; say so in the box
    if (/^chat\.(width|height)$/.test(el.dataset.path || '')) {
      const val = Number(E.getPath(el.dataset.path)) || 0;
      if (val < 120) { E.setPath(el.dataset.path, 120); S.syncSceneGeometry(E.project); E.renderAll(); }
    }
  });

  // ------------------------------------------------------------- clicks
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const p = E.project;

    // platform / theme
    if (btn.dataset.platform) {
      if (btn.dataset.platform === p.platform) return;
      const was = p.platform;
      p.platform = btn.dataset.platform;
      const nowTT = S.isTT(p.platform), wasTT = S.isTT(was);
      const nowYT = S.isYT && S.isYT(p.platform), wasYT = S.isYT && S.isYT(was);

      // The watch page and the chat families share nothing: no message list,
      // no bubbles, a desktop canvas instead of a phone. Moving across that
      // line reseeds the scenes rather than converting them.
      if (nowYT !== wasYT) {
        p.scenes.forEach(sc => {
          if (sc.ref) { sc.ref = null; return; }
          sc.chat = S.defaultChat(p.platform);
          sc.messages = S.defaultMessages(p.platform);
        });
        p.active = 0;
        p.theme = 'dark';
        E.selectedId = null;
        S.bindScene(p, 0);
        E.tab = nowYT ? 'video' : 'message';
        E.dirty = true; E.renderAll(); return;
      }

      // Platform is project-wide, so EVERY scene has to come along. Converting
      // only the active one leaves the scenes you aren't looking at holding
      // messages of the other family, which render as nonsense.
      p.scenes.forEach(sc => {
        if (sc.ref) return;                     // a revisit borrows its scene's
        sc.messages = S.convertMessages(sc.messages, was, p.platform);
        if (nowTT !== wasTT) {
          // the two families pace very differently; recompute unless hand-tuned
          sc.messages.forEach(m => { if (m.anim) m.anim.manual = false; });
          sc.chat.showHeader = !nowTT;
          sc.chat.showInputBar = !nowTT;
        }
        if (sc.chat.bubbleRadius === (was === 'imessage' ? 18 : 8)) {
          sc.chat.bubbleRadius = p.platform === 'imessage' ? 18 : 8;
        }
        if (sc.chat.inputPlaceholder === (was === 'imessage' ? 'iMessage' : 'Message')) {
          sc.chat.inputPlaceholder = p.platform === 'imessage' ? 'iMessage' : 'Message';
        }
      });
      if (nowTT && !wasTT) p.theme = 'dark';
      // convertMessages hands back new arrays, so re-point the aliases
      S.bindScene(p, p.active);
      if (!p.messages.some(m => m.id === E.selectedId)) {
        E.selectedId = p.messages.length ? p.messages[0].id : null;
      }
      E.dirty = true; E.renderAll(); return;
    }
    if (btn.dataset.theme) { p.theme = btn.dataset.theme; E.dirty = true; E.renderAll(); return; }
    if (btn.dataset.tab) { E.tab = btn.dataset.tab; E.renderInspector(); return; }
    if (btn.dataset.egroup) { E.setEmojiGroup(btn.dataset.egroup); return; }
    if (btn.dataset.emo) { E.insertEmoji(btn.dataset.emo); return; }
    if (btn.dataset.side) { const m = E.selected(); if (m) { m.side = btn.dataset.side; E.dirty = true; E.renderAll(); } return; }
    if (btn.dataset.pov) {
      // It is one phone for the whole animation — the keyboard cannot be up in
      // scene 1 and gone in scene 2 — so POV applies to every scene.
      p.chat.pov = btn.dataset.pov;
      S.syncSharedChat(p);
      if (btn.dataset.pov === 'owner') {
        // outgoing messages that were never given a visible typing time go back
        // on automatic so they get a compose duration for the keyboard
        p.scenes.forEach(sc => {
          if (!sc.messages) return;
          sc.messages.forEach(m => { if (m.side === 'out' && m.anim && !m.anim.typing) m.anim.manual = false; });
        });
      }
      E.dirty = true; E.renderAll(); return;
    }

    const act = btn.dataset.act;
    if (!act || btn.closest('#msgList')) return;      // the list handles its own

    switch (act) {
      case 'import': return E.importInto(btn.dataset.target, btn.dataset.kind);
      case 'fit': return E.openFit(btn.dataset.target, !!btn.dataset.round);
      case 'clearmedia': E.setPath(btn.dataset.target, null); E.renderAll(); return;
      case 'ytsize': {
        // The watch page has one canvas for the whole project, like the phone
        // does — set it in both places so export sizing agrees.
        p.chat.width = Number(btn.dataset.w) || 1280;
        p.chat.height = Number(btn.dataset.h) || 720;
        S.syncSceneGeometry(p);
        E.dirty = true; E.renderAll(); return;
      }
      case 'react': {
        const m = E.selected(); if (!m) return;
        const em = btn.dataset.emoji;
        const i = m.reactions.indexOf(em);
        if (i >= 0) m.reactions.splice(i, 1); else m.reactions.push(em);
        E.dirty = true; E.renderInspector(); E.renderPreview(); return;
      }
      case 'statuschip': {
        const m = E.selected(); if (!m) return;
        m.text = btn.dataset.v;
        E.dirty = true; E.renderInspector(); E.renderList(); E.renderPreview(); return;
      }
      case 'addstatus':
        E.addMessage('status');
        return;
      case 'dupSel': if (E.selectedId) E.duplicateMsg(E.selectedId); return;
      case 'delSel': if (E.selectedId) E.deleteMsg(E.selectedId); return;
      case 'resetColors': p.chat.colors = Object.assign({}, S.PRESETS[p.platform][p.theme]); E.dirty = true; E.renderAll(); return;
      case 'resetSize': {
        const d = S.DEVICES.find(x => x.id === p.chat.device) || S.DEVICES[0];
        p.chat.width = d.w; p.chat.height = d.h;
        // one canvas for the whole animation
        S.syncSceneGeometry(p);
        E.dirty = true; E.renderAll(); E.toast('Screen reset to ' + d.w + ' × ' + d.h); return;
      }
      case 'reauto': { const m = E.selected(); if (m) { m.anim.manual = false; E.dirty = true; E.renderAll(); } return; }
      case 'clearOverrides':
        p.messages.forEach(m => { if (m.anim) m.anim.manual = false; });
        E.dirty = true; E.renderAll(); E.toast('All messages back on automatic timing'); return;
      case 'clearCrop': {
        const c = p.exportOpts.crop;      // in place — the crop dialog holds a reference
        c.top = c.right = c.bottom = c.left = 0;
        E.dirty = true; E.renderInspector(); return;
      }
      case 'preview': return E.openPreview();
      case 'applyDelays':
        p.messages.forEach(m => { m.anim.delay = p.timeline.defaultDelay; });
        E.dirty = true; E.renderAll(); E.toast('Delays applied'); return;
      case 'autoTiming':
        p.messages.forEach(m => {
          const len = (m.text || m.caption || '').length;
          if (m.side === 'in' && ['divider', 'system', 'typing', 'status'].indexOf(m.type) < 0) {
            m.anim.typing = Math.min(4200, 500 + len * 45);
          }
          m.anim.delay = Math.min(3000, 600 + len * 12);
        });
        E.dirty = true; E.renderAll(); E.toast('Timing generated from message length'); return;
      case 'pickperson': return E.openPeople(btn.dataset.slot);
      case 'genstats': return E.generateStats(btn.dataset.which);
      case 'dupscene': return E.addScene(true);
      case 'sceneearlier': return E.moveScene(p.active, p.active - 1);
      case 'scenelater': return E.moveScene(p.active, p.active + 1);
      case 'backscene': return E.openBackTo();
      case 'gotoref': return E.gotoScene(S.sceneRefIndex(p, p.active));
      case 'delscene': return E.deleteScene(p.active);
      case 'wmsnap':
        p.chat.brand.wmX = Number(btn.dataset.x);
        p.chat.brand.wmY = Number(btn.dataset.y);
        S.syncSharedChat(p);
        E.dirty = true; E.renderInspector(); E.renderPreview(); return;
      case 'openFolder': window.api.openFolder(btn.dataset.which); return;
      case 'png': return E.exportPng();
      case 'webm': return E.exportWebm();
      case 'anim': return E.exportAnimated();
    }
  });

  $('#btnClear').onclick = async () => {
    if (!E.project.messages.length) return;
    if (!(await E.confirm('Clear this scene?', 'Remove every message in this scene?', 'Remove all', true))) return;
    E.setMessages([]);
    E.selectedId = null; E.dirty = true; E.renderAll();
  };

  // ------------------------------------------- drag the watermark anywhere
  // Positions live as a percentage of the phone box, so they survive a change
  // of screen size or export resolution.
  (function wmDrag() {
    let drag = null;
    $('#preview').addEventListener('pointerdown', (e) => {
      const wm = e.target.closest('[data-wmdrag]');
      if (!wm) return;
      const phone = wm.closest('.phone');
      if (!phone) return;
      drag = { wm, box: phone.getBoundingClientRect() };
      wm.classList.add('dragging');
      wm.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    $('#preview').addEventListener('pointermove', (e) => {
      if (!drag) return;
      const x = Math.max(0, Math.min(100, ((e.clientX - drag.box.left) / drag.box.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - drag.box.top) / drag.box.height) * 100));
      // move it live rather than re-rendering the whole phone on every frame
      drag.wm.style.left = x + '%';
      drag.wm.style.top = y + '%';
      drag.x = x; drag.y = y;
    });
    const end = () => {
      if (!drag) return;
      drag.wm.classList.remove('dragging');
      if (drag.x != null) {
        E.project.chat.brand.wmX = Math.round(drag.x * 2) / 2;
        E.project.chat.brand.wmY = Math.round(drag.y * 2) / 2;
        S.syncSharedChat(E.project);   // the watermark sits on the phone, not the chat
        E.dirty = true;
        if (E.tab === 'style') E.renderInspector();
      }
      drag = null;
    };
    $('#preview').addEventListener('pointerup', end);
    $('#preview').addEventListener('pointercancel', end);
  })();

  // ------------------------------------------------------------ shortcuts
  document.addEventListener('keydown', (e) => {
    const ae = document.activeElement;
    const typing = ae && (/INPUT|TEXTAREA|SELECT/.test(ae.tagName) || ae.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); E.saveTemplate(); return; }
    // with a dialog open, the keys below belong to the dialog, not the project
    if (E.modalOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); E.closeModal(); }
      return;
    }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); E.openAddModal(); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); E.addMessage(S.isTT(E.project.platform) ? 'comment' : 'text-out'); return; }
    if (typing) return;
    if (e.key === ' ') { e.preventDefault(); if (e.shiftKey) E.previewScene(); else E.playAll(); return; }
    if (e.key === 'Escape' && E.isPlaying()) { E.stopPlayback(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); E.step(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); E.step(-1); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && E.selectedId) {
      e.preventDefault();
      E.deleteMsg(E.selectedId);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const i = E.indexOfSel();
      const j = i + (e.key === 'ArrowDown' ? 1 : -1);
      const m = E.project.messages[j];
      if (m) {
        e.preventDefault();
        E.selectedId = m.id; E.renderList(); E.renderInspector(); E.renderPreview();
        const row = $('.mrow.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
      }
    }
  });

  // ----------------------------------------------------------------- boot
  (async function boot() {
    const ver = $('#appVersion');
    if (ver && window.APP_VERSION) ver.textContent = 'v' + window.APP_VERSION + (E.caps.platform === 'web' ? ' · web' : '');
    document.body.dataset.platform = E.caps.platform;
    E.paths = await window.api.paths();
    await E.loadPeople();
    await window.MediaRef.prepare(E.project);
    // a name looked up late (one nothing prepared) redraws when it arrives —
    // but never the panel you are typing in
    window.MediaRef.onChange(() => {
      E.renderPreview(); E.renderList();
      if (!document.activeElement || !document.activeElement.closest('#inspector')) E.renderInspector();
    });
    E.renderAll();
    E.status('Ready');
    E.backfillDurations();
    // quietly free storage held by pictures, clips and sounds nothing uses
    setTimeout(() => { if (E.pruneMedia) E.pruneMedia(); }, 3000);

    // Can this browser keep anything? If not, say so on every visit — the
    // usual first-visit notice would promise saving that cannot happen.
    const store = window.api.checkStorage ? await window.api.checkStorage() : { ok: true };
    if (!store.ok) {
      E.status('Not saving — browser storage is unavailable', 'err');
      E.modal('Your work can’t be saved in this browser',
        cat(html`<div class="field confirm-text">This browser is not letting MockChat keep anything right now — `,
        html`${(store.reason === 'full' ? html`its storage is <b>full</b>.` : html`usually a <b>private window</b>, or <b>site data turned off</b> for this site.`)}`,
        html`<br><br>You can still build mockups and export them, but <b>saving templates, People, and importing pictures, `,
        html`clips and sounds will not work</b> — each will show an error.<br><br>`,
        html`To keep your work, open <b>Templates</b> and save a <b>project file</b> (.zip) before you leave, or use a normal window.</div>`),
        html`<button class="d-btn d-btn-sm d-btn-primary" data-close>I understand</button>`, { sticky: true });
    } else if (E.caps.platform === 'web' && !E.pref.get('storageNotice', false)) {
      // first visit to the web version: say plainly where the work is kept
      E.modal('Before you start',
        cat(html`<div class="field confirm-text">Everything you make here is saved <b>in this browser, on this device</b>. Nothing is uploaded — `,
        html`there is no account and no server.<br><br>`,
        html`To back up a project or move it to another computer, open <b>Templates</b> and save a <b>project file</b>: `,
        html`one .zip with the project and all its pictures, clips and sounds.<br><br>`,
        html`Clearing this site’s data in your browser settings deletes your templates.</div>`),
        html`<button class="d-btn d-btn-sm d-btn-primary" data-close>Got it</button>`, { sticky: true });
      E.pref.set('storageNotice', true);
    }
  })();
})();
