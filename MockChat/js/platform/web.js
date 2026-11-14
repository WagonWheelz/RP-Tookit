/* The browser implementation of window.api.

   The desktop build gets window.api from electron/preload.js (it talks to the
   Electron main process). In a plain browser there is no main process, so this
   file provides the same methods on top of IndexedDB, file inputs and
   downloads. The rest of the app calls window.api and never needs to know
   which one it has.

   Loaded on every page. Under Electron the preload has already defined
   window.api, and this file does nothing.

   Storage model — the same one the desktop uses, just in the browser:
     media      blobs keyed by a unique file name; projects refer to them as
                `media/<name>`, never by URL, so a template stays portable
     templates  the stripped project JSON, keyed by its file-safe name
     kv         small values: the people list, first-run flags */
(function () {
  'use strict';
  if (window.api) return;

  const DB_NAME = 'mockchat-studio';
  const STORES = ['media', 'templates', 'kv'];
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Browser storage is unavailable'));
      // another tab holding an old version open: say so instead of waiting forever
      req.onblocked = () => reject(new Error('Browser storage is busy in another tab'));
    });
    // a failed open is not remembered, so the next save tries again
    dbp.catch(() => { dbp = null; });
    return dbp;
  }

  function tx(store, mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const os = t.objectStore(store);
      let out;
      Promise.resolve(fn(os)).then(v => { out = v; });
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  const reqP = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const idbGet = (store, key) => tx(store, 'readonly', os => reqP(os.get(key)));
  const idbPut = (store, key, val) => tx(store, 'readwrite', os => reqP(os.put(val, key)));
  const idbDel = (store, key) => tx(store, 'readwrite', os => reqP(os.delete(key)));
  const idbKeys = (store) => tx(store, 'readonly', os => reqP(os.getAllKeys()));
  const idbAll = (store) => tx(store, 'readonly', os => reqP(os.getAll()));

  // ----------------------------------------------------------- naming rules
  // The same rules the desktop applies to files on disk.
  const extOf = (name) => { const m = /\.([^.\/\\]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  function safeName(name) {
    return String(name || 'template').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'template';
  }
  async function uniqueMediaName(base) {
    if (window.MediaRef) base = window.MediaRef.safeName(base);   // never a path, never a leading dot
    const ext = extOf(base);
    const stem = String(base || 'file').replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '_').slice(0, 60) || 'file';
    const taken = new Set(await idbKeys('media'));
    let name = stem + (ext ? '.' + ext : '');
    let i = 1;
    while (taken.has(name)) name = stem + '_' + (i++) + (ext ? '.' + ext : '');
    return name;
  }

  // ---------------------------------------------------------- media + URLs
  // One object URL per stored file for the whole session, so re-rendering the
  // preview a thousand times does not mint a thousand URLs.
  const urls = new Map();
  async function urlFor(name) {
    if (urls.has(name)) return urls.get(name);
    const rec = await idbGet('media', name);
    const url = rec && rec.blob ? URL.createObjectURL(rec.blob) : null;
    if (url) urls.set(name, url);
    return url;
  }

  const nameOfMedia = (m) => String((m && (m.rel || m.name)) || '').replace(/^.*[\\/]/, '');

  // Where does each NAME live? A blob: url made from this browser's own
  // storage, or null. The only addresses the app ever draws with (see
  // core/mediaref.js) — nothing in a project or file can supply one.
  async function resolveMedia(names) {
    const out = {};
    for (const n of names || []) {
      const name = window.MediaRef ? window.MediaRef.safeName(n) : String(n);
      try { out[n] = await urlFor(name); } catch (e) { out[n] = null; }
    }
    return out;
  }
  // a name just stored is looked up afresh next time it is drawn
  const forget = (name) => { if (window.MediaRef) window.MediaRef.forget(name); };

  async function sameBytes(a, b) {
    if (a.size !== b.size) return false;
    const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
    const u = new Uint8Array(x), v = new Uint8Array(y);
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
    return true;
  }

  async function storeBlob(fileName, blob) {
    // hidden details (GPS location, camera, dates…) come off before anything
    // is kept: a clean copy is all this browser ever holds (design request 2)
    if (window.MetaStrip) {
      const out = window.MetaStrip.strip(new Uint8Array(await blob.arrayBuffer()), extOf(fileName));
      if (out.removed.length) blob = new Blob([out.bytes], { type: blob.type || '' });
    }
    // the very same file already stored under this name (re-opening your own
    // project file, say) is reused rather than copied again as name_1
    const have = await idbGet('media', window.MediaRef ? window.MediaRef.safeName(fileName) : String(fileName || ''));
    if (have && have.blob && await sameBytes(have.blob, blob)) {
      // used again just now: the clean-up's 24-hour grace starts over
      try { await idbPut('media', have.name, Object.assign({}, have, { mtime: Date.now() })); } catch (e) {}
      forget(have.name);
      return { name: have.name, rel: 'media/' + have.name, ext: extOf(have.name), size: have.size };
    }
    const name = await uniqueMediaName(fileName);
    await idbPut('media', name, { name, blob, type: blob.type || '', size: blob.size, mtime: Date.now() });
    forget(name);
    return { name, rel: 'media/' + name, ext: extOf(name), size: blob.size };
  }

  // Walk anything that looks like a media record — same test as the desktop.
  function walkMedia(node, fn, seen) {
    if (!node || typeof node !== 'object') return;
    seen = seen || new Set();
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(n => walkMedia(n, fn, seen)); return; }
    if (typeof node.ext === 'string' && (node.rel || node.file || node.name)) fn(node);
    Object.keys(node).forEach(k => { if (node[k] && typeof node[k] === 'object') walkMedia(node[k], fn, seen); });
  }

  function stripPaths(data) {
    const clone = JSON.parse(JSON.stringify(data));
    walkMedia(clone, (m) => {
      const name = nameOfMedia(m) || 'file';
      m.rel = 'media/' + name;
      delete m.file; delete m.url; delete m.missing;
    });
    return clone;
  }

  // Data read back from storage or a file: addresses out, names tidied. The
  // editor resolves the names itself (MediaRef.prepare), so nothing here
  // adds a url any more.
  async function rehydrate(data) {
    return window.MediaRef ? window.MediaRef.ingest(data) : data;
  }

  // ------------------------------------------------------ file in / file out
  // Opens the browser's file picker; resolves with the chosen files, or []
  // when the picker is closed without choosing.
  //
  // Most browsers say "closed without choosing" with a `cancel` event. Safari
  // before 16.4 never sends it (hand-over issue 12), which left a hidden input
  // and a promise waiting forever. There, the page getting focus back is the
  // sign the picker closed: a choice arrives as `change` straight away, so if
  // nothing came a second later it was cancelled. And whatever the browser, a
  // picker still open when the next one starts is settled as cancelled.
  let openPick = null;
  function pickFiles(accept, multi) {
    if (openPick) openPick([]);
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.multiple = !!multi;
      input.style.display = 'none';
      let done = false, timer = null;
      const onFocus = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { if (!input.files || !input.files.length) finish([]); }, 1000);
      };
      const finish = (files) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('focus', onFocus);
        if (openPick === finish) openPick = null;
        input.remove();
        resolve(files);
      };
      openPick = finish;
      input.addEventListener('change', () => finish(Array.from(input.files || [])));
      input.addEventListener('cancel', () => finish([]));
      if (!('oncancel' in input)) window.addEventListener('focus', onFocus);
      document.body.appendChild(input);
      input.click();
    });
  }

  function download(fileName, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    return fileName;
  }

  const ACCEPT = {
    image: 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif',
    gif: 'image/gif,image/webp,image/apng,image/png',
    sticker: 'image/webp,image/png,image/gif,image/apng,image/svg+xml',
    video: 'video/mp4,video/webm,video/quicktime,.mkv,.m4v,.mov',
    audio: 'audio/*,.opus,.m4a,.flac',
    any: ''
  };

  // ------------------------------------------------------------ clean-up
  // Pictures, clips and sounds stay in the browser after the last template
  // that used them is deleted, filling up storage the whole host site shares
  // so this removes the ones nothing uses: no
  // saved template, nobody in People, and not the project open on screen
  // (the editor passes its names in). Anything stored or reused in the last
  // 24 hours is always kept — another tab may have it in an unsaved project.
  const PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;
  async function pruneMedia(inUse) {
    const keep = new Set((inUse || []).map(String));
    for (const t of await idbAll('templates')) walkMedia(t.data, (m) => keep.add(nameOfMedia(m)));
    walkMedia({ people: (await idbGet('kv', 'people')) || [] }, (m) => keep.add(nameOfMedia(m)));
    const cutoff = Date.now() - PRUNE_GRACE_MS;
    let removed = 0, bytes = 0;
    for (const rec of await idbAll('media')) {
      if (!rec || keep.has(rec.name) || !(rec.mtime < cutoff)) continue;
      await idbDel('media', rec.name);
      if (urls.has(rec.name)) { URL.revokeObjectURL(urls.get(rec.name)); urls.delete(rec.name); }
      forget(rec.name);
      removed++;
      bytes += rec.size || 0;
    }
    return { removed, bytes };
  }

  // ------------------------------------------------------------- templates
  // Marked done only once every starter is stored, so a failed first load
  // (offline, a bad response) simply tries again next time.
  async function seedTemplates() {
    if (await idbGet('kv', 'seeded')) return;
    const getJSON = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(url + ': ' + res.status);
      return res.json();
    };
    try {
      const idx = await getJSON('starter-templates/index.json');
      for (const f of idx) {
        const data = await getJSON('starter-templates/' + f);
        const name = safeName((data.meta && data.meta.name) || f.replace(/\.json$/i, ''));
        if (!(await idbGet('templates', name))) {
          await idbPut('templates', name, { name, data: stripPaths(data), mtime: Date.now() });
        }
      }
      await idbPut('kv', 'seeded', true);
    } catch (e) { /* offline or missing — non-fatal, retried next time */ }
  }

  // Can this browser keep anything at all? (private windows, blocked site
  // data, a full disk). Writes and reads back one small value of our own.
  async function checkStorage() {
    try {
      const stamp = Date.now();
      await idbPut('kv', 'probe', stamp);
      if ((await idbGet('kv', 'probe')) !== stamp) throw new Error('read back a different value');
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e && (e.name === 'QuotaExceededError' ? 'full' : e.message) || e) };
    }
  }

  // ----------------------------------------------------------------- events
  const bus = new EventTarget();
  const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

  const caps = {
    platform: 'web',
    fileSystem: false,         // no folders to open
    showInFolder: false,
    cancelExport: true,
    videoExport: typeof window.VideoEncoder === 'function',
    audioInVideo: typeof window.AudioEncoder === 'function',
    animExport: true,
    // Safari's canvas quietly hands back a PNG when asked for WebP
    webpExport: (() => { try { return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { return false; } })()
  };

  // ------------------------------------------------------------------ api
  window.api = {
    capabilities: () => caps,
    checkStorage,
    paths: async () => null,
    openFolder: async () => false,
    showItem: async () => false,

    // media
    importMedia: async (kind, multi) => {
      const files = await pickFiles(ACCEPT[kind] || '', multi);
      const out = [];
      for (const f of files) out.push(await storeBlob(f.name, f));
      return out;
    },
    adoptFile: (file) => storeBlob(file.name, file),
    adoptMedia: async () => null,
    pathForFile: () => null,
    readMedia: async (m) => {
      const rec = await idbGet('media', nameOfMedia(m));
      return rec && rec.blob ? rec.blob.arrayBuffer() : null;
    },
    mediaBytes: async (m) => {
      const rec = await idbGet('media', nameOfMedia(m));
      return rec && rec.blob ? new Uint8Array(await rec.blob.arrayBuffer()) : null;
    },
    mediaBlob: async (m) => {
      const rec = await idbGet('media', nameOfMedia(m));
      return rec ? rec.blob : null;
    },
    storeMedia: async (name, bytes) => storeBlob(name, new Blob([bytes])),
    resolveMedia,
    // spec: { exts: ['zip'], accept: '.zip', mime } — the browser uses accept
    saveFile: async (fileName, bytes, spec) => download(fileName, bytes instanceof Blob ? bytes
      : new Blob([bytes], { type: (spec && spec.mime) || 'application/octet-stream' })),
    openFile: async (spec) => {
      const [f] = await pickFiles((spec && spec.accept) || '', false);
      if (!f) return null;
      return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
    },

    // people
    listPeople: async () => rehydrate({ people: (await idbGet('kv', 'people')) || [] }).then(d => d.people),
    savePeople: async (list) => {
      await idbPut('kv', 'people', stripPaths({ people: Array.isArray(list) ? list : [] }).people);
      return window.api.listPeople();
    },
    exportPeopleFile: async (list) => {
      const clean = stripPaths({ people: list || [] });
      const json = JSON.stringify({ version: 1, people: clean.people }, null, 2);
      return download('people.json', new Blob([json], { type: 'application/json' }));
    },
    importPeopleFile: async () => {
      const [f] = await pickFiles('application/json,.json', false);
      if (!f) return null;
      const raw = JSON.parse(await f.text());
      const list = Array.isArray(raw) ? raw : (raw.people || []);
      return (await rehydrate({ people: list })).people;
    },

    // templates
    listTemplates: async () => {
      await seedTemplates();
      const all = await idbAll('templates');
      return all.map(t => ({
        file: t.name, fileName: t.name + '.json',
        name: (t.data && t.data.meta && t.data.meta.name) || t.name, mtime: t.mtime
      })).sort((a, b) => b.mtime - a.mtime);
    },
    saveTemplate: async (name, data) => {
      const key = safeName(name);
      await idbPut('templates', key, { name: key, data: stripPaths(data), mtime: Date.now() });
      return key;
    },
    loadTemplate: async (key) => {
      const t = await idbGet('templates', key);
      return t ? rehydrate(JSON.parse(JSON.stringify(t.data))) : null;
    },
    deleteTemplate: async (key) => { await idbDel('templates', key); return true; },
    pruneMedia,
    exportTemplateFile: async (name, data) => {
      const json = JSON.stringify(stripPaths(data), null, 2);
      return download(safeName(name) + '.json', new Blob([json], { type: 'application/json' }));
    },
    importTemplateFile: async () => {
      const [f] = await pickFiles('application/json,.json', false);
      if (!f) return null;
      const data = JSON.parse(await f.text());
      const key = safeName((data.meta && data.meta.name) || f.name.replace(/\.json$/i, ''));
      await idbPut('templates', key, { name: key, data: stripPaths(data), mtime: Date.now() });
      return rehydrate(data);
    },
    stripPaths,
    rehydrate,

    // closing: the browser asks on its own through beforeunload (see editor)
    onQueryClose: () => {},
    closeAck: () => {},
    closeReply: () => {},

    // exports run in this page — see js/export/webexport.js
    exportImage: (opts) => window.WebExport.image(opts, emit),
    exportVideo: (opts) => window.WebExport.video(opts, emit),
    exportAnimated: (opts) => window.WebExport.animated(opts, emit),
    cancelExport: () => window.WebExport.cancel(),
    onExportProgress: (cb) => bus.addEventListener('export:progress', (e) => cb(e.detail)),
    deliver: (fileName, blob) => download(fileName, blob)
  };
  // No navigator.storage.persist(): it would apply to the whole site this is
  // hosted on, not just MockChat.
})();
