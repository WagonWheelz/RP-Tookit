/* Runs inside the frameless render window used for PNG / WebM export. */
(function () {
  'use strict';
  const stage = document.getElementById('stage');
  const inner = document.getElementById('stageInner');
  let project = null, view = null, tl = null, player = null;

  function waitForMedia(root, timeout) {
    const jobs = [];
    root.querySelectorAll('img').forEach(img => {
      if (img.complete && img.naturalWidth) return;
      jobs.push(new Promise(res => { img.onload = img.onerror = res; }));
    });
    root.querySelectorAll('video').forEach(v => {
      if (v.readyState >= 2) return;
      jobs.push(new Promise(res => { v.onloadeddata = v.onerror = res; setTimeout(res, 2500); }));
    });
    const all = Promise.all(jobs);
    return Promise.race([all, new Promise(r => setTimeout(r, timeout || 4000))]);
  }

  window.api.onProject(async (payload) => {
    // rebuild the scene bindings the pack step dropped on the way over
    project = window.Store.migrate(payload.project);
    await window.MediaRef.prepare(project);      // where each named picture lives here
    // every emoji picture the animation will show, loaded before the recorder starts
    if (window.Emoji) await window.Emoji.preload(project, { unicode: project.chat.emojiSet !== 'system' });
    const framed = ['iphone15', 'iphone_se', 'android'].indexOf(project.chat.device) >= 0;
    document.body.style.background = framed ? '#0d0e10' : window.Store.paletteFor(project).bg;
    // crop is applied by sliding the device under a clipped stage, so both the
    // still and the recording come out already cropped
    const crop = (project.exportOpts && project.exportOpts.crop) || {};
    inner.style.left = '-' + (crop.left || 0) + 'px';
    inner.style.top = '-' + (crop.top || 0) + 'px';
    // a project is a sequence of scenes; a still shows the one you were editing,
    // as it looks at `at` ms in (the step you were on, or the scene's end)
    const staged = window.ScenePlayer.mountStatic(inner, project, project.active || 0, payload.at);
    view = staged.view;
    tl = staged.tl;
    await waitForMedia(inner, 5000);
    // a beat for fonts + layout
    setTimeout(() => window.api.renderReady(), 120);
  });

  // ---------------------------------------------------------------- audio
  async function buildAudio(schedule, ctx) {
    const dest = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(dest);
    const jobs = window.ScenePlayer.audioCues(project)
      .map(async (ev) => {
        try {
          const b64 = await window.api.readMedia(ev.media);    // by name, inside the media folder
          if (!b64) return null;
          const bin = atob(b64);
          const buf = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
          const audioBuf = await ctx.decodeAudioData(buf.buffer);
          return { at: ev.at, until: ev.until, buf: audioBuf };
        } catch (e) { return null; }
      });

    const decoded = (await Promise.all(jobs)).filter(Boolean);
    return { dest, gain, decoded };
  }

  // --------------------------------------------------------------- record
  window.api.onRecord(async (opts) => {
    const fps = opts.fps || 30;
    try {
      const schedule = { total: window.ScenePlayer.totalDuration(project) };

      // 1. capture this very window through the legacy desktop-capturer path
      //    (no user-gesture requirement, unlike getDisplayMedia)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: opts.sourceId,
            maxWidth: 4096,
            maxHeight: 4096,
            minFrameRate: fps,
            maxFrameRate: fps
          }
        }
      });

      // 2. mix any voice-note / video audio into the recording
      let ctx = null, audio = null;
      if (project.timeline.soundInVideo) {
        try {
          ctx = new (window.AudioContext || window.webkitAudioContext)();
          try { await ctx.resume(); } catch (e) {}
          audio = await buildAudio(schedule, ctx);
          if (audio.decoded.length) {
            audio.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
          } else { try { ctx.close(); } catch (e) {} ctx = null; audio = null; }
        } catch (e) { ctx = null; audio = null; }
      }

      // 3. recorder
      const types = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm'
      ];
      const mimeType = types.find(t => window.MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: opts.bitrate || 12000000,
        audioBitsPerSecond: 128000
      });

      // Buffer every blob and ship them only once recording has fully stopped —
      // sending from ondataavailable races the final chunk against onstop and
      // silently truncates the file.
      const blobs = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) blobs.push(e.data); };

      const finish = (payload) => {
        try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        try { if (ctx) ctx.close(); } catch (e) {}
        window.api.recordDone(payload);
      };

      rec.onstop = async () => {
        try {
          const blob = new Blob(blobs, { type: mimeType || 'video/webm' });
          const u8 = new Uint8Array(await blob.arrayBuffer());
          const CHUNK = 4 * 1024 * 1024;
          for (let o = 0; o < u8.length; o += CHUNK) window.api.recordChunk(u8.slice(o, o + CHUNK));
          finish({ ok: true, duration: schedule.total });
        } catch (err) {
          finish({ ok: false, error: String(err && err.message || err) });
        }
      };
      rec.onerror = (e) => finish({ ok: false, error: String(e && e.error || e) });

      await new Promise(r => setTimeout(r, 250));
      rec.start(400);

      // start scheduled audio exactly when playback starts
      if (ctx && audio) {
        const t0 = ctx.currentTime + 0.08;
        const FADE = 0.12;                 // short taper, so cutting off never clicks
        audio.decoded.forEach(d => {
          const src = ctx.createBufferSource();
          src.buffer = d.buf;
          // Each sound belongs to the screen it was on, and must be gone by the
          // time that screen is. Starting it and letting the whole file run was
          // what left one reel playing over the next.
          const startAt = t0 + d.at;
          const endAt = d.until != null ? t0 + d.until : startAt + d.buf.duration;
          if (endAt <= startAt) return;
          const g = ctx.createGain();
          g.gain.setValueAtTime(1, startAt);
          if (endAt - startAt > FADE) g.gain.setValueAtTime(1, endAt - FADE);
          g.gain.linearRampToValueAtTime(0.0001, endAt);
          src.connect(g);
          g.connect(audio.gain);
          try { src.start(startAt); src.stop(endAt + 0.02); } catch (e) {}
        });
      }

      player = window.ScenePlayer.play(inner, project, {
        onProgress: (p) => window.api.renderProgress({ phase: 'record', p }),
        onDone: () => setTimeout(() => { try { rec.stop(); } catch (e) {} }, 350)
      });
    } catch (err) {
      window.api.recordDone({ ok: false, error: String(err && err.message || err) });
    }
  });

  // ---------------------------------------------------- animated stills
  // Grabs frames off the same desktop-capture stream the video path uses, then
  // packs them as an animated GIF or WebP. Frames are stored as raw pixels
  // during playback (fast, synchronous) and encoded afterwards, so a slow
  // encoder can never drag the animation out of time.
  window.api.onRecordAnimated(async (opts) => {
    const fps = Math.max(4, Math.min(30, opts.fps || 12));
    const format = opts.format === 'webp' ? 'webp' : 'gif';
    const maxFrames = Math.max(4, Math.min(400, opts.maxFrames || 220));
    try {
      const schedule = { total: window.ScenePlayer.totalDuration(project) };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: opts.sourceId,
            maxWidth: 4096, maxHeight: 4096,
            minFrameRate: fps, maxFrameRate: fps
          }
        }
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise(r => (video.videoWidth ? r() : (video.onloadedmetadata = r)));

      const srcW = video.videoWidth || 390;
      const srcH = video.videoHeight || 844;
      const long = Math.max(srcW, srcH);
      const scale = opts.longEdge ? Math.min(1, opts.longEdge / long) : 1;
      const W = Math.max(2, Math.round(srcW * scale / 2) * 2);
      const H = Math.max(2, Math.round(srcH * scale / 2) * 2);

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const shots = [];
      let last = 0;
      let stopped = false;

      function grab(now) {
        if (stopped || shots.length >= maxFrames) return;
        ctx.drawImage(video, 0, 0, W, H);
        shots.push({ img: ctx.getImageData(0, 0, W, H), t: now });
      }

      const timer = setInterval(() => grab(performance.now()), 1000 / fps);

      const finish = async () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        grab(performance.now());
        try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}

        if (!shots.length) return window.api.recordDone({ ok: false, error: 'No frames were captured.' });

        // real elapsed time per frame, so uneven capture still plays back right
        const frames = shots.map((s, i) => {
          const nxt = shots[i + 1];
          const d = nxt ? Math.max(20, Math.round(nxt.t - s.t)) : Math.round(1000 / fps);
          return { data: s.img.data, img: s.img, delay: Math.min(1000, d) };
        });

        let bytes;
        if (format === 'gif') {
          bytes = window.GifEnc.encode(frames, W, H, {
            colors: opts.colors || 256,
            onProgress: (p) => window.api.renderProgress({ phase: 'encode', p })
          });
        } else {
          const enc = document.createElement('canvas');
          enc.width = W; enc.height = H;
          const ec = enc.getContext('2d');
          const wf = [];
          for (let i = 0; i < frames.length; i++) {
            ec.putImageData(frames[i].img, 0, 0);
            const blob = await new Promise(r => enc.toBlob(r, 'image/webp', (opts.quality || 88) / 100));
            wf.push({ bytes: new Uint8Array(await blob.arrayBuffer()), delay: frames[i].delay });
            window.api.renderProgress({ phase: 'encode', p: (i + 1) / frames.length });
          }
          bytes = window.WebpMux.encode(wf, W, H, {});
        }

        const CH = 4 * 1024 * 1024;
        for (let o = 0; o < bytes.length; o += CH) window.api.recordChunk(bytes.slice(o, o + CH));
        window.api.recordDone({ ok: true, format, frames: frames.length, width: W, height: H, duration: schedule.total });
      };

      await new Promise(r => setTimeout(r, 220));
      player = window.ScenePlayer.play(inner, project, {
        onProgress: (p) => window.api.renderProgress({ phase: 'record', p }),
        onDone: () => setTimeout(finish, 260)
      });
    } catch (err) {
      window.api.recordDone({ ok: false, error: String(err && err.message || err) });
    }
  });
})();
