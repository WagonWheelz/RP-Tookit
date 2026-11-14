/* The phone in the middle: drawing it, zooming it, and the transport —
   step back / preview this scene / play everything / step forward.

   Step view (on by default) draws the scene exactly as it looks right after
   the selected message lands, so clicking down the message list walks through
   the conversation. With it off, the whole conversation is shown at once. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, T = E.T, $ = E.$;

  let view = null, tl = null, player = null, playing = null;   // 'scene' | 'all'
  let zoom = 1, zoomAuto = true;
  E.stepView = E.pref.get('stepView', true);

  // The moment of the active scene the preview (and an image export) shows:
  // after the selected message when step view is on, else the scene's end.
  E.previewAt = function () {
    const p = E.project;
    if (S.isRevisit(p, p.active)) return null;
    const sched = T.build(p);
    const i = E.indexOfSel();
    if (E.stepView && i >= 0) return { ms: T.stepTime(sched, i), step: i, of: p.messages.length, total: sched.total };
    return { ms: sched.total, step: -1, of: p.messages.length, total: sched.total };
  };

  E.renderPreview = function () {
    const wrap = $('#preview');
    stopListening();
    stopPlayer();
    if (tl) tl.stop();
    const at = E.previewAt();
    // the editor view keeps every message visible unless step view is on;
    // exports always use a simulated moment (see exports.js)
    const staged = window.ScenePlayer.mountStatic(wrap, E.project, E.project.active || 0,
      at && at.step >= 0 ? at.ms : null);
    view = staged.view;
    tl = staged.tl;
    applyZoom();
    E.updateDuration();
    paintTransport();
  };

  function applyZoom() {
    const wrap = $('#preview');
    const stage = $('#stageWrap');
    const dev = wrap.querySelector('.device');
    const w = (dev && dev.offsetWidth) || E.project.chat.width;
    const h = (dev && dev.offsetHeight) || E.project.chat.height;
    if (zoomAuto) {
      // inside the padding: the transport bar above, a margin below
      const availH = stage.clientHeight - 60 - 24;
      const availW = stage.clientWidth - 48;
      zoom = Math.min(1.6, Math.max(0.25, Math.min(availW / w, availH / h)));
    }
    wrap.style.transform = 'scale(' + zoom + ')';
    const box = $('#previewBox');
    box.style.width = Math.round(w * zoom) + 'px';
    box.style.height = Math.round(h * zoom) + 'px';
    $('#zoomLabel').textContent = Math.round(zoom * 100) + '%';
  }
  E.applyZoom = applyZoom;

  E.updateDuration = function () {
    const p = E.project;
    const total = window.ScenePlayer.totalDuration(p);
    const n = p.scenes.length;
    // the duration covers every scene, so the message count has to as well
    const msgs = p.scenes.reduce((a, sc) => a + (sc.messages ? sc.messages.length : 0), 0);
    $('#statusPaths').textContent =
      (E.paths ? 'templates → ' + E.paths.templates + '   ·   ' : '') +
      (n > 1 ? n + ' scenes · ' : '') +
      msgs + ' messages · animation ' + (total / 1000).toFixed(1) + 's';
  };

  // ---------------------------------------------------------- transport
  // the play / stop glyphs on the big round button
  const SVG = html`<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">`;
  const ICON_PLAY = html`${SVG}<path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z"/></svg>`;
  const ICON_STOP = html`${SVG}<rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>`;

  // ------------------------------------------------------- page playback
  // A watch page has no steps, so the transport drives the clip in it: play and
  // pause, step a frame at a time, and a readout that follows the clip.
  const isPage = () => !!(S.isStatic && S.isStatic(E.project.platform));
  const pageClip = () => document.querySelector('#preview video.yt-clip, #preview video.ph-clip');
  const pageTotal = () => { const c = pageClip(); return (c && isFinite(c.duration) && c.duration > 0) ? c.duration : 0; };
  const pageAt = () => { const c = pageClip(); return c ? (c.currentTime || 0) : 0; };
  const fmtSec = (s, round) => {
    const n = Math.max(0, round ? Math.round(Number(s) || 0) : Math.floor(Number(s) || 0));
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  };
  const pageSeek = (t) => {
    const c = pageClip();
    if (!c) return;
    try { c.currentTime = Math.max(0, Math.min(pageTotal() || 0, t)); } catch (e) {}
    const pageEl = document.querySelector('#preview .yt-page, #preview .ph-page');
    if (pageEl) pageEl.dispatchEvent(new CustomEvent('yt:seek', { bubbles: true, detail: { t: c.currentTime } }));
  };

  function paintTransport() {
    const at = E.previewAt();
    const btnAll = $('#tpPlay'), btnScene = $('#tpScene');
    setHTML(btnAll, playing ? ICON_STOP : ICON_PLAY);
    btnAll.dataset.tip = playing ? 'Stop (Space)' : 'Play everything from the start (Space)';
    btnAll.classList.toggle('on', !!playing);
    btnScene.disabled = !!playing;
    $('#tpPrev').disabled = !!playing;
    $('#tpNext').disabled = !!playing;
    $('#tpStep').classList.toggle('on', E.stepView);
    const read = $('#tpRead');
    if (isPage()) {
      const c = pageClip();
      const total = pageTotal();
      btnAll.classList.toggle('on', !!(c && !c.paused));
      btnScene.disabled = !c;
      $('#tpPrev').disabled = !c;
      $('#tpNext').disabled = !c;
      $('#tpStep').disabled = true;
      read.textContent = c ? ('clip · ' + fmtSec(pageAt()) + ' / ' + fmtSec(total, true)) : 'no clip attached';
      return;
    }
    $('#tpStep').disabled = false;
    if (playing) read.textContent = playing === 'all' ? 'playing all' : 'previewing scene';
    else if (at && at.step >= 0) read.textContent = 'step ' + (at.step + 1) + '/' + at.of + ' · ' + (at.ms / 1000).toFixed(1) + 's';
    else read.textContent = at ? 'whole scene · ' + (at.total / 1000).toFixed(1) + 's' : 'revisit';
  }
  E.paintTransport = paintTransport;

  function stopPlayer() {
    if (player) { player.stop(); player = null; }
    playing = null;
  }

  E.stopPlayback = function () {
    if (!player) return;
    stopPlayer();
    E.status('Ready');
    E.renderPreview();
  };
  E.isPlaying = () => !!player;

  // ------------------------------------------ listen to one voice note
  // Clicking the ▶ on a voice note in the still phone plays its file, the way
  // you would check it on a real phone. Playback (▶ above) has its own sound.
  let listening = null;            // { audio, btn }
  function stopListening() {
    if (!listening) return;
    const { audio, btn } = listening;
    listening = null;
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
    if (btn.isConnected && window.Icons) setHTML(btn, window.Icons.play({ w: 22, h: 22 }));
  }
  $('#preview').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vplay]');
    if (!btn || player) return;
    const voice = btn.closest('[data-voice]');
    const src = voice && voice.dataset.src;
    const again = listening && listening.btn === btn;
    stopListening();
    if (again) return;             // a second click on the same note stops it
    if (!src) { E.toast('This voice note has no audio file — import one in the Message tab'); return; }
    const audio = new Audio(src);
    listening = { audio, btn };
    if (window.Icons) setHTML(btn, window.Icons.pause({ w: 22, h: 22 }));
    audio.addEventListener('ended', () => { if (listening && listening.audio === audio) stopListening(); });
    audio.play().catch(() => {
      if (listening && listening.audio === audio) stopListening();
      E.toast('This browser could not play that audio file', 'err');
    });
  });

  function start(kind) {
    const p = E.project;
    stopListening();
    stopPlayer();
    if (tl) tl.stop();
    const opts = {
      sound: true,
      onDone: () => { player = null; playing = null; E.status('Ready'); E.renderPreview(); }
    };
    if (kind === 'scene') {
      opts.only = p.active;
      // start just before the selected message, so you watch it arrive
      const i = E.indexOfSel();
      if (E.stepView && i > 0 && !S.isRevisit(p, p.active)) {
        const sched = T.build(p);
        opts.from = Math.max(0, sched.steps[i].start - 1);
      }
      E.status('Previewing this scene…');
    } else {
      E.status(p.scenes.length > 1 ? 'Playing ' + p.scenes.length + ' scenes…' : 'Playing…');
    }
    playing = kind;
    player = window.ScenePlayer.play($('#preview'), p, opts);
    applyZoom();
    paintTransport();
  }

  E.playAll = () => {
    if (isPage()) {
      const c = pageClip();
      if (!c) return E.toast('Attach a video clip first', 'err');
      if (c.paused) { c.play().catch(() => {}); } else { c.pause(); }
      paintTransport();
      return;
    }
    return (player ? E.stopPlayback() : start('all'));
  };
  E.previewScene = () => {
    if (isPage()) { pageSeek(0); paintTransport(); return; }
    return (player ? E.stopPlayback() : start('scene'));
  };

  // Walk the selection through the messages, across scene boundaries.
  E.step = function (dir) {
    const p = E.project;
    if (isPage()) {
      const fps = Number(E.project.exportOpts.fps) || 30;
      pageClip() && pageClip().pause();
      pageSeek(pageAt() + dir / fps);
      paintTransport();
      return;
    }
    if (player) E.stopPlayback();
    const i = E.indexOfSel();
    const j = i + dir;
    if (j >= 0 && j < p.messages.length) {
      E.selectedId = p.messages[j].id;
    } else {
      // off the end of this scene: into the next/previous one that has content
      let k = p.active + dir;
      while (k >= 0 && k < p.scenes.length && S.isRevisit(p, k)) k += dir;
      if (k < 0 || k >= p.scenes.length) return;
      S.bindScene(p, k);
      const list = p.messages;
      E.selectedId = list.length ? list[dir > 0 ? 0 : list.length - 1].id : null;
      E.renderSceneStrip();
    }
    if (!E.stepView) { E.stepView = true; E.pref.set('stepView', true); }
    E.tab = 'message';
    E.renderList(); E.renderInspector(); E.renderPreview();
    const row = $('.mrow.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
  };

  E.toggleStepView = function () {
    E.stepView = !E.stepView;
    E.pref.set('stepView', E.stepView);
    E.renderPreview();
    E.toast(E.stepView ? 'Step view: the phone shows the conversation up to the selected message'
                       : 'Showing the whole conversation');
  };

  $('#tpPlay').onclick = () => E.playAll();
  $('#tpScene').onclick = () => E.previewScene();
  $('#tpPrev').onclick = () => E.step(-1);
  $('#tpNext').onclick = () => E.step(1);
  $('#tpStep').onclick = () => E.toggleStepView();
  $('#zoomIn').onclick = () => { zoomAuto = false; zoom = Math.min(2, zoom + 0.1); applyZoom(); };
  $('#zoomOut').onclick = () => { zoomAuto = false; zoom = Math.max(0.15, zoom - 0.1); applyZoom(); };
  $('#zoomFit').onclick = () => { zoomAuto = true; applyZoom(); };
  window.addEventListener('resize', () => applyZoom());
})();
