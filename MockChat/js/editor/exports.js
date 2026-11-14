/* Exporting from the editor: the crop/preview dialog, the progress bar (with
   Cancel where the platform supports it), and the three exports. The work
   itself happens in the platform: a hidden window on the desktop
   (electron/main.js + export/renderpage.js), in this page on the web
   (export/webexport.js). */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, $ = E.$, $$ = E.$$, esc = E.esc;

  let busyNow = false;
  E.busy = function (on, label) {
    busyNow = on;
    $('#progWrap').hidden = !on;
    $('#progBar').value = 0;
    $('#progCancel').hidden = !(on && E.caps.cancelExport && /^(Rendering|Recording|Encoding)/.test(label || ''));
    ['#btnPng', '#btnWebm', '#tpPlay', '#tpScene'].forEach(s => { const b = $(s); if (b) b.disabled = on; });
    E.status(on ? label : 'Ready');
    document.title = on ? '⏳ ' + (label || 'Working…') + ' — MockChat Studio' : 'MockChat Studio';
  };

  window.api.onExportProgress((p) => {
    if (!p || p.p == null) return;
    const pct = Math.round(p.p * 100);
    $('#progBar').value = pct;
    if (busyNow && p.label) E.status(p.label);
    if (busyNow) document.title = '⏳ ' + pct + '% — MockChat Studio';
  });
  $('#progCancel').onclick = () => { if (window.api.cancelExport) window.api.cancelExport(); };

  // The packed project the exporters take: a deep copy, so nothing they do
  // can reach back into the editor.
  const packed = () => JSON.parse(JSON.stringify(S.pack(E.project)));

  const done = (res, what) => {
    if (res.cancelled) return E.toast('Export cancelled');
    if (!res.ok) return E.toast('Export failed: ' + res.error, 'err');
    E.toast(what + (res.note ? ' (' + res.note + ')' : ''), null,
      E.caps.showInFolder && res.file ? 'show file' : null, () => window.api.showItem(res.file));
  };

  E.exportPng = async function () {
    if (busyNow) return;
    if (E.isPlaying()) E.stopPlayback();
    const r = S.resolveScale(E.project, E.project.exportOpts.imgRes);
    const at = E.previewAt();
    busy(true, 'Rendering ' + r.w + '×' + r.h + ' image…');
    let res;
    try {
      res = await window.api.exportImage({
        project: packed(),
        scale: r.scale,
        atMs: at ? at.ms : null,
        fileName: E.project.exportOpts.name
      });
    } catch (err) { res = { ok: false, error: String(err && err.message || err) }; }
    busy(false);
    done(res, 'PNG saved — ' + res.width + '×' + res.height);
  };
  const busy = (on, label) => E.busy(on, label);

  E.exportWebm = async function () {
    if (busyNow) return;
    if (E.isPlaying()) E.stopPlayback();
    // the recording plays every scene, so the gate and the label have to
    // measure the whole sequence, not just the one you happen to be standing on
    const total = window.ScenePlayer.totalDuration(E.project);
    if (S.isStatic && S.isStatic(E.project.platform)) {
      return E.toast('This page is a still — use Export image.', 'err');
    }
    if (S.isStatic && S.isStatic(E.project.platform)) {
      return E.toast('This page is a still — use Export image.', 'err');
    }
    if (S.isStatic && S.isStatic(E.project.platform)) {
      return E.toast('This page is a still — use Export image.', 'err');
    }
    if (total < 300) { E.toast('Nothing to animate — add some messages first.', 'err'); return; }
    const r = S.resolveScale(E.project, E.project.exportOpts.vidRes);
    busy(true, (E.caps.platform === 'web' ? 'Rendering ' : 'Recording ') + (total / 1000).toFixed(1) + 's of video…');
    let res;
    try {
      res = await window.api.exportVideo({
        project: packed(),
        scale: r.scale,
        fps: Number(E.project.exportOpts.fps) || 30,
        bitrate: Math.round((Number(E.project.exportOpts.bitrate) || 12) * 1000000),
        fileName: E.project.exportOpts.name
      });
    } catch (err) { res = { ok: false, error: String(err && err.message || err) }; }
    busy(false);
    done(res, 'Video saved — ' + res.width + '×' + res.height + ', ' + ((res.duration || 0) / 1000).toFixed(1) + 's' +
      (res.clamped ? ' (capped to fit your screen)' : '') + (res.noAudio ? ' — no sound (this browser cannot encode audio)' : ''));
  };

  E.exportAnimated = async function () {
    if (busyNow) return;
    if (E.isPlaying()) E.stopPlayback();
    const total = window.ScenePlayer.totalDuration(E.project);
    if (total < 300) { E.toast('Nothing to animate — add some messages first.', 'err'); return; }
    const eo = E.project.exportOpts;
    const fmt = eo.animFormat === 'webp' && E.caps.webpExport !== false ? 'webp' : 'gif';
    const fps = Number(eo.animFps) || 12;

    // The capture stops at 400 frames. Left unsaid, a long project silently
    // produces a GIF that just stops partway through.
    const CAP = 400;
    const want = Math.ceil((total / 1000) * fps);
    if (want > CAP) {
      const ok = await E.confirm('Too long for an animated image',
        cat(html`This animation is ${(total / 1000).toFixed(1)}s — ${want} frames at ${fps} fps, more than the ${CAP}`,
        html` an animated image can hold. Only the first ${(CAP / fps).toFixed(1)}s would be saved.<br><br>`,
        html`Lower the frame rate, shorten it, or export a video instead.`), 'Export the first ' + (CAP / fps).toFixed(1) + 's');
      if (!ok) return;
    }

    busy(true, (E.caps.platform === 'web' ? 'Rendering ' : 'Recording ') + (total / 1000).toFixed(1) + 's as ' + fmt.toUpperCase() + '…');
    let res;
    try {
      res = await window.api.exportAnimated({
        project: packed(),
        format: fmt, fps: fps, maxFrames: CAP,
        longEdge: Number(eo.animEdge) || 480,
        quality: 88, scale: 1,
        fileName: eo.name
      });
    } catch (err) { res = { ok: false, error: String(err && err.message || err) }; }
    busy(false);
    done(res, (res.format || fmt).toUpperCase() + ' saved — ' + res.width + '×' + res.height + ', ' +
      res.frames + ' frames, ' + ((res.bytes || 0) / 1048576).toFixed(1) + ' MB');
  };

  // --------------------------------------------------- preview + crop
  E.openPreview = function () {
    const p = E.project;
    const o = S.outerSize(p);
    const fullW = o.fullW, fullH = o.fullH;
    const ps = Math.min(1, 470 / fullH, 330 / fullW);
    const at = E.previewAt();

    const body =
      cat(html`<div class="crop-wrap">`,
        html`<div class="crop-stage" id="cropStage" style="width:${(fullW * ps)}px;height:${(fullH * ps)}px">`,
          html`<div class="crop-scaler" id="cropScaler" style="transform:scale(${ps})"></div>`,
          html`<div class="crop-overlay">`,
            html`<div class="crop-shade" data-shade="top"></div>`,
            html`<div class="crop-shade" data-shade="bottom"></div>`,
            html`<div class="crop-shade" data-shade="left"></div>`,
            html`<div class="crop-shade" data-shade="right"></div>`,
            html`<div class="crop-box" id="cropBox"></div>`,
            html`<div class="crop-handle h-top"    data-edge="top"></div>`,
            html`<div class="crop-handle h-bottom" data-edge="bottom"></div>`,
            html`<div class="crop-handle h-left"   data-edge="left"></div>`,
            html`<div class="crop-handle h-right"  data-edge="right"></div>`,
          html`</div>`,
        html`</div>`,
      html`</div>`,
      html`<div class="field"><label>Resolution</label>`,
        html`<select class="d-select d-select-sm" id="prevRes">${hjoin(S.RESOLUTIONS.map(r =>
          html`<option value="${r.id}"${(r.id === p.exportOpts.imgRes ? ' selected' : '')}>${r.label}</option>`))}`,
        html`</select><div class="hint" id="prevSize"></div></div>`,
      html`<div class="field"><label>Crop (px)${E.tip('Drag the blue handles on the picture, or type the numbers')}</label><div class="row4">`,
        html`${hjoin(['top', 'right', 'bottom', 'left'].map(k =>
          cat(html`<div><span class="minilab">${k}</span><input type="number" class="d-input d-input-sm cropnum" data-edge="${k}`,
          html`" value="${p.exportOpts.crop[k]}" min="0" step="1"></div>`)))}`,
      html`</div></div>`);

    E.modal('Preview & crop', body,
      cat(html`<button class="d-btn d-btn-sm" id="prevReset">Reset crop</button><span class="grow"></span>`,
      html`<button class="d-btn d-btn-sm" data-close>Cancel</button>`,
      html`<button class="d-btn d-btn-sm d-btn-primary" id="prevExport">Export PNG</button>`));

    // live render of the real phone at the moment being exported, scaled down
    window.ScenePlayer.mountStatic($('#cropScaler'), p, p.active || 0, at ? at.ms : null);

    const stage = $('#cropStage');
    const crop = p.exportOpts.crop;

    function clampCrop() {
      crop.top = Math.max(0, Math.min(crop.top, fullH - crop.bottom - 40));
      crop.bottom = Math.max(0, Math.min(crop.bottom, fullH - crop.top - 40));
      crop.left = Math.max(0, Math.min(crop.left, fullW - crop.right - 40));
      crop.right = Math.max(0, Math.min(crop.right, fullW - crop.left - 40));
    }

    function updateCropUI() {
      clampCrop();
      const t = crop.top * ps, b = crop.bottom * ps, l = crop.left * ps, r = crop.right * ps;
      const W = fullW * ps, H = fullH * ps;
      const set = (sel2, css) => { const el = $(sel2); if (el) Object.assign(el.style, css); };
      set('[data-shade="top"]',    { left: '0px', top: '0px', width: W + 'px', height: t + 'px' });
      set('[data-shade="bottom"]', { left: '0px', top: (H - b) + 'px', width: W + 'px', height: b + 'px' });
      set('[data-shade="left"]',   { left: '0px', top: t + 'px', width: l + 'px', height: (H - t - b) + 'px' });
      set('[data-shade="right"]',  { left: (W - r) + 'px', top: t + 'px', width: r + 'px', height: (H - t - b) + 'px' });
      set('#cropBox', { left: l + 'px', top: t + 'px', width: (W - l - r) + 'px', height: (H - t - b) + 'px' });
      set('.h-top',    { left: l + 'px', top: t + 'px', width: (W - l - r) + 'px' });
      set('.h-bottom', { left: l + 'px', top: (H - b) + 'px', width: (W - l - r) + 'px' });
      set('.h-left',   { top: t + 'px', left: l + 'px', height: (H - t - b) + 'px' });
      set('.h-right',  { top: t + 'px', left: (W - r) + 'px', height: (H - t - b) + 'px' });
      $$('.cropnum').forEach(i => { if (document.activeElement !== i) i.value = crop[i.dataset.edge]; });
      const res = S.resolveScale(p, $('#prevRes').value);
      $('#prevSize').textContent = 'Exports at ' + res.w + ' × ' + res.h + ' px — aspect ratio ' +
        (res.w / res.h).toFixed(3) + ' kept exactly';
    }

    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.crop-handle');
      if (!handle) return;
      drag = handle.dataset.edge;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const rect = stage.getBoundingClientRect();
      const x = (e.clientX - rect.left) / ps;
      const y = (e.clientY - rect.top) / ps;
      if (drag === 'top') crop.top = Math.round(y);
      if (drag === 'bottom') crop.bottom = Math.round(fullH - y);
      if (drag === 'left') crop.left = Math.round(x);
      if (drag === 'right') crop.right = Math.round(fullW - x);
      E.dirty = true;
      updateCropUI();
    });
    const endDrag = () => { drag = null; };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    $$('.cropnum').forEach(i => i.addEventListener('input', () => {
      crop[i.dataset.edge] = Math.max(0, parseInt(i.value, 10) || 0);
      E.dirty = true; updateCropUI();
    }));
    $('#prevRes').addEventListener('input', () => {
      p.exportOpts.imgRes = $('#prevRes').value;
      E.dirty = true; updateCropUI();
    });
    $('#prevReset').onclick = () => {
      // `crop` above is the live object — zero it in place. Assigning a fresh
      // one here orphaned every handle drag that followed a reset, and the
      // export came out uncropped.
      crop.top = crop.right = crop.bottom = crop.left = 0;
      E.dirty = true;
      updateCropUI();
    };
    $('#prevExport').onclick = () => { E.closeModal(); E.renderInspector(); E.exportPng(); };
    $('#modalHost').__onClose = () => { if (E.tab === 'export') E.renderInspector(); };

    updateCropUI();
  };

  $('#btnPng').onclick = () => E.openPreview();
  $('#btnWebm').onclick = () => E.exportWebm();
})();
