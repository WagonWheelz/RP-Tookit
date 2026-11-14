/* Reposition a photo or clip inside its frame.

   Same interaction as setting a profile picture on a phone: drag to pan,
   wheel or slider to zoom, and the framing is stored with the media record so
   it shows up identically in the preview and in every export. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, $ = E.$, esc = E.esc;

  E.openFit = (path, round) => E.openFitOn(E.getPath(path), null, round, null);

  // owner/key are only needed when the media does not live behind a path.
  // onDone runs after Done or Cancel; without it the editor just redraws.
  E.openFitOn = function (ownerOrMedia, key, round, onDone) {
    const media = key ? ownerOrMedia[key] : ownerOrMedia;
    if (!media) return;
    media.fit = Object.assign({ z: 1, x: 0.5, y: 0.5, mode: 'cover' }, media.fit || {});
    const fit = media.fit;
    const original = Object.assign({}, fit);
    const isVid = S.isVideoMedia(media);
    const V = 260;

    // A clip is framed exactly like a photo — same drag, same zoom — except the
    // preview plays, so you can see what you are actually cropping into.
    const stageEl = isVid
      ? html`<video class="fitimg" id="fitImg" src="${window.MediaRef.src(media)}" muted loop autoplay playsinline preload="auto"></video>`
      : html`<img class="fitimg" id="fitImg" src="${window.MediaRef.src(media)}" draggable="false" alt="">`;

    E.modal(isVid ? 'Adjust clip' : 'Adjust photo',
      cat(html`<div class="fit-wrap">`,
        html`<div class="fit-view${(round ? ' round' : '')}" id="fitView" style="width:${V}px;height:${V}px">`,
          html`${stageEl}`,
          html`<div class="fit-guides"></div>`,
        html`</div>`,
      html`</div>`,
      html`<div class="field"><label>How it sits in the frame</label><div class="row2">`,
        html`<button class="d-btn d-btn-xs" id="fitCover" data-tip="Covers the whole frame and trims whatever hangs over the edge">Fill · crop the edges</button>`,
        html`<button class="d-btn d-btn-xs" id="fitContain" data-tip="Shows all of it — the sides go black where it does not reach">Fit · show all of it</button>`,
        html`</div></div>`,
      html`<div class="field"><label>Zoom${E.tip('Drag the picture to reposition it. Scroll over it, or use the slider, to zoom.')}</label>`,
        html`<div class="rng">`,
        html`<input class="d-range d-range-xs" type="range" id="fitZoom" min="1" max="4" step="0.01" value="${fit.z}" aria-label="Zoom">`,
        html`<output id="fitZoomOut">${Number(fit.z).toFixed(2)}×</output></div></div>`),
      cat(html`<button class="d-btn d-btn-sm" id="fitReset">Reset</button>`,
      html`<span class="grow"></span>`,
      html`<button class="d-btn d-btn-sm" id="fitCancel">Cancel</button>`,
      html`<button class="d-btn d-btn-sm d-btn-primary" id="fitDone">Done</button>`),
      { sticky: true });

    const view = $('#fitView');
    const img = $('#fitImg');
    let nw = 0, nh = 0;

    function apply() {
      img.style.setProperty('--ox', (fit.x * 100) + '%');
      img.style.setProperty('--oy', (fit.y * 100) + '%');
      img.style.setProperty('--z', fit.z);
      img.style.setProperty('--of', S.fitMode(fit));
      $('#fitZoom').value = fit.z;
      $('#fitZoomOut').textContent = Number(fit.z).toFixed(2) + '×';
      const contain = S.fitMode(fit) === 'contain';
      $('#fitCover').classList.toggle('primary', !contain);
      $('#fitContain').classList.toggle('primary', contain);
    }

    // Displayed size of the picture at the current zoom, in viewport pixels.
    // Cover scales to the LARGER ratio (so it overflows), contain to the
    // smaller (so it fits inside) — the drag maths follows whichever is in use.
    function dims() {
      if (!nw || !nh) return { dw: V * fit.z, dh: V * fit.z };
      const pick = S.fitMode(fit) === 'contain' ? Math.min : Math.max;
      const base = pick(V / nw, V / nh) * fit.z;
      return { dw: nw * base, dh: nh * base };
    }

    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    function onLoaded() {
      nw = img.naturalWidth || img.videoWidth || 0;
      nh = img.naturalHeight || img.videoHeight || 0;
      apply();
    }
    // Listen BEFORE checking: a cached picture can finish loading in the gap
    // between the two, and then neither path ever measured it — which left
    // dragging dead on the second open of the same picture.
    if (isVid) {
      img.addEventListener('loadedmetadata', onLoaded);
      if (img.videoWidth) onLoaded();
      const q = img.play(); if (q && q.catch) q.catch(() => {});
    } else {
      img.addEventListener('load', onLoaded);
      if (img.complete && img.naturalWidth) onLoaded();
      else if (img.decode) img.decode().then(onLoaded, () => {});
    }

    const changed = () => {
      E.dirty = true;
      if (!onDone) { clearTimeout(view._t); view._t = setTimeout(E.renderPreview, 120); }
    };

    let last = null;
    view.addEventListener('pointerdown', (e) => {
      if (!nw) onLoaded();             // belt and braces: measure on first touch
      last = { x: e.clientX, y: e.clientY };
      view.setPointerCapture(e.pointerId);
      view.classList.add('grabbing');
      e.preventDefault();
    });
    view.addEventListener('pointermove', (e) => {
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      const d = dims();
      if (d.dw - V > 0.5) fit.x = clamp01(fit.x - dx / (d.dw - V));
      if (d.dh - V > 0.5) fit.y = clamp01(fit.y - dy / (d.dh - V));
      apply();
    });
    const stop = () => { if (last) { last = null; view.classList.remove('grabbing'); changed(); } };
    view.addEventListener('pointerup', stop);
    view.addEventListener('pointercancel', stop);

    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      fit.z = Math.max(1, Math.min(4, fit.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
      apply(); changed();
    }, { passive: false });

    $('#fitZoom').addEventListener('input', (e) => {
      fit.z = parseFloat(e.target.value) || 1;
      apply(); changed();
    });

    const setMode = (mode) => {
      fit.mode = mode;
      // recentre when switching — the old offset means nothing in the other mode
      fit.x = 0.5; fit.y = 0.5;
      apply(); changed();
    };
    $('#fitCover').onclick = () => setMode('cover');
    $('#fitContain').onclick = () => setMode('contain');

    const finish = () => { if (onDone) onDone(); else E.renderAll(); };
    $('#fitReset').onclick = () => { Object.assign(fit, { z: 1, x: 0.5, y: 0.5, mode: 'cover' }); apply(); changed(); };
    $('#fitCancel').onclick = () => { Object.assign(fit, original); E.closeModal(); finish(); };
    $('#fitDone').onclick = () => { E.closeModal(); E.dirty = true; finish(); };
    apply();
  };
})();
