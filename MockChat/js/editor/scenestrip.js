/* The scene strip: the row of steps above the message list.

   A project is a run of scenes. Switching one in rebinds project.chat and
   project.messages, so every other part of the editor carries on unaware. */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, $ = E.$, $$ = E.$$, esc = E.esc;

  const TRANS_ARROW = { cut: '⇥', fade: '◐', slide: '→', swipe: '↑', down: '↓' };

  E.renderSceneStrip = function () {
    const host = $('#sceneStrip');
    if (!host) return;
    const p = E.project;
    const many = p.scenes.length > 1;
    setHTML(host, cat(html`${hjoin(p.scenes.map((sc, i) => {
      const arrow = i < p.scenes.length - 1 ? (TRANS_ARROW[sc.transition] || '') : '';
      const back = S.isRevisit(p, i);
      const target = S.resolveScene(p, i);
      const watch = Number(sc.watch) || 0;
      const tr = S.TRANSITIONS.find(t => t.id === sc.transition);
      return cat(html`<div class="scene-chip${(i === p.active ? ' on' : '')}${(back ? ' revisit' : '')}`,
        html`" data-scene="${i}" draggable="true" data-tip="`,
        html`${(back ? 'Back to “' + target.name + '” — a second look' : sc.name) +
          (arrow && tr ? ' · leaves by: ' + tr.label : '') + ' · drag to reorder'}">`,
        html`<span class="n">${(back ? '↩' : (i + 1))}</span>`,
        html`<span class="nm">${back ? target.name : sc.name}</span>`,
        html`${(watch ? html`<span class="wt">${E.secLabel(watch)}</span>` : '')}`,
        html`${(arrow ? html`<span class="tr">${arrow}</span>` : '')}`,
        html`${(many ? html`<button class="x" data-delscene="${i}" data-tip="Remove this step" aria-label="Remove this step">✕</button>` : '')}`,
        html`</div>`);
    }))}`,
      html`<button class="scene-add" data-addscene data-tip="Add a new scene after this one — another chat, or the next reel">+ scene</button>`,
      html`${(p.scenes.length > 1
        ? html`<button class="scene-add" data-backscene data-tip="Scroll back to a scene you already showed (a double-take)">↩ back to…</button>`
        : '')}`));
  };

  E.gotoScene = function (i) {
    if (E.isPlaying()) E.stopPlayback();
    S.bindScene(E.project, i);
    E.selectedId = E.project.messages.length ? E.project.messages[0].id : null;
    E.renderAll();
  };

  // true when moving from step a to step b means going UP the feed — that is,
  // to a scene that was first shown earlier
  function backwards(a, b) {
    return S.sceneRefIndex(E.project, b) < S.sceneRefIndex(E.project, a);
  }

  // Adds a step that returns to a scene already in the sequence — scrolling
  // back up the feed for a second look. It borrows that scene's content, so
  // editing it here edits the one reel, in both places it appears.
  function addRevisit(targetIndex) {
    const p = E.project;
    const target = p.scenes[S.sceneRefIndex(p, targetIndex)];
    const here = p.scenes[p.active];
    const step = {
      id: S.uid(), name: target.name, ref: target.id, chat: null, messages: null,
      watch: 1500,           // a double-take is short by nature
      transition: 'cut', hold: 0
    };
    // going back up the feed is a downward swipe; carrying on is an upward one
    if (here.transition === 'cut') here.transition = backwards(p.active, targetIndex) ? 'down' : 'swipe';
    p.scenes.splice(p.active + 1, 0, step);
    // and the step after the revisit has to get back to wherever it was going
    const after = p.scenes[p.active + 2];
    if (after) step.transition = backwards(p.active + 1, p.active + 2) ? 'down' : 'swipe';
    E.dirty = true;
    E.gotoScene(p.active + 1);
  }

  E.addScene = function (copyCurrent) {
    const p = E.project;
    const here = p.scenes[p.active];
    const src = S.resolveScene(p, p.active);   // a revisit copies its target
    let sc;
    if (copyCurrent) {
      sc = JSON.parse(JSON.stringify(src));
      sc.id = S.uid();
      sc.ref = null;
      sc.name = src.name + ' copy';
      sc.messages.forEach(m => { m.id = S.uid(); });
    } else {
      sc = S.defaultScene(p.platform, 'Scene ' + (p.scenes.filter(x => !x.ref).length + 1));
      // a new scene should look like the one you were just editing — geometry
      // and everything that belongs to the phone rather than the conversation
      sc.chat.width = src.chat.width;
      sc.chat.height = src.chat.height;
      sc.chat.device = src.chat.device;
      S.SHARED_CHAT_KEYS.forEach(k => { sc.chat[k] = src.chat[k]; });
      sc.chat.brand = JSON.parse(JSON.stringify(src.chat.brand));
      sc.chat.statusBar = JSON.parse(JSON.stringify(src.chat.statusBar));
    }
    // the scene before it needs a way to get here
    if (here.transition === 'cut') here.transition = S.isTT(p.platform) ? 'swipe' : 'slide';
    p.scenes.splice(p.active + 1, 0, sc);
    E.dirty = true;
    E.gotoScene(p.active + 1);
  };

  E.deleteScene = async function (i) {
    const p = E.project;
    if (p.scenes.length < 2) return;
    const wasOn = p.active;
    const gone = p.scenes[i];
    const doomed = gone.ref ? [i]
      // taking out a scene takes its second looks with it — they have nothing
      // left to show
      : p.scenes.map((sc, j) => (j === i || sc.ref === gone.id) ? j : -1).filter(j => j >= 0);
    if (doomed.length >= p.scenes.length) return;
    if (!gone.ref && (gone.messages || []).length) {
      const ok = await E.confirm('Delete scene?', cat(html`Delete “${gone.name}” and its ${gone.messages.length}`,
        html` message${(gone.messages.length > 1 ? 's' : '')}?`,
        html`${(doomed.length > 1 ? ' The ' + (doomed.length - 1) + ' step(s) that go back to it are removed too.' : '')}`), 'Delete', true);
      if (!ok) return;
    }
    doomed.slice().reverse().forEach(j => p.scenes.splice(j, 1));
    E.dirty = true;
    // deleting a step you are not standing on shouldn't move you off yours
    const removedBefore = doomed.filter(j => j < wasOn).length;
    const to = doomed.indexOf(wasOn) >= 0 ? Math.min(i, p.scenes.length - 1) : wasOn - removedBefore;
    E.gotoScene(to);
  };

  // Pick which already-shown scene to scroll back to.
  E.openBackTo = function () {
    const p = E.project;
    const choices = p.scenes
      .map((sc, i) => ({ sc, i }))
      .filter(x => !x.sc.ref && x.i !== S.sceneRefIndex(p, p.active));
    if (!choices.length) { E.toast('There is no other scene to go back to yet.'); return; }
    const body = cat(html`<div class="pad">`,
      html`${E.note('Adds a step right after this one that shows that scene again — already played out, the way it looks when you scroll back up to it.')}`,
      html`${hjoin(choices.map(x =>
        cat(html`<div class="person-row"><button class="d-btn d-btn-sm" data-backto="${x.i}" style="width:100%;text-align:left">`,
        html`↩ ${x.sc.name}</button></div>`)))}</div>`);
    E.modal('Scroll back to…', body, html`<button class="d-btn d-btn-sm" data-close>Cancel</button>`);
    $$('#modalHost [data-backto]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.backto);
      E.closeModal();
      addRevisit(i);
    });
  };

  // ---- strip events ----------------------------------------------------
  $('#sceneStrip').addEventListener('click', (e) => {
    const del = e.target.closest('[data-delscene]');
    if (del) { e.stopPropagation(); return E.deleteScene(Number(del.dataset.delscene)); }
    if (e.target.closest('[data-addscene]')) return E.addScene(false);
    if (e.target.closest('[data-backscene]')) return E.openBackTo();
    const chip = e.target.closest('[data-scene]');
    if (chip) E.gotoScene(Number(chip.dataset.scene));
  });

  let sceneDrag = null;
  $('#sceneStrip').addEventListener('dragstart', (e) => {
    const chip = e.target.closest('[data-scene]');
    if (!chip) return;
    sceneDrag = Number(chip.dataset.scene);
    e.dataTransfer.effectAllowed = 'move';
  });
  $('#sceneStrip').addEventListener('dragover', (e) => {
    const chip = e.target.closest('[data-scene]');
    if (!chip || sceneDrag == null) return;
    e.preventDefault();
    $$('.scene-chip').forEach(c => c.classList.remove('drag-over'));
    chip.classList.add('drag-over');
  });
  $('#sceneStrip').addEventListener('drop', (e) => {
    const chip = e.target.closest('[data-scene]');
    $$('.scene-chip').forEach(c => c.classList.remove('drag-over'));
    if (!chip || sceneDrag == null) { sceneDrag = null; return; }
    e.preventDefault();
    E.moveScene(sceneDrag, Number(chip.dataset.scene));
    sceneDrag = null;
  });

  // Dragging needs a mouse; the Timing tab's "Earlier / Later" buttons call
  // this too, which is how scenes get reordered on a phone.
  E.moveScene = function (from, to) {
    const p = E.project;
    if (from === to || to < 0 || to >= p.scenes.length) return;
    const [sc] = p.scenes.splice(from, 1);
    p.scenes.splice(to, 0, sc);
    E.dirty = true;
    E.gotoScene(to);
  };
})();
