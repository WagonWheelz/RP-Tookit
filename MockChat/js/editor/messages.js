/* The message list on the left, the toolbox under it, and getting media in.

   The toolbox is a row of favourites plus one "+ Add…" button. The button
   opens a searchable list of everything that can be added (focus lands in
   the search box, so you can type straight away); the star next to an item
   pins it to the toolbox. Favourites are remembered per screen family. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, R = E.R, $ = E.$, $$ = E.$$, esc = E.esc;

  // ------------------------------------------------------------- catalog
  // id: what addMessage() understands. Every message type is here, plus the
  // two "text from them / from you" shortcuts.
  const CATALOG = {
    chat: [
      { id: 'text-in',  ic: '💬', label: 'Their message',    desc: 'A text bubble from the other person' },
      { id: 'text-out', ic: '🗨️', label: 'Your message',     desc: 'A text bubble you sent' },
      { id: 'image',    ic: '🖼️', label: 'Image',            desc: 'A photo in a bubble' },
      { id: 'gif',      ic: '🎞️', label: 'GIF',              desc: 'An animated picture' },
      { id: 'sticker',  ic: '🏷️', label: 'Sticker',          desc: 'A sticker with no bubble behind it' },
      { id: 'video',    ic: '🎬', label: 'Video',            desc: 'A clip that plays when it arrives' },
      { id: 'voice',    ic: '🎙️', label: 'Voice note',       desc: 'A waveform that fills as it plays' },
      { id: 'audio',    ic: '🎵', label: 'Audio file',       desc: 'A shared audio file' },
      { id: 'file',     ic: '📄', label: 'Document',         desc: 'A PDF, DOCX, ZIP… attachment' },
      { id: 'contact',  ic: '👤', label: 'Contact card',     desc: 'A shared contact' },
      { id: 'location', ic: '📍', label: 'Location',         desc: 'A shared place with a map' },
      { id: 'link',     ic: '🔗', label: 'Link preview',     desc: 'A URL with its preview card' },
      { id: 'typing',   ic: '…',  label: 'Typing indicator', desc: 'A "…" bubble that shows, then goes away' },
      { id: 'divider',  ic: '📅', label: 'Date divider',     desc: '"Today", "Yesterday"…' },
      { id: 'system',   ic: 'ℹ️', label: 'System notice',    desc: 'Encryption notice, "X left the group"…' },
      { id: 'call',     ic: '📞', label: 'Call event',       desc: 'Missed / incoming / outgoing call' },
      { id: 'status',   ic: '🟢', label: 'Status change',    desc: 'Changes "online / last seen…" under the name at this moment' }
    ],
    tiktoklive: [
      { id: 'comment', ic: '💬', label: 'Comment',           desc: 'A line in the live chat' },
      { id: 'gift',    ic: '🎁', label: 'Gift',              desc: 'A gift banner, with emoji thrown up the side' },
      { id: 'likes',   ic: '❤️', label: 'Burst of reactions', desc: 'A wave of emoji floating up' },
      { id: 'join',    ic: '👋', label: 'Someone joined',    desc: '"kayla_ww joined"' },
      { id: 'follow',  ic: '➕', label: 'New follower',      desc: '"sam.exe followed the host"' },
      { id: 'share',   ic: '↗️', label: 'Shared the live',   desc: '"theo shared the live"' },
      { id: 'banner',  ic: '📣', label: 'System banner',     desc: '"Welcome to the stream"…' }
    ],
    tiktok: [
      { id: 'comment', ic: '💬', label: 'Comment',           desc: 'A comment under the video (open the comment sheet on the Video tab to see them)' }
    ]
  };
  const DEFAULT_FAVS = {
    chat: ['text-in', 'text-out', 'image', 'voice', 'video', 'sticker', 'gif', 'typing', 'divider'],
    tiktoklive: ['comment', 'gift', 'likes', 'join', 'follow', 'share', 'banner'],
    tiktok: ['comment']
  };
  const family = () => (CATALOG[E.project.platform] ? E.project.platform : 'chat');
  const favsFor = (fam) => E.pref.get('favs.' + fam, DEFAULT_FAVS[fam]);
  E.catalog = () => CATALOG[family()];

  // ---------------------------------------------------------- the list
  const TYPE_LABEL = {};
  S.MESSAGE_TYPES.concat(S.MESSAGE_TYPES_TT).forEach(t => { TYPE_LABEL[t.id] = t.label; });

  function snippet(m) {
    if (m.type === 'gift')   return (m.user || '?') + ' → ' + (m.giftName || 'gift') + (Number(m.giftCount) > 1 ? ' x' + m.giftCount : '');
    if (m.type === 'join')   return (m.user || '?') + ' joined';
    if (m.type === 'follow') return (m.user || '?') + ' followed';
    if (m.type === 'share')  return (m.user || '?') + ' shared';
    if (m.type === 'likes')  return (m.floatCount || 14) + ' × ' + (m.floatEmoji || 'stream emoji');
    if (m.type === 'banner') return m.text || '(banner)';
    if (m.type === 'comment') return (m.user ? m.user + ': ' : '') + (m.text || '(empty)');
    if (m.type === 'system') return m.text || 'Messages are end-to-end encrypted.';
    if (m.type === 'status') return m.text ? '→ “' + m.text + '”' : '→ (no status line)';
    if (m.type === 'text' || m.type === 'divider') return m.text || '(empty)';
    if (m.type === 'typing') return 'typing…';
    if (m.caption) return m.caption;
    if (m.media) return m.media.name;
    if (m.type === 'file') return m.fileName;
    if (m.type === 'call') return m.callResult + ' ' + m.callKind + ' call';
    if (m.type === 'location') return m.place;
    if (m.type === 'link') return m.linkTitle;
    if (m.type === 'voice' || m.type === 'audio') return R.mmss(m.duration) + ' voice note';
    return '(no media yet)';
  }

  E.renderList = function () {
    const host = $('#msgList');
    const p = E.project;
    const tt = S.isTT(p.platform);
    if (!p.messages.length) {
      setHTML(host, html`<div class="list-empty">No messages in this scene yet.<br>Add one from the toolbox below.</div>`);
      return;
    }
    setHTML(host, hjoin(p.messages.map((m, i) => {
      const structural = ['divider', 'system', 'banner', 'status'].indexOf(m.type) >= 0;
      const cls = 'mrow ' + (structural ? 'structural' : m.side) + (m.id === E.selectedId ? ' sel' : '') +
        (m.type === 'status' ? ' status' : '');
      const s1 = (ms) => (Number(ms) / 1000).toFixed(1) + 's';
      const timing = (m.anim.typing ? '⌨ ' + s1(m.anim.typing) + ' · ' : '') + s1(m.anim.delay);
      return cat(html`<div class="${cls}" data-id="${m.id}" draggable="true">`,
        html`<div class="idx">${(i + 1)}</div>`,
        html`<div class="body"><div class="kind"><span>${TYPE_LABEL[m.type] || m.type}`,
          html`${(structural || tt ? '' : ' · ' + (m.side === 'out' ? 'you' : 'them'))}`,
          html`</span><span class="timing d-badge d-badge-xs d-badge-ghost" data-tip="${(m.anim.typing ? 'typing time, then ' : '')}wait before the next message">${timing}</span></div>`,
          html`<div class="snip">${snippet(m)}</div></div>`,
        html`<div class="tools">`,
          html`<button data-act="up" data-tip="Move up">▲</button>`,
          html`<button data-act="down" data-tip="Move down">▼</button>`,
          html`<button data-act="dup" data-tip="Duplicate">⧉</button>`,
          html`<button data-act="del" data-tip="Delete (Del)">✕</button>`,
        html`</div></div>`);
    })));
  };

  // ------------------------------------------------------------ toolbox
  E.renderAddGrid = function () {
    const fam = family();
    const favs = favsFor(fam);
    const items = CATALOG[fam].filter(c => favs.indexOf(c.id) >= 0);
    setHTML($('#addGrid'), cat(html`${hjoin(items.map(c => cat(html`<button class="d-btn d-btn-sm" data-add="${c.id}" data-tip="${c.desc}">`,
        html`<span class="ic">${c.ic}</span><span class="lbl">${c.label}</span></button>`)))}`,
      html`<button class="d-btn d-btn-sm add-more" data-add="more" data-tip="Everything you can add — type to search, ★ to pin it here (Ctrl+K)">＋ Add…</button>`));
  };

  E.openAddModal = function () {
    const fam = family();
    let favs = favsFor(fam).slice();
    let hi = 0;
    let shown = CATALOG[fam];

    E.modal('Add to this scene',
      cat(html`<div class="add-search"><input class="d-input" type="search" id="addQ" placeholder="Search — e.g. voice, gift, status…" autocomplete="off" aria-label="Search things to add"></div>`,
      html`<div class="add-list" id="addList" role="listbox"></div>`),
      html`<span class="foot-hint"><kbd class="d-kbd d-kbd-xs">↑</kbd><kbd class="d-kbd d-kbd-xs">↓</kbd> to move · <kbd class="d-kbd d-kbd-xs">Enter</kbd> to add · ★ pins it to the toolbox</span><button class="d-btn d-btn-sm" data-close>Close</button>`,
      { cls: 'add-modal' });

    const q = $('#addQ');
    function paint() {
      const term = q.value.trim().toLowerCase();
      shown = CATALOG[fam].filter(c => !term || (c.label + ' ' + c.desc + ' ' + c.id).toLowerCase().indexOf(term) >= 0);
      hi = Math.max(0, Math.min(hi, shown.length - 1));
      setHTML($('#addList'), shown.length
        ? hjoin(shown.map((c, i) =>
          cat(html`<div class="add-item${(i === hi ? ' hi' : '')}" role="option" data-pick="${c.id}">`,
            html`<span class="ic">${c.ic}</span>`,
            html`<span class="txt"><b>${c.label}</b><i>${c.desc}</i></span>`,
            html`<button class="star${(favs.indexOf(c.id) >= 0 ? ' on' : '')}" data-star="${c.id}" `,
              html`data-tip="${(favs.indexOf(c.id) >= 0 ? 'Remove from the toolbox' : 'Pin to the toolbox')}" aria-label="favourite">★</button>`,
          html`</div>`)))
        : html`<div class="list-empty">Nothing matches “${q.value}”.</div>`);
    }
    function pick(id) { E.closeModal(); E.addMessage(id); }

    q.addEventListener('input', () => { hi = 0; paint(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { hi = Math.min(shown.length - 1, hi + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[hi]) { e.preventDefault(); pick(shown[hi].id); }
      else if (e.key === 'Escape') E.closeModal();
    });
    $('#addList').addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (star) {
        const id = star.dataset.star;
        favs = favs.indexOf(id) >= 0 ? favs.filter(x => x !== id) : favs.concat(id);
        // keep the toolbox in catalogue order, not the order they were starred
        favs = CATALOG[fam].map(c => c.id).filter(x => favs.indexOf(x) >= 0);
        E.pref.set('favs.' + fam, favs);
        E.renderAddGrid();
        paint();
        q.focus();
        return;
      }
      const row = e.target.closest('[data-pick]');
      if (row) pick(row.dataset.pick);
    });
    paint();
    setTimeout(() => q.focus(), 0);
  };

  // --------------------------------------------------------- add a message
  function nowTime() {
    const d = new Date();
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  E.nowTime = nowTime;

  E.addMessage = function (kind) {
    const p = E.project;
    const t = p.timeline;
    const tt = S.isTT(p.platform);
    const base = { anim: { delay: t.defaultDelay, typing: 0, effect: tt ? 'slide' : 'pop' } };
    let m;
    switch (kind) {
      case 'text-in':  m = S.defaultMessage(Object.assign({ side: 'in',  type: 'text', text: 'New message', time: nowTime() }, base)); m.anim.typing = t.defaultTyping; break;
      case 'text-out': m = S.defaultMessage(Object.assign({ side: 'out', type: 'text', text: 'New message', time: nowTime(), status: 'read' }, base)); break;
      case 'divider':  m = S.defaultMessage(Object.assign({ type: 'divider', text: 'Today' }, base)); break;
      case 'status':   m = S.defaultMessage(Object.assign({ type: 'status', side: 'in', text: 'online' }, base)); m.anim.delay = 600; break;
      case 'comment':  m = S.defaultMessage(Object.assign({ type: 'comment', user: 'someuser', text: 'nice one' }, base)); break;
      case 'gift':     m = S.defaultMessage(Object.assign({ type: 'gift', user: 'someuser', giftName: 'Rose', giftIcon: '🌹', giftCoins: '1' }, base)); break;
      case 'likes':    m = S.defaultMessage(Object.assign({ type: 'likes', floatEmoji: '', floatCount: 20 }, base)); break;
      case 'join':     m = S.defaultMessage(Object.assign({ type: 'join', user: 'someuser' }, base)); break;
      case 'follow':   m = S.defaultMessage(Object.assign({ type: 'follow', user: 'someuser' }, base)); break;
      case 'share':    m = S.defaultMessage(Object.assign({ type: 'share', user: 'someuser' }, base)); break;
      case 'banner':   m = S.defaultMessage(Object.assign({ type: 'banner', text: 'Welcome to the stream' }, base)); break;
      case 'typing':   m = S.defaultMessage(Object.assign({ side: 'in', type: 'typing' }, base)); m.anim.delay = 1500; break;
      default:         m = S.defaultMessage(Object.assign({ side: 'in', type: kind, time: nowTime() }, base));
    }
    const at = E.indexOfSel();
    if (at >= 0) p.messages.splice(at + 1, 0, m); else p.messages.push(m);
    E.selectedId = m.id;
    E.tab = 'message';
    E.dirty = true;
    E.renderAll();
    const row = $('.mrow.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
    if (E.isNarrow()) E.showPane('edit');      // on a phone: straight to typing it
    if (['image', 'gif', 'sticker', 'video', 'voice'].indexOf(kind) >= 0) E.importInto('msg.media', kind === 'voice' ? 'audio' : kind);
  };

  E.moveMsg = function (id, dir) {
    const list = E.project.messages;
    const i = list.findIndex(m => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const [m] = list.splice(i, 1);
    list.splice(j, 0, m);
    E.dirty = true; E.renderList(); E.renderPreview();
  };

  E.deleteMsg = function (id) {
    const list = E.project.messages;
    const at = list.findIndex(m => m.id === id);
    if (at < 0) return;
    E.setMessages(list.filter(m => m.id !== id));
    // keep the selection where the eye already is, not back at the top
    if (E.selectedId === id || !E.selected()) {
      const next = E.project.messages[Math.min(at, E.project.messages.length - 1)];
      E.selectedId = next ? next.id : null;
    }
    E.dirty = true; E.renderAll();
  };

  E.duplicateMsg = function (id) {
    const list = E.project.messages;
    const i = list.findIndex(m => m.id === id);
    if (i < 0) return;
    const copy = JSON.parse(JSON.stringify(list[i]));
    copy.id = S.uid();
    list.splice(i + 1, 0, copy);
    E.selectedId = copy.id; E.dirty = true; E.renderAll();
  };

  // ---------------------------------------------------------- media in
  // Ask the file how long it actually is, and remember it on the media object.
  // Without this every clip is assumed to be the default eight seconds, which is
  // why a 13s video used to get cut off part-way through.
  function probeDuration(media) {
    return new Promise((resolve) => {
      if (!media || !window.MediaRef.src(media) || !S.isTimeBased(media)) return resolve(media);
      const el = document.createElement(S.isVideoMedia(media) ? 'video' : 'audio');
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const d = Number(el.duration);
        if (isFinite(d) && d > 0) media.secs = Math.round(d * 100) / 100;
        el.removeAttribute('src');
        try { el.load(); } catch (e) {}
        resolve(media);
      };
      const timer = setTimeout(finish, 6000);   // never hang the import on it
      el.preload = 'metadata';
      el.muted = true;
      el.onloadedmetadata = finish;
      el.onerror = finish;
      el.src = window.MediaRef.src(media);
    });
  }
  E.probeDuration = probeDuration;

  function timeBasedMedia(project) {
    const out = [];
    project.scenes.forEach((sc) => {
      if (!sc.chat) return;
      (sc.messages || []).forEach(m => { if (S.isTimeBased(m.media)) out.push(m.media); });
      const tt = sc.chat.tt;
      if (tt && Array.isArray(tt.cells)) {
        tt.cells.forEach(c => { if (c && S.isTimeBased(c.media)) out.push(c.media); });
      }
    });
    return out;
  }

  // Anything imported before clip lengths were measured — or whose length the
  // file didn't declare — has no `secs`, and without it the animation cuts the
  // clip off. Measure them quietly in the background and redraw once.
  let backfilling = false;
  E.backfillDurations = async function () {
    if (backfilling) return;
    const todo = timeBasedMedia(E.project).filter(m => window.MediaRef.src(m) && !(Number(m.secs) > 0));
    if (!todo.length) return;
    backfilling = true;
    let got = 0;
    const failed = [];
    for (const m of todo) {
      await probeDuration(m);
      if (Number(m.secs) > 0) got++; else failed.push(m.name || m.rel || 'a clip');
    }
    backfilling = false;
    if (got) E.renderAll();
    if (failed.length) {
      E.toast("Couldn't read the length of " + failed[0] +
        (failed.length > 1 ? ' (and ' + (failed.length - 1) + ' more)' : '') +
        " — set the scene's watch time by hand", 'err');
    }
  };

  E.importInto = async function (path, kind) {
    let files;
    try { files = await window.api.importMedia(kind, false); } catch (err) { return E.storageError('import that file', err); }
    if (!files || !files.length) return;
    await window.MediaRef.prepare(files, { refresh: true });
    files[0].fit = S.defaultFit();
    await probeDuration(files[0]);
    E.setPath(path, files[0]);
    // a voice note or a clip on a message carries its own length too
    const m = E.selected();
    if (m && files[0].secs && /^msg\.media$/.test(path)) m.duration = files[0].secs;
    E.renderAll();
    E.toast('Imported ' + files[0].name + (files[0].secs ? ' (' + files[0].secs.toFixed(1) + 's)' : ''));
  };

  // ---------------------------------------------------------- list events
  $('#msgList').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    const row = e.target.closest('.mrow');
    if (!row) return;
    if (btn && btn.dataset.act) {
      e.stopPropagation();
      const id = row.dataset.id;
      if (btn.dataset.act === 'up') return E.moveMsg(id, -1);
      if (btn.dataset.act === 'down') return E.moveMsg(id, 1);
      if (btn.dataset.act === 'dup') return E.duplicateMsg(id);
      if (btn.dataset.act === 'del') return E.deleteMsg(id);
      return;
    }
    E.selectedId = row.dataset.id;
    E.tab = 'message';
    if (E.isPlaying()) E.stopPlayback();
    E.renderList(); E.renderInspector(); E.renderPreview();
    if (E.isNarrow()) E.showPane('edit');
  });

  // drag to reorder
  let dragId = null;
  $('#msgList').addEventListener('dragstart', (e) => {
    const row = e.target.closest('.mrow'); if (!row) return;
    dragId = row.dataset.id; e.dataTransfer.effectAllowed = 'move';
  });
  $('#msgList').addEventListener('dragover', (e) => {
    const row = e.target.closest('.mrow'); if (!row || !dragId) return;
    e.preventDefault();
    $$('.mrow').forEach(r => r.classList.remove('drag-over'));
    row.classList.add('drag-over');
  });
  $('#msgList').addEventListener('drop', (e) => {
    const row = e.target.closest('.mrow');
    $$('.mrow').forEach(r => r.classList.remove('drag-over'));
    if (!row || !dragId || row.dataset.id === dragId) { dragId = null; return; }
    e.preventDefault();
    const list = E.project.messages;
    const from = list.findIndex(m => m.id === dragId);
    const to = list.findIndex(m => m.id === row.dataset.id);
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    dragId = null; E.dirty = true; E.renderList(); E.renderPreview();
  });
  $('#msgList').addEventListener('dragend', () => { dragId = null; $$('.mrow').forEach(r => r.classList.remove('drag-over')); });

  $('#addGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    if (b.dataset.add === 'more') E.openAddModal(); else E.addMessage(b.dataset.add);
  });

  // drop media files straight onto the preview
  const stageWrap = $('#stageWrap');
  ['dragover', 'drop'].forEach(evt => stageWrap.addEventListener(evt, (e) => {
    if (!e.dataTransfer || !Array.prototype.some.call(e.dataTransfer.types || [], t => t === 'Files')) return;
    e.preventDefault();
    if (evt !== 'drop') return;
    const files = Array.prototype.slice.call(e.dataTransfer.files || []);
    if (!files.length) return;
    (async () => {
      let added = 0;
      for (const f of files) {
        let info = null;
        try {
          if (window.api.adoptFile) info = await window.api.adoptFile(f);
          else {
            const pth = window.api.pathForFile(f);
            if (pth) info = await window.api.adoptMedia(pth);
          }
        } catch (err) {
          E.storageError('import ' + f.name, err);
          break;                       // the rest would fail the same way
        }
        if (!info) continue;
        await window.MediaRef.prepare(info, { refresh: true });
        info.fit = S.defaultFit();
        await probeDuration(info);
        // a TikTok screen has no chat bubbles to drop into: the file becomes
        // the video (or photo) behind the screen
        if (S.isTT(E.project.platform)) {
          E.project.chat.tt.cells[0].media = info;
          added++;
          break;
        }
        const ext = info.ext;
        const type = S.VIDEO_EXT.indexOf(ext) >= 0 ? 'video'
          : S.AUDIO_EXT.indexOf(ext) >= 0 ? 'voice'
            : ext === 'gif' ? 'gif' : 'image';
        const m = S.defaultMessage({
          side: 'in', type, media: info, time: nowTime(),
          duration: info.secs || 8,
          anim: { delay: E.project.timeline.defaultDelay, typing: 0, effect: 'pop' }
        });
        E.project.messages.push(m);
        E.selectedId = m.id;
        added++;
      }
      E.dirty = true; E.renderAll();
      if (added) E.toast('Added ' + added + ' item' + (added > 1 ? 's' : ''));
    })();
  }));
})();
