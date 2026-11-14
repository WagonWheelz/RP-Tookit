/* Plays a project's scenes one after another with a transition between them.

   Used by the editor's Preview button and by every export, so what you watch is
   what you get. Each scene is mounted into its own layer; the outgoing and
   incoming layers are both live during a transition, which is what makes a
   swipe read as scrolling to the next reel rather than a hard cut.

   A step can also be a REVISIT — scenes[i].ref names an earlier scene — which
   is how "scroll back up and watch that one again" is expressed. A revisit
   shows the scene already played out and just dwells on it, because the viewer
   has seen it before; it is the double-take. */
(function () {
  'use strict';
  const S = () => window.Store;
  const R = () => window.Renderer;
  const T = () => window.Timeline;

  const TRANS_SLACK = 30;   // runTransition resolves this much after the CSS ends
  const FLICK_HOLD = 220;   // how long a reel you scroll straight past is seen for
  const flickMs = (ms) => Math.max(160, Math.round(ms * 0.55));

  // Where a step sits in the feed — its position among the real scenes, so that
  // revisit steps don't count as extra videos. Scrolling from the third reel
  // back to the first is two positions, and so two swipes.
  function feedOrder(project) {
    const out = [];
    project.scenes.forEach((sc, i) => { if (!sc.ref) out.push(i); });
    return out;
  }

  function feedPos(project, i) {
    return feedOrder(project).indexOf(S().sceneRefIndex(project, i));
  }

  // The scenes passed THROUGH going from one step to another, endpoints excluded.
  function feedChain(project, fromStep, toStep) {
    const order = feedOrder(project);
    const a = feedPos(project, fromStep), b = feedPos(project, toStep);
    if (a < 0 || b < 0 || Math.abs(b - a) < 2) return [];
    const dir = b > a ? 1 : -1;
    const chain = [];
    for (let p = a + dir; p !== b; p += dir) chain.push(order[p]);
    return chain;
  }

  // Run fn once per scene with the project bound to it, then put the binding
  // back where it was. Timeline.build() reads project.chat/messages, so the
  // binding has to be correct while it runs.
  function eachScene(project, fn) {
    const keep = project.active || 0;
    const out = [];
    try {
      for (let i = 0; i < project.scenes.length; i++) {
        S().bindScene(project, i);
        out.push(fn(project, i, project.scenes[i]));
      }
    } finally {
      S().bindScene(project, keep);
    }
    return out;
  }

  // How long one step is on screen. `watch` overrides the natural length — it
  // is "let this reel play for two seconds, then scroll" — and a revisit is
  // shown complete rather than animated in, so it only ever dwells.
  function sceneDurations(project) {
    return eachScene(project, (p, i, sc) => {
      const revisit = S().isRevisit(p, i);
      const watch = Math.max(0, Number(sc.watch) || 0);
      const natural = T().build(p).total;
      const body = revisit ? (watch || 1200) : (watch || natural);
      const hold = revisit ? 0 : Math.max(0, Number(sc.hold) || 0);
      const last = i === project.scenes.length - 1;
      const ms = S().transitionMs(sc.transition);
      // every reel scrolled past on the way to the next step is a swipe of its
      // own, and each one costs time the export has to know about
      const flicks = last ? 0 : feedChain(project, i, i + 1).length;
      const trans = last ? 0
        : ms + TRANS_SLACK + flicks * (flickMs(ms) + TRANS_SLACK + FLICK_HOLD);
      return { body, hold, trans, natural, revisit, flicks, total: body + hold + trans };
    });
  }

  function totalDuration(project) {
    return sceneDurations(project).reduce((a, d) => a + d.total, 0);
  }

  // --------------------------------------------------------------- staging
  function makeStack(container) {
    window.HTML.setHTML(container, window.HTML.html`<div class="scene-stack"><div class="scene-layer"></div><div class="scene-layer"></div></div>`);
    const stack = container.firstElementChild;
    return { stack, layers: Array.prototype.slice.call(stack.children) };
  }

  // The first layer just IS there. Adding .on normally runs the layer's fade
  // transition, which a still or the first frame of an export would catch at
  // opacity 0 — a blank picture.
  function showNow(layer) {
    layer.style.transition = 'none';
    layer.classList.add('on');
    void layer.offsetWidth;
    layer.style.transition = '';
  }

  function sizeStack(stack, layer) {
    const dev = layer.querySelector('.device');
    if (!dev) return;
    stack.style.width = dev.offsetWidth + 'px';
    stack.style.height = dev.offsetHeight + 'px';
  }

  // --------------------------------------------------- the audio handover
  // Two reels are on screen at once during a swipe, and if both are playing you
  // hear both. A real scroll hands over halfway: the one leaving goes quiet as
  // it clears the screen, and the one arriving takes over from there.
  function silence(layer, C) {
    if (!layer) return;
    layer.querySelectorAll('video, audio').forEach(v => {
      try { v.__ttStop = true; v.muted = true; } catch (e) {}
      C.pauseMedia(v);
    });
  }

  function wake(layer, C) {
    if (!layer) return;
    layer.querySelectorAll('[data-stage]').forEach(v => {
      try {
        v.__ttStop = false;
        v.muted = true;                  // preview is silent; export mixes audio
      } catch (e) {}
      C.playMedia(v);
    });
  }

  function runTransition(stack, from, to, kind, ms, C) {
    return new Promise((resolve) => {
      if (!ms || kind === 'cut') {
        silence(from, C);
        from.classList.remove('on');
        to.classList.add('on');
        wake(to, C);
        resolve();
        return;
      }
      // park the incoming layer off-stage, then let CSS carry both across
      to.classList.add('on', 'enter-' + kind);
      // force a frame so the start position is applied before we animate
      void to.offsetWidth;
      stack.style.setProperty('--tms', ms + 'ms');
      from.classList.add('leave-' + kind);
      to.classList.remove('enter-' + kind);
      // halfway: the outgoing reel is half off the screen — cut it, start the
      // other, and the two never overlap
      C.setTimeout(() => { silence(from, C); wake(to, C); }, Math.round(ms / 2));
      C.setTimeout(() => {
        from.classList.remove('on', 'leave-' + kind);
        silence(from, C);                // belt and braces once it is gone
        resolve();
      }, ms + TRANS_SLACK);
    });
  }

  // -------------------------------------------------------------- playback
  // Shows a single scene, no animation — what the editor draws while you edit.
  // With `atMs` it shows the scene as it is that far in (see Timeline.seek);
  // without, the whole conversation at once.
  function mountStatic(container, project, index, atMs) {
    const { stack, layers } = makeStack(container);
    const keep = project.active || 0;
    S().bindScene(project, index == null ? keep : index);
    const view = R().mount(layers[0], project);
    const tl = T().create(view, project);
    if (atMs != null && !S().isRevisit(project, project.active)) tl.seek(atMs); else tl.showAll();
    showNow(layers[0]);
    sizeStack(stack, layers[0]);
    S().bindScene(project, keep);
    return { stack, view, tl, layer: layers[0] };
  }

  // opts.only     play just this one step, with no transitions in or out
  // opts.from     start this many ms into the first step that plays
  // opts.clock    a Clock (the exporter passes a virtual one)
  // opts.sound    voice notes play out loud (the editor preview)
  function play(container, project, opts) {
    opts = opts || {};
    const C = opts.clock || window.Clock.real;
    const { stack, layers } = makeStack(container);
    const durations = sceneDurations(project);
    const only = opts.only == null ? -1 : Math.max(0, Math.min(project.scenes.length - 1, opts.only | 0));
    const grand = (only >= 0 ? durations[only].body : durations.reduce((a, d) => a + d.total, 0)) || 1;
    const keep = project.active || 0;

    let stopped = false;
    let cleaned = false;
    let current = null;          // the timeline that is running right now
    let elapsedBefore = 0;
    // how each scene is arrived AT, kept out here on purpose — writing it onto
    // the scene objects would get it saved into templates
    const incoming = [];

    // Must run at most once. The loop can be parked in a timer that fires after
    // stop() has already cleaned up and the editor has moved the user to another
    // scene — a second bindScene(keep) would silently drag them back.
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (current) { try { current.stop(); } catch (e) {} current = null; }
      // a reel left rolling on the layer behind has to go quiet too
      layers.forEach(l => silence(l, C));
      S().bindScene(project, keep);
    }

    const wait = (ms) => C.wait(ms);

    // Which layer is showing. Counted rather than derived from the scene index,
    // because scrolling past intermediate reels mounts extra screens in between.
    let li = 0;
    const layerAt = (n) => layers[((n % 2) + 2) % 2];

    // Scroll through the reels between here and there, one swipe each, so going
    // back three videos looks like going back three videos.
    async function flickThrough(fromStep, toStep, kind, ms) {
      const chain = feedChain(project, fromStep, toStep);
      const quick = flickMs(ms);
      for (const sceneIdx of chain) {
        if (stopped) return;
        S().bindScene(project, sceneIdx);
        const slot = layerAt(li + 1);
        const view = R().mount(slot, project);
        const seen = T().create(view, project, C);
        seen.showAll();                       // passed at speed, already playing
        await runTransition(stack, layerAt(li), slot, kind, quick, C);
        li++;
        if (stopped) { try { seen.stop(); } catch (e) {} return; }
        await wait(FLICK_HOLD);              // let it actually be seen moving
        // keeps rolling into the next swipe; the handover pauses it
        try { seen.stop({ keepStage: true }); } catch (e) {}
      }
    }

    async function run() {
      const first = only >= 0 ? only : 0;
      const lastStep = only >= 0 ? only : project.scenes.length - 1;
      for (let i = first; i <= lastStep && !stopped; i++) {
        const sc = project.scenes[i];
        const d = durations[i];
        const from = i === first ? Math.max(0, Number(opts.from) || 0) : 0;

        if (i > first) {
          const inc = incoming[i] || { kind: 'cut', ms: 0 };
          await flickThrough(i - 1, i, inc.kind, inc.ms);
          if (stopped) break;
        }

        const slot = layerAt(li + (i === first ? 0 : 1));
        S().bindScene(project, i);
        const view = R().mount(slot, project);
        const tl = T().create(view, project, C, { sound: !!opts.sound });
        // a voice note still talking on the screen being left goes quiet as the
        // next one comes in (the export cuts it at the same handover)
        if (current) { try { current.hush(); } catch (e) {} }
        current = tl;

        // A revisit is a screen the viewer has already seen, so it comes back
        // fully populated instead of animating itself in from nothing.
        if (d.revisit) tl.showAll(); else if (from > 0) tl.seek(from); else tl.hideAll();

        if (i === first) {
          showNow(slot);
          sizeStack(stack, slot);
        } else {
          const inc = incoming[i] || { kind: 'cut', ms: 0 };
          await runTransition(stack, layerAt(li), slot, inc.kind, inc.ms, C);
          li++;
          if (stopped) break;
        }

        const base = elapsedBefore;
        const report = (ms) => {
          if (opts.onProgress) opts.onProgress(Math.min(1, (base + ms) / grand), base + ms, grand);
        };

        if (d.revisit) {
          report(0);
          await wait(Math.max(0, d.body - from));
        } else if (sc.watch > 0) {
          // play it, but scroll away after the time you asked for
          let ticker = null;
          await new Promise((resolve) => {
            let done = false;
            const finish = () => { if (done) return; done = true; C.clearTimeout(ticker); resolve(); };
            tl.play({ from, onProgress: (p, ms) => report(Math.min(ms, d.body)), onDone: finish });
            ticker = C.setTimeout(finish, Math.max(0, d.body - from));
          });
          // the schedule is done, but the reel plays on until it is half off
          try { tl.stop({ keepStage: true }); } catch (e) {}
        } else {
          await new Promise((resolve) => {
            tl.play({ from, onProgress: (p, ms) => report(ms), onDone: resolve });
          });
        }
        if (stopped) break;

        elapsedBefore += d.body;
        if (only >= 0) break;            // a single-step preview ends here

        // a beat on the finished scene before moving on
        if (d.hold) {
          await wait(d.hold);
          elapsedBefore += d.hold;
        }
        if (stopped) break;

        // hand the transition style to the next iteration
        if (project.scenes[i + 1]) {
          incoming[i + 1] = { kind: sc.transition, ms: S().transitionMs(sc.transition) };
          elapsedBefore += d.trans;   // includes every reel scrolled past
        }
      }
      const wasStopped = stopped;
      cleanup();
      if (!wasStopped && opts.onDone) opts.onDone();
    }

    run();
    return {
      stop() { stopped = true; cleanup(); },
      total: grand
    };
  }

  // Every voice note / video across the whole sequence, timed from the start of
  // the first scene — so audio still lines up when a project has many scenes.
  // A revisit replays nothing: the viewer is looking at a screen that already
  // finished, so its sounds are not fired again.
  function audioCues(project) {
    const durations = sceneDurations(project);
    const cues = [];
    let base = 0;
    eachScene(project, (p, i, sc) => {
      const d = durations[i];
      const body = d.body;

      // A sound belongs to the screen it is on. The moment that screen is half
      // out of the way it has to be silent, or it plays on underneath the next
      // one — a 13s reel cued at 0 was still going three reels later, which is
      // exactly the overlap you hear.
      const last = i === project.scenes.length - 1;
      const handover = base + body + d.hold + (last ? 0 : S().transitionMs(sc.transition) / 2);

      // `media` is the whole media record; both builds read its bytes by NAME
      // (api.mediaBlob on the web, api.readMedia on the desktop)
      const push = (atMs, media, naturalMs) => {
        const endMs = Math.min(handover, atMs + (naturalMs || Infinity));
        if (endMs <= atMs) return;
        cues.push({ at: atMs / 1000, until: endMs / 1000, media });
      };

      // A revisit shows a screen that has already played out, so its messages
      // do not fire again — but you are looking at the video a second time and
      // it has to be audible, or scrolling back lands on a silent reel.
      if (!d.revisit) {
        const sched = T().build(p);
        sched.events.forEach(ev => {
          if (ev.type !== 'voice' && ev.type !== 'video') return;
          if (ev.t > body) return;                  // cut off by a watch time
          const m = p.messages.find(x => x.id === ev.id);
          if (!m || !window.MediaRef.src(m.media)) return;
          push(base + ev.t, m.media, S().mediaMs(m.media) || null);
        });
      }

      // The clip behind a TikTok screen has a soundtrack too, and it is not a
      // message, so the loop above never sees it. It loops on screen, so it
      // loops here as well — each repeat clipped at the handover.
      if (p.timeline.playVideo) {
        S().stageMedia(p).forEach(md => {
          if (!S().isVideoMedia(md) || !window.MediaRef.src(md)) return;
          const len = S().mediaMs(md);
          if (!len) { push(base, md, null); return; }
          for (let at = 0, n = 0; at < body && n < 40; at += len, n++) {
            push(base + at, md, len);
          }
        });
      }
      base += d.total;
    });
    return cues;
  }

  window.ScenePlayer = { play, mountStatic, totalDuration, sceneDurations, eachScene, audioCues };
})();
