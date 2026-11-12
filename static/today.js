/* Heute: vier Kacheln mit echten Zahlen aus den Stores, Video hinzufügen und die zuletzt bearbeiteten Aufgaben. */
(() => {
  'use strict';
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  async function request(url) {
    const response = await KlartextRequest.send(url, {headers: {Accept: 'application/json'}});
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  // One running count per number: a new value stops the old count and goes on from what is shown.
  const counting = new WeakMap();
  function countUp(node, value, ms = 600) {
    cancelAnimationFrame(counting.get(node));
    const from = Number.parseInt(node.textContent, 10) || 0;
    node.dataset.value = String(value);
    if (reduced.matches || from === value) { node.textContent = String(value); return; }
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      node.textContent = String(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) counting.set(node, requestAnimationFrame(step));
    };
    counting.set(node, requestAnimationFrame(step));
  }
  const format = new Intl.DateTimeFormat('de-DE', {weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
  function postTime(post) {
    const p = Object.fromEntries(format.formatToParts(new Date(post.scheduled_local || post.scheduled_at)).map(part => [part.type, part.value]));
    return `${p.weekday.replace('.', '')} ${p.day}.${p.month}. ${p.hour}:${p.minute}`;
  }
  let refresh = () => {};

  function mount(host) {
    if (!host || host.querySelector('[data-structure-view="today"]')) return;
    const root = el('section', 'todayPage'); root.dataset.structureView = 'today'; root.hidden = true; root.setAttribute('aria-label', 'Heute');
    root.innerHTML = `<div class="todayTiles">
      <button type="button" class="todayTile card" data-today-tile="review" data-shell-route="review"><span class="todayTileLabel">Wartet auf Prüfung</span><strong class="todayTileValue" data-today-count="review">…</strong></button>
      <button type="button" class="todayTile card" data-today-tile="due" data-shell-route="projects"><span class="todayTileLabel">Fällig diese Woche</span><strong class="todayTileValue" data-today-count="due">…</strong><span class="todayTileNote" data-today-due-note hidden></span></button>
      <button type="button" class="todayTile card" data-today-tile="posts" data-shell-route="planning"><span class="todayTileLabel">Nächste Beiträge</span><ol class="todayPosts" data-today-posts></ol><span class="todayTileNote" data-today-posts-note hidden></span></button>
      <button type="button" class="todayTile card" data-today-tile="requests" data-shell-route="requests"><span class="todayTileLabel">Neue Anfragen</span><strong class="todayTileValue" data-today-count="requests">…</strong></button>
    </div>
    <div class="todayActions"><button type="button" class="btn isPrimary" data-today-add-video>Video hinzufügen</button></div>
    <section class="todayRecent"><h2>Zuletzt bearbeitet</h2><div data-today-recent></div></section>`;
    host.append(root);
    const $ = selector => root.querySelector(selector);
    const tile = name => $(`[data-today-tile="${name}"]`);
    // Compared with the target value, not the text: while a number counts, its text is still on the way.
    function show(name, value) { tile(name).removeAttribute('data-today-unavailable'); const count = $(`[data-today-count="${name}"]`); if (count.dataset.value !== String(value)) countUp(count, value); }
    function fail(name) {
      tile(name).dataset.todayUnavailable = ''; const count = $(`[data-today-count="${name}"]`); if (!count) return;
      cancelAnimationFrame(counting.get(count)); delete count.dataset.value; count.textContent = 'nicht geladen';
    }

    function renderTasks(ws) {
      const recent = $('[data-today-recent]');
      if (!ws) { fail('due'); tile('due').classList.remove('isOverdue'); $('[data-today-due-note]').hidden = true; recent.replaceChildren(el('p', 'status isError', 'Aufgaben nicht geladen. Verbindung fehlgeschlagen, lade die Seite neu.')); return; }
      const tasks = ws.tasks || [], now = new Date(), stage = window.KlartextStage;
      // The same tasks as Aufgaben with the Frist filter, where archived projects stay out too.
      const archived = new Set((ws.projects || []).filter(project => project.archived).map(project => project.id));
      const due = tasks.filter(task => !archived.has(task.project_id) && stage.dueThisWeek(task, now));
      show('due', due.length);
      // Red alone does not say it (WCAG 1.4.1): the note names how many are overdue.
      const late = due.filter(task => stage.overdue(task, now)).length, note = $('[data-today-due-note]');
      tile('due').classList.toggle('isOverdue', late > 0);
      note.textContent = late ? `davon ${late} überfällig` : ''; note.hidden = !late;
      const stageLabel = Object.fromEntries((ws.stages || []).map(stage => [stage.id, stage.label]));
      const brandOf = task => { const project = (ws.projects || []).find(p => p.id === task.project_id); return (ws.brands || []).find(b => b.id === project?.brand_id)?.name || 'Ohne Firma'; };
      const rows = [...tasks].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 5).map(task => {
        const row = el('button', 'todayRow'); row.type = 'button'; row.dataset.todayTask = task.id;
        row.append(el('strong', 'todayRowTitle', `#${task.number} ${task.title || 'Ohne Titel'}`), window.KlartextStage.chip(task.stage, stageLabel[task.stage] || task.stage), el('span', 'todayRowMeta', brandOf(task)));
        return row;
      });
      recent.replaceChildren(...(rows.length ? rows : [el('p', 'status', 'Noch keine Aufgaben.')]));
    }
    // The posts come with /api/workspace: the calendar route checks files and Instagram first and may wait on the NAS.
    function renderPosts(ws) {
      const list = $('[data-today-posts]'), note = $('[data-today-posts-note]');
      if (!ws) { fail('posts'); list.replaceChildren(); note.textContent = 'Nicht geladen. Lade die Seite neu.'; note.hidden = false; return; }
      tile('posts').removeAttribute('data-today-unavailable');
      const now = Date.now();
      const next = (ws.posts || []).filter(post => post.status === 'planned' && post.scheduled_at && Date.parse(post.scheduled_at) >= now)
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 3);
      list.replaceChildren(...next.map(post => { const item = el('li'); item.append(el('span', '', `${post.title || 'Beitrag'} · `), el('time', '', postTime(post))); return item; }));
      note.textContent = 'Keine Beiträge geplant.'; note.hidden = next.length > 0;
    }
    let serial = 0;
    // Every tile shows as soon as its own answer is there; only answers of the newest load count.
    async function load() {
      const run = ++serial;
      const answer = (loading, render) => loading.then(value => run === serial && render(value), () => run === serial && render(null));
      await Promise.allSettled([
        answer(request('/api/workspace'), ws => { renderTasks(ws); renderPosts(ws); }),
        // The same number as the Freigaben badge: what waits on this role. review.js loads it and updates its badge with it.
        answer(window.KlartextReview.reviews(), reviews => {
          if (!reviews) return fail('review');
          // For the team the number is its own rework, not a review.
          $('[data-today-tile="review"] .todayTileLabel').textContent = (reviews.me?.role || document.body.dataset.role) === 'team' ? 'Wartet auf dich' : 'Wartet auf Prüfung';
          const open = window.KlartextReview.waiting(reviews).length;
          show('review', open); tile('review').classList.toggle('hasOpen', open > 0);
        }),
        answer(request('/api/requests'), requests => requests ? show('requests', requests.requests.filter(r => r.status === 'open').length) : fail('requests'))]);
      if (run === serial) root.dataset.todayReady = 'true';
    }
    refresh = load;
    root.addEventListener('click', event => {
      if (event.target.closest('[data-today-add-video]')) { window.KlartextAddVideo?.open(); return; }
      // The shell opens Aufgaben through data-shell-route; the tile hands over its filter first.
      if (event.target.closest('[data-today-tile="due"]')) window.KlartextTasks?.filter('due', ['week']);
      const row = event.target.closest('[data-today-task]');
      if (!row) return;
      window.KlartextEditor?.setWorkspace('projects');
      // tasks.js hört darauf und öffnet das Panel der Aufgabe.
      window.dispatchEvent(new CustomEvent('klartext:open-task', {detail: {id: row.dataset.todayTask}}));
    });
    window.addEventListener('klartext:workspace-change', event => { if (event.detail?.name === 'today') load(); });
    window.addEventListener('klartext:tasks-changed', () => { if (root.dataset.todayReady) load(); });
  }

  window.KlartextToday = Object.freeze({mount, refresh: () => refresh()});
})();
