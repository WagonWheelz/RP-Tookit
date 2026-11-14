/* ============================================================================
   pornhub.js — the second page chassis, for an adult tube-style watch page.

   Same contract as youtube.js: a fixed 1280x720 document laid out from the
   fields on project.chat.ph, built as DOM (every value goes in through
   textContent, so a pasted tag in a title stays text), and returned as the
   element itself so the video painter stays attached to live nodes.

   Geometry was measured off a real page at 1280 wide: the player sits at
   x=146 y=188 at 656x369, the title below it at 17px/700, the base font is
   12px Arial on black. Nothing else was taken from it.
   ========================================================================= */
(function () {
  'use strict';

  const src = (m) => (m && window.MediaRef) ? window.MediaRef.src(m) : '';
  const isVideo = (m) => {
    if (!m) return false;
    if (window.Store && window.Store.isVideoMedia) return window.Store.isVideoMedia(m);
    return ['mp4', 'webm', 'mov', 'mkv', 'm4v'].indexOf(String(m.ext || '').toLowerCase()) >= 0;
  };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const icon = (paths, cls) => {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    (paths || []).forEach(d => {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  };

  function durSecs(txt) {
    const m = String(txt || '').match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
    if (!m) return 0;
    return m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
  }
  function fmtTime(sec, round) {
    const s = Math.max(0, round ? Math.round(Number(sec) || 0) : Math.floor(Number(sec) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // --------------------------------------------------------------- defaults
  function defaultPH() {
    return {
      title: 'The video title sits here, two lines at most before it clips',
      channel: 'Uploader name',
      handle: '@uploader',
      subs: '1.2K videos',
      views: '482K views',
      date: '2 days ago',
      likes: '12K',
      dislikes: '3K',
      percent: 80,
      duration: '12:34',
      at: 0,
      tags: ['tag one', 'tag two', 'tag three', 'tag four', 'tag five'],
      description: 'The description panel sits under the tags. Put the blurb, the credits and anything else that would go in the box here — it stays a fixed height so the page never shifts.',
      video: null,
      thumb: null,
      avatar: null,
      sidebar: [
        { title: 'A related video, two lines of title at most', channel: 'Another uploader', meta: '1.4M views', thumb: null, duration: '8:21' },
        { title: 'Second related video in the rail', channel: 'Another uploader', meta: '88K views', thumb: null, duration: '4:07' },
        { title: 'Third related video, same card shape', channel: 'Another uploader', meta: '2.2M views', thumb: null, duration: '21:15' },
        { title: 'Fourth related video fills the rail', channel: 'Another uploader', meta: '310K views', thumb: null, duration: '9:58' }
      ]
    };
  }

  function data(project) {
    const c = project.chat || {};
    const ph = c.ph || {};
    const fallback = defaultPH();
    const base = (window.Store && window.Store.defaultPH)
      ? Object.assign(fallback, window.Store.defaultPH() || {})
      : fallback;
    if (!Array.isArray(base.sidebar) || !base.sidebar.length) base.sidebar = fallback.sidebar;
    if (!Array.isArray(base.tags)) base.tags = fallback.tags.slice();
    const out = Object.assign({}, base, ph);
    out.sidebar = Array.isArray(ph.sidebar) && ph.sidebar.length
      ? ph.sidebar.map((it, i) => Object.assign({}, base.sidebar[i % base.sidebar.length], it || {}))
      : base.sidebar;
    out.tags = Array.isArray(ph.tags) ? ph.tags : base.tags;
    return out;
  }

  // ------------------------------------------------------------------ parts
  function header() {
    const head = el('header', 'ph-top');

    const brand = el('div', 'ph-brand');
    brand.appendChild(el('span', 'ph-logo', 'Pornhub'));
    brand.appendChild(el('span', 'ph-logo-rule'));

    const search = el('div', 'ph-search');
    const input = el('input', 'ph-search-input');
    input.type = 'text';
    input.readOnly = true;
    input.tabIndex = -1;
    input.placeholder = 'Search';
    const go = el('button', 'ph-search-btn');
    go.appendChild(icon(['M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z']));
    search.appendChild(input);
    search.appendChild(go);

    const right = el('div', 'ph-top-right');
    const upload = el('button', 'ph-upload');
    upload.appendChild(icon(['M12 4v10m0-10L8 8m4-4 4 4', 'M4 16v3h16v-3']));
    upload.appendChild(el('span', null, 'Upload'));
    const signin = el('button', 'ph-signin', 'Sign in');
    right.appendChild(upload);
    right.appendChild(signin);

    head.appendChild(brand);
    head.appendChild(search);
    head.appendChild(right);
    return head;
  }

  function player(d) {
    const wrap = el('div', 'ph-player');
    const stage = el('div', 'ph-stage');

    const poster = src(d.thumb);
    const videoSrc = src(d.video);
    let clipEl = null;

    if (videoSrc && isVideo(d.video)) {
      // canvas over the clip: the exporter serialises this page into an SVG
      // image, where a <video> paints as an empty box
      const canvas = el('canvas', 'ph-media');
      canvas.width = 1312;
      canvas.height = 738;
      stage.appendChild(canvas);

      const clip = el('video', 'ph-clip');
      clip.src = videoSrc;
      clip.muted = true;
      clip.loop = true;
      clip.playsInline = true;
      clip.setAttribute('muted', '');
      clip.setAttribute('playsinline', '');
      if (poster) clip.poster = poster;
      stage.appendChild(clip);

      const ctx = canvas.getContext ? canvas.getContext('2d') : null;
      const paint = () => {
        if (!ctx || !clip.videoWidth) return;
        try { ctx.drawImage(clip, 0, 0, canvas.width, canvas.height); } catch (e) {}
      };
      ['loadeddata', 'seeked', 'playing', 'timeupdate'].forEach(ev2 => clip.addEventListener(ev2, paint));
      const timer = setInterval(paint, 120);
      clip.addEventListener('emptied', () => clearInterval(timer));

      const at0 = Math.max(0, Number(d.at) || 0);
      const seekTo = (t) => { try { clip.currentTime = Math.max(0, t); } catch (e) {} };
      const park = () => seekTo(at0 > 0 ? at0 : 0.001);
      clip.addEventListener('loadedmetadata', park, { once: true });
      if (clip.readyState >= 1) park();
      clipEl = clip;
      paint();
    } else if (poster) {
      const img = el('img', 'ph-media');
      img.src = poster;
      img.alt = '';
      stage.appendChild(img);
    } else {
      stage.appendChild(el('div', 'ph-media ph-empty', 'Video'));
    }

    // control bar, the same grammar as the watch page: bar, then the row
    const ctrls = el('div', 'ph-ctrls');
    const track = el('div', 'ph-track');
    const fill = el('div', 'ph-track-fill');
    const dot = el('div', 'ph-track-dot');
    track.appendChild(fill);
    track.appendChild(dot);
    ctrls.appendChild(track);

    const row = el('div', 'ph-ctrl-row');
    const left = el('div', 'ph-ctrl-left');
    const play = el('button', 'ph-icon ph-sm');
    play.appendChild(icon(['M8 5v14l11-7z']));
    const vol = el('button', 'ph-icon ph-sm');
    vol.appendChild(icon(['M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z']));
    const time = el('span', 'ph-time', '');
    left.appendChild(play); left.appendChild(vol); left.appendChild(time);

    const right = el('div', 'ph-ctrl-right');
    ['HD', '⚙', '⛶'].forEach(g => right.appendChild(el('button', 'ph-icon ph-sm ph-glyph', g)));
    row.appendChild(left); row.appendChild(right);
    ctrls.appendChild(row);
    stage.appendChild(ctrls);

    const totalOf = () => {
      if (clipEl && isFinite(clipEl.duration) && clipEl.duration > 0) return clipEl.duration;
      return durSecs(d.duration) || 0;
    };
    const sync = () => {
      const total = totalOf();
      const t = clipEl ? Math.min(clipEl.currentTime || 0, total || 1e9) : 0;
      time.textContent = fmtTime(t) + ' / ' + fmtTime(total, true);
      const p = total > 0 ? Math.max(0, Math.min(1, t / total)) : 0;
      fill.style.right = ((1 - p) * 100) + '%';
      dot.style.left = (p * 100) + '%';
    };
    sync();
    if (clipEl) ['timeupdate', 'seeked', 'loadedmetadata', 'play', 'pause'].forEach(e2 => clipEl.addEventListener(e2, sync));

    play.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!clipEl) return;
      if (clipEl.paused) clipEl.play().catch(() => {}); else clipEl.pause();
    });

    let dragging = false;
    const seekFromTrack = (e) => {
      const r = track.getBoundingClientRect();
      if (!r.width) return;
      const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const total = totalOf();
      if (clipEl && total > 0) { try { clipEl.currentTime = p * total; } catch (err) {} }
      sync();
      const pageEl = track.closest('.ph-page');
      if (pageEl) pageEl.dispatchEvent(new CustomEvent('yt:seek', { bubbles: true, detail: { t: p * total } }));
    };
    track.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { track.setPointerCapture(e.pointerId); } catch (err) {}
      seekFromTrack(e);
      e.stopPropagation();
    });
    track.addEventListener('pointermove', (e) => { if (dragging) seekFromTrack(e); });
    track.addEventListener('pointerup', () => { dragging = false; });
    track.addEventListener('pointercancel', () => { dragging = false; });

    wrap.appendChild(stage);
    return wrap;
  }

  function voteBar(d) {
    const wrap = el('div', 'ph-vote');
    const pct = Math.max(0, Math.min(100, Number(d.percent) || 0));
    const fill = el('div', 'ph-vote-fill');
    fill.style.width = pct + '%';
    wrap.appendChild(fill);
    wrap.appendChild(el('span', 'ph-vote-label', pct + '%'));
    wrap.appendChild(el('span', 'ph-vote-counts', (d.likes || '0') + ' up  ·  ' + (d.dislikes || '0') + ' down'));
    return wrap;
  }

  function actions(d) {
    const row = el('div', 'ph-actions');

    const like = el('button', 'ph-btn ph-like');
    like.appendChild(icon(['M2 10h4v10H2zm20-1.2c0-1-.8-1.8-1.8-1.8h-5.5l.9-4.2v-.3c0-.4-.2-.8-.4-1L13.9 1 7.5 7.4c-.3.3-.5.7-.5 1.1V19c0 1.1.9 2 2 2h8.2c.8 0 1.5-.5 1.8-1.2l2.8-6.6c.1-.2.1-.4.1-.6z']));
    like.appendChild(el('span', null, d.likes || '0'));
    row.appendChild(like);

    const dislike = el('button', 'ph-btn ph-dislike');
    dislike.appendChild(icon(['M22 14h-4V4h4zm-20 1.2c0 1 .8 1.8 1.8 1.8h5.5l-.9 4.2v.3c0 .4.2.8.4 1L10.1 23l6.4-6.4c.3-.3.5-.7.5-1.1V5c0-1.1-.9-2-2-2H6.8c-.8 0-1.5.5-1.8 1.2L2.2 10.8c-.1.2-.1.4-.1.6z']));
    row.appendChild(dislike);

    const fav = el('button', 'ph-btn');
    fav.appendChild(icon(['M12 3l2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 17l-5.6 3 1.3-6.1L3 9.6l6.3-.7z']));
    fav.appendChild(el('span', null, 'Add to favourites'));
    row.appendChild(fav);

    const playlist = el('button', 'ph-btn');
    playlist.appendChild(icon(['M3 5h12v2H3zm0 6h12v2H3zm0 6h8v2H3zm14-6.5L22 14l-5 3.5z']));
    playlist.appendChild(el('span', null, 'Add to playlist'));
    row.appendChild(playlist);

    const share = el('button', 'ph-btn ph-share');
    share.appendChild(icon(['M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-10z']));
    row.appendChild(share);
    return row;
  }

  function uploader(d) {
    const row = el('div', 'ph-uploader');

    const av = el('div', 'ph-avatar');
    const a = src(d.avatar);
    if (a) {
      const img = el('img');
      img.src = a;
      img.alt = '';
      av.appendChild(img);
    } else {
      av.appendChild(el('span', null, (d.channel || 'U').trim().charAt(0).toUpperCase()));
    }

    const info = el('div', 'ph-uploader-info');
    const name = el('div', 'ph-uploader-name', d.channel || 'Uploader name');
    name.appendChild(el('span', 'ph-tick', '✓'));
    info.appendChild(name);
    info.appendChild(el('div', 'ph-uploader-sub', [d.handle, d.subs].filter(Boolean).join('  ·  ')));

    const sub = el('button', 'ph-subscribe', 'Subscribe');
    row.appendChild(av);
    row.appendChild(info);
    row.appendChild(sub);
    return row;
  }

  function tagRow(d) {
    const row = el('div', 'ph-tags');
    (d.tags || []).forEach((t, i) => {
      if (i > 0) row.appendChild(el('span', 'ph-tag-sep', '·'));
      row.appendChild(el('a', 'ph-tag', String(t)));
    });
    return row;
  }

  function description(d) {
    const box = el('div', 'ph-desc');
    box.appendChild(el('div', 'ph-desc-meta', [d.views, d.date].filter(Boolean).join('  ·  ')));
    box.appendChild(el('p', 'ph-desc-text', d.description || ''));
    box.appendChild(el('button', 'ph-more', 'Show more'));
    return box;
  }

  function card(item) {
    const art = el('article', 'ph-card');
    const thumb = el('div', 'ph-card-thumb');
    const t = src(item.thumb);
    if (t) {
      const img = el('img');
      img.src = t;
      img.alt = '';
      thumb.appendChild(img);
    }
    if (item.duration) thumb.appendChild(el('span', 'ph-card-dur', item.duration));
    const meta = el('div', 'ph-card-meta');
    meta.appendChild(el('h3', 'ph-card-title', item.title || ''));
    meta.appendChild(el('div', 'ph-card-ch', item.channel || ''));
    meta.appendChild(el('div', 'ph-card-stats', item.meta || ''));
    art.appendChild(thumb);
    art.appendChild(meta);
    return art;
  }

  function body(project) {
    const d = data(project);
    const page = el('div', 'ph-page');
    page.dataset.theme = project.theme === 'light' ? 'light' : 'dark';

    page.appendChild(header());

    const main = el('div', 'ph-body');

    const col = el('main', 'ph-main');
    col.appendChild(player(d));
    col.appendChild(el('h1', 'ph-title', d.title || ''));
    col.appendChild(voteBar(d));
    col.appendChild(actions(d));
    col.appendChild(description(d));
    col.appendChild(uploader(d));
    col.appendChild(tagRow(d));

    const side = el('aside', 'ph-side');
    d.sidebar.forEach(it => side.appendChild(card(it)));

    main.appendChild(col);
    main.appendChild(side);
    page.appendChild(main);
    return page;
  }

  // the hook the exporters await, same contract as the watch page
  async function still(container, project) {
    const d = data(project);
    const clip = container.querySelector('video.ph-clip');
    if (!clip || !isVideo(d.video)) return false;
    const at = Math.max(0, Number(d.at) || 0);

    const seeked = () => new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; clip.removeEventListener('seeked', fin); res(); };
      clip.addEventListener('seeked', fin);
      setTimeout(fin, 4000);
    });

    if (clip.readyState < 1) {
      await new Promise((res) => {
        let done = false;
        const fin = () => { if (done) return; done = true; clip.removeEventListener('loadedmetadata', fin); res(); };
        clip.addEventListener('loadedmetadata', fin);
        setTimeout(fin, 6000);
      });
    }
    try { clip.pause(); } catch (e) {}
    if (clip.readyState < 2) {
      await new Promise((res) => {
        let done = false;
        const fin = () => { if (done) return; done = true; clip.removeEventListener('loadeddata', fin); res(); };
        clip.addEventListener('loadeddata', fin);
        setTimeout(fin, 6000);
      });
    }
    if (Math.abs((clip.currentTime || 0) - at) > 0.02 || !clip.videoWidth) {
      const p = seeked();
      try { clip.currentTime = at > 0 ? at : 0.001; } catch (e) {}
      await p;
    }
    const canvas = container.querySelector('canvas.ph-media');
    if (canvas && clip.videoWidth) {
      try { canvas.getContext('2d').drawImage(clip, 0, 0, canvas.width, canvas.height); } catch (e) {}
    }
    return true;
  }

  window.PHUI = { body, defaultPH, data, still };
})();
