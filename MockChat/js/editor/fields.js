/* HTML builders for inspector fields, plus the emoji panel.

   Each builder returns a string. Inputs carry data-path (what they edit) and
   optionally data-refresh: 'all' | 'inspector' | (default) preview — read by
   the global input handler in main.js. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, R = E.R, esc = E.esc;

  // A small ⓘ that explains a field on hover, instead of a paragraph under it.
  const tip = E.tip = (text) => text
    ? html`<span class="tip" tabindex="0" data-tip="${text}" aria-label="${text}">i</span>`
    : '';

  E.fld = function (label, inner, help) {
    return html`<fieldset class="field d-fieldset"><legend class="d-fieldset-legend">${label}${tip(help)}</legend>${inner}</fieldset>`;
  };
  // a label/control pair inside a row2/row3 grid
  E.mini = (label, inner, help) =>
    html`<div><label class="minilab">${label}${tip(help)}</label>${inner}</div>`;
  E.section = (title, help) => html`<div class="section-title">${title}${tip(help)}</div>`;
  E.note = (content) => html`<div class="field note">${content}</div>`;

  E.txt = function (path, ph, refresh) {
    const v = E.getPath(path);
    return cat(html`<input class="d-input d-input-sm" type="text" data-path="${path}" value="${v == null ? '' : v}`,
      html`" placeholder="${ph || ''}"${(refresh ? html` data-refresh="${refresh}"` : '')}>`);
  };
  E.area = (path, ph) =>
    html`<textarea class="d-textarea d-textarea-sm" data-path="${path}" placeholder="${ph || ''}">${E.getPath(path) || ''}</textarea>`;
  E.num = function (path, min, max, step, refresh) {
    const v = E.getPath(path);
    return cat(html`<input class="d-input d-input-sm" type="number" data-num data-path="${path}" value="${(v == null ? 0 : v)}`,
      html`" min="${min}"${(max != null ? html` max="${max}"` : '')} step="${(step || 1)}"`,
      html`${(refresh ? html` data-refresh="${refresh}"` : '')}>`);
  };
  E.rng = function (path, min, max, step, suffix) {
    const v = E.getPath(path);
    return cat(html`<div class="rng"><input class="d-range d-range-xs" type="range" data-num data-path="${path}" min="${min}" max="${max}`,
      html`" step="${(step || 1)}" value="${v}"><output>${v}${(suffix || '')}</output></div>`);
  };

  // A duration typed in seconds and stored in ms. No upper cap — a 15s hold or
  // a two-minute watch is the user's call.
  E.secs = function (path, opts) {
    opts = opts || {};
    const v = Number(E.getPath(path)) || 0;
    return cat(html`<div class="secs"><input class="d-input d-input-sm" type="number" data-secs data-path="${path}" min="0" step="${(opts.step || 0.1)}`,
      html`" value="${E.secText(v)}"${(opts.ph ? html` placeholder="${opts.ph}"` : '')}`,
      html`${(opts.refresh ? html` data-refresh="${opts.refresh}"` : '')}><span>sec</span></div>`);
  };

  E.sel = function (path, options, refresh) {
    const v = E.getPath(path);
    return cat(html`<select class="d-select d-select-sm" data-path="${path}"${(refresh ? html` data-refresh="${refresh}"` : '')}>`,
      html`${hjoin(options.map(o => html`<option value="${o.id}"${(String(o.id) === String(v) ? ' selected' : '')}>${o.label}</option>`))}`,
      html`</select>`);
  };
  E.chk = function (path, label, refresh, help) {
    return cat(html`<label class="check"><input class="d-toggle d-toggle-sm" type="checkbox" data-path="${path}"${(E.getPath(path) ? ' checked' : '')}`,
      html`${(refresh ? html` data-refresh="${refresh}"` : '')}><span>${label}</span>${tip(help)}</label>`);
  };
  E.col = (path, label) =>
    cat(html`<div><label class="minilab">${label}</label>`,
    html`<input type="color" data-path="${path}" value="${(E.getPath(path) || '#000000')}"></div>`);

  const PIC_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'];

  E.mediaBlock = function (path, kind, label, framing, help) {
    const m = E.getPath(path);
    const isPic = m && PIC_EXT.indexOf(m.ext) >= 0;
    const isVid = S.isVideoMedia(m);
    const canFrame = !!(m && framing && (isPic || isVid));   // clips frame too
    let thumb = '';
    if (m && window.MediaRef.missing(m)) {
      thumb = cat(html`<div class="media-thumb missing" data-tip="This project refers to a file that is not in this `,
        html`${(E.caps.platform === 'web' ? 'browser' : 'media folder')}. Import the project bundle, or replace it.">missing: ${m.name || m.rel}</div>`);
    } else if (canFrame) {
      thumb = cat(html`<div class="fit-thumb${(framing === 'round' ? ' round' : '')}">`,
        html`${(isVid
          ? html`<video class="fitimg" src="${window.MediaRef.src(m)}" muted loop autoplay playsinline ${R.fitStyle(m)}></video>`
          : R.fitImg(m))}</div>`);
    } else if (m && isPic) {
      thumb = html`<img class="media-thumb" src="${window.MediaRef.src(m)}" alt="">`;
    } else if (m && isVid) {
      thumb = html`<video class="media-thumb" src="${window.MediaRef.src(m)}" muted loop autoplay playsinline></video>`;
    } else if (m) {
      thumb = html`<div class="media-thumb file">${m.name}</div>`;
    }
    const secs = m && Number(m.secs) > 0 ? ' · ' + Number(m.secs).toFixed(1) + 's' : '';
    return E.fld(label,
      cat(html`${thumb}`,
      html`<div class="${(canFrame ? 'row3' : 'row2')}" style="margin-top:5px">`,
      html`<button class="d-btn d-btn-xs" data-act="import" data-target="${path}" data-kind="${kind}">${(m ? 'Replace' : 'Import')}…</button>`,
      html`${(canFrame
        ? cat(html`<button class="d-btn d-btn-xs" data-act="fit" data-target="${path}" data-round="${(framing === 'round' ? '1' : '')}`,
          html`" data-tip="Drag to reposition, scroll to zoom, choose Fill or Fit">Adjust…</button>`)
        : '')}`,
      html`<button class="d-btn d-btn-xs d-btn-ghost" data-act="clearmedia" data-target="${path}"${(m ? '' : ' disabled')}>Remove</button>`,
      html`</div>${(m ? html`<div class="media-name">${m.name}${secs}</div>` : '')}`),
      help || (E.caps.platform === 'web' ? 'Stored in this browser with your project.' : "Copied into the app's media folder."));
  };

  // ------------------------------------------------------------ emoji panel
  // Three sets, picked in the panel's drop-down (project.chat.emojiSet, which
  // also decides how the phone draws emoji — core/emoji.js):
  // - EmojiOne: its own categories (core/emojidata.js). The buttons hold plain
  //   emoji text; the editor's emoji painter (main.js) shows them as pictures.
  // - Possum: the possum faces, inserted as :posse_<name>:.
  // - Your device's: the list below, left to the device's emoji font
  //   (data-emo-text stops the painter). Space separated so multi-codepoint
  //   sequences (❤️‍🔥, 🏳️‍🌈) stay intact.
  const EMOJI_SETS = [
    { id: 'emojione', label: 'EmojiOne' },
    { id: 'possum', label: 'Possum' },
    { id: 'system', label: 'Your device’s emoji' }
  ];
  const EMOJI_GROUPS = [
    { id: 'faces', tab: '😀', label: 'Smileys', chars: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👻 👽 🤖 🎃' },
    { id: 'hands', tab: '👍', label: 'People', chars: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 💪 🦾 🦵 🦶 👀 👁️ 👄 💋 🧠 🫀 🙌 👏 🤲 🫂 🕺 💃 🚶 🏃 🧍 🧎 💁 🙋 🙆 🙅 🤷 🤦 💇 💆 🧖 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👮 🕵️ 💂 👷 🤴 👸 👰 🤵 🎅 🦸 🦹 🧙 🧚 🧛 🧜 🧝' },
    { id: 'hearts', tab: '❤️', label: 'Hearts', chars: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ❤️‍🔥 ❤️‍🩹 💯 💢 💥 💫 💦 💨 🕳️ 💬 🗨️ 🗯️ 💭 💤 ‼️ ⁉️ ❓ ❔ ❕ ❗ 〰️ ⚠️ 🔥 ✨ ⭐ 🌟 ☑️ ✅ ❌ ⭕ 🚫 🔞 ♻️ 🔱 ⚜️ 🔰 ⚡ 🎵 🎶 🆗 🆒 🆕 🔝 🔜 ➕ ➖ ✖️ ➗ ♾️' },
    { id: 'animals', tab: '🐶', label: 'Nature', chars: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🕷️ 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🐪 🦒 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🕊️ 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🍃 🍂 🍁 🌾 🌺 🌻 🌹 🥀 🌷 🌸 🌼 🌞 🌝 🌚 🌙 ⭐ 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ⛄ 🌊 💧' },
    { id: 'food', tab: '🍕', label: 'Food', chars: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥔 🥕 🌽 🌶️ 🥒 🥬 🥦 🧄 🧅 🍄 🥜 🌰 🍞 🥐 🥖 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥙 🧆 🥚 🍳 🥘 🍲 🥣 🥗 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🍵 🍶 🍾 🍷 🍸 🍹 🍺 🍻 🥂 🥃 🧃 🧉' },
    { id: 'things', tab: '📱', label: 'Objects', chars: '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📷 📸 📹 🎥 📺 📻 🎙️ 🎚️ ⏰ ⏱️ ⌛ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ 🛡️ 🚬 ⚰️ 🔮 📿 🧿 ⚗️ 🔭 🔬 💊 💉 🩸 🧬 🦠 🧪 🌡️ 🧹 🧺 🧻 🚽 🚿 🛁 🧼 🪒 🧽 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 🎁 🎈 🎏 🎀 🎊 🎉 🏮 🧧 ✉️ 📩 📨 📧 💌 📦 🏷️ 📪 📫 📬 📭 📮 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🔗 📎 📐 📏 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🏸 🥊 🎯 🎳 🎮 🕹️ 🎲 🧩 🎧 🎤 🎸 🎹 🥁 🎺 🎻 🏆 🥇 🥈 🥉 🎖️ 🏅' },
    { id: 'travel', tab: '✈️', label: 'Travel', chars: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 ⛩️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁 🕐 🕑 🕒 🕓 🕔 🕕' },
    { id: 'flags', tab: '🏳️', label: 'Flags', chars: '🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇦🇷 🇦🇺 🇧🇷 🇨🇦 🇨🇳 🇨🇴 🇩🇪 🇩🇰 🇪🇸 🇪🇺 🇫🇮 🇫🇷 🇬🇧 🇬🇷 🇮🇩 🇮🇪 🇮🇱 🇮🇳 🇮🇹 🇯🇵 🇰🇷 🇲🇽 🇳🇬 🇳🇱 🇳🇴 🇳🇿 🇵🇭 🇵🇱 🇵🇹 🇷🇴 🇷🇺 🇸🇦 🇸🇪 🇸🇬 🇹🇭 🇹🇷 🇺🇦 🇺🇸 🇻🇳 🇿🇦' }
  ];
  EMOJI_GROUPS.forEach(g => { g.list = g.chars.split(' ').filter(Boolean); });

  const groupFor = { emojione: 'people', system: 'faces' };
  let recentEmoji = E.pref.get('recentEmoji', []);
  let lastField = null;

  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el && el.dataset && el.dataset.path && (el.tagName === 'TEXTAREA' || el.type === 'text')) lastField = el;
  });

  const emojiSet = () => (E.project && E.project.chat.emojiSet) || 'emojione';

  E.emojiPanelHTML = function () {
    const set = emojiSet();
    const groups = set === 'system' ? EMOJI_GROUPS.map(x => ({ id: x.id, label: x.label, icon: x.tab, list: x.list }))
      : set === 'emojione' ? window.Emoji.groups() : null;
    const g = groups && (groups.find(x => x.id === groupFor[set]) || groups[0]);
    const list = g ? g.list : window.Emoji.possumTokens();
    const tipOf = (c) => window.Emoji.isPossum(c) ? c.slice(7, -1).replace(/_/g, ' ') : null;
    const btn = (c) => html`<button data-emo="${c}"${(tipOf(c) ? html` data-tip="${tipOf(c)}" aria-label="${tipOf(c)}"` : '')}>${c}</button>`;
    return cat(html`<div class="emoji-panel emoji-${set}"${(set === 'system' ? html` data-emo-text` : '')}>`,
      html`<div class="emoji-set"><label for="emojiSetSel">Emoji set</label>`,
        html`<select class="d-select d-select-xs" id="emojiSetSel" data-path="chat.emojiSet" data-refresh="all">`,
        html`${hjoin(EMOJI_SETS.map(o => html`<option value="${o.id}"${(o.id === set ? ' selected' : '')}>${o.label}</option>`))}</select></div>`,
      html`${(groups ? cat(html`<div class="emoji-tabs">`,
        html`${hjoin(groups.map(x => cat(html`<button data-egroup="${x.id}" data-tip="${x.label}" aria-label="${x.label}"`,
          html`${(x.id === g.id ? html` class="on"` : '')}>${x.icon}</button>`)))}`,
        html`</div>`) : '')}`,
      html`${(recentEmoji.length
        ? html`<div class="emoji-recent"><span>Recent</span>${hjoin(recentEmoji.map(btn))}</div>`
        : '')}`,
      html`<div class="emoji-grid${(set === 'possum' ? ' big' : '')}">${hjoin(list.map(btn))}</div>`,
      html`${(set === 'possum' ? html`<div class="emoji-credit">Possum faces: art by possummachine</div>`
        : set === 'emojione' ? html`<div class="emoji-credit">Emoji art: EmojiOne, CC BY 4.0</div>` : '')}`,
      html`</div>`);
  };

  function pushRecent(ch) {
    recentEmoji = [ch].concat(recentEmoji.filter(c => c !== ch)).slice(0, 14);
    E.pref.set('recentEmoji', recentEmoji);
  }

  E.setEmojiGroup = function (id) { groupFor[emojiSet()] = id; E.refreshEmojiPanel(); };

  E.insertEmoji = function (ch) {
    const f = (lastField && document.body.contains(lastField)) ? lastField : null;
    if (f) {
      const start = f.selectionStart == null ? f.value.length : f.selectionStart;
      const end = f.selectionEnd == null ? start : f.selectionEnd;
      f.value = f.value.slice(0, start) + ch + f.value.slice(end);
      // let the normal input handler store it (it knows the special paths)
      f.dispatchEvent(new Event('input', { bubbles: true }));
      const pos = start + ch.length;
      try { f.focus(); f.setSelectionRange(pos, pos); } catch (e) {}
      pushRecent(ch);
      E.refreshEmojiPanel();
      return;
    }
    const m = E.selected();
    if (!m) return;
    const key = (['image', 'gif', 'sticker', 'video', 'file'].indexOf(m.type) >= 0) ? 'caption' : 'text';
    m[key] = (m[key] || '') + ch;
    E.dirty = true;
    pushRecent(ch);
    E.renderInspector(); E.renderPreview(); E.renderList();
  };

  E.refreshEmojiPanel = function () {
    const host = E.$('.emoji-panel');
    if (!host) return;
    const wrap = document.createElement('div');
    setHTML(wrap, E.emojiPanelHTML());
    host.replaceWith(wrap.firstElementChild);
  };
})();
