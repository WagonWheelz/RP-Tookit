/* Renders a project into a phone element. Pure DOM, no framework.

   Every piece of markup here is an html`…` template (core/html.js): any value
   in a ${…} slot is escaped as text unless it is itself html`` output, so a
   value from a file can never become live markup. Numbers that go into CSS
   pass through HTML.num, colours through HTML.color. */
(function () {
  'use strict';
  const I = window.Icons;
  const { html, join, setHTML, insert, num, color } = window.HTML;
  const cat = (...parts) => join(parts);         // several html`` pieces as one
  const esc = window.HTML.escText;

  // Chat-style inline formatting: *bold* _italic_ ~strike~ ```mono```
  // The text is escaped FIRST; only these fixed tags are then put around it.
  function fmt(str) {
    let t = esc(str);
    t = t.replace(/```([^`]+)```/g, '<code>$1</code>');
    t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?)])/g, '$1<b>$2</b>');
    t = t.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?)])/g, '$1<i>$2</i>');
    t = t.replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s.,!?)])/g, '$1<s>$2</s>');
    return window.HTML.trusted(t); // html-allow: escaped text with fixed <b>/<i>/<s>/<code> added
  }

  const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|️|‍|\s){1,12}$/u;
  function isEmojiOnly(t) {
    if (!t || !t.trim()) return false;
    t = t.replace(/:posse_[a-z0-9_]+:/g, '\u{1F600}');   // a possum face counts as one emoji
    try { return EMOJI_ONLY.test(t.trim()) && /\p{Extended_Pictographic}/u.test(t); }
    catch (e) { return false; }
  }

  function hashOf(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function waveBars(seed, count) {
    let h = hashOf(seed);
    const out = [];
    for (let i = 0; i < count; i++) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      const v = (h % 1000) / 1000;
      out.push(Math.round(5 + v * 19));
    }
    return out;
  }

  function mmss(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }


  // ---------------------------------------------------------------- chassis
  // (style.setProperty is not markup: a value can only ever be a CSS value)
  function applyVars(phone, project) {
    const p = window.Store.paletteFor(project);
    const c = project.chat;
    const font = (window.Store.FONTS.find(f => f.id === c.font) || window.Store.FONTS[0]).stack;
    const set = (k, v) => phone.style.setProperty(k, v);
    set('--w', window.Store.screenW(c) + 'px');
    set('--h', window.Store.screenH(c) + 'px');
    set('--bg', c.wallpaper.mode === 'color' ? c.wallpaper.color : p.bg);
    set('--bubble-in', p.bubbleIn);
    set('--bubble-out', p.bubbleOut);
    set('--text-in', p.textIn);
    set('--text-out', p.textOut);
    set('--header', p.header);
    set('--header-text', p.headerText);
    set('--meta', p.meta);
    set('--accent', p.accent);
    set('--input-bg', p.inputBg);
    set('--radius', c.bubbleRadius + 'px');
    set('--font', font);
    set('--fs', c.fontScale);
    set('--ui', c.uiScale == null ? 1 : c.uiScale);
    phone.dataset.platform = project.platform;
    phone.dataset.theme = project.theme;
    phone.dataset.pov = project.chat.pov || 'observer';
    phone.dataset.kb = (project.chat.pov === 'owner' && project.chat.keyboardAlways === false) ? 'auto' : 'up';
  }

  function statusBarHTML(project) {
    const sb = project.chat.statusBar;
    const pct = Math.max(0, Math.min(100, num(sb.battery, 0)));
    return cat(html`<div class="sb-left">${sb.carrier ? html`<span class="sb-carrier">${sb.carrier}</span>` : ''}${sb.time}</div>`,
      html`<div class="sb-right">${I.signalDim(Math.max(0, Math.min(4, num(sb.signal, 0))))}${sb.wifi ? I.wifi({ w: 16, h: 16, sw: 1.6 }) : ''}`,
      html`${sb.charging ? html`<span style="display:flex">${I.bolt({ w: 11, h: 11 })}</span>` : ''}<span class="batt-pct">${pct}</span>`,
      html`<span class="batt${sb.charging ? ' charging' : ''}"><i style="width:${pct * 0.21}px"></i></span></div>`);
  }

  // the framing of a photo or clip: numbers only, whatever the file said
  function fitStyle(media) {
    const f = (media && media.fit) || {};
    return html`style="--ox:${num(f.x, 0.5) * 100}%;--oy:${num(f.y, 0.5) * 100}%;--z:${num(f.z, 1)};--of:${window.Store.fitMode(f)}"`;
  }

  // Every picture, clip and sound is drawn from MediaRef.src(): the address
  // this machine resolved for its NAME. A project never holds one itself.
  const src = (media) => window.MediaRef.src(media);

  function fitImg(media, extraClass) {
    if (!media) return html``;
    return html`<img class="fitimg ${extraClass || ''}" src="${src(media)}" alt="" ${fitStyle(media)}>`;
  }

  function avatarHTML(media, name, cls) {
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    if (src(media)) return html`<div class="${cls}">${fitImg(media)}</div>`;
    return html`<div class="${cls}">${initial}</div>`;
  }

  function headerHTML(project) {
    const c = project.chat;
    const av = c.avatar;
    const sub = c.headerTyping ? 'typing…' : c.contactSubtitle;
    if (project.platform === 'imessage') {
      return cat(html`<div class="hdr-back">${I.back({ w: 24, h: 24, sw: 2.2 })}</div>`,
        html`<div class="hdr-center">${avatarHTML(av, c.contactName, 'hdr-avatar')}`,
        html`<div class="hdr-name">${c.contactName}${I.chevRight({ w: 11, h: 11, sw: 2.4 })}</div></div>`,
        html`<div class="hdr-actions">${I.videoCam({ w: 22, h: 22 })}</div>`);
    }
    // the subtitle line is always there, even empty, so a status change part-way
    // through the conversation has somewhere to write
    return cat(html`<div class="hdr-back">${I.back({ w: 22, h: 22, sw: 2.2 })}</div>`,
      html`${avatarHTML(av, c.contactName, 'hdr-avatar')}`,
      html`<div class="hdr-meta"><div class="hdr-name">${c.contactName}</div>`,
      html`<div class="hdr-sub">${sub || ''}</div></div>`,
      html`<div class="hdr-actions">${I.videoCam({ w: 21, h: 21 })}${I.phone({ w: 19, h: 19 })}${I.dots({ w: 19, h: 19 })}</div>`);
  }

  function composeFieldHTML(project) {
    return cat(html`<span class="grow"><span class="ph">${project.chat.inputPlaceholder}</span>`,
      html`<span class="typed" data-typed></span><i class="caret"></i></span>`);
  }

  function inputBarHTML(project) {
    if (project.platform === 'imessage') {
      return cat(html`<div class="round plus">${I.plus({ w: 18, h: 18 })}</div>`,
        html`<div class="field">${composeFieldHTML(project)}</div>`,
        html`<div class="round send">${I.arrowUp({ w: 17, h: 17, sw: 2.4 })}</div>`);
    }
    return cat(html`<div class="field">${I.smile({ w: 21, h: 21 })}${composeFieldHTML(project)}${I.clip({ w: 20, h: 20 })}${I.camera({ w: 20, h: 20 })}</div>`,
      html`<div class="round send"><span class="ic-mic">${I.mic({ w: 18, h: 18 })}</span>`,
      html`<span class="ic-send">${I.send({ w: 18, h: 18 })}</span></div>`);
  }

  // ------------------------------------------------------------- keyboard
  // Shown in "phone owner" POV, where the viewer is the one holding the phone
  // and watches their own message being typed out.
  const KB_ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];

  function kbStyleFor(project) {
    const k = project.chat.keyboard || 'auto';
    if (k !== 'auto') return k;
    return project.platform === 'imessage' ? 'ios' : 'android';
  }

  // Every emoji the script will need has to exist in the drawer so the
  // "scroll to find it" beat has something real to scroll to.
  function drawerEmoji(project) {
    const S = window.Store;
    const list = S.KEYBOARD_EMOJI.slice();
    const seen = {};
    list.forEach(e => { seen[e] = 1; });
    (project.messages || []).forEach(m => {
      if (m.side !== 'out') return;
      S.graphemes((m.text || '') + (m.caption || '')).forEach(g => {
        if (!S.isEmojiChar(g) || seen[g]) return;
        seen[g] = 1;
        // deterministic placement, far enough down that finding it reads as a scroll
        const at = 24 + (S.hash32(g) % Math.max(1, list.length - 40));
        list.splice(at, 0, g);
      });
    });
    return list;
  }

  function emojiPanelHTML(project) {
    const list = drawerEmoji(project);
    return cat(html`<div class="kb-emoji"><div class="kb-emoji-scroll" data-emojiscroll>`,
      html`${list.map(e => html`<span class="kb-emo" data-e="${e}">${e}</span>`)}</div>`,
      html`<div class="kb-emoji-bar"><span class="kb-key sp abc">ABC</span>`,
      html`<span class="kb-cat on">😀</span><span class="kb-cat">🐶</span><span class="kb-cat">🍕</span>`,
      html`<span class="kb-cat">⚽</span><span class="kb-cat">💡</span><span class="kb-cat">❤️</span>`,
      html`<span class="kb-key sp back">${I.backspace({ w: 19, h: 19, sw: 1.6 })}</span></div></div>`);
  }

  function keyboardHTML(project) {
    if (project.chat.pov !== 'owner') return html``;
    const style = kbStyleFor(project);
    const key = (k) => html`<span class="kb-key" data-k="${k}">${k}</span>`;
    const suggest = style === 'ios'
      ? html`<div class="kb-suggest"><span>I</span><i></i><span class="mid">The</span><i></i><span>I&rsquo;m</span></div>`
      : html`<div class="kb-suggest gb"><span class="kb-emokey">${I.smile({ w: 17, h: 17 })}</span><span class="mid">GIF</span><span>${I.search({ w: 16, h: 16 })}</span></div>`;
    const r4 = style === 'ios'
      ? cat(html`<div class="kb-row r4"><span class="kb-key sp num">123</span>`,
        html`<span class="kb-key sp globe kb-emokey">${I.smile({ w: 19, h: 19 })}</span>`,
        html`<span class="kb-key space" data-k=" ">space</span><span class="kb-key sp ret">return</span></div>`)
      : cat(html`<div class="kb-row r4"><span class="kb-key sp num">?123</span><span class="kb-key sp" data-k=",">,</span>`,
        html`<span class="kb-key space" data-k=" "></span><span class="kb-key sp" data-k=".">.</span>`,
        html`<span class="kb-key sp ret">${I.kbReturn({ w: 19, h: 19 })}</span></div>`);
    return cat(html`<div class="kb kb-${style}">${suggest}<div class="kb-letters">`,
      html`<div class="kb-row r1">${KB_ROWS[0].map(key)}</div>`,
      html`<div class="kb-row r2">${KB_ROWS[1].map(key)}</div>`,
      html`<div class="kb-row r3"><span class="kb-key sp shift">${I.shift({ w: 19, h: 19 })}</span>${KB_ROWS[2].map(key)}`,
      html`<span class="kb-key sp back">${I.backspace({ w: 21, h: 21, sw: 1.6 })}</span></div>`,
      html`${r4}</div>${emojiPanelHTML(project)}</div>`);
  }

  // ---------------------------------------------------------------- pieces
  function ticksHTML(m, project) {
    if (m.side !== 'out' || m.status === 'none') return html``;
    if (project.platform === 'imessage') return html``;
    if (m.status === 'pending') return html`<span class="ticks">${I.clock({ w: 13, h: 13, sw: 2 })}</span>`;
    if (m.status === 'sent') return html`<span class="ticks">${I.check1({ w: 13, h: 13 })}</span>`;
    return html`<span class="ticks${m.status === 'read' ? ' read' : ''}">${I.check2({ w: 16, h: 11 })}</span>`;
  }

  function metaHTML(m, project, floating) {
    const bits = [];
    if (m.starred) bits.push(I.star({ w: 11, h: 11 }));
    if (m.edited) bits.push(html`<span class="edited">Edited</span>`);
    if (m.time) bits.push(html`<span class="time">${m.time}</span>`);
    const t = ticksHTML(m, project);
    if (t.html) bits.push(t);
    if (!bits.length) return html``;
    return html`<div class="${floating ? 'float-meta' : 'meta-row'}">${bits}</div>`;
  }

  function metaWidth(m, project) {
    let w = 8;
    if (m.time) w += String(m.time).length * 6.2;
    if (m.side === 'out' && m.status !== 'none' && project.platform !== 'imessage') w += 18;
    if (m.edited) w += 34;
    if (m.starred) w += 13;
    return Math.round(w);
  }

  function replyHTML(m) {
    if (!m.replyTo && !m.replyText && !m.replyName) return html``;
    return cat(html`<div class="reply-quote"><div class="q-body"><div class="q-name">${m.replyName || 'You'}</div>`,
      html`<div class="q-text">${m.replyText || ''}</div></div></div>`);
  }

  function reactionsHTML(m) {
    if (!m.reactions || !m.reactions.length) return html``;
    const counts = m.reactions.length > 3 ? m.reactions.slice(0, 3) : m.reactions;
    return cat(html`<div class="reactions">${counts.map(r => html`<span>${r}</span>`)}`,
      html`${m.reactions.length > 3 ? html`<span style="font-size:.75em;opacity:.7">${m.reactions.length}</span>` : ''}</div>`);
  }

  function voiceHTML(m, project) {
    const bars = waveBars(m.id + (m.media ? m.media.name : ''), 32);
    const wave = html`<div class="wave" data-wave>${bars.map((h, i) => html`<i data-bar="${i}" style="height:${h}px"></i>`)}</div>`;
    return cat(html`<div class="voice" data-voice data-dur="${num(m.duration, 0) || 8}"${m.media ? html` data-src="${src(m.media)}"` : ''}>`,
      html`<div class="v-play" data-vplay>${I.play({ w: 22, h: 22 })}</div>`,
      html`<div class="v-main">${wave}<div class="v-foot"><span data-vtime>${mmss(m.duration)}</span>`,
      html`${m.time && project.platform !== 'imessage' ? html`<span>${m.time} ${m.side === 'out' ? ticksHTML(m, project) : ''}</span>` : ''}`,
      html`</div></div></div>`);
  }

  function docHTML(m) {
    const kind = String(m.fileKind || 'pdf').toLowerCase();
    const label = kind.slice(0, 4).toUpperCase();
    return cat(html`<div class="doc"><div class="doc-icon ${kind}">${label}</div>`,
      html`<div class="doc-body"><div class="doc-name">${m.fileName}</div>`,
      html`<div class="doc-sub">${m.fileSize} · ${kind}</div></div></div>`);
  }

  function mediaHTML(m, project) {
    if (!m.media) {
      return html`<div class="media-wrap" style="width:220px;height:150px;display:grid;place-items:center;color:var(--meta);font-size:12px">no media imported</div>`;
    }
    const url = src(m.media);
    if (m.type === 'video') {
      const poster = src(m.thumb) ? html` poster="${src(m.thumb)}"` : '';
      return cat(html`<div class="media-wrap"><video class="fitimg" src="${url}"${poster} data-video muted playsinline preload="metadata" ${fitStyle(m.media)}></video>`,
        html`<div class="play-badge"><span>${I.play({ w: 22, h: 22 })}</span></div>`,
        html`<div class="dur-badge">${I.videoCam({ w: 12, h: 12, sw: 2 })}${mmss(m.duration)}</div>`,
        html`${metaHTML(m, project, true)}</div>`);
    }
    return cat(html`<div class="media-wrap"><img src="${url}" alt="">`,
      html`${m.type === 'gif' ? html`<div class="dur-badge">GIF</div>` : ''}`,
      html`${m.caption ? '' : metaHTML(m, project, true)}</div>`);
  }

  function linkHTML(m) {
    return cat(html`<div class="linkprev">${src(m.media) ? html`<img src="${src(m.media)}" alt="">` : ''}`,
      html`<div class="lp-body"><div class="lp-title">${m.linkTitle}</div>`,
      html`<div class="lp-desc">${m.linkDesc}</div>`,
      html`<div class="lp-host">${m.linkHost}</div></div></div>`);
  }

  function contactHTML(m) {
    return cat(html`<div class="contact-card"><div class="c-av">${fitImg(m.media)}</div>`,
      html`<div class="c-name">${m.text || 'Contact name'}</div></div>`,
      html`<div class="contact-divider">Message</div>`);
  }

  function locationHTML(m) {
    return cat(html`<div class="location"><div class="map">`,
      html`${src(m.media) ? html`<img src="${src(m.media)}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0">` : ''}`,
      html`<div class="pin">${I.pin({ w: 26, h: 26 })}</div></div>`,
      html`<div class="loc-name">${m.place}</div></div>`);
  }

  function callHTML(m) {
    const missed = m.callResult === 'missed' || m.callResult === 'declined';
    const verb = { missed: 'Missed', incoming: 'Incoming', outgoing: 'Outgoing', declined: 'Declined' }[m.callResult] || 'Call';
    return cat(html`<div class="call-row"><div class="c-ic${missed ? ' missed' : ''}">${m.callKind === 'video' ? I.videoCam({ w: 17, h: 17 }) : I.phone({ w: 17, h: 17 })}</div>`,
      html`<div><div class="c-title">${verb} ${m.callKind} call</div>`,
      html`<div class="c-sub">${missed ? 'Tap to call back' : m.callDuration}</div></div></div>`);
  }

  // --------------------------------------------------------------- message
  function buildMessage(m, project, ctx) {
    const el = document.createElement('div');
    el.className = 'msg side-' + m.side + ' type-' + m.type;
    el.dataset.id = m.id;

    if (m.type === 'divider') {
      el.className = 'msg type-divider';
      setHTML(el, html`<div class="divider">${project.platform === 'imessage'
        ? html`<b>${m.text || 'Today'}</b>${m.time ? html` ${m.time}` : ''}`
        : (m.text || 'Today')}</div>`);
      return el;
    }
    if (m.type === 'system') {
      el.className = 'msg type-system';
      setHTML(el, cat(html`<div class="system-note">${m.text && /encrypt/i.test(m.text) ? I.lock({ w: 12, h: 12 }) : ''}`,
        html`<span>${m.text || 'Messages are end-to-end encrypted.'}</span></div>`));
      return el;
    }
    if (m.type === 'status') {
      // never drawn — it only changes the header's subtitle (see Timeline)
      el.className = 'msg type-status';
      return el;
    }
    if (m.type === 'typing') {
      el.className = 'msg side-' + m.side + ' type-typing tail';
      setHTML(el, html`<div class="stack"><div class="row"><div class="bubble typing-bubble"><i></i><i></i><i></i></div></div></div>`);
      return el;
    }

    const showTail = project.chat.showTails && ctx.isTail;
    if (showTail) el.classList.add('tail');
    if (ctx.groupStart) el.classList.add('grp-start');

    const isMedia = ['image', 'gif', 'sticker', 'video'].indexOf(m.type) >= 0;
    const parts = [];

    const bubble = [];
    if (m.forwarded) bubble.push(html`<div class="fwd">${I.forward({ w: 12, h: 12 })}<span>Forwarded</span></div>`);
    if (project.chat.groupChat && m.side === 'in' && m.sender && ctx.groupStart) {
      bubble.push(html`<div class="sender-name" style="color:${color(ctx.senderColor)}">${m.sender}</div>`);
    }
    bubble.push(replyHTML(m));

    const spacer = html`<span class="meta-spacer" style="width:${metaWidth(m, project)}px"></span>`;
    switch (m.type) {
      case 'text':
        bubble.push(html`<div class="btext">${isEmojiOnly(m.text) ? html`<span class="emoji-only">${m.text}</span>` : fmt(m.text)}${spacer}</div>`);
        bubble.push(metaHTML(m, project, false));
        break;
      case 'image': case 'gif': case 'sticker': case 'video':
        bubble.push(mediaHTML(m, project));
        if (m.caption) bubble.push(html`<div class="btext caption">${fmt(m.caption)}${spacer}</div>${metaHTML(m, project, false)}`);
        break;
      case 'voice': case 'audio':
        bubble.push(voiceHTML(m, project));
        break;
      case 'file':
        bubble.push(docHTML(m));
        if (m.caption) bubble.push(html`<div class="btext caption">${fmt(m.caption)}</div>`);
        bubble.push(metaHTML(m, project, false));
        break;
      case 'contact':
        bubble.push(contactHTML(m), metaHTML(m, project, false));
        break;
      case 'location':
        bubble.push(locationHTML(m), metaHTML(m, project, false));
        break;
      case 'link':
        bubble.push(linkHTML(m));
        bubble.push(html`<div class="btext">${fmt(m.text || m.linkHost)}${spacer}</div>${metaHTML(m, project, false)}`);
        break;
      case 'call':
        bubble.push(callHTML(m), metaHTML(m, project, false));
        break;
      default:
        bubble.push(html`<div class="btext">${fmt(m.text)}</div>`);
    }
    parts.push(html`<div class="bubble${isMedia ? ' has-media' : ''}">${bubble}</div>`);

    // Every message you send carries its own "Delivered / Read" line; CSS shows
    // only the one under the newest message on screen, and the timeline moves
    // that marker as the conversation plays.
    let statusLine = '';
    if (project.platform === 'imessage' && m.side === 'out' && m.status !== 'none') {
      const label = m.status === 'read' ? 'Read' : m.status === 'delivered' ? 'Delivered' : m.status === 'pending' ? 'Sending…' : 'Sent';
      statusLine = html`<div class="status-line">${m.status === 'read' ? html`<b>Read</b>${m.time ? html` ${m.time}` : ''}` : label}</div>`;
    }
    setHTML(el, html`<div class="stack"><div class="row">${parts}</div>${reactionsHTML(m)}${statusLine}</div>`);
    return el;
  }

  const SENDER_COLORS = ['#e542a3', '#00a884', '#ff8a65', '#7f66ff', '#2196f3', '#f4b400', '#ff5c8a', '#1fbfb8'];

  // ---------------------------------------------------------------- mount
  function mount(container, project) {
    container.replaceChildren();
    const device = document.createElement('div');
    device.className = 'device frame-' + (project.chat.device || 'none');

    const phone = document.createElement('div');
    phone.className = 'phone';
    applyVars(phone, project);

    const c = project.chat;
    const tt = window.Store.isTT(project.platform);
    const home = (extra) => (c.device === 'iphone15' || c.device === 'none') ? extra : '';
    const frameBits = () => {
      if (c.device === 'iphone15') insert(device, 'beforeend', html`<div class="notch"></div>`);
      if (c.device === 'android') insert(device, 'beforeend', html`<div class="punch"></div>`);
    };

    // The watch page is a desktop document — its own chassis, built as markup
    // and laid out at a fixed 1280x720 then scaled to the project's canvas.
    const pageUI = window.Store.isPH && window.Store.isPH(project.platform) ? window.PHUI : window.YouTubeUI;
    if (window.Store.isStatic(project.platform) && pageUI) {
      // appendChild, not innerHTML: the module hands back the element it built
      // (every field went in via textContent), and re-parsing would orphan the
      // video painter onto a detached copy.
      phone.appendChild(pageUI.body(project));
      const page = phone.querySelector('.yt-page') || phone.querySelector('.ph-page');
      if (page) {
        // the page is laid out at 1280x720 always; the canvas preset picks the
        // scale, never the markup
        const k = (window.Store.screenW(c) || 1280) / 1280;
        page.style.transform = 'scale(' + k + ')';
      }
      device.appendChild(phone);
      container.appendChild(device);
      // NOT the page: the editor scrolls whatever this points at (auto-scroll
      // to the newest message), and scrolling the page shoved its own content
      // up by the overflow -- which is what clipped the masthead at the top.
      // The phone is exactly the page's size, so there is nothing to scroll.
      if (page) page.scrollTop = 0;
      return { device, phone, scroll: phone, els: new Map(), gifts: null, youtube: true };
    }

    // TikTok screens are a full-bleed video with overlays, not a chat column,
    // so they get their own chassis entirely.
    if (tt && window.TikTokUI) {
      setHTML(phone, cat(html`${c.showStatusBar ? html`<div class="statusbar tt-status">${statusBarHTML(project)}</div>` : ''}`,
        html`${window.TikTokUI.body(project)}${home(html`<div class="home-indicator tt-home"><i></i></div>`)}`));

      const chatEl = phone.querySelector('[data-chat]');
      const giftEl = phone.querySelector('[data-gifts]');
      const els = new Map();
      project.messages.forEach((m) => {
        const built = window.TikTokUI.buildEvent(m, project);
        const host = (built.lane === 'gift' && giftEl) ? giftEl : chatEl;
        if (host) host.appendChild(built.el); else phone.appendChild(built.el);
        els.set(m.id, built.el);
      });

      device.appendChild(phone);
      frameBits();
      paintEmoji(device, project);
      container.appendChild(device);
      return { device, phone, scroll: chatEl || phone, els, gifts: giftEl, tiktok: true };
    }

    setHTML(phone, cat(html`${c.showStatusBar ? html`<div class="statusbar">${statusBarHTML(project)}</div>` : ''}`,
      html`${c.showHeader ? html`<div class="chat-header">${headerHTML(project)}</div>` : ''}`,
      html`<div class="chat-body"><div class="chat-wall"></div><div class="chat-dim"></div><div class="chat-scroll"><div class="chat-spacer"></div></div></div>`,
      html`${c.showInputBar ? html`<div class="input-bar">${inputBarHTML(project)}</div>` : ''}${keyboardHTML(project)}`,
      html`${home(html`<div class="home-indicator" style="color:var(--header-text)"><i></i></div>`)}`));

    // wallpaper
    const wall = phone.querySelector('.chat-wall');
    const wp = c.wallpaper;
    if (wp.mode === 'image' && wp.image) {
      setHTML(wall, fitImg(wp.image));
      if (wp.blur) wall.style.filter = 'blur(' + num(wp.blur, 0) + 'px)';
    } else if (wp.mode === 'color') {
      wall.style.background = wp.color;
    }
    phone.querySelector('.chat-dim').style.opacity = num(wp.dim, 0) / 100;

    // messages
    const scroll = phone.querySelector('.chat-scroll');
    const list = project.messages;
    const senderColors = {};
    let ci = 0;
    let lastOutIdx = -1;
    list.forEach((m, i) => { if (m.side === 'out' && ['divider', 'system', 'typing', 'status'].indexOf(m.type) < 0) lastOutIdx = i; });
    const els = new Map();

    // status changes are invisible, so they must not split a run of bubbles
    const drawn = list.filter(m => m.type !== 'status');
    list.forEach((m) => {
      if (m.type === 'status') {
        const el = buildMessage(m, project, {});
        scroll.appendChild(el);
        els.set(m.id, el);
      }
    });
    drawn.forEach((m, i) => {
      const prev = drawn[i - 1], next = drawn[i + 1];
      const structural = (x) => !x || ['divider', 'system'].indexOf(x.type) >= 0;
      const groupStart = structural(prev) || prev.side !== m.side || (m.sender || '') !== (prev.sender || '');
      const isTail = structural(next) || next.side !== m.side || (m.sender || '') !== (next.sender || '');
      if (m.sender && !senderColors[m.sender]) senderColors[m.sender] = SENDER_COLORS[ci++ % SENDER_COLORS.length];
      const el = buildMessage(m, project, {
        groupStart, isTail, isLastOut: list.indexOf(m) === lastOutIdx,
        senderColor: senderColors[m.sender] || SENDER_COLORS[0]
      });
      scroll.appendChild(el);
      els.set(m.id, el);
    });

    // the parody watermark is available on the chat platforms too
    if (window.TikTokUI) insert(phone, 'beforeend', window.TikTokUI.watermarkHTML(project));

    device.appendChild(phone);
    frameBits();
    paintEmoji(device, project);
    container.appendChild(device);

    return { device, phone, scroll, els };
  }

  // Emoji are drawn as pictures of the chosen set, now and as the timeline
  // types and animates (core/emoji.js). 'system' leaves them to the device,
  // but the possum faces are always pictures.
  function paintEmoji(device, project) {
    if (window.Emoji) window.Emoji.watch(device, { own: true, unicode: project.chat.emojiSet !== 'system' });
  }

  window.Renderer = { mount, applyVars, mmss, waveBars, esc, isEmojiOnly, fitImg, fitStyle, kbStyleFor };
})();
