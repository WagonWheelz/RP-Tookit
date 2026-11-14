/* Emoji pictures instead of the device's emoji font.

   Typed emoji stay ordinary text everywhere (in the project, the fields, the
   files). Wherever text is put on screen, paint() swaps each emoji for an
   <img> of the chosen set, and watch() keeps doing it as the timeline types,
   floats reactions or rewrites a line — the phone and the editor both use it.
   It only ever creates elements and text nodes, never markup.

   Sets (project.chat.emojiSet): 'emojione' (default) and 'possum' draw
   EmojiOne pictures; 'system' leaves emoji to the device. The possum faces
   have no emoji code of their own: they are typed as :posse_<name>: and are
   drawn in every set. Data: core/emojidata.js (scripts/build-emoji.mjs). */
(function () {
  'use strict';
  const D = window.EmojiData || { emojione: '', groups: [], possum: [] };
  const ONE = new Set(D.emojione.split(' ').filter(Boolean));
  const POSSUM = new Set(D.possum);
  const TOKEN = /:posse_([a-z0-9_]+):/g;
  // a cheap test before the real work: any pictograph, keycap, flag letter or token
  const MAYBE = /[©®‼-㊙⃣]|[\ud83c-\ud83e][\udc00-\udfff]|:posse_/;
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, TITLE: 1 };
  const seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const graphemes = (s) => seg ? Array.from(seg.segment(s), x => x.segment) : Array.from(s);

  // '😀' → '1f600'; fe0f never appears in the file names, and EmojiOne 2
  // names its joined sequences without the joiners
  function codeOf(g) {
    const cps = Array.from(g, c => c.codePointAt(0).toString(16).padStart(4, '0')).filter(h => h !== 'fe0f');
    const a = cps.join('-');
    if (ONE.has(a)) return a;
    const b = cps.filter(h => h !== '200d').join('-');
    return ONE.has(b) ? b : null;
  }
  const src = (code) => 'emoji/emojione/' + code + '.svg';
  const possumSrc = (name) => 'emoji/possum/posse_' + name + '.png';
  // © or ❤ on their own are text; with the emoji selector (fe0f), as a keycap,
  // a flag, a joined sequence or a code point that is always an emoji, a picture
  const EMOJI_LOOK = /\p{Emoji_Presentation}|️|⃣|\p{Regional_Indicator}|‍/u;
  const isPossum = (s) => { const m = /^:posse_([a-z0-9_]+):$/.exec(s); return !!m && POSSUM.has(m[1]); };

  function img(url, alt, possum, lazy) {
    const el = document.createElement('img');
    el.className = possum ? 'emo emo-possum' : 'emo';
    if (lazy) el.loading = 'lazy';    // the editor's long picker grids; never on a phone being exported
    el.src = url; el.alt = alt; el.draggable = false;
    return el;
  }

  // the pieces of one string: plain text runs, and pictures
  function pieces(text, unicode, lazy) {
    const out = [];
    let buf = '';
    const flush = () => { if (buf) { out.push(buf); buf = ''; } };
    const plain = (part) => {
      if (!unicode) { buf += part; return; }
      graphemes(part).forEach(g => {
        const code = EMOJI_LOOK.test(g) ? codeOf(g) : null;
        if (code) { flush(); out.push(img(src(code), g, false, lazy)); }
        else buf += g;
      });
    };
    let last = 0;
    text.replace(TOKEN, (m, name, at) => {
      plain(text.slice(last, at));
      if (POSSUM.has(name)) { flush(); out.push(img(possumSrc(name), m, true, lazy)); } else buf += m;
      last = at + m.length;
      return m;
    });
    plain(text.slice(last));
    flush();
    return out;
  }

  // owner: the element a watcher looks after. A phone inside the editor
  // (data-emoroot) paints itself, in its own set, so the editor leaves it be.
  function skipped(node, owner) {
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (SKIP[el.tagName] || el.isContentEditable || el.hasAttribute('data-noemo')) return true;
      if (el.hasAttribute('data-emoroot') && el !== owner) return true;
      if (el === owner) return false;
    }
    return false;
  }

  function paintText(node, unicode, lazy) {
    const text = node.data;
    if (!text || !MAYBE.test(text)) return;
    // data-emo-text: leave emoji to the device here, but still draw possum faces
    if (unicode && node.parentElement && node.parentElement.closest('[data-emo-text]')) unicode = false;
    const parts = pieces(text, unicode, lazy);
    if (parts.length === 1 && typeof parts[0] === 'string') return;
    const frag = document.createDocumentFragment();
    parts.forEach(p => frag.appendChild(typeof p === 'string' ? document.createTextNode(p) : p));
    node.replaceWith(frag);
  }

  function paint(root, opts, owner) {
    if (!root) return;
    const unicode = !opts || opts.unicode !== false, lazy = !!(opts && opts.lazy);
    if (root.nodeType === 3) { if (!skipped(root, owner)) paintText(root, unicode, lazy); return; }
    if (root.nodeType !== 1) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const todo = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (MAYBE.test(n.data) && !skipped(n, owner)) todo.push(n);
    todo.forEach(n => paintText(n, unicode, lazy));
  }

  // Paint now, then again wherever text changes. The phone root carries
  // data-emoroot so the editor's own watcher leaves it to this one.
  function watch(root, opts) {
    if (root.__emo) root.__emo.disconnect();
    if (opts && opts.own) root.setAttribute('data-emoroot', '');
    paint(root, opts, root);
    const mo = new MutationObserver((records) => {
      records.forEach(r => {
        if (r.type === 'characterData') paint(r.target, opts, root);
        else r.addedNodes.forEach(n => { if (root.contains(n)) paint(n, opts, root); });
      });
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    root.__emo = mo;
    return mo;
  }

  // Load every picture a project will need before an export starts, so a
  // recording never catches one half-loaded.
  function preload(project, opts) {
    const urls = new Set();
    const unicode = !opts || opts.unicode !== false;
    const walk = (v) => {
      if (typeof v === 'string') { if (MAYBE.test(v)) pieces(v, unicode).forEach(p => { if (typeof p !== 'string') urls.add(p.getAttribute('src')); }); }
      else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k]));
    };
    walk(project);
    return Promise.all(Array.from(urls).map(u => {
      const i = new Image(); i.src = u;
      return i.decode ? i.decode().catch(() => {}) : Promise.resolve();
    }));
  }

  // the picker's view of a set
  const groups = () => D.groups.map(g => ({ id: g.id, label: g.label, icon: g.icon, list: g.chars.split(' ').filter(Boolean) }));
  const possumTokens = () => D.possum.map(n => ':posse_' + n + ':');

  window.Emoji = { paint, watch, preload, codeOf, src, possumSrc, isPossum, groups, possumTokens, TOKEN };
})();
