/* Templates, project files and closing safely.

   A template is the project JSON with media referred to by name only
   (`media/<name>`), kept by the platform: a folder beside the desktop app, or
   IndexedDB in the browser. A PROJECT FILE (.mockchat.zip) is that same JSON
   plus every media file it uses, in one zip — the way to back work up and to
   move it between computers or between the desktop app and the web version. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, $ = E.$, $$ = E.$$, esc = E.esc;

  const BUNDLE_EXT = '.mockchat.zip';

  // ------------------------------------------------------- project files
  function walkMedia(node, fn, seen) {
    if (!node || typeof node !== 'object') return;
    seen = seen || new Set();
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(n => walkMedia(n, fn, seen)); return; }
    if (typeof node.ext === 'string' && (node.rel || node.file || node.name)) fn(node);
    Object.keys(node).forEach(k => { if (node[k] && typeof node[k] === 'object') walkMedia(node[k], fn, seen); });
  }
  const baseName = (s) => String(s || '').replace(/^.*[\\/]/, '');
  const mediaName = (m) => baseName(m.rel || m.name || m.file) || 'file';
  const fileSafe = (s) => String(s || 'project').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'project';

  // Project files get shared, so what goes in them is cleaned first:
  // - every picture, clip and sound is renamed (picture-1.jpg, clip-2.mp4…) —
  //   original names are often a date, a place or someone's name;
  // - their hidden details (GPS location, camera, author, dates) are removed
  //   by MetaStrip, without re-encoding: the media itself is unchanged.
  const kindOf = (ext) => S.AUDIO_EXT.indexOf(ext) >= 0 ? 'sound' : S.VIDEO_EXT.indexOf(ext) >= 0 ? 'clip' : 'picture';

  async function buildBundle(packed) {
    const clean = JSON.parse(JSON.stringify(packed));
    const wanted = new Map();                    // original name -> { rec to read it by, name in the zip }
    const counts = {};
    walkMedia(clean, (m) => {
      const name = mediaName(m);
      if (!wanted.has(name)) {
        const ext = String(m.ext || (/\.([^.]+)$/.exec(name) || [])[1] || '').toLowerCase();
        const kind = kindOf(ext);
        counts[kind] = (counts[kind] || 0) + 1;
        wanted.set(name, { rec: Object.assign({}, m), as: kind + '-' + counts[kind] + (ext ? '.' + ext : ''), ext });
      }
      const w = wanted.get(name);
      m.rel = 'media/' + w.as;
      m.name = w.as;
      delete m.file; delete m.url; delete m.missing;
    });
    const files = {
      'project.json': window.fflate.strToU8(JSON.stringify(clean, null, 2)),
      'README.txt': window.fflate.strToU8(
        'MockChat Studio project file.\n\nOpen it from Templates → Open project file… in the desktop app or the web version.\n' +
        'project.json is the project; media/ holds every picture, clip and sound it uses.\n' +
        'They were renamed, and their hidden details (location, camera, dates) removed, when this file was made.\n')
    };
    const missing = [];
    let cleaned = 0;
    for (const [name, w] of wanted) {
      const bytes = await window.api.mediaBytes(w.rec);
      if (!bytes || !bytes.length) { missing.push(name); continue; }
      const out = window.MetaStrip.strip(new Uint8Array(bytes), w.ext);
      if (out.removed.length) cleaned++;
      files['media/' + w.as] = [out.bytes, { level: 0 }];  // already compressed formats
    }
    return { zip: window.fflate.zipSync(files, { level: 6 }), missing, count: wanted.size, cleaned };
  }

  // Unpack a project file: store its media, then point the project at the
  // stored copies (a name can change if this machine already has one like it).
  async function readBundle(bytes) {
    const files = window.fflate.unzipSync(bytes);
    if (!files['project.json']) throw new Error('This zip is not a MockChat project file (no project.json inside).');
    // names only, from here on: any address in project.json is dropped
    const data = window.MediaRef.ingest(JSON.parse(window.fflate.strFromU8(files['project.json'])));
    const stored = {};
    for (const path of Object.keys(files)) {
      const m = /^media\/([^/]+)$/.exec(path);
      if (!m || !files[path].length) continue;
      // the platform cleans the name again and never writes outside its store
      stored[window.MediaRef.safeName(m[1])] = await window.api.storeMedia(m[1], files[path]);
    }
    walkMedia(data, (m) => {
      const rec = stored[m.name];
      if (rec) { m.name = rec.name; m.rel = rec.rel; }   // a name can change if this machine has one like it
    });
    return data;
  }

  E.saveProjectFile = async function (packed, name) {
    E.busy(true, 'Packing the project file…');
    try {
      const out = await buildBundle(packed || S.pack(E.project));
      const file = await window.api.saveFile(fileSafe(name) + BUNDLE_EXT,
        out.zip, { exts: ['zip'], label: 'MockChat project', mime: 'application/zip' });
      if (!file) return;
      E.toast('Saved project file with ' + out.count + ' media file' + (out.count === 1 ? '' : 's') +
        (out.cleaned ? ' (hidden location and camera details removed from ' + out.cleaned + ')' : '') +
        (out.missing.length ? ' — ' + out.missing.length + ' could not be found and were left out' : ''),
        out.missing.length ? 'err' : null,
        E.caps.showInFolder ? 'show file' : null, () => window.api.showItem(file));
    } catch (err) {
      E.toast('Could not save the project file: ' + (err && err.message || err), 'err');
    } finally {
      E.busy(false);
    }
  };

  E.openProjectFile = async function () {
    const got = await window.api.openFile({ accept: '.zip,.json,application/zip,application/json', exts: ['zip', 'json'] });
    if (!got) return null;
    let data;
    if (/\.json$/i.test(got.name)) {
      // a bare template: media by name only, found here if this machine has them
      data = window.MediaRef.ingest(JSON.parse(new TextDecoder().decode(got.bytes)));
    } else {
      E.busy(true, 'Unpacking the project file…');
      try { data = await readBundle(got.bytes); } finally { E.busy(false); }
    }
    let name = (data.meta && data.meta.name) || got.name.replace(/(\.mockchat)?\.(zip|json)$/i, '');
    // a template of that name already here: ask, never overwrite it quietly
    const clash = await nameClash(name);
    if (clash) {
      const choice = await askOnClash(name, 'Opening this file keeps it in your templates.');
      if (!choice) return null;
      if (choice === 'both') name = clash.free;
    }
    data.meta = Object.assign({}, data.meta, { name });
    // store it as a template, then read it back: the platform resolves every
    // media name to something this machine can actually show
    try {
      const key = await window.api.saveTemplate(name, data);
      return (await window.api.loadTemplate(key)) || data;
    } catch (err) {
      // it still opens — it just is not kept in the templates
      E.storageError('keep it in your templates', err);
      return data;
    }
  };

  // ----------------------------------------------------------- templates
  async function openTemplates() {
    let list;
    try { list = await window.api.listTemplates(); } catch (err) { return E.storageError('open your templates', err); }
    const rows = list.length ? hjoin(list.map(t =>
      cat(html`<div class="tpl-row d-list-row"><span class="name d-list-col-grow">${t.name}</span>`,
      html`<span class="when">${new Date(t.mtime).toLocaleDateString()}</span>`,
      html`<button class="d-btn d-btn-xs" data-load="${t.file}">Open</button>`,
      html`<button class="d-btn d-btn-xs" data-bundle="${t.file}" data-name="${t.name}" data-tip="Save as a project file (.zip) with all its media — for backups and other computers">⤓</button>`,
      html`<button class="d-btn d-btn-xs d-btn-ghost danger" data-del="${t.file}" data-name="${t.name}" data-tip="Delete this template" aria-label="Delete">✕</button></div>`)))
      : E.note('No templates saved yet. Build a chat and hit “Save”.');

    E.modal('Templates',
      cat(html`${(E.caps.platform === 'web'
        ? E.note('Templates are kept in this browser on this device. Save a project file (⤓) to back one up or move it to another computer.')
        : '')}`,
      html`<div class="pad d-list">${rows}</div>`,
      html`${E.note('🔒 Photo location and camera details are removed from shared projects.')}`),
      cat(html`<button class="d-btn d-btn-sm" data-tplact="import" data-tip="Opens a .mockchat.zip project file, or a template .json">Open project file…</button>`,
      html`<button class="d-btn d-btn-sm" data-tplact="bundle" data-tip="Saves what is on screen now, with its media, as one .zip">Save project file…</button>`,
      html`${(E.caps.fileSystem ? html`<button class="d-btn d-btn-sm" data-tplact="folder">Open folder</button>` : '')}`,
      html`<span class="grow"></span><button class="d-btn d-btn-sm" data-close>Close</button>`));

    $$('#modalHost [data-load]').forEach(b => b.onclick = async () => {
      if (E.dirty && !(await E.confirm('Open template?', 'Your current changes are not saved in a template. Open this one anyway?', 'Open anyway'))) return openTemplates();
      let data;
      try { data = await window.api.loadTemplate(b.dataset.load); } catch (err) { return E.storageError('open that template', err); }
      if (!data) return E.toast('That template could not be read.', 'err');
      await loadProject(data);
      E.closeModal();
      E.toast('Loaded “' + E.templateName + '”');
    });
    $$('#modalHost [data-bundle]').forEach(b => b.onclick = async () => {
      let data;
      try { data = await window.api.loadTemplate(b.dataset.bundle); } catch (err) { return E.storageError('read that template', err); }
      if (data) E.saveProjectFile(data, b.dataset.name);
    });
    $$('#modalHost [data-del]').forEach(b => b.onclick = async () => {
      if (!(await E.confirm('Delete template?', html`Delete “${b.dataset.name}”? This cannot be undone.`, 'Delete', true))) return openTemplates();
      try { await window.api.deleteTemplate(b.dataset.del); } catch (err) { E.storageError('delete that template', err); }
      await E.pruneMedia();
      openTemplates();
    });
    $$('#modalHost [data-tplact]').forEach(b => b.onclick = async () => {
      const a = b.dataset.tplact;
      if (a === 'folder') return window.api.openFolder('templates');
      if (a === 'bundle') return E.saveProjectFile(S.pack(E.project), E.templateName || E.project.meta.name || 'mockchat');
      try {
        const data = await E.openProjectFile();
        if (!data) return;
        await loadProject(data);
        E.closeModal();
        const missing = countMissing(E.project);
        E.toast(missing ? 'Opened — but ' + missing + ' media file(s) were not included' : 'Project opened and saved to your templates', missing ? 'err' : null);
      } catch (err) {
        if (err instanceof DOMException) E.storageError('open that file', err);
        else E.toast('Could not open that file: ' + (err && err.message || err), 'err');
      }
    });
  }

  function countMissing(p) {
    let n = 0;
    walkMedia(p.scenes, (m) => { if (!window.MediaRef.src(m)) n++; });
    return n;
  }

  // Names are looked up (afresh: a project file may just have supplied files
  // that were missing before) before anything is drawn.
  async function loadProject(data) {
    if (E.isPlaying()) E.stopPlayback();
    const p = S.migrate(data);
    await window.MediaRef.prepare(p, { refresh: true });
    E.setProject(p);
    E.renderAll();
    E.backfillDurations();
  }

  // Let the platform drop media nothing uses any more (web only; see
  // pruneMedia in platform/web.js). Never fails loudly: it is housekeeping.
  E.pruneMedia = async function () {
    if (!window.api.pruneMedia) return null;
    const inUse = [];
    walkMedia(E.project, (m) => inUse.push(mediaName(m)));
    (E.people || []).forEach(p => walkMedia(p, (m) => inUse.push(mediaName(m))));
    try { return await window.api.pruneMedia(inUse); } catch (e) { return null; }
  };

  // ------------------------------------------------- two templates, one name
  // Templates are stored under a file-safe version of their name, so "Chat",
  // "chat" and "Chat?" would land on the same file (Windows ignores case).
  const keyOf = (name) => fileSafe(name).toLowerCase();
  const keyOfListed = (t) => String(t.fileName || t.file || '').replace(/^.*[\\/]/, '').replace(/\.json$/i, '').toLowerCase();

  // null when the name is free; otherwise the next free "name (2)"
  async function nameClash(name) {
    let list = [];
    try { list = await window.api.listTemplates(); } catch (e) { return null; }   // the save reports storage trouble
    const taken = new Set(list.map(keyOfListed));
    if (!taken.has(keyOf(name))) return null;
    let n = 2;
    while (taken.has(keyOf(name + ' (' + n + ')'))) n++;
    return { free: name + ' (' + n + ')' };
  }

  // 'both' | 'replace' | null (cancelled)
  function askOnClash(name, why) {
    return new Promise((resolve) => {
      E.modal('“' + name + '” already exists',
        cat(html`<div class="field confirm-text">You already have a template called <b>${name}</b>. ${(why || '')}`,
        html`<br><br><b>Keep both</b> saves this one under a new name; <b>Replace</b> overwrites the old one.</div>`),
        cat(html`<button class="d-btn d-btn-sm" id="clCancel">Cancel</button><span class="grow"></span>`,
        html`<button class="d-btn d-btn-sm d-btn-ghost danger" id="clReplace">Replace</button>`,
        html`<button class="d-btn d-btn-sm d-btn-primary" id="clBoth">Keep both</button>`));
      const done = (v) => { $('#modalHost').__onClose = null; E.closeModal(); resolve(v); };
      $('#clBoth').onclick = () => done('both');
      $('#clReplace').onclick = () => done('replace');
      $('#clCancel').onclick = () => done(null);
      $('#modalHost').__onClose = () => resolve(null);
      setTimeout(() => { const b = $('#clBoth'); if (b) b.focus(); }, 0);
    });
  }

  E.saveTemplate = async function () {
    const p = E.project;
    let name = await E.askName('Save template', E.templateName || p.chat.contactName + ' — ' + p.platform);
    if (!name) return false;
    // saving the open template again just updates it; any OTHER template of
    // that name is asked about first
    if (keyOf(name) !== keyOf(E.templateName)) {
      const clash = await nameClash(name);
      if (clash) {
        const choice = await askOnClash(name);
        if (!choice) return false;
        if (choice === 'both') name = clash.free;
      }
    }
    // the name goes into the saved data (the Templates list shows meta.name),
    // and is put back as it was if the save fails
    const before = { tpl: E.templateName, meta: p.meta.name };
    E.templateName = name;
    p.meta.name = name;
    let file;
    try {
      file = await window.api.saveTemplate(name, S.pack(p));
    } catch (err) {
      E.templateName = before.tpl;
      p.meta.name = before.meta;
      E.storageError('save “' + name + '”', err);
      return false;
    }
    E.dirty = false;
    if (E.caps.showInFolder) E.toast('Saved to the templates folder', null, 'show file', () => window.api.showItem(file));
    else E.toast('Saved “' + name + '” in this browser');
    return true;
  };

  $('#btnTemplates').onclick = openTemplates;
  $('#btnSave').onclick = () => E.saveTemplate();

  // ------------------------------------------------------------- closing
  if (E.caps.platform === 'web') {
    // the browser shows its own "leave site?" prompt
    window.addEventListener('beforeunload', (e) => {
      if (!E.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  } else {
    // NOTE: never guard the close with beforeunload in Electron — setting
    // event.returnValue cancels the close silently and the window becomes
    // impossible to shut. Main asks us instead, and we always answer.
    window.api.onQueryClose(() => {
      window.api.closeAck();
      if (!E.dirty) { window.api.closeReply(true); return; }
      E.modal('Unsaved changes',
        E.note('You have changes that are not in a template yet.'),
        cat(html`<button class="d-btn d-btn-sm" id="closeCancel">Keep editing</button>`,
        html`<button class="d-btn d-btn-sm d-btn-ghost danger" id="closeDiscard">Close without saving</button>`,
        html`<button class="d-btn d-btn-sm d-btn-primary" id="closeSave">Save &amp; close</button>`), { sticky: true });
      $('#closeCancel').onclick = () => { E.closeModal(); window.api.closeReply(false); };
      $('#closeDiscard').onclick = () => { E.closeModal(); window.api.closeReply(true); };
      $('#closeSave').onclick = async () => {
        E.closeModal();
        const ok = await E.saveTemplate();
        window.api.closeReply(!!ok);
      };
    });
  }
})();
