/* Animation engine: turns a project into a timed schedule of reveals. */
(function () {
  'use strict';

  const STRUCTURAL = ['divider', 'system'];
  // A status change is not drawn in the chat at all: it rewrites the line under
  // the contact's name ("online", "last seen today at 10:24") at its moment.
  const INVISIBLE = ['status'];
  const TYPED = ['text', 'link'];
  const isStructural = (m) => !m || STRUCTURAL.indexOf(m.type) >= 0 || INVISIBLE.indexOf(m.type) >= 0;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const contentLen = (m) => String(m.text || '').length + String(m.caption || '').length;

  // --- what the thumbs actually do ------------------------------------------
  // Typing a message is not a uniform stream of characters. The keyboard has to
  // come up, the space bar is slower than a letter, an emoji means leaving the
  // letters, hunting through the drawer and coming back, and the whole thing
  // ends on a deliberate tap of send. buildComposeScript lays that out as timed
  // steps; the timeline sums them for the schedule and the player replays them.

  function buildComposeScript(text, opts) {
    const S = window.Store;
    opts = opts || {};
    const seed = opts.seed || 'x';
    let jn = 0;
    const jit = (base, spread) => {
      const h = S.hash32(seed + '#' + (jn++));
      return Math.max(40, Math.round(base + ((h % 1000) / 1000 - 0.5) * 2 * spread));
    };

    const steps = [];
    const gs = S.graphemes(text);

    // the keyboard rising, or just the tap that puts a caret in the field
    steps.push({ k: 'wait', ms: opts.keyboardHidden ? jit(430, 60) : jit(250, 50) });

    let mode = 'abc';
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      if (S.isEmojiChar(g)) {
        if (mode !== 'emoji') {
          steps.push({ k: 'wait', ms: jit(175, 45) });            // reach for the smiley
          steps.push({ k: 'mode', mode: 'emoji', ms: jit(300, 55) });
          mode = 'emoji';
        }
        steps.push({ k: 'scroll', ch: g, ms: jit(540, 190) });    // hunt for it
        steps.push({ k: 'emoji', ch: g, ms: jit(170, 40) });
      } else {
        if (mode !== 'abc') {
          steps.push({ k: 'mode', mode: 'abc', ms: jit(285, 45) });
          mode = 'abc';
        }
        let ms;
        if (g === ' ') ms = jit(152, 32);                          // space bar is a reach
        else if (g === '\n') ms = jit(205, 35);                    // and so is return
        else if ('.,!?;:'.indexOf(g) >= 0) ms = jit(168, 38);
        else if (/[0-9]/.test(g)) ms = jit(230, 45);                // via the symbols key
        else ms = jit(108, 26);
        steps.push({ k: 'key', ch: g, ms: ms });
      }
    }

    steps.push({ k: 'wait', ms: jit(290, 70) });                    // read it back
    steps.push({ k: 'send', ms: jit(180, 35) });                    // tap send

    let total = 0;
    steps.forEach(st => { st.at = total; total += st.ms; });
    return { steps: steps, total: total };
  }

  function composeScriptFor(m, project) {
    return buildComposeScript(m.text || m.caption || '', {
      seed: m.id,
      keyboardHidden: !!(project.chat && project.chat.pov === 'owner' && project.chat.keyboardAlways === false)
    });
  }

  // --- realistic pacing -----------------------------------------------------
  // Thumb typing runs at roughly 3–4 characters a second with a beat to start;
  // reading runs at roughly 24 characters a second plus a beat to react. Both
  // numbers are deliberately a little quicker than real life so the resulting
  // video does not drag.

  function typingMsFor(m, prev, owner) {
    if (isStructural(m) || m.type === 'typing') return 0;
    if (m.side === 'out') {
      // In phone-owner POV your own message is typed out on screen, so its
      // duration is however long the keystroke script takes. Otherwise you
      // never see your own indicator at all.
      if (!owner) return 0;
      if (!contentLen(m)) return 0;
      return composeScriptFor(m, owner.project).total;
    }
    const len = contentLen(m);
    let ms;
    if (TYPED.indexOf(m.type) >= 0) ms = 450 + len * 105;
    else if (m.type === 'voice' || m.type === 'audio') ms = 900 + Math.min(3000, (Number(m.duration) || 8) * 120);
    else ms = 700;                              // finding and attaching something
    if (prev && prev.side === 'in' && !isStructural(prev)) ms *= 0.55;  // already mid-flow
    return clamp(ms, 300, 5200);
  }

  // How long the other side needs to take this message in before replying.
  function readMsFor(m) {
    const len = contentLen(m);
    switch (m.type) {
      case 'image': case 'gif': case 'sticker': return 1300;
      // long enough to watch it, when there is a real clip and we know its length
      case 'video': return clamp(window.Store.mediaMs(m.media) || 1900, 1200, 120000);
      case 'voice': case 'audio': return clamp(900 + (Number(m.duration) || 8) * 260, 1200, 4500);
      case 'file': case 'contact': case 'location': case 'link': return 1300;
      case 'call': return 1100;
      default: return clamp(420 + len * 42, 500, 3400);
    }
  }

  function delayAfter(m, next, owner) {
    if (!next) return 250;
    if (isStructural(m)) return 420;
    if (m.type === 'typing') return 1400;
    if (next.side === m.side && !isStructural(next)) {
      return clamp(240 + contentLen(m) * 7, 220, 900);   // same person, still going
    }
    let gap = readMsFor(m);
    if (!owner && next.side === 'out' && !isStructural(next) && next.type !== 'typing') {
      // with no keyboard on screen your reply has no visible indicator, so its
      // compose time is folded into this gap instead
      gap += clamp(250 + contentLen(next) * 75, 300, 3200);
    }
    return Math.round(gap);
  }

  // Rewrites timings for every message that has not been hand-tuned.
  // Live chat has no typing indicator and moves much faster than a DM thread:
  // comments land a beat apart, gifts get room to be read.
  function autoTimeTT(project) {
    project.messages.forEach((m) => {
      if (!m.anim) m.anim = { delay: 700, typing: 0, effect: 'slide', manual: false };
      if (m.anim.manual) return;
      m.anim.typing = 0;
      const len = String(m.text || '').length;
      switch (m.type) {
        case 'gift':   m.anim.delay = clamp(950 + (Number(m.giftCount) > 1 ? 350 : 0), 700, 2600); break;
        case 'likes':  m.anim.delay = 320; break;
        case 'join':
        case 'follow':
        case 'share':  m.anim.delay = 520; break;
        case 'banner': m.anim.delay = 900; break;
        default:       m.anim.delay = clamp(430 + len * 20, 380, 1500);
      }
    });
    return project;
  }

  function autoTime(project) {
    if (window.Store && window.Store.isTT(project.platform)) return autoTimeTT(project);
    const list = project.messages;
    const isOwner = !!(project.chat && project.chat.pov === 'owner');
    const owner = isOwner ? { project: project } : false;
    list.forEach((m, i) => {
      if (!m.anim) m.anim = { delay: 900, typing: 0, effect: 'pop', manual: false };
      if (m.anim.manual) return;
      m.anim.typing = typingMsFor(m, list[i - 1], owner);
      m.anim.delay = delayAfter(m, list[i + 1], isOwner);
    });
    return project;
  }

  // How long an appear effect takes to settle, so a still taken "after" a
  // message shows it landed rather than mid-pop.
  const SETTLE_MS = 650;

  function build(project) {
    const tl = project.timeline;
    if (tl.autoTiming) autoTime(project);
    const ownerPov = !!(project.chat && project.chat.pov === 'owner');
    const pace = Math.max(0.25, Number(tl.pace) || 1);
    const P = (ms) => Math.max(0, Math.round(ms / pace));
    const events = [];
    // per message: when its first beat starts (typing included), when it shows
    // and when the next one may start — what stepping through a scene uses
    const steps = [];
    const giftHold = Number(tl.giftHold) || 3600;
    let t = P(Math.max(0, tl.startDelay || 0));
    // the animation must not finish while something is still playing
    let mediaEnd = 0;
    const runsUntil = (ms) => { if (ms > mediaEnd) mediaEnd = ms; };

    project.messages.forEach((m) => {
      const anim = m.anim || {};
      const typing = P(Math.max(0, Number(anim.typing) || 0));
      const delay = P(Math.max(0, anim.delay == null ? tl.defaultDelay : Number(anim.delay)));
      const start = t;

      if (typing > 0 && !isStructural(m) && m.type !== 'typing') {
        if (m.side === 'out' && ownerPov) {
          events.push({ t, type: 'compose-on', id: m.id, duration: typing, script: composeScriptFor(m, project) });
          t += typing;
          events.push({ t, type: 'compose-off' });
        } else {
          events.push({ t, type: 'typing-on', side: m.side });
          t += typing;
          events.push({ t, type: 'typing-off' });
        }
      }
      if (m.type === 'status') {
        events.push({ t, type: 'status', id: m.id, text: m.text || '' });
      } else {
        events.push({ t, type: 'show', id: m.id, effect: anim.effect || 'pop' });
      }
      // Only a REAL file holds the animation open. `m.duration` is a label —
      // the "0:47" on a voice note and how long its waveform takes to fill —
      // and is very often a joke length with no audio behind it.
      if ((m.type === 'voice' || m.type === 'audio') && tl.playVoice) {
        events.push({ t: t + 120, type: 'voice', id: m.id, duration: Math.max(0.5, Number(m.duration) || 8) });
        runsUntil(t + 120 + window.Store.mediaMs(m.media));
      }
      if (m.type === 'video' && tl.playVideo) {
        events.push({ t: t + 120, type: 'video', id: m.id });
        runsUntil(t + 120 + window.Store.mediaMs(m.media));
      }
      if (m.type === 'typing') {
        // explicit typing message: it stays for its own delay then disappears
        events.push({ t: t + delay, type: 'hide', id: m.id });
      }
      // a gift banner slides in, sits for a beat, then clears the way
      if (m.type === 'gift') {
        events.push({ t: t + P(Math.max(1200, giftHold)), type: 'hide', id: m.id });
      }
      // reaction bursts and gifts both throw emoji up the side
      if (m.type === 'likes') {
        events.push({ t: t + 40, type: 'burst', id: m.id });
      }
      steps.push({ id: m.id, start, shown: t, end: t + delay });
      t += delay;
    });

    // A TikTok screen is a video with overlays on it — the clip behind is not a
    // message, so nothing above has accounted for it. Let the longest one play
    // through once.
    if (tl.playVideo) {
      window.Store.stageMedia(project).forEach(md => {
        if (window.Store.isVideoMedia(md)) runsUntil(window.Store.mediaMs(md));
      });
    }

    events.sort((a, b) => a.t - b.t);
    const total = Math.max(t, mediaEnd) + P(Math.max(0, tl.endHold || 0));
    return { events, steps, total, mediaEnd };
  }

  // The moment that best shows "the screen after message i": it has landed and
  // settled, but whatever comes next (even a typing indicator) has not begun.
  function stepTime(schedule, i) {
    const st = schedule.steps[i];
    if (!st) return schedule.total;
    const nxt = schedule.steps[i + 1];
    const limit = nxt ? nxt.start - 1 : schedule.total;
    return Math.max(st.shown, Math.min(st.shown + SETTLE_MS, limit));
  }

  const ANIM_CLASSES = ['anim-pop', 'anim-slide', 'anim-fade', 'anim-drop', 'anim-slam'];

  // opts.sound   play voice notes out loud — the editor preview only. Exports
  //              mix their sound separately (ScenePlayer.audioCues), so a
  //              virtual clock never makes a sound, and the desktop export
  //              window does not ask for it.
  function create(view, project, clock, opts) {
    const C = clock || window.Clock.real;
    const sound = !!(opts && opts.sound) && !C.virtual;
    const { phone, scroll, els } = view;
    const byId = (id) => project.messages.find(m => m.id === id);
    let raf = null, startTs = 0, idx = 0, running = false;
    let typingEl = null;
    let composer = null;
    let scrollTween = null;
    // schedule time, in ms from the start of this scene — what the waveforms,
    // the keyboard script and the clips are all measured against
    let curT = 0;
    const waves = [];
    const voices = [];              // <audio> elements playing voice notes (opts.sound)
    let schedule = build(project);
    const baseStatus = (project.chat && project.chat.contactSubtitle) || '';
    let status = baseStatus;

    // ---- header subtitle ------------------------------------------------
    // Two things write the line under the contact's name: status changes, and
    // the "typing…" a header shows while they type. Typing always wins while
    // it lasts, then the current status comes back.
    let headerTyping = false;
    function paintStatus() {
      const sub = phone.querySelector('.hdr-sub');
      if (sub) sub.textContent = headerTyping ? 'typing…' : status;
    }
    function setStatus(text) { status = text; paintStatus(); }

    // ---- iMessage "Delivered / Read" ------------------------------------
    // It sits under the newest message you sent that is on screen, so it walks
    // down the thread as the conversation plays.
    function markLastOut() {
      let last = null;
      els.forEach((el) => {
        el.classList.remove('is-last-out');
        if (el.classList.contains('side-out') && !el.classList.contains('hidden') &&
            !el.classList.contains('type-typing')) last = el;
      });
      // a newest message with its status hidden shows no line at all
      if (last && last.querySelector('.status-line')) last.classList.add('is-last-out');
    }

    function hideAll() {
      els.forEach((el) => el.classList.add('hidden'));
      removeTyping();
      endCompose();
      setStatus(baseStatus);
      phone.querySelectorAll('[data-stage]').forEach(v => { v.__keepPos = false; });
      scrollTween = null;
      scroll.scrollTop = 0;
      waves.length = 0;
      markLastOut();
    }

    // The clip behind a TikTok screen belongs to the screen, not to a message,
    // so nothing in the schedule ever starts it. Kick it off by hand.
    //
    // This has to survive the element not being ready yet. A <video> mounted a
    // moment ago can still be at readyState 0, where seeking is a no-op that
    // cancels the pending play and leaves it sitting on a black first frame —
    // which is exactly how a reel ended up looking dead while the same code
    // worked elsewhere by winning the race. So: never seek before metadata, and
    // keep trying until it is genuinely running.
    const stageArmed = [];

    function armStageVideo(v) {
      if (C.virtual) { if (!v.__keepPos) C.seekMedia(v, 0); C.playMedia(v); return; }
      let settled = false;
      const attempt = () => {
        if (settled || v.__ttStop) return;
        try {
          v.muted = true;
          // only rewind something that is not already rolling — a reel woken
          // mid-swipe is meant to keep going, not jump back to the start
          if (v.paused && v.readyState >= 1 && v.currentTime > 0.05 && !v.__keepPos) v.currentTime = 0;
          const q = v.play();
          if (q && q.then) q.then(() => { settled = true; }, () => {});
        } catch (e) { /* try again below */ }
      };
      const check = C.setInterval(() => {
        if (v.__ttStop || (!v.paused && v.currentTime > 0)) { settled = true; C.clearInterval(check); return; }
        attempt();
      }, 120);
      // give up after a couple of seconds rather than spinning forever
      C.setTimeout(() => C.clearInterval(check), 2500);
      v.addEventListener('loadedmetadata', attempt, { once: true });
      v.addEventListener('canplay', attempt, { once: true });
      attempt();
      stageArmed.push(() => C.clearInterval(check));
    }

    function startStageVideos() {
      phone.querySelectorAll('[data-stage]').forEach(v => {
        v.__ttStop = false;
        armStageVideo(v);
      });
    }

    function stopStageVideos() {
      while (stageArmed.length) { try { stageArmed.pop()(); } catch (e) {} }
      phone.querySelectorAll('[data-stage]').forEach(v => {
        v.__ttStop = true;
        C.pauseMedia(v);
      });
    }

    function clearAnimClasses(el) { ANIM_CLASSES.forEach(c => el.classList.remove(c)); }

    function showAll() {
      stop();
      endCompose();
      // a still of a reel should still be the reel, not a black first frame
      if (project.timeline.playVideo) startStageVideos();
      els.forEach((el) => { el.classList.remove('hidden'); clearAnimClasses(el); });
      removeTyping();
      // the last status change is the one the screen ends on
      const changes = project.messages.filter(m => m.type === 'status');
      setStatus(changes.length ? (changes[changes.length - 1].text || '') : baseStatus);
      // fill waveforms so still exports look "played"
      phone.querySelectorAll('[data-wave]').forEach(w => {
        w.querySelectorAll('i').forEach(b => b.classList.remove('on'));
      });
      markLastOut();
      scrollToBottom(false);
    }

    // Our own eased scroll rather than behavior:'smooth', because the browser's
    // runs on the wall clock and an export runs on a virtual one.
    function scrollToBottom(smooth) {
      if (!project.timeline.autoScroll) return;
      const target = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      if (!smooth || Math.abs(target - scroll.scrollTop) < 2) {
        scrollTween = null;
        scroll.scrollTop = target;
        return;
      }
      scrollTween = { from: scroll.scrollTop, t0: C.now(), dur: 280 };
      if (!running) {
        // nothing is driving frames (a still), so land it now
        scroll.scrollTop = target;
        scrollTween = null;
      }
    }

    function tickScrollTween(now) {
      if (!scrollTween) return;
      const target = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      const p = Math.min(1, (now - scrollTween.t0) / scrollTween.dur);
      const e = 1 - Math.pow(1 - p, 3);
      scroll.scrollTop = scrollTween.from + (target - scrollTween.from) * e;
      if (p >= 1) scrollTween = null;
    }

    function makeTyping(side) {
      removeTyping();
      typingEl = document.createElement('div');
      typingEl.className = 'msg side-' + side + ' type-typing tail anim-pop';
      window.HTML.setHTML(typingEl, window.HTML.html`<div class="stack"><div class="row"><div class="bubble typing-bubble"><i></i><i></i><i></i></div></div></div>`);
      scroll.appendChild(typingEl);
      if (project.chat.headerTyping && side === 'in') { headerTyping = true; paintStatus(); }
      scrollToBottom(true);
    }

    function removeTyping() {
      if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
      typingEl = null;
      if (headerTyping) { headerTyping = false; paintStatus(); }
    }

    // ---- phone-owner POV: replay the keystroke script -------------------
    function startCompose(ev, at) {
      const typed = phone.querySelector('[data-typed]');
      endCompose();
      if (!typed) return;
      const script = ev.script || { steps: [], total: 1 };
      composer = {
        start: at == null ? curT : at,
        steps: script.steps,
        // a hand-tuned or paced duration stretches the whole script evenly
        scale: script.total > 0 ? Math.max(0.05, (ev.duration || script.total) / script.total) : 1,
        i: 0,
        out: '',
        el: typed,
        scroll: null
      };
      typed.textContent = '';
      phone.classList.add('composing');
      setKbMode('abc');
      scrollToBottom(true);
    }

    function endCompose() {
      const typed = phone.querySelector('[data-typed]');
      if (typed) typed.textContent = '';
      composer = null;
      phone.classList.remove('composing');
      setKbMode('abc');
      phone.querySelectorAll('.kb-key.press, .kb-emo.press, .kb-emokey.press, .round.press')
        .forEach(k => k.classList.remove('press'));
      const sc = phone.querySelector('[data-emojiscroll]');
      if (sc) sc.scrollTop = 0;
    }

    function setKbMode(mode) {
      const kb = phone.querySelector('.kb');
      if (kb) kb.classList.toggle('emoji-mode', mode === 'emoji');
    }

    let still = false;      // true while seeking: no key flashes, no tweens
    const startedClips = [];
    function tapKey(el, ms) {
      if (!el || still) return;
      el.classList.add('press');
      C.clearTimeout(el._pt);
      el._pt = C.setTimeout(() => el.classList.remove('press'), ms || 95);
    }

    function flashKey(ch) {
      const kb = phone.querySelector('.kb');
      if (!kb || !ch) return;
      const low = ch.toLowerCase();
      let el;
      if (ch === ' ') el = kb.querySelector('.kb-key.space');
      else if (ch === '\n') el = kb.querySelector('.kb-key.ret');
      else if (/[a-z]/.test(low)) el = kb.querySelector('.kb-key[data-k="' + low + '"]');
      else if (ch === ',' || ch === '.') el = kb.querySelector('.kb-key[data-k="' + ch + '"]');
      // digits and the rest of the punctuation live behind the symbols key
      tapKey(el || kb.querySelector('.kb-key.num'));
      if (ch !== low && /[a-z]/.test(low)) tapKey(kb.querySelector('.kb-key.shift'));
    }

    // Scroll the emoji drawer to the target over the length of the step, the
    // way a thumb flick settles on the one you were looking for.
    function emojiTarget(ch) {
      const sc = phone.querySelector('[data-emojiscroll]');
      if (!sc) return null;
      const cell = sc.querySelector('.kb-emo[data-e="' + ch + '"]');
      if (!cell) return null;
      return {
        el: sc,
        to: Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight,
          cell.offsetTop - sc.clientHeight / 2 + cell.offsetHeight / 2))
      };
    }

    function startEmojiScroll(ch, dur) {
      const tg = emojiTarget(ch);
      if (!tg) return;
      if (still) { tg.el.scrollTop = tg.to; return; }
      composer.scroll = { el: tg.el, from: tg.el.scrollTop, to: tg.to, t0: curT, dur: Math.max(80, dur) };
    }

    function tickScroll(now) {
      const s2 = composer && composer.scroll;
      if (!s2) return;
      const p = Math.min(1, (now - s2.t0) / s2.dur);
      const e = 1 - Math.pow(1 - p, 3);                 // ease out, like a flick
      s2.el.scrollTop = s2.from + (s2.to - s2.from) * e;
      if (p >= 1) composer.scroll = null;
    }

    function enterStep(st) {
      const kb = phone.querySelector('.kb');
      if (st.k === 'key') {
        flashKey(st.ch);
        composer.out += st.ch;
        composer.el.textContent = composer.out;
      } else if (st.k === 'emoji') {
        const sc = phone.querySelector('[data-emojiscroll]');
        const cell = sc && sc.querySelector('.kb-emo[data-e="' + st.ch + '"]');
        tapKey(cell, 190);
        composer.out += st.ch;
        composer.el.textContent = composer.out;
      } else if (st.k === 'mode') {
        if (kb) tapKey(kb.querySelector(st.mode === 'emoji' ? '.kb-emokey' : '.kb-emoji-bar .abc'), 130);
        setKbMode(st.mode);
      } else if (st.k === 'scroll') {
        startEmojiScroll(st.ch, st.ms * composer.scale);
      } else if (st.k === 'send') {
        tapKey(phone.querySelector('.input-bar .round.send'), 150);
        const kb2 = phone.querySelector('.kb');
        if (kb2 && composer.out.indexOf('\n') >= 0) tapKey(kb2.querySelector('.kb-key.ret'));
      }
      scrollToBottom(false);
    }

    function tickCompose(now) {
      if (!composer) return;
      const elapsed = now - composer.start;   // both in schedule time
      while (composer.i < composer.steps.length &&
             elapsed >= composer.steps[composer.i].at * composer.scale) {
        enterStep(composer.steps[composer.i]);
        composer.i++;
      }
      tickScroll(now);
    }

    // A wave of reactions thrown up the side of a live stream. Uses the same
    // keyframes as the ambient stream, but each one runs once and cleans up.
    function burst(emoji, count, size) {
      const host = phone.querySelector('[data-floaters]');
      if (!host || still) return;
      const f = (project.chat.tt && project.chat.tt.floaters) || {};
      const set = emoji ? [emoji] : ((f.emojis && f.emojis.length) ? f.emojis : ['❤️']);
      const n = Math.max(1, Math.min(80, count || 14));
      const spread = Number(f.spread) || 64;
      const wob = Number(f.wobble) || 46;
      const base = Number(f.speed) || 4.4;
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'tt-f burst';
        s.textContent = set[i % set.length];
        // a burst wants more spread and a longer stagger than the ambient
        // stream, or they come up as one clump
        const r = Math.random();
        const dur = base * (0.7 + Math.random() * 0.5);
        s.style.cssText =
          '--x:' + (Math.random() * spread * 1.5 - spread * 0.25) + 'px;' +
          '--w:' + (Math.random() * wob * 1.3 - wob * 0.65) + 'px;' +
          '--s:' + (0.65 + Math.random() * 0.65) + ';' +
          '--dur:' + dur.toFixed(2) + 's;' +
          'animation-delay:' + (r * 1.15).toFixed(2) + 's;' +
          'font-size:' + (size || Number(f.size) || 30) + 'px';
        host.appendChild(s);
        C.setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, (dur + r * 1.2) * 1000 + 300);
      }
    }

    function fire(ev, at) {
      if (ev.type === 'burst') {
        const m = byId(ev.id);
        if (m) burst(m.floatEmoji || '', Number(m.floatCount) || 14, 0);
        return;
      }
      if (ev.type === 'status') return setStatus(ev.text);
      if (ev.type === 'compose-on') return startCompose(ev, at);
      if (ev.type === 'compose-off') return endCompose();
      if (ev.type === 'typing-on') return makeTyping(ev.side);
      if (ev.type === 'typing-off') return removeTyping();
      if (ev.type === 'hide') {
        const el = els.get(ev.id); if (el) el.classList.add('hidden');
        markLastOut();
        return;
      }
      if (ev.type === 'show') {
        const el = els.get(ev.id);
        if (!el) return;
        el.classList.remove('hidden');
        // a gift landing also throws its own icon up the side
        const gm = byId(ev.id);
        if (gm && gm.type === 'gift' && gm.giftIcon) {
          burst(gm.giftIcon, Math.min(30, 6 + (Number(gm.giftCount) || 1) * 3), 27);
        }
        if (!still && ev.effect && ev.effect !== 'none') {
          clearAnimClasses(el);
          void el.offsetWidth;
          el.classList.add('anim-' + ev.effect);
        }
        markLastOut();
        scrollToBottom(!still);
        return;
      }
      if (ev.type === 'voice') {
        const el = els.get(ev.id);
        if (!el) return;
        const w = el.querySelector('[data-wave]');
        if (w) waves.push({ el: w, start: at == null ? curT : at, dur: ev.duration * 1000, timeEl: el.querySelector('[data-vtime]') });
        const playIcon = el.querySelector('[data-vplay]');
        if (playIcon && window.Icons) window.HTML.setHTML(playIcon, window.Icons.pause({ w: 22, h: 22 }));
        // the real file, heard in the preview. Started part-way in when the
        // preview starts part-way in; a jump (`still`) parks it for play().
        const m = byId(ev.id);
        if (sound && m && window.MediaRef.src(m.media)) {
          const a = document.createElement('audio');
          a.preload = 'auto';
          a.src = window.MediaRef.src(m.media);
          voices.push(a);
          C.seekMedia(a, at == null ? 0 : Math.max(0, (curT - at) / 1000));
          if (still) startedClips.push(a); else C.playMedia(a);
        }
        return;
      }
      if (ev.type === 'video') {
        const el = els.get(ev.id);
        const v = el && el.querySelector('[data-video]');
        if (v) {
          const from = at == null ? 0 : Math.max(0, (curT - at) / 1000);
          C.seekMedia(v, from);
          if (still) { C.pauseMedia(v); startedClips.push(v); } else C.playMedia(v);
        }
        const badge = el && el.querySelector('.play-badge');
        if (badge) badge.style.display = 'none';
        return;
      }
    }

    // The scrubber under a TikTok reel. It follows the clip itself when there is
    // one — so it reaches the end exactly when the video does — and otherwise
    // just crawls across for however long the scene lasts.
    function tickPlaybackBar(elapsed) {
      const bar = phone.querySelector('[data-progress]');
      if (!bar) return;
      const v = phone.querySelector('[data-stage]');
      let p;
      if (v && isFinite(v.duration) && v.duration > 0) {
        p = (C.virtual ? C.mediaTime(v) : v.currentTime) / v.duration;
      } else {
        const span = (schedule && schedule.total) || 0;
        if (!span) return;
        p = elapsed / span;
      }
      bar.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(2) + '%';
    }

    function tickWaves(now) {
      for (const w of waves) {
        const p = Math.max(0, Math.min(1, (now - w.start) / w.dur));
        const bars = w.el.querySelectorAll('i');
        const upto = Math.floor(p * bars.length);
        for (let i = 0; i < bars.length; i++) bars[i].classList.toggle('on', i < upto);
        if (w.timeEl) w.timeEl.textContent = window.Renderer.mmss((w.dur / 1000) * p);
      }
    }

    let onDone = null, onProgress = null;

    function loop(ts) {
      if (!running) return;
      const now = C.virtual ? C.now() : ts;
      const elapsed = now - startTs;
      curT = elapsed;
      while (idx < schedule.events.length && schedule.events[idx].t <= elapsed) {
        fire(schedule.events[idx], schedule.events[idx].t); idx++;
      }
      tickWaves(elapsed);
      tickCompose(elapsed);
      tickScrollTween(now);
      tickPlaybackBar(elapsed);
      if (onProgress) onProgress(Math.min(1, elapsed / schedule.total), elapsed, schedule.total);
      if (elapsed >= schedule.total) {
        running = false;
        raf = null;
        if (onDone) onDone();
        return;
      }
      raf = C.raf(loop);
    }

    // play({ from }) starts part-way in: everything before `from` is applied
    // instantly, then it runs live from there. That is how "preview from this
    // message" works.
    function play(opts) {
      opts = opts || {};
      onDone = opts.onDone || null;
      onProgress = opts.onProgress || null;
      schedule = build(project);
      const from = Math.max(0, Number(opts.from) || 0);
      if (from > 0) {
        seek(from);
        // clips that were already rolling at that point carry on from there
        startedClips.forEach(v => C.playMedia(v));
      } else hideAll();
      if (project.timeline.playVideo) startStageVideos();
      idx = 0;
      while (idx < schedule.events.length && schedule.events[idx].t <= from) idx++;
      running = true;
      startTs = C.now() - from;
      raf = C.raf(loop);
    }

    // Lay the screen out exactly as it is `ms` into the scene, without
    // animating anything — what you see when you step through the messages,
    // and what an image export "at this step" captures.
    function seek(ms) {
      stop();
      schedule = build(project);
      hideAll();
      still = true;
      curT = ms;
      startedClips.length = 0;
      try {
        let i = 0;
        for (; i < schedule.events.length && schedule.events[i].t <= ms; i++) {
          fire(schedule.events[i], schedule.events[i].t);
        }
        els.forEach(clearAnimClasses);
        if (typingEl) clearAnimClasses(typingEl);
        // a message being typed out on the keyboard right now
        if (composer) {
          const elapsed = ms - composer.start;
          while (composer.i < composer.steps.length &&
                 elapsed >= composer.steps[composer.i].at * composer.scale) {
            enterStep(composer.steps[composer.i]);
            composer.i++;
          }
          composer.scroll = null;
        }
        tickWaves(ms);
        // the reel behind a TikTok screen, parked where it would be
        phone.querySelectorAll('[data-stage]').forEach(v => {
          v.__keepPos = true;
          const at = () => {
            const d = Number(v.duration);
            C.seekMedia(v, isFinite(d) && d > 0 ? (ms / 1000) % d : ms / 1000);
            C.pauseMedia(v);
          };
          if (v.readyState >= 1) at(); else v.addEventListener('loadedmetadata', at, { once: true });
        });
        tickPlaybackBar(ms);
        markLastOut();
      } finally {
        still = false;
      }
      scrollTween = null;
      scrollToBottom(false);
      return schedule;
    }

    // stop({ keepStage: true }) ends the schedule but LEAVES THE REEL ROLLING.
    // On a real feed the clip you are watching carries on until it is half off
    // the screen; freezing it the moment its messages ran out is what made the
    // playback read as "pause, scroll, play" instead of one continuous scroll.
    // The scene player pauses it at the halfway point of the swipe instead.
    function stop(opts) {
      const keepStage = !!(opts && opts.keepStage);
      running = false;
      if (raf) C.cancelRaf(raf);
      raf = null;
      waves.length = 0;
      hush();
      if (!keepStage) stopStageVideos();
      phone.querySelectorAll('[data-video]').forEach(v => {
        if (keepStage && v.hasAttribute('data-stage')) return;
        C.pauseMedia(v);
      });
    }

    // silence the voice notes and let their files go
    function hush() {
      voices.forEach(a => {
        C.pauseMedia(a);
        try { a.removeAttribute('src'); a.load(); } catch (e) {}
      });
      voices.length = 0;
    }

    return {
      play, stop, seek, showAll, hideAll, hush,
      get total() { return build(project).total; },
      schedule: () => build(project)
    };
  }

  window.Timeline = { build, create, autoTime, typingMsFor, readMsFor, buildComposeScript, stepTime, SETTLE_MS };
})();
