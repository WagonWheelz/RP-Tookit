/* Media is NAMED, never addressed.

   A project, template or People file refers to each picture, clip and sound
   by a bare file name: { name, ext, rel: 'media/<name>', fit?, secs?… }. It
   never carries an address — no url, no file path. Whatever a shared file
   says, the app alone decides where a name lives:

     web      the browser's own storage (IndexedDB) → a blob: url it made
     desktop  the app's media folder → a file:/// url, checked to be inside it

   MediaRef.ingest(tree)   on the way in (Store.migrate / migratePerson call
                           it): deletes every url / file / missing key
                           anywhere in the tree and makes every media name a
                           bare, safe file name
   MediaRef.prepare(tree)  asks the platform (api.resolveMedia) where the
                           names in a tree live; await it before drawing
   MediaRef.src(media)     the address to draw with: '' if unknown or absent
   MediaRef.missing(media) true once a name is known NOT to exist here

   Addresses live only in this module's map — never in the project — so
   saving cannot leak one and a file cannot plant one. */
(function (root) {
  'use strict';

  const DROP = ['url', 'file', 'missing'];
  const isMedia = (o) => !!o && typeof o === 'object' && !Array.isArray(o) &&
    typeof o.ext === 'string' && !!(o.rel || o.name || o.file);

  // the last path segment only, and only ordinary characters: no / \ : , no
  // control characters, no leading dot. Names the app stores already look
  // like this (letters, digits, - _ . and spaces), so they come out unchanged.
  function safeName(raw) {
    let n = String(raw == null ? '' : raw).replace(/^.*[\\/]/, '');
    n = n.replace(/[\x00-\x1f\x7f]/g, '').replace(/[^\w\-. ]+/g, '_').trim().replace(/^\.+/, '_');
    return n.slice(0, 120) || 'file';
  }
  const nameOf = (m) => safeName(m.rel || m.name || m.file);

  function ingest(tree) {
    const seen = new Set();
    (function walk(o) {
      if (!o || typeof o !== 'object' || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (isMedia(o)) {
        const name = nameOf(o);
        o.name = name;
        o.rel = 'media/' + name;
        o.ext = String(o.ext).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
      }
      DROP.forEach(k => { delete o[k]; });
      Object.keys(o).forEach(k => walk(o[k]));
    })(tree);
    return tree;
  }

  function names(tree) {
    const out = new Set(), seen = new Set();
    (function walk(o) {
      if (!o || typeof o !== 'object' || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (isMedia(o)) out.add(nameOf(o));
      Object.keys(o).forEach(k => walk(o[k]));
    })(tree);
    return out;
  }

  // ------------------------------------------------------------ resolving
  // Only addresses the app itself makes are ever accepted from the platform:
  // a blob: url, or a file:/// url on a local drive (never a network share).
  const SAFE_URL = /^(blob:|file:\/\/\/[A-Za-z]:\/)/;
  const urls = new Map();              // name -> url, or null when not here
  const listeners = [];
  let lazy = null;

  async function resolve(list) {
    if (!list.length) return;
    let got = {};
    try { got = (root.api && root.api.resolveMedia) ? (await root.api.resolveMedia(list)) || {} : {}; } catch (e) { got = {}; }
    list.forEach(n => {
      const u = got[n];
      urls.set(n, typeof u === 'string' && SAFE_URL.test(u) ? u : null);
    });
  }

  // refresh: look the names up again (just stored or replaced)
  async function prepare(tree, opts) {
    const all = [...names(tree)];
    const todo = opts && opts.refresh ? all : all.filter(n => !urls.has(n));
    await resolve(todo);
  }

  // A name nobody prepared: look it up now and tell the listeners, so a
  // missed prepare() only costs a moment of blank, never a wrong picture.
  function later(name) {
    if (!lazy) {
      lazy = new Set();
      Promise.resolve().then(async () => {
        const list = [...lazy];
        lazy = null;
        await resolve(list.filter(n => !urls.has(n)));
        listeners.forEach(fn => { try { fn(); } catch (e) {} });
      });
    }
    lazy.add(name);
  }

  function src(m) {
    if (!isMedia(m)) return '';
    const n = nameOf(m);
    if (!urls.has(n)) { later(n); return ''; }
    return urls.get(n) || '';
  }
  const missing = (m) => isMedia(m) && urls.has(nameOf(m)) && !urls.get(nameOf(m));
  const forget = (name) => urls.delete(safeName(name));
  const onChange = (fn) => listeners.push(fn);

  root.MediaRef = { ingest, prepare, src, missing, forget, onChange, safeName, isMedia, nameOf };
})(typeof window !== 'undefined' ? window : globalThis);
