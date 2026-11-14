/* The two TikTok screens: the live stream and the regular feed.
   Loaded after render.js and reached through window.TikTokUI, so it can borrow
   Renderer's helpers at call time without a circular dependency.

   All markup is html`…` (core/html.js): values are escaped unless they are
   html`` output themselves; numbers going into CSS pass through HTML.num. */
(function () {
  'use strict';
  const I = window.Icons;
  const R = () => window.Renderer;
  const { html, join, setHTML, num, color } = window.HTML;
  const cat = (...parts) => join(parts);
  const fitImg = (m, cls) => R().fitImg(m, cls);

  // --------------------------------------------------------------- helpers
  function avatar(media, name, cls) {
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    return html`<div class="${cls}">${window.MediaRef.src(media) ? fitImg(media) : initial}</div>`;
  }

  function cellMedia(cell) {
    if (window.MediaRef.src(cell.media)) {
      if (window.Store.isVideoMedia(cell.media)) {
        // data-stage marks the clip BEHIND the screen rather than one inside a
        // message — the timeline starts these itself, since no message event
        // will ever fire for them. It loops: a reel you sit on keeps going.
        // fitStyle so Adjust… frames a clip the same way it frames a photo.
        return html`<video class="fitimg" src="${window.MediaRef.src(cell.media)}" data-video data-stage loop muted playsinline preload="auto" ${R().fitStyle(cell.media)}></video>`;
      }
      return fitImg(cell.media);
    }
    return html`<div class="tt-cell-empty"><span>${cell.label || 'drop a photo or clip here'}</span></div>`;
  }

  function cellHTML(cell, project, opts) {
    opts = opts || {};
    const chip = opts.chip && cell.label
      ? html`<div class="tt-cell-chip">${cell.live ? html`<i class="tt-livedot"></i>` : ''}${cell.label}</div>`
      : '';
    return html`<div class="tt-cell${opts.cls ? ' ' + opts.cls : ''}">${cellMedia(cell)}${chip}</div>`;
  }

  // --------------------------------------------------------------- stage
  function stageHTML(project) {
    const tt = project.chat.tt;
    const L = tt.layout;
    let inner;
    if (L === 'group4') {
      inner = tt.cells.slice(0, 4).map(c => cellHTML(c, project, { chip: true }));
    } else if (L === 'gameplay') {
      inner = [cellHTML(tt.cells[0], project, { cls: 'cam', chip: true }), cellHTML(tt.cells[1], project, { cls: 'game' })];
    } else if (L === 'duet') {
      inner = [cellHTML(tt.cells[0], project, { chip: true }), cellHTML(tt.cells[1], project, { chip: true })];
    } else {
      inner = [cellHTML(tt.cells[0], project, {})];
    }
    return html`<div class="tt-cells" data-layout="${L}"${L === 'gameplay' ? html` style="--camratio:${num(tt.gameplayRatio, 0) || 38}%"` : ''}>${inner}</div>`;
  }

  // --------------------------------------------------------------- floaters
  // Reactions rising off the side. Any emoji, any number — staggered with
  // negative delays so a still frame always catches some mid-flight.
  function floatersHTML(project) {
    const f = project.chat.tt.floaters;
    if (!f.on) return html``;
    const list = (f.emojis && f.emojis.length) ? f.emojis : ['❤️'];
    const n = Math.max(1, Math.min(60, num(f.count, 0) || 14));
    const hash = window.Store.hash32;
    const spans = [];
    for (let i = 0; i < n; i++) {
      const h = hash('f' + i);
      const e = list[i % list.length];
      const dur = (num(f.speed, 0) || 4.4) * (0.75 + ((h % 100) / 100) * 0.5);
      const wob = num(f.wobble, 0) || 46;
      spans.push(html`<span class="tt-f" style="--x:${((h >> 3) % 100) / 100 * (num(f.spread, 0) || 64)}px;--w:${((h >> 7) % 100) / 100 * wob - wob / 2}px;--s:${0.75 + ((h >> 11) % 60) / 100};--dur:${dur.toFixed(2)}s;animation-delay:-${(dur * ((h >> 13) % 100) / 100).toFixed(2)}s;font-size:${num(f.size, 0) || 30}px">${e}</span>`);
    }
    return html`<div class="tt-floaters" data-floaters data-side="${f.side || 'right'}">${spans}</div>`;
  }

  // --------------------------------------------------------------- live UI
  function liveTopHTML(project) {
    const tt = project.chat.tt;
    if (!tt.showTopBar) return html``;
    return cat(html`<div class="tt-top"><div class="tt-host">${avatar(tt.hostAvatar || project.chat.avatar, tt.hostName, 'tt-host-av')}`,
      html`<div class="tt-host-meta"><div class="tt-host-name">${tt.hostName}</div>`,
      html`<div class="tt-host-sub">${tt.likeCount} likes</div></div>`,
      tt.following ? html`<div class="tt-follow following">Following</div>` : html`<div class="tt-follow">Follow</div>`,
      html`</div><div class="tt-top-right">`,
      html`${tt.showRank ? html`<div class="tt-rank">${I.ttTrophy({ w: 12, h: 12 })}${tt.rankText}</div>` : ''}`,
      html`<div class="tt-viewers">${I.ttEye({ w: 13, h: 13, sw: 1.7 })}${tt.viewers}</div>`,
      html`<div class="tt-x">${I.ttClose({ w: 15, h: 15, sw: 2.2 })}</div></div></div>`);
  }

  function duetBarHTML(project) {
    const d = project.chat.tt.duet;
    const l = Math.max(0, Math.min(100, num(d.leftScore, 0)));
    const r = Math.max(0, Math.min(100, num(d.rightScore, 0)));
    const total = (l + r) || 1;
    const pct = (l / total) * 100;
    return cat(html`<div class="tt-duetbar"><div class="tt-duet-timer">${d.timer}</div><div class="tt-duet-track">`,
      html`<div class="tt-duet-fill left" style="width:${pct.toFixed(1)}%"></div>`,
      html`<div class="tt-duet-fill right" style="width:${(100 - pct).toFixed(1)}%"></div>`,
      html`<div class="tt-duet-vs" style="left:${pct.toFixed(1)}%">VS</div></div>`,
      html`<div class="tt-duet-scores"><span>${String(d.leftScore)}</span><span>${String(d.rightScore)}</span></div></div>`);
  }

  function liveBottomHTML(project) {
    const tt = project.chat.tt;
    if (!tt.showBottomBar) return html``;
    return cat(html`<div class="tt-bottom"><div class="tt-say">${tt.commentPlaceholder}</div>`,
      html`<div class="tt-bicon">${I.smile({ w: 20, h: 20 })}</div>`,
      html`<div class="tt-bicon">${I.ttShare({ w: 20, h: 20 })}</div>`,
      html`<div class="tt-bicon gift">${I.ttGift({ w: 21, h: 21 })}</div></div>`);
  }

  function liveBody(project) {
    const tt = project.chat.tt;
    return cat(html`<div class="tt tt-live"><div class="tt-stage">${stageHTML(project)}<div class="tt-scrim"></div></div>`,
      html`<div class="tt-ui">${liveTopHTML(project)}${tt.layout === 'duet' ? duetBarHTML(project) : ''}`,
      html`<div class="tt-spacer"></div><div class="tt-gifts" data-gifts></div>`,
      html`${tt.showChat ? html`<div class="tt-chat" data-chat style="--lines:${num(tt.chatLines, 0) || 6}"></div>` : ''}`,
      html`${liveBottomHTML(project)}${floatersHTML(project)}</div></div>`);
  }

  // --------------------------------------------------------------- feed UI
  function feedBody(project) {
    const f = project.chat.tt.feed;
    const tt = project.chat.tt;
    const name = window.Store.brandName(project);

    const ui = [html`<div class="tt-ui">`];
    ui.push(cat(html`<div class="tt-feed-top"><span class="${f.tab === 'Following' ? 'on' : ''}">Following</span><i></i>`,
      html`<span class="${f.tab !== 'Following' ? 'on' : ''}">For You</span>`,
      html`<div class="tt-feed-search">${I.search({ w: 19, h: 19, sw: 2 })}</div></div>`));

    if (f.showSearchBanner) {
      ui.push(html`<div class="tt-searchbar">${I.search({ w: 13, h: 13, sw: 2.2 })}<span>${f.searchTerm}</span><b>See more</b>${I.chevRight({ w: 12, h: 12, sw: 2.4 })}</div>`);
    }

    ui.push(html`<div class="tt-spacer"></div>`);

    if (f.showRail) {
      ui.push(cat(html`<div class="tt-rail"><div class="tt-rail-av">${avatar(project.chat.avatar, f.username, 'tt-rail-avimg')}`,
        html`${f.following ? '' : html`<i class="tt-rail-plus">+</i>`}</div>`,
        html`<div class="tt-rail-item"><span class="ic heart">${I.ttHeart({ w: 33, h: 33 })}</span><b>${f.likes}</b></div>`,
        html`<div class="tt-rail-item"><span class="ic">${I.ttComment({ w: 31, h: 31 })}</span><b>${f.comments}</b></div>`,
        html`<div class="tt-rail-item"><span class="ic fav">${I.ttBookmark({ w: 29, h: 29 })}</span><b>${f.favorites}</b></div>`,
        html`<div class="tt-rail-item"><span class="ic">${I.ttShare({ w: 31, h: 31 })}</span><b>${f.shares}</b></div>`,
        html`<div class="tt-disc">${window.MediaRef.src(project.chat.avatar) ? fitImg(project.chat.avatar) : html`<span class="tt-disc-note">♪</span>`}</div></div>`));
    }

    ui.push(cat(html`<div class="tt-caption"><div class="tt-cap-user">@${f.username}${f.verified ? I.ttVerified({ w: 13, h: 13 }) : ''}</div>`,
      html`<div class="tt-cap-text">${f.caption}${f.hashtags ? html` <span class="tt-tags">${f.hashtags}</span>` : ''}</div>`,
      html`<div class="tt-music"><span class="ic">${I.ttMusic({ w: 13, h: 13, sw: 1.7 })}</span>`,
      html`<span class="tt-music-track"><span>${f.song}</span><span>${f.song}</span></span></div></div>`));

    // data-progress lets the timeline drive this off the real clip; the value
    // here is the starting position and the fallback when there is no video.
    ui.push(html`<div class="tt-progress"><i data-progress style="width:${num(f.progress, 0) || 0}%"></i></div></div>`);

    const sheet = f.showComments ? cat(html`<div class="tt-sheet"><div class="tt-sheet-head"><i class="grab"></i>`,
      html`<div class="tt-sheet-title">${f.comments} comments</div>`,
      html`<div class="tt-sheet-x">${I.ttClose({ w: 15, h: 15, sw: 2.2 })}</div></div>`,
      html`<div class="tt-sheet-list" data-chat></div><div class="tt-sheet-input"><span>Add comment...</span>`,
      html`<div class="tt-sheet-icons">${I.smile({ w: 18, h: 18 })}${I.ttGift({ w: 18, h: 18 })}</div></div></div>`) : '';

    const nav = f.showNav ? cat(html`<div class="tt-nav"><div class="on">${I.ttHome({ w: 21, h: 21 })}<span>Home</span></div>`,
      html`<div>${I.ttFriends({ w: 21, h: 21 })}<span>Friends</span></div>`,
      html`<div class="tt-nav-plus"><i></i><b>+</b></div>`,
      html`<div>${I.ttInbox({ w: 21, h: 21 })}<span>Inbox</span></div>`,
      html`<div>${I.ttProfile({ w: 21, h: 21 })}<span>Profile</span></div></div>`) : '';

    // Same wrapper the live stage uses. A bare .tt-cell dropped straight into
    // .tt-stage is position:relative with nothing but absolutely-positioned
    // children, so it collapses to ZERO HEIGHT and the clip inside it is
    // invisible — the reel played, with sound, behind a black rectangle.
    return cat(html`<div class="tt tt-feed" data-nav="${f.showNav ? 1 : 0}" data-brand="${name}">`,
      html`<div class="tt-stage"><div class="tt-cells" data-layout="single">${cellHTML(tt.cells[0], project, {})}</div><div class="tt-scrim feed"></div></div>`,
      html`${ui}${sheet}${nav}</div>`);
  }

  // --------------------------------------------------------------- brand
  function watermarkHTML(project) {
    const b = project.chat.brand;
    if (!b.watermark) return html``;
    const label = (b.wmText && b.wmText.trim()) || window.Store.brandName(project);
    const x = b.wmX == null ? 88 : num(b.wmX, 88);
    const y = b.wmY == null ? 7 : num(b.wmY, 7);
    const rot = num(b.wmRotate, 0) || 0;
    return cat(html`<div class="tt-watermark" data-wmdrag style="left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${rot}deg);`,
      html`opacity:${(num(b.wmOpacity, 0) || 70) / 100};font-size:${num(b.wmSize, 0) || 15}px">`,
      html`${(b.wmShow !== 'text' && window.MediaRef.src(b.logo)) ? html`<span class="wm-logo">${fitImg(b.logo)}</span>` : ''}`,
      html`${b.wmShow === 'logo' && window.MediaRef.src(b.logo) ? '' : html`<span>${label}</span>`}</div>`);
  }

  // --------------------------------------------------------------- events
  // The gift line is a sentence the user writes with {user} {gift} {count}
  // {coins} in it. It is escaped first; only the fixed <b> tags go in after.
  function giftLine(m) {
    const esc = window.HTML.escText;
    const tpl = esc(m.giftTemplate || '{user} just sent a {gift}');
    return window.HTML.trusted(tpl // html-allow: escaped text, fixed <b> tags around escaped values
      .replace(/\{user\}/g, '<b class="u">' + esc(m.user) + '</b>') // html-allow: as above
      .replace(/\{gift\}/g, '<b class="g">' + esc(m.giftName) + '</b>') // html-allow: as above
      .replace(/\{count\}/g, esc(String(m.giftCount || 1)))
      .replace(/\{coins\}/g, esc(String(m.giftCoins || ''))));
  }

  function badgesHTML(m) {
    return html`${m.subscriber ? html`<span class="tt-badge sub">SUB</span>` : ''}${m.badge ? html`<span class="tt-badge" style="background:${color(m.badgeColor || '#8a5cff', '#8a5cff')}">${m.badge}</span>` : ''}`;
  }

  // Returns { el, lane } — lane says whether it belongs in the chat column or
  // the gift strip above it.
  function buildEvent(m, project) {
    const el = document.createElement('div');
    el.dataset.id = m.id;

    if (m.type === 'gift') {
      el.className = 'tt-gift';
      const icon = window.MediaRef.src(m.giftMedia)
        ? fitImg(m.giftMedia, 'tt-gift-img')
        : html`<span class="tt-gift-emoji">${m.giftIcon || '🎁'}</span>`;
      setHTML(el, cat(avatar(m.userAvatar, m.user, 'tt-gift-av'),
        html`<div class="tt-gift-body"><div class="tt-gift-line">${giftLine(m)}</div>`,
        html`${m.giftCoins ? html`<div class="tt-gift-coins">${I.ttCoin({ w: 11, h: 11 })}${String(m.giftCoins)}</div>` : ''}</div>`,
        html`<div class="tt-gift-icon">${icon}</div>`,
        html`${Number(m.giftCount) > 1 ? html`<div class="tt-gift-x">x${String(m.giftCount)}</div>` : ''}`));
      return { el, lane: 'gift' };
    }

    if (m.type === 'join' || m.type === 'follow' || m.type === 'share' || m.type === 'banner') {
      el.className = 'tt-sys tt-ev-' + m.type;
      const label = m.type === 'join' ? 'joined'
        : m.type === 'follow' ? 'followed the host'
          : m.type === 'share' ? 'shared the live' : '';
      setHTML(el, m.type === 'banner'
        ? html`<span class="tt-sys-pill">${m.text || 'Welcome to the stream'}</span>`
        : html`<span class="tt-sys-pill"><b>${m.user}</b> ${m.text || label}</span>`);
      return { el, lane: 'chat' };
    }

    if (m.type === 'likes') {
      el.className = 'tt-likes-marker';
      el.style.display = 'none';
      return { el, lane: 'chat' };
    }

    // comment (live chat, and the feed's comment sheet)
    const feedStyle = project.platform === 'tiktok';
    el.className = feedStyle ? 'tt-fc' : 'tt-c';
    if (feedStyle) {
      setHTML(el, cat(avatar(m.userAvatar, m.user, 'tt-fc-av'),
        html`<div class="tt-fc-body"><div class="tt-fc-user">${m.user}${badgesHTML(m)}</div>`,
        html`<div class="tt-fc-text">${m.text}</div>`,
        html`<div class="tt-fc-meta"><span>${m.time || '2h'}</span><span>Reply</span></div></div>`,
        html`<div class="tt-fc-like">${I.ttHeart({ w: 15, h: 15 })}<b>${m.likes || ''}</b></div>`));
    } else {
      setHTML(el, cat(avatar(m.userAvatar, m.user, 'tt-c-av'),
        html`<div class="tt-c-body">${badgesHTML(m)}<span class="tt-c-user">${m.user}</span> `,
        html`<span class="tt-c-text">${m.text}</span></div>`));
    }
    return { el, lane: 'chat' };
  }

  window.TikTokUI = {
    body: (project) => cat(project.platform === 'tiktoklive' ? liveBody(project) : feedBody(project), watermarkHTML(project)),
    buildEvent, floatersHTML, watermarkHTML, giftLine
  };
})();
