/* The time source for everything that animates.

   The preview runs on the real clock: performance.now, setTimeout and
   requestAnimationFrame. The web exporter runs the very same timeline and
   scene player on a VIRTUAL clock instead — time only moves when the exporter
   says so, one frame at a time — which is what lets a browser render a video
   that is frame-exact no matter how slowly each frame is drawn.

   Media elements go through the clock too (playMedia / pauseMedia /
   seekMedia). On the real clock they simply play. On a virtual one they stay
   paused, and the clock remembers where each one should be so the exporter
   can seek it before it snapshots the frame. */
(function () {
  'use strict';

  const real = {
    virtual: false,
    now: () => performance.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id),
    raf: (fn) => window.requestAnimationFrame(fn),
    cancelRaf: (id) => window.cancelAnimationFrame(id),
    wait: (ms) => new Promise(r => window.setTimeout(r, ms)),
    playMedia(v) {
      try { const q = v.play(); if (q && q.catch) q.catch(() => {}); } catch (e) {}
    },
    pauseMedia(v) { try { v.pause(); } catch (e) {} },
    seekMedia(v, secs) {
      // seeking before metadata is a no-op that also cancels a pending play,
      // so a clip that is not ready yet gets the seek once it is
      try {
        if (v.readyState >= 1) v.currentTime = secs;
        else v.addEventListener('loadedmetadata', () => { try { v.currentTime = secs; } catch (e) {} }, { once: true });
      } catch (e) {}
    },
    isPlaying: (v) => !v.paused
  };

  // Let every pending promise continuation run. A MessageChannel message is a
  // macrotask, so by the time it arrives the microtask queue is empty — far
  // quicker than setTimeout(0), which browsers clamp to 4ms when nested.
  function flush() {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    });
  }

  function createVirtual(opts) {
    opts = opts || {};
    let t = 0;
    let seq = 0;
    const timers = new Map();          // id -> { at, fn, every }
    let frames = new Map();            // id -> fn
    const media = new Map();           // <video>/<audio> -> { since, from, playing }

    const after = () => { if (opts.onStep) opts.onStep(t); };

    const clock = {
      virtual: true,
      now: () => t,
      setTimeout(fn, ms) {
        const id = ++seq;
        timers.set(id, { at: t + Math.max(0, Number(ms) || 0), fn, every: 0 });
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
      setInterval(fn, ms) {
        const id = ++seq;
        const every = Math.max(1, Number(ms) || 1);
        timers.set(id, { at: t + every, fn, every });
        return id;
      },
      clearInterval(id) { timers.delete(id); },
      raf(fn) { const id = ++seq; frames.set(id, fn); return id; },
      cancelRaf(id) { frames.delete(id); },
      wait(ms) { return new Promise(r => clock.setTimeout(r, ms)); },

      playMedia(v) {
        const st = media.get(v);
        if (st && st.playing) return;
        media.set(v, { since: t, from: Number(v.currentTime) || 0, playing: true });
        try { v.pause(); } catch (e) {}
      },
      pauseMedia(v) {
        const st = media.get(v);
        if (st && st.playing) media.set(v, { since: t, from: clock.mediaTime(v), playing: false });
        try { v.pause(); } catch (e) {}
      },
      seekMedia(v, secs) {
        const st = media.get(v);
        media.set(v, { since: t, from: Number(secs) || 0, playing: !!(st && st.playing) });
      },
      isPlaying: (v) => !!(media.get(v) && media.get(v).playing),

      // Where a clip should be right now, in seconds — looping if it loops.
      mediaTime(v) {
        const st = media.get(v);
        if (!st) return Number(v.currentTime) || 0;
        let s = st.from + (st.playing ? (t - st.since) / 1000 : 0);
        const d = Number(v.duration);
        if (isFinite(d) && d > 0) s = v.loop ? s % d : Math.min(s, Math.max(0, d - 0.001));
        return Math.max(0, s);
      },
      trackedMedia: () => Array.from(media.keys()),

      // Move time forward to `target`, firing every timer that falls due in
      // order, then one animation frame at the target time.
      async advanceTo(target) {
        for (;;) {
          let next = null, nextId = 0;
          timers.forEach((tm, id) => {
            if (tm.at <= target && (!next || tm.at < next.at || (tm.at === next.at && id < nextId))) {
              next = tm; nextId = id;
            }
          });
          if (!next) break;
          t = Math.max(t, next.at);
          if (next.every) next.at += next.every; else timers.delete(nextId);
          try { next.fn(); } catch (e) { console.error(e); }
          after();
          await flush();
        }
        t = Math.max(t, target);
        const run = frames;
        frames = new Map();
        run.forEach((fn) => { try { fn(t); } catch (e) { console.error(e); } });
        after();
        await flush();
      },

      dispose() { timers.clear(); frames.clear(); media.clear(); }
    };
    return clock;
  }

  window.Clock = { real, createVirtual, flush };
})();
