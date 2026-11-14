/* People: a small address book shared by every project — display name,
   @handle, picture, badge, and how well known they are (reach), which the
   TikTok screens use to make up believable numbers. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, R = E.R, $ = E.$, $$ = E.$$, esc = E.esc;

  // people.json can be hand-edited or come from an older version, so fill in
  // anything missing rather than trusting the shape
  const normPeople = (list) => (Array.isArray(list) ? list : []).map(S.migratePerson);

  E.loadPeople = async function () {
    try { E.people = normPeople(await window.api.listPeople()); } catch (e) { E.people = []; }
    await window.MediaRef.prepare(E.people);
    return E.people;
  };

  // Saving hands back FRESH objects (re-read from storage), so anything that
  // held on to a person from before the save is now looking at a stale copy.
  // Always find people again by id after this.
  // A failure keeps the list on screen as it is and says so — it used to be
  // swallowed, and the people were simply gone after a reload.
  async function persistPeople() {
    try { E.people = normPeople(await window.api.savePeople(E.people)); return true; } catch (err) {
      E.storageError('save your People list', err);
      return false;
    }
  }
  const byId = (id) => E.people.find(x => x.id === id) || null;

  const REACH_OPTS = [{ id: '', label: 'Not set' }].concat(S.REACH.map(r => ({ id: r.id, label: r.label })));

  function personRowHTML(p) {
    const reach = S.REACH.find(r => r.id === p.reach);
    return cat(html`<div class="person-row d-list-row" data-person="${p.id}">`,
      html`<div class="person-av">${(window.MediaRef.src(p.avatar) ? R.fitImg(p.avatar) : esc((p.display || '?').charAt(0).toUpperCase()))}</div>`,
      html`<div class="person-meta d-list-col-grow"><div class="d">${p.display || 'unnamed'}`,
        html`${(p.verified ? html` <span class="verified" data-tip="Verified">✓</span>` : '')}</div>`,
        html`<div class="h">${(p.handle ? html`@${p.handle}` : html`<i>no handle</i>`)}`,
        html`${(reach ? html` · ${reach.label}` : '')}</div></div>`,
      html`<div class="acts">`,
        html`<button class="d-btn d-btn-xs" data-pedit="${p.id}">Edit</button>`,
        html`<button class="d-btn d-btn-xs d-btn-ghost danger" data-pdel="${p.id}" data-tip="Delete this person" aria-label="Delete">✕</button>`,
      html`</div></div>`);
  }

  E.openPeople = async function (pickFor) {
    await E.loadPeople();
    const list = E.people.length
      ? hjoin(E.people.map(personRowHTML))
      : html`<div class="person-empty">No one saved yet.<br>Add the people you use often and they are one click away everywhere.</div>`;
    E.modal(pickFor ? 'Pick a person' : 'People',
      cat(html`${(pickFor ? E.note('Click a person to use them here.') : '')}`,
      html`<div class="pad d-list">${list}</div>`),
      cat(html`<button class="d-btn d-btn-sm" data-pact="import">Import…</button>`,
      html`<button class="d-btn d-btn-sm" data-pact="export"${(E.people.length ? '' : ' disabled')}>Export…</button>`,
      html`<span class="grow"></span>`,
      html`<button class="d-btn d-btn-sm d-btn-primary" data-pact="add">+ Add person</button>`,
      html`<button class="d-btn d-btn-sm" data-close>Close</button>`));

    $$('#modalHost [data-pedit]').forEach(b => b.onclick = () => editPerson(b.dataset.pedit, pickFor));
    $$('#modalHost [data-pdel]').forEach(b => b.onclick = async () => {
      const p = byId(b.dataset.pdel);
      if (!p || !(await E.confirm('Delete person?', html`Delete “${p.display}” from People?`, 'Delete', true))) return E.openPeople(pickFor);
      E.people = E.people.filter(x => x.id !== p.id);
      await persistPeople();
      E.openPeople(pickFor);
    });
    $$('#modalHost [data-pact]').forEach(b => b.onclick = async () => {
      const a = b.dataset.pact;
      if (a === 'add') {
        const p = S.defaultPerson();
        E.people.push(p);
        await persistPeople();
        return editPerson(p.id, pickFor);
      }
      if (a === 'export') { await window.api.exportPeopleFile(E.people); return; }
      if (a === 'import') {
        let got;
        try { got = await window.api.importPeopleFile(); } catch (err) {
          return E.toast('Could not read that People file: ' + (err && err.message || err), 'err');
        }
        if (!got) return;
        const have = {};
        E.people.forEach(p => { have[p.id] = 1; });
        let n = 0;
        got.forEach(p => { if (!have[p.id]) { E.people.push(S.migratePerson(p)); n++; } });
        if (await persistPeople()) E.toast(n ? 'Imported ' + n + ' ' + (n === 1 ? 'person' : 'people') : 'Everyone in that file is already here');
        return E.openPeople(pickFor);
      }
    });
    if (pickFor) {
      $$('#modalHost .person-row').forEach(row => row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const p = byId(row.dataset.person);
        if (p) { E.applyPerson(p, pickFor); E.closeModal(); E.renderAll(); }
      }));
    }
  };

  function editPerson(id, pickFor) {
    const p = byId(id);
    if (!p) return E.openPeople(pickFor);
    E.modal('Edit person',
      cat(html`<div class="field person-edit-av">`,
        html`<div class="fit-thumb round" id="pAv">${(window.MediaRef.src(p.avatar) ? R.fitImg(p.avatar) : '')}</div>`,
        html`<div class="row3">`,
          html`<button class="d-btn d-btn-xs" data-pa="import">${(p.avatar ? 'Replace…' : 'Import…')}</button>`,
          html`<button class="d-btn d-btn-xs" data-pa="fit"${(p.avatar ? '' : ' disabled')} data-tip="Drag to reposition, scroll to zoom">Adjust…</button>`,
          html`<button class="d-btn d-btn-xs d-btn-ghost" data-pa="clear"${(p.avatar ? '' : ' disabled')}>Remove</button>`,
        html`</div></div>`,
      html`<fieldset class="field d-fieldset"><legend class="d-fieldset-legend">Display name</legend><input class="d-input d-input-sm" type="text" id="pDisplay" value="${p.display}"></fieldset>`,
      html`<fieldset class="field d-fieldset"><legend class="d-fieldset-legend">Handle</legend><input class="d-input d-input-sm" type="text" id="pHandle" placeholder="without the @" value="${p.handle}"></fieldset>`,
      html`<div class="field"><div class="row2">`,
        html`${E.mini('Badge', html`<input class="d-input d-input-sm" type="text" id="pBadge" value="${p.badge}">`, 'Shown next to their name in TikTok live chat, e.g. LVL 32 or MOD')}`,
        html`${E.mini('Badge colour', html`<input type="color" id="pBadgeColor" value="${p.badgeColor || '#8a5cff'}">`)}`,
      html`</div></div>`,
      html`<fieldset class="field d-fieldset"><legend class="d-fieldset-legend">Reach${E.tip('How well known they are. When you use them as a TikTok poster or streamer, the likes, views and comment counts are made up to match.')}</legend>`,
        html`<select class="d-select d-select-sm" id="pReach">${hjoin(REACH_OPTS.map(o => html`<option value="${o.id}"${(o.id === (p.reach || '') ? ' selected' : '')}>${o.label}</option>`))}</select></fieldset>`,
      html`<label class="check"><input class="d-toggle d-toggle-sm" type="checkbox" id="pVerified"${(p.verified ? ' checked' : '')}><span>Verified tick</span></label>`,
      html`<fieldset class="field d-fieldset"><legend class="d-fieldset-legend">Note to self</legend><input class="d-input d-input-sm" type="text" id="pNote" value="${p.note}"></fieldset>`),
      cat(html`<button class="d-btn d-btn-sm" data-pe="back">Back</button>`,
      html`<button class="d-btn d-btn-sm d-btn-primary" data-pe="save">Save</button>`));

    // read the form into the CURRENT object for this id
    const collect = () => {
      const cur = byId(id);
      if (!cur) return null;
      cur.display = $('#pDisplay').value.trim() || 'unnamed';
      cur.handle = $('#pHandle').value.trim().replace(/^@+/, '');
      cur.badge = $('#pBadge').value.trim();
      cur.badgeColor = $('#pBadgeColor').value;
      cur.reach = $('#pReach').value;
      cur.verified = $('#pVerified').checked;
      cur.note = $('#pNote').value.trim();
      return cur;
    };
    $$('#modalHost [data-pa]').forEach(b => b.onclick = async () => {
      const cur = collect();
      if (!cur) return;
      const a = b.dataset.pa;
      if (a === 'import') {
        let files;
        try { files = await window.api.importMedia('image', false); } catch (err) { E.storageError('import that picture', err); }
        if (files && files.length) {
          await window.MediaRef.prepare(files, { refresh: true });
          files[0].fit = S.defaultFit(); cur.avatar = files[0];
        }
      } else if (a === 'clear') {
        cur.avatar = null;
      } else if (a === 'fit') {
        // Frame the picture on the live object, THEN save. Saving first (as
        // this used to) swapped every person for a fresh copy, so the framing
        // went onto an object nothing kept — it looked right while the dialog
        // was open and was gone the next time you opened it.
        return E.openFitOn(cur, 'avatar', true, async () => {
          await persistPeople();
          editPerson(id, pickFor);
        });
      }
      await persistPeople();
      editPerson(id, pickFor);
    });
    $$('#modalHost [data-pe]').forEach(b => b.onclick = async () => {
      collect();
      await persistPeople();
      // either way you land back on the list — that is where you came from
      E.openPeople(pickFor);
    });
  }

  // Where a person's details land, per place they can be used.
  const PERSON_SLOTS = {
    contact:  { name: 'chat.contactName', avatar: 'chat.avatar' },
    host:     { name: 'chat.tt.hostName', avatar: 'chat.tt.hostAvatar', reach: true },
    poster:   { name: 'chat.tt.feed.username', avatar: 'chat.avatar', verified: 'chat.tt.feed.verified', reach: true },
    msgUser:  { name: 'msg.user', avatar: 'msg.userAvatar', badge: 'msg.badge', badgeColor: 'msg.badgeColor' },
    sender:   { name: 'msg.sender' }
  };

  E.applyPerson = function (p, slotKey) {
    let slot = PERSON_SLOTS[slotKey];
    if (!slot && slotKey && slotKey.indexOf('cell:') === 0) {
      slot = { name: 'chat.tt.cells.' + slotKey.slice(5) + '.label', avatar: 'chat.tt.cells.' + slotKey.slice(5) + '.media' };
    }
    if (!slot) return;
    const nameValue = (slotKey === 'poster' || slotKey === 'host' || slotKey === 'msgUser')
      ? (p.handle || p.display)
      : (p.display || p.handle);
    if (slot.name) E.setPath(slot.name, nameValue);
    if (slot.avatar && p.avatar) E.setPath(slot.avatar, JSON.parse(JSON.stringify(p.avatar)));
    if (slot.verified) E.setPath(slot.verified, !!p.verified);
    if (slot.badge && p.badge) { E.setPath(slot.badge, p.badge); if (slot.badgeColor) E.setPath(slot.badgeColor, p.badgeColor); }
    // a known account comes with numbers to match
    if (slot.reach && p.reach) {
      E.project.chat.tt.reach = p.reach;
      E.generateStats(slotKey === 'host' ? 'live' : 'feed', true);
    }
    E.dirty = true;
  };

  E.personPick = (slotKey) =>
    html`<div class="field"><button class="d-btn d-btn-xs d-btn-block" data-act="pickperson" data-slot="${slotKey}">👤 Use a saved person…</button></div>`;

  // ------------------------------------------------------- TikTok numbers
  // Fill the counters from the scene's reach instead of typing them in.
  E.generateStats = function (which, quiet) {
    const p = E.project;
    const tt = p.chat.tt;
    const g = S.genStats(tt.reach || 'mid');
    if (which === 'live') {
      tt.viewers = g.viewers;
      tt.likeCount = g.liveLikes;
    } else {
      Object.assign(tt.feed, { likes: g.likes, comments: g.comments, favorites: g.favorites, shares: g.shares });
      // the comments under the video get likes too, the first few the most
      p.messages.filter(m => m.type === 'comment').forEach((m, i) => { m.likes = g.commentLikes(i); });
    }
    E.dirty = true;
    if (!quiet) { E.renderAll(); E.toast('New numbers for a ' + (S.REACH.find(r => r.id === tt.reach) || S.REACH[2]).label.toLowerCase()); }
  };

  $('#btnPeople').onclick = () => E.openPeople(null);
})();
