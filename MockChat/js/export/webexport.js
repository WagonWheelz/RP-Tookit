/* Exporting in the browser (web build only; the desktop records a hidden
   window instead — see electron/main.js and renderpage.js).

   A browser cannot screenshot or screen-record its own page, so every export
   here is drawn frame by frame:

     1. The project is mounted off-screen and played on a VIRTUAL clock
        (Clock.createVirtual). Time only moves when we say so, so a frame that
        takes 200ms to draw still lands exactly 1/fps after the last one.
     2. CSS animations and transitions are paused and set to the virtual time;
        videos are seeked to where the clock says they should be.
     3. html-to-image (vendored) turns the phone's DOM into a canvas.
     4. The canvases go to the encoder: PNG via canvas, GIF via GifEnc, WebP
        via WebpMux, WebM via WebCodecs (VideoEncoder + AudioEncoder) and
        webm-muxer, with the sound mixed offline (OfflineAudioContext).

   Nothing leaves the page: there are no network requests besides the app's
   own font files. */
(function () {
  'use strict';
  const S = () => window.Store;

  let cancelled = false;
  const CANCEL = new Error('cancelled');

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const safeName = (n) => String(n || 'mockchat').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'mockchat';
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);

  function once(el, type, ms) {
    return new Promise((resolve) => {
      let t = null;
      const done = () => { clearTimeout(t); el.removeEventListener(type, done); resolve(); };
      el.addEventListener(type, done);
      t = setTimeout(done, ms || 3000);
    });
  }

  // --------------------------------------------------------------- stage
  // The phone is mounted inside a clipped box the size of the export (crop
  // applied by sliding the phone under it), parked far off-screen.
  function makeHost(project) {
    const o = S().outerSize(project);
    const crop = (project.exportOpts && project.exportOpts.crop) || {};
    const framed = ['iphone15', 'iphone_se', 'android'].indexOf(project.chat.device) >= 0;
    const host = document.createElement('div');
    host.className = 'export-host';
    host.setAttribute('aria-hidden', 'true');
    const stage = document.createElement('div');
    stage.className = 'export-stage';
    stage.style.width = o.w + 'px';
    stage.style.height = o.h + 'px';
    stage.style.background = framed ? '#0d0e10' : S().paletteFor(project).bg;
    const inner = document.createElement('div');
    inner.className = 'export-inner';
    inner.style.left = -(crop.left || 0) + 'px';
    inner.style.top = -(crop.top || 0) + 'px';
    stage.appendChild(inner);
    host.appendChild(stage);
    document.body.appendChild(host);
    return { host, stage, inner, o };
  }

  // Wait until pictures are decoded, clips have a frame and fonts are in.
  async function settle(root, ms) {
    const jobs = [];
    root.querySelectorAll('img').forEach(img => {
      if (img.complete && img.naturalWidth) return;
      jobs.push(img.decode ? img.decode().catch(() => {}) : once(img, 'load', 3000));
    });
    root.querySelectorAll('video').forEach(v => {
      if (v.readyState >= 2 && !v.seeking) return;
      v.preload = 'auto';
      jobs.push(Promise.race([once(v, 'loadeddata', 4000), once(v, 'seeked', 4000)]));
    });
    if (document.fonts && document.fonts.ready) jobs.push(document.fonts.ready);
    await Promise.race([Promise.all(jobs), sleep(ms || 5000)]);
    // a beat for layout — a timer, not requestAnimationFrame, which never
    // fires while the tab is in the background and would hang the export
    await sleep(60);
  }

  // html-to-image rebuilds the DOM without scroll positions, so a chat
  // scrolled to the bottom would come out showing its top. Turn each scroll
  // offset into a shift of the content for the moment of the snapshot.
  function unscroll(root) {
    const undo = [];
    root.querySelectorAll('*').forEach(el => {
      const st = el.scrollTop, sl = el.scrollLeft;
      if (!st && !sl) return;
      Array.prototype.forEach.call(el.children, k => {
        undo.push(() => { k.style.translate = k.__tr || ''; });
        k.__tr = k.style.translate;
        k.style.translate = (-sl) + 'px ' + (-st) + 'px';
      });
      el.scrollTop = 0; el.scrollLeft = 0;
      undo.push(() => { el.scrollTop = st; el.scrollLeft = sl; });
    });
    return () => { for (let i = undo.length - 1; i >= 0; i--) undo[i](); };
  }

  // ---------------------------------------------------------------- fonts
  // Only the bundled families the project actually uses are embedded, once
  // per export, instead of html-to-image re-reading every stylesheet per frame.
  const fontCache = {};
  async function fontCSSFor(project) {
    const ids = {};
    (project.scenes || []).forEach(sc => { if (sc.chat) ids[sc.chat.font] = 1; });
    const fams = S().FONTS.filter(f => f.bundled && ids[f.id]).map(f => f.id === 'inter' ? 'Inter' : 'Roboto');
    if (!fams.length) return '';
    let css = '';
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of Array.from(rules || [])) {
        if (r.type !== CSSRule.FONT_FACE_RULE) continue;
        const fam = String(r.style.getPropertyValue('font-family')).replace(/["']/g, '').trim();
        if (fams.indexOf(fam) < 0) continue;
        const m = /url\(["']?([^"')]+)["']?\)/.exec(r.style.getPropertyValue('src'));
        if (!m) continue;
        const url = new URL(m[1], sheet.href || location.href).href;
        if (!fontCache[url]) {
          fontCache[url] = fetch(url).then(res => res.blob()).then(b => new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.readAsDataURL(b);
          }));
        }
        const data = await fontCache[url];
        css += '@font-face{font-family:"' + fam + '";font-style:normal;font-weight:' +
          r.style.getPropertyValue('font-weight') + ';src:url(' + data + ') format("woff2");}\n';
      }
    }
    return css;
  }

  // html-to-image waits for an animation frame before every picture it draws,
  // and a background tab — or a window that is covered up, even one that
  // still reports itself "visible" — gets no animation frames, so the export
  // froze. For the length of a snapshot, hand it a frame callback that runs at
  // once (a MessageChannel message, which nothing throttles). Nothing else in
  // the page is animating while an export runs.
  async function withFrames(fn) {
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); cb(performance.now()); };
      ch.port2.postMessage(0);
      return 0;
    };
    try { return await fn(); } finally { window.requestAnimationFrame = orig; }
  }

  // A clip or picture the browser cannot decode (an HEVC iPhone video in
  // Chrome, a mislabelled or damaged file) made html-to-image wait for it
  // forever. For the snapshot it stands in as an empty box of the same size.
  function parkBroken(root) {
    const swaps = [];
    root.querySelectorAll('video, img').forEach(el => {
      // a picture whose file is missing has no address at all: html-to-image
      // gave up on the whole snapshot for it, so it parks too (as nothing)
      const missing = el.tagName === 'IMG' && !el.getAttribute('src');
      const broken = el.tagName === 'VIDEO'
        ? !!el.error || (el.readyState >= 1 && !el.videoWidth)
        : el.complete && !el.naturalWidth;
      if (!broken) return;
      const box = document.createElement('div');
      box.className = el.className;
      box.style.cssText = el.style.cssText;
      if (!missing) box.style.background = '#000';
      el.replaceWith(box);
      swaps.push(() => box.replaceWith(el));
    });
    return () => swaps.forEach(f => f());
  }

  async function snapshot(stage, o, scale, fontCSS) {
    const undo = unscroll(stage);
    const unpark = parkBroken(stage);
    try {
      return await withFrames(() => window.htmlToImage.toCanvas(stage, {
        width: o.w, height: o.h,
        pixelRatio: scale,
        cacheBust: false,
        fontEmbedCSS: fontCSS || '',
        skipFonts: !fontCSS,
        skipAutoScale: true,
        preferredFontFormat: 'woff2'
      }));
    } finally {
      unpark();
      undo();
    }
  }

  // Draw a snapshot onto a canvas of exactly W×H — encoders need fixed sizes.
  function fitTo(src, W, H, target) {
    const c = target || document.createElement('canvas');
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(src, 0, 0, W, H);
    return c;
  }

  const toBlob = (canvas, type, q) => new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The browser could not encode the image.'))), type, q));

  // ------------------------------------------------------------- frames
  // Plays the whole project on a virtual clock and hands every frame (a
  // canvas) to onFrame. The heart of every animated export.
  async function renderFrames(project, opts, onFrame, emit) {
    const fps = opts.fps;
    const total = window.ScenePlayer.totalDuration(project) + (opts.tail || 0);
    const count = Math.min(opts.maxFrames || Infinity, Math.ceil((total / 1000) * fps) + 1);
    const { host, stage, inner, o } = makeHost(project);
    let fontCSS = '';

    // every CSS animation/transition is paused the moment it appears and from
    // then on positioned by hand at (now - when it appeared)
    const born = new WeakMap();
    const track = (t) => {
      inner.getAnimations({ subtree: true }).forEach(a => {
        if (born.has(a)) return;
        born.set(a, t);
        a.pause();
      });
    };
    const clock = window.Clock.createVirtual({ onStep: track });
    let player = null;

    async function syncVideos() {
      const vids = Array.prototype.slice.call(inner.querySelectorAll('video'));
      await Promise.all(vids.map(async (v) => {
        v.muted = true;
        if (v.readyState < 1) { v.preload = 'auto'; await once(v, 'loadedmetadata', 4000); }
        const want = clock.mediaTime(v);
        if (v.readyState < 2 || Math.abs(v.currentTime - want) > 0.0005) {
          try { v.currentTime = want; } catch (e) { return; }
          await once(v, 'seeked', 4000);
        }
      }));
    }

    // everything from here on is inside the try, so a failure anywhere (fonts
    // included) still takes the off-screen host away
    try {
      fontCSS = await fontCSSFor(project);
      player = window.ScenePlayer.play(inner, project, { clock });
      await settle(inner);
      for (let i = 0; i < count; i++) {
        if (cancelled) throw CANCEL;
        const t = (i * 1000) / fps;
        await clock.advanceTo(t);
        track(t);
        inner.getAnimations({ subtree: true }).forEach(a => {
          const b = born.get(a);
          if (b != null) a.currentTime = Math.max(0, t - b);
        });
        await syncVideos();
        const canvas = await snapshot(stage, o, opts.scale, fontCSS);
        await onFrame(canvas, i, t, count);
        emit('export:progress', {
          phase: 'record', p: (i + 1) / count * (opts.share || 1),
          label: 'Rendering frame ' + (i + 1) + ' of ' + count + '…'
        });
      }
    } finally {
      try { if (player) player.stop(); } catch (e) {}
      clock.dispose();
      host.remove();
    }
    return { count, total, o };
  }

  // ---------------------------------------------------------------- audio
  // Every voice note and clip mixed into one track, offline, at its exact
  // place in the timeline — the same cues the desktop recorder plays live.
  async function mixAudio(project, totalSec) {
    const cues = window.ScenePlayer.audioCues(project);
    if (!cues.length) return null;
    const rate = 48000;
    const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(totalSec * rate)), rate);
    const decoded = {};
    let any = false;
    const FADE = 0.12;                    // a short taper, so a cut never clicks
    for (const c of cues) {
      const key = c.media.rel || c.media.name;
      if (!(key in decoded)) {
        decoded[key] = null;
        try {
          const blob = await window.api.mediaBlob(c.media);
          if (blob) decoded[key] = await ctx.decodeAudioData(await blob.arrayBuffer());
        } catch (e) { /* a clip with no sound track */ }
      }
      const buf = decoded[key];
      if (!buf) continue;
      const startAt = c.at;
      const endAt = c.until != null ? c.until : startAt + buf.duration;
      if (endAt <= startAt) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(1, startAt);
      if (endAt - startAt > FADE) g.gain.setValueAtTime(1, endAt - FADE);
      g.gain.linearRampToValueAtTime(0.0001, endAt);
      src.connect(g);
      g.connect(ctx.destination);
      src.start(startAt);
      src.stop(endAt + 0.02);
      any = true;
    }
    return any ? ctx.startRendering() : null;
  }

  async function encodeAudio(buffer, muxer) {
    let failure = null;
    const enc = new window.AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { failure = e; }
    });
    try {
      enc.configure({ codec: 'opus', sampleRate: buffer.sampleRate, numberOfChannels: 2, bitrate: 128000 });
      const L = buffer.getChannelData(0);
      const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
      const STEP = 4800;
      for (let off = 0; off < buffer.length; off += STEP) {
        const n = Math.min(STEP, buffer.length - off);
        const data = new Float32Array(n * 2);
        data.set(L.subarray(off, off + n), 0);
        data.set(R.subarray(off, off + n), n);
        const ad = new window.AudioData({
          format: 'f32-planar', sampleRate: buffer.sampleRate, numberOfFrames: n, numberOfChannels: 2,
          timestamp: Math.round((off / buffer.sampleRate) * 1e6), data
        });
        enc.encode(ad);
        ad.close();
      }
      await enc.flush();
    } finally {
      if (enc.state !== 'closed') { try { enc.close(); } catch (e) {} }
    }
    if (failure) throw failure;
  }

  async function pickVideoCodec(W, H, fps, bitrate) {
    const options = [
      { codec: 'vp09.00.10.08', mux: 'V_VP9' },
      { codec: 'vp8', mux: 'V_VP8' }
    ];
    for (const c of options) {
      try {
        const r = await window.VideoEncoder.isConfigSupported({ codec: c.codec, width: W, height: H, bitrate, framerate: fps });
        if (r && r.supported) return c;
      } catch (e) { /* try the next */ }
    }
    return null;
  }

  // ----------------------------------------------------------- the API
  // Same shapes the desktop returns, so the editor does not care which ran.
  // html-to-image rejects with a bare load Event when something on the phone
  // cannot be drawn; "[object Event]" means nothing to a person
  const fail = (err) => (err === CANCEL ? { ok: false, cancelled: true }
    : { ok: false, error: err instanceof Event ? 'A picture or clip in this project could not be drawn — try replacing it'
                                                : String(err && err.message || err) });

  async function image(opts, emit) {
    cancelled = false;
    const project = S().migrate(opts.project);
    await window.MediaRef.prepare(project);
    const { host, stage, inner, o } = makeHost(project);
    try {
      emit('export:progress', { p: 0.1 });
      window.ScenePlayer.mountStatic(inner, project, project.active || 0, opts.atMs);
      // a page owns a clip: let it park on the stored frame before the snapshot
      const pageUI = (window.Store.isPH && window.Store.isPH(project.platform)) ? window.PHUI : window.YouTubeUI;
      if (pageUI && pageUI.still) {
        try { await pageUI.still(inner, project); } catch (e) {}
      }
      await settle(inner);
      emit('export:progress', { p: 0.4 });
      const canvas = await snapshot(stage, o, Math.max(0.25, Number(opts.scale) || 2), await fontCSSFor(project));
      emit('export:progress', { p: 0.9 });
      const blob = await toBlob(canvas, 'image/png');
      const file = safeName(opts.fileName) + '.png';
      window.api.deliver(file, blob);
      emit('export:progress', { p: 1 });
      return { ok: true, file, width: canvas.width, height: canvas.height, scale: opts.scale };
    } catch (err) {
      return fail(err);
    } finally {
      host.remove();
    }
  }

  async function animated(opts, emit) {
    cancelled = false;
    const project = S().migrate(opts.project);
    await window.MediaRef.prepare(project);
    const format = opts.format === 'webp' ? 'webp' : 'gif';
    const fps = Math.max(4, Math.min(30, Number(opts.fps) || 12));
    const o = S().outerSize(project);
    const scale = Math.min(4, (Number(opts.longEdge) || 480) / Math.max(o.w, o.h));
    const W = even(o.w * scale), H = even(o.h * scale);
    // A GIF frame is encoded as soon as it is drawn and then dropped (raw frames
    // of an XL GIF used to pile up to ~380 MB). WebP frames are small already.
    const gif = format === 'gif' ? window.GifEnc.createStream(W, H, { colors: opts.colors || 256 }) : null;
    const frames = [];
    const target = document.createElement('canvas');
    const delay = Math.round(1000 / fps);
    try {
      const res = await renderFrames(project, { fps, scale, maxFrames: opts.maxFrames || 400, share: gif ? 0.97 : 0.75 }, async (canvas) => {
        fitTo(canvas, W, H, target);
        if (gif) {
          gif.addFrame(target.getContext('2d').getImageData(0, 0, W, H).data, delay);
        } else {
          const blob = await toBlob(target, 'image/webp', (opts.quality || 88) / 100);
          if (blob.type !== 'image/webp') throw new Error('This browser cannot make WebP images. Choose GIF instead.');
          frames.push({ bytes: new Uint8Array(await blob.arrayBuffer()), delay });
        }
      }, emit);
      if (cancelled) throw CANCEL;
      emit('export:progress', { p: gif ? 0.98 : 0.8, label: (gif ? 'Finishing the ' : 'Encoding ') + format.toUpperCase() + '…' });
      await sleep(30);
      const bytes = gif ? gif.finish() : window.WebpMux.encode(frames, W, H, {});
      const file = safeName(opts.fileName) + '.' + format;
      window.api.deliver(file, new Blob([bytes], { type: 'image/' + format }));
      return { ok: true, file, format, frames: gif ? gif.frames : frames.length, width: W, height: H, bytes: bytes.length, duration: res.total };
    } catch (err) {
      return fail(err);
    }
  }

  async function video(opts, emit) {
    cancelled = false;
    if (typeof window.VideoEncoder !== 'function') {
      return { ok: false, error: 'Video export needs Chrome or Edge. PNG and GIF work in every browser.' };
    }
    const project = S().migrate(opts.project);
    await window.MediaRef.prepare(project);
    const fps = Math.max(1, Math.min(60, Number(opts.fps) || 30));
    const scale = Math.max(0.25, Number(opts.scale) || 2);
    const o = S().outerSize(project);
    const W = even(o.w * scale), H = even(o.h * scale);
    const bitrate = Number(opts.bitrate) || 12000000;
    const tail = 200;
    const totalMs = window.ScenePlayer.totalDuration(project) + tail;

    let enc = null;
    try {
      const codec = await pickVideoCodec(W, H, fps, bitrate);
      if (!codec) return { ok: false, error: 'This browser cannot encode WebM video at ' + W + '×' + H + '. Try a lower resolution, or Chrome/Edge.' };

      // sound first: it is quick, and knowing whether there is any decides
      // whether the file gets an audio track at all
      let audioBuf = null, noAudio = false;
      if (project.timeline.soundInVideo) {
        emit('export:progress', { p: 0, label: 'Mixing the sound…' });
        try { audioBuf = await mixAudio(project, totalMs / 1000); } catch (e) { audioBuf = null; }
        if (audioBuf && typeof window.AudioEncoder !== 'function') { audioBuf = null; noAudio = true; }
        if (audioBuf) {
          try {
            const sup = await window.AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
            if (!sup || !sup.supported) { audioBuf = null; noAudio = true; }
          } catch (e) { audioBuf = null; noAudio = true; }
        }
      }

      const muxer = new window.WebMMuxer.Muxer({
        target: new window.WebMMuxer.ArrayBufferTarget(),
        video: { codec: codec.mux, width: W, height: H, frameRate: fps },
        audio: audioBuf ? { codec: 'A_OPUS', sampleRate: 48000, numberOfChannels: 2 } : undefined,
        firstTimestampBehavior: 'offset'
      });
      if (audioBuf) await encodeAudio(audioBuf, muxer);

      let failure = null;
      enc = new window.VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { failure = e; }
      });
      enc.configure({ codec: codec.codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' });
      const target = document.createElement('canvas');
      const frameUs = 1e6 / fps;

      const res = await renderFrames(project, { fps, scale, tail, share: 0.97 }, async (canvas, i) => {
        if (failure) throw failure;
        fitTo(canvas, W, H, target);
        const vf = new window.VideoFrame(target, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
        try { enc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); } finally { vf.close(); }
        // do not let the encoder fall far behind — memory, not speed
        while (enc.encodeQueueSize > 4) await sleep(4);
      }, emit);

      emit('export:progress', { p: 0.98, label: 'Finishing the video…' });
      await enc.flush();
      if (failure) throw failure;
      muxer.finalize();
      const file = safeName(opts.fileName) + '.webm';
      window.api.deliver(file, new Blob([muxer.target.buffer], { type: 'video/webm' }));
      return { ok: true, file, width: W, height: H, duration: res.total, frames: res.count, noAudio };
    } catch (err) {
      return fail(err);
    } finally {
      // a cancelled or failed export lets go of the encoder too — after letting
      // it finish the few frames it still holds, so none is dropped mid-encode
      if (enc && enc.state === 'configured') { try { await enc.flush(); } catch (e) {} }
      if (enc && enc.state !== 'closed') { try { enc.close(); } catch (e) {} }
    }
  }

  // ------------------------------------------------------------ page video
  // A watch page is a still with one clip inside it, so its video export is
  // not the animation recorder: the page is painted once, the clip is seeked
  // frame by frame over its whole length, and the pieces are composited and
  // encoded to MP4 (H.264, falling back to VP9 in an MP4 container).

  // "12:34" / "1:02:03" -> seconds
  function parseDur(txt) {
    const m = String(txt || '').match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
    if (!m) return 0;
    return m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
  }

  function seekClip(v, t) {
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', fin); resolve(); };
      v.addEventListener('seeked', fin);
      setTimeout(fin, 1200);
      try { v.currentTime = t; } catch (e) { fin(); }
    });
  }

  async function pickMp4Codec(W, H, fps, bitrate) {
    // H.264 first, at every level from baseline to 4K — a baseline profile is
    // rejected above roughly 720p, and the fallback was landing on VP9-in-MP4,
    // which plenty of editors will not open.
    const tries = [
      { codec: 'avc1.640042', mux: 'avc', avc: true },   // high, level 4.2 (4K)
      { codec: 'avc1.640034', mux: 'avc', avc: true },   // high, level 5.2
      { codec: 'avc1.640032', mux: 'avc', avc: true },   // high, level 5.0
      { codec: 'avc1.640028', mux: 'avc', avc: true },   // high, level 4.0 (1080p)
      { codec: 'avc1.4d002a', mux: 'avc', avc: true },   // main, level 4.2
      { codec: 'avc1.42001f', mux: 'avc', avc: true },   // baseline, level 3.1 (720p)
      { codec: 'vp09.00.10.08', mux: 'vp9', avc: false }
    ];
    for (const c of tries) {
      try {
        const r = await window.VideoEncoder.isConfigSupported({ codec: c.codec, width: W, height: H, bitrate, framerate: fps });
        if (r && r.supported) return c;
      } catch (e) { /* try the next one */ }
    }
    return null;
  }

  async function pageVideo(opts, emit) {
    cancelled = false;
    if (typeof window.VideoEncoder !== 'function') {
      // Two quite different causes. The common one is not the browser at all:
      // WebCodecs is only exposed in a secure context, so the same page that
      // exports video on https:// exports nothing on http://192.168.x.x.
      if (!window.isSecureContext) {
        return { ok: false, error: 'Video export needs a secure page — open this over https:// or on localhost. ' +
          'This page is ' + location.origin + ' (plain http), where the browser hides its video encoder. PNG still works.' };
      }
      return { ok: false, error: 'This browser has no video encoder (WebCodecs). Chrome or Edge 94+ can do it; PNG works everywhere.' };
    }
    if (!window.Mp4Muxer) return { ok: false, error: 'The MP4 muxer did not load — reload the page.' };

    const project = S().migrate(opts.project);
    await window.MediaRef.prepare(project);
    const fps = Math.max(1, Math.min(60, Number(opts.fps) || 30));
    const scale = Math.max(0.25, Number(opts.scale) || 1);
    const o = S().outerSize(project);
    const W = even(o.w * scale), H = even(o.h * scale);
    const bitrate = Number(opts.bitrate) || 12000000;

    const scene = (S().resolveScene && S().resolveScene(project, project.active || 0)) || project.scenes[0];
    const yt = (scene.chat && scene.chat.yt) || {};
    if (!yt.video) return { ok: false, error: 'Attach a video clip first — the page has nothing to play.' };
    const secs = Math.max(0.5, Number(yt.video.secs) || parseDur(yt.duration) || 10);

    const { host, stage, inner } = makeHost(project);
    let enc = null;
    try {
      emit('export:progress', { p: 0.02, label: 'Painting the page…' });
      window.ScenePlayer.mountStatic(inner, project, project.active || 0, null);
      await settle(inner);

      const page = inner.querySelector('.yt-page');
      const clip = inner.querySelector('video.yt-clip');
      const stageEl = inner.querySelector('.yt-stage');
      const ctrlsEl = inner.querySelector('.yt-ctrls');
      const canvasEl = inner.querySelector('canvas.yt-media');
      if (!page || !clip || !stageEl) return { ok: false, error: 'The watch page did not render its player.' };
      if (!clip.videoWidth) await once(clip, 'loadeddata', 6000);
      try { clip.pause(); } catch (e) {}

      const pr = page.getBoundingClientRect();
      const rel = (el) => { const r = el.getBoundingClientRect();
        return { x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height }; };
      const sr = rel(stageEl);
      const cr = ctrlsEl ? rel(ctrlsEl) : null;

      // the page without the clip (so the frame drawn under the controls is
      // the page itself), then the control bar on its own
      const hide = [canvasEl, clip].filter(Boolean);
      hide.forEach(el => { el.dataset.wasVis = el.style.visibility; el.style.visibility = 'hidden'; });
      const baseCv = await snapshot(stage, o, scale, await fontCSSFor(project));
      hide.forEach(el => { el.style.visibility = el.dataset.wasVis || ''; });
      const ctrlsCv = (ctrlsEl && cr && cr.w > 0)
        ? await window.htmlToImage.toCanvas(ctrlsEl, {
            width: Math.round(cr.w), height: Math.round(cr.h), pixelRatio: scale, skipFonts: true
          })
        : null;

      const codec = await pickMp4Codec(W, H, fps, bitrate);
      if (!codec) return { ok: false, error: 'This browser cannot encode video at ' + W + '×' + H + '. Try a lower resolution.' };

      const muxer = new window.Mp4Muxer.Muxer({
        target: new window.Mp4Muxer.ArrayBufferTarget(),
        video: { codec: codec.mux, width: W, height: H, frameRate: fps },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset'
      });
      let failure = null;
      enc = new window.VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { failure = e; }
      });
      enc.configure({
        codec: codec.codec, width: W, height: H, bitrate, framerate: fps,
        avc: codec.avc ? { format: 'avc' } : undefined,
        latencyMode: 'quality'
      });

      const target = document.createElement('canvas');
      target.width = W;
      target.height = H;
      const g = target.getContext('2d', { alpha: false });
      const frames = Math.max(1, Math.round(secs * fps));
      const frameUs = 1e6 / fps;

      for (let i = 0; i < frames; i++) {
        if (cancelled) throw CANCEL;
        if (failure) throw failure;
        await seekClip(clip, Math.min(secs - 0.001, i / fps));
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, H);
        g.drawImage(baseCv, 0, 0, W, H);
        try { g.drawImage(clip, sr.x * scale, sr.y * scale, sr.w * scale, sr.h * scale); } catch (e) {}
        if (ctrlsCv) g.drawImage(ctrlsCv, cr.x * scale, cr.y * scale, cr.w * scale, cr.h * scale);
        const vf = new window.VideoFrame(target, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
        try { enc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); } finally { vf.close(); }
        while (enc.encodeQueueSize > 4) await sleep(4);
        if (i % 5 === 0) emit('export:progress', { p: 0.04 + 0.9 * (i / frames), label: 'Rendering frame ' + (i + 1) + ' of ' + frames + '…' });
      }

      emit('export:progress', { p: 0.98, label: 'Writing the MP4…' });
      await enc.flush();
      if (failure) throw failure;
      muxer.finalize();
      const file = safeName(opts.fileName) + '.mp4';
      window.api.deliver(file, new Blob([muxer.target.buffer], { type: 'video/mp4' }));
      emit('export:progress', { p: 1 });
      return { ok: true, file, width: W, height: H, duration: Math.round(secs * 1000), frames, codec: codec.codec };
    } catch (err) {
      if (err === CANCEL) return { cancelled: true };
      return fail(err);
    } finally {
      if (enc && enc.state !== 'closed') { try { enc.close(); } catch (e) {} }
      host.remove();
    }
  }

  window.WebExport = {
    image, animated, video, pageVideo,
    cancel() { cancelled = true; }
  };
})();
