/* ============================================================================
   youtube.js — the watch page chassis.

   A desktop page, not a chat column: masthead, 16:9 player, metadata block,
   and a recommendation rail. Everything on it is user data, so the module
   builds plain DOM and writes text with textContent — no HTML is ever parsed
   from a field, which keeps a pasted "<script>" in a video title inert.

   Reached through window.YouTubeUI, loaded after render.js.
   ========================================================================= */
(function () {
  'use strict';

  const src = (m) => (m && window.MediaRef) ? window.MediaRef.src(m) : '';
  // Media refs carry an extension, not a mime type -- ask the store, which
  // keeps the one list of what counts as a clip.
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

  // --------------------------------------------------------------- defaults
  function defaultYT() {
    return {
      title: 'This is what the video title looks like on a watch page',
      channel: 'Channel name',
      handle: '@channel',
      subs: '1.2M subscribers',
      views: '482,391 views',
      date: 'Premiered 2 days ago',
      likes: '18K',
      description: 'The description sits under the action buttons. Put the video blurb, the links, the timestamps and the credits here — the mockup keeps the same collapsed height so the layout never shifts.',
      comments: '2,418',
      duration: '12:34',
      video: null,           // media ref — plays in the player when set
      thumb: null,           // media ref — poster / thumbnail
      avatar: null,          // media ref — channel picture
      sidebar: [
        { title: 'A recommended video sits here, two lines of title at most', channel: 'Another channel', meta: '1.4M views · 3 days ago', thumb: null, duration: '8:21' },
        { title: 'Second recommendation in the rail', channel: 'Another channel', meta: '88K views · 1 week ago', thumb: null, duration: '4:07' },
        { title: 'Third recommendation, same card shape', channel: 'Another channel', meta: '2.2M views · 2 weeks ago', thumb: null, duration: '21:15' },
        { title: 'Fourth recommendation fills the rail', channel: 'Another channel', meta: '310K views · 1 month ago', thumb: null, duration: '9:58' }
      ]
    };
  }

  function data(project) {
    const c = project.chat || {};
    const yt = c.yt || {};
    // The store's defaults are canonical, but merge them over the module's own
    // so a partial stub (or an old saved project) can never leave a hole.
    const fallback = defaultYT();
    const base = (window.Store && window.Store.defaultYT)
      ? Object.assign(fallback, window.Store.defaultYT() || {})
      : fallback;
    if (!Array.isArray(base.sidebar) || !base.sidebar.length) base.sidebar = fallback.sidebar;
    const out = Object.assign({}, base, yt);
    out.sidebar = Array.isArray(yt.sidebar) && yt.sidebar.length
      ? yt.sidebar.map((it, i) => Object.assign({}, base.sidebar[i % base.sidebar.length], it || {}))
      : base.sidebar;
    return out;
  }

  // ------------------------------------------------------------------ parts
  function masthead(project) {
    const head = el('header', 'yt-mast');

    const burger = el('button', 'yt-icon yt-burger');
    burger.appendChild(icon(['M3 6h18M3 12h18M3 18h18'], 'yt-stroke'));

    const brand = el('div', 'yt-brand');
    const badge = el('span', 'yt-badge');
    badge.appendChild(icon(['M9.5 7.8v8.4l7-4.2z'], 'yt-play'));
    brand.appendChild(badge);
    brand.appendChild(el('span', 'yt-wordmark', 'YouTube'));

    const search = el('div', 'yt-search');
    const input = el('input', 'yt-search-input');
    input.type = 'text';
    input.placeholder = 'Search';
    input.readOnly = true;
    input.tabIndex = -1;
    const go = el('button', 'yt-search-btn');
    go.appendChild(icon(['M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z']));
    search.appendChild(input);
    search.appendChild(go);

    const right = el('div', 'yt-right');
    const kebab = el('button', 'yt-icon');
    kebab.appendChild(icon(['M12 4.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z', 'M12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z', 'M12 16.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z']));
    const mic = el('button', 'yt-icon yt-mic');
    mic.appendChild(icon(['M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12z']));

    const signin = el('button', 'yt-signin');
    signin.appendChild(icon(['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.66-8 3.5V19h16v-1.5c0-1.84-4.7-3.5-8-3.5z'], 'yt-person'));
    signin.appendChild(el('span', null, 'Sign in'));

    right.appendChild(kebab);
    right.appendChild(signin);

    head.appendChild(burger);
    head.appendChild(brand);
    head.appendChild(search);
    head.appendChild(right);
    return head;
  }

  function player(d, project) {
    const wrap = el('div', 'yt-player');
    const stage = el('div', 'yt-stage');

    const poster = src(d.thumb);
    const videoSrc = src(d.video);

    if (videoSrc && isVideo(d.video)) {
      // Draw the clip into a canvas instead of putting a <video> on the page.
      // The exporter serialises this page into an SVG image, and a <video>
      // paints as an empty box there -- which is why an exported PNG came out
      // black. Pixels on a canvas survive the trip.
      const canvas = el('canvas', 'yt-media');
      canvas.width = 1640;
      canvas.height = 922;
      stage.appendChild(canvas);

      const clip = el('video', 'yt-clip');
      clip.src = videoSrc;
      clip.muted = true;
      clip.loop = true;
      clip.autoplay = true;
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
      // an interval, not requestAnimationFrame: a background tab (and the
      // export's offscreen host) never fires animation frames
      const timer = setInterval(paint, 120);
      clip.addEventListener('emptied', () => clearInterval(timer));
      paint();
    } else if (poster) {
      const img = el('img', 'yt-media');
      img.src = poster;
      img.alt = '';
      stage.appendChild(img);
    } else {
      stage.appendChild(el('div', 'yt-media yt-empty', 'Video'));
    }

    // control bar: timeline + the row of buttons along the bottom
    const ctrls = el('div', 'yt-ctrls');
    const track = el('div', 'yt-track');
    track.appendChild(el('div', 'yt-track-fill'));
    track.appendChild(el('div', 'yt-track-dot'));
    ctrls.appendChild(track);

    const row = el('div', 'yt-ctrl-row');
    const left = el('div', 'yt-ctrl-left');
    const play = el('button', 'yt-icon yt-sm');
    play.appendChild(icon(['M8 5v14l11-7z']));
    const next = el('button', 'yt-icon yt-sm');
    next.appendChild(icon(['M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z']));
    const vol = el('button', 'yt-icon yt-sm');
    vol.appendChild(icon(['M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z']));
    const time = el('span', 'yt-time', '0:00 / ' + (d.duration || '0:00'));
    left.appendChild(play); left.appendChild(next); left.appendChild(vol); left.appendChild(time);

    const right = el('div', 'yt-ctrl-right');
    ['CC', '⚙', '⛶'].forEach(glyph => right.appendChild(el('button', 'yt-icon yt-sm yt-glyph', glyph)));
    row.appendChild(left); row.appendChild(right);
    ctrls.appendChild(row);
    stage.appendChild(ctrls);

    wrap.appendChild(stage);
    return wrap;
  }

  function owner(d) {
    const row = el('div', 'yt-owner');
    row.appendChild(channelRow(d));
    return row;
  }

  function avatarBox(d, cls) {
    const box = el('div', cls || 'yt-avatar');
    const a = src(d.avatar);
    if (a) {
      const img = el('img');
      img.src = a;
      img.alt = '';
      box.appendChild(img);
    } else {
      box.appendChild(el('span', null, (d.channel || 'C').trim().charAt(0).toUpperCase()));
    }
    return box;
  }

  function channelRow(d) {
    const info = el('div', 'yt-owner-info');
    const nameLine = el('div', 'yt-owner-name');
    nameLine.appendChild(el('span', 'yt-owner-title', d.channel || 'Channel name'));

    const subLine = el('div', 'yt-owner-sub', [d.subs, d.handle].filter(Boolean).join(' · '));

    info.appendChild(nameLine);
    info.appendChild(subLine);

    const wrap = el('div', 'yt-owner-row');
    wrap.appendChild(avatarBox(d));
    wrap.appendChild(info);

    const subscribe = el('button', 'yt-subscribe', 'Subscribe');
    wrap.appendChild(subscribe);
    return wrap;
  }

  function actions(d) {
    const row = el('div', 'yt-actions');

    const like = el('button', 'yt-pill yt-like');
    like.appendChild(icon(['M2 10h4v10H2zm20-1.2c0-1-.8-1.8-1.8-1.8h-5.5l.9-4.2v-.3c0-.4-.2-.8-.4-1L13.9 1 7.5 7.4c-.3.3-.5.7-.5 1.1V19c0 1.1.9 2 2 2h8.2c.8 0 1.5-.5 1.8-1.2l2.8-6.6c.1-.2.1-.4.1-.6z'], 'yt-like-icon'));
    like.appendChild(el('span', null, d.likes || '0'));
    const likeWrap = el('div', 'yt-split');
    likeWrap.appendChild(like);
    const dislike = el('button', 'yt-pill yt-dislike');
    dislike.appendChild(icon(['M22 14h-4V4h4zm-20 1.2c0 1 .8 1.8 1.8 1.8h5.5l-.9 4.2v.3c0 .4.2.8.4 1L10.1 23l6.4-6.4c.3-.3.5-.7.5-1.1V5c0-1.1-.9-2-2-2H6.8c-.8 0-1.5.5-1.8 1.2L2.2 10.8c-.1.2-.1.4-.1.6z']));
    likeWrap.appendChild(dislike);
    row.appendChild(likeWrap);

    const share = el('button', 'yt-pill');
    share.appendChild(icon(['M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-10z']));
    share.appendChild(el('span', null, 'Share'));
    row.appendChild(share);

    const save = el('button', 'yt-pill');
    save.appendChild(icon(['M3 4h18v2H3zm0 7h12v2H3zm0 7h12v2H3zm14.5-6.5L22 16l-4.5 4.5v-3H14v-3h3.5z']));
    save.appendChild(el('span', null, 'Save'));
    row.appendChild(save);

    const more = el('button', 'yt-pill yt-more');
    more.appendChild(icon(['M12 4.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z', 'M12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z', 'M12 16.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z']));
    row.appendChild(more);
    return row;
  }

  function description(d) {
    const box = el('div', 'yt-desc');
    box.appendChild(el('div', 'yt-desc-meta', [d.views, d.date].filter(Boolean).join('  ·  ')));
    box.appendChild(el('p', 'yt-desc-text', d.description || ''));
    box.appendChild(el('button', 'yt-more-btn', '...more'));
    return box;
  }

  function card(item) {
    const a = el('article', 'yt-card');
    const thumb = el('div', 'yt-card-thumb');
    const t = src(item.thumb);
    if (t) {
      const img = el('img');
      img.src = t;
      img.alt = '';
      thumb.appendChild(img);
    }
    if (item.duration) thumb.appendChild(el('span', 'yt-card-dur', item.duration));
    const meta = el('div', 'yt-card-meta');
    meta.appendChild(el('h3', 'yt-card-title', item.title || ''));
    meta.appendChild(el('div', 'yt-card-ch', item.channel || ''));
    meta.appendChild(el('div', 'yt-card-stats', item.meta || ''));
    a.appendChild(thumb);
    a.appendChild(meta);
    return a;
  }

  function body(project) {
    const d = data(project);
    const page = el('div', 'yt-page');
    page.dataset.theme = project.theme === 'light' ? 'light' : 'dark';

    page.appendChild(masthead(project));

    const main = el('div', 'yt-body');

    const col = el('main', 'yt-main');
    col.appendChild(player(d, project));
    col.appendChild(el('h1', 'yt-title', d.title || ''));
    col.appendChild(channelRow(d));
    col.appendChild(actions(d));
    const descWrap = el('div', 'yt-desc-wrap');
    descWrap.appendChild(description(d));
    col.appendChild(descWrap);

    const side = el('aside', 'yt-side');
    descWrap.appendChild(el('div', 'yt-side-label', 'Comments · ' + (d.comments || '0')));
    d.sidebar.forEach(it => side.appendChild(card(it)));

    main.appendChild(col);
    main.appendChild(side);
    page.appendChild(main);
    // The element, not outerHTML: re-parsing the markup would rebuild every
    // node and leave the video painter attached to an orphan copy.
    return page;
  }

  window.YouTubeUI = { body, defaultYT, data };
})();
