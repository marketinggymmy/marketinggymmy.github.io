/* Aufgaben: Firmen, Projekte und Aufgaben auf denselben lokalen Daten. Neu, Geschnitten und Untertitelt setzt der Nutzer, ab Zur Prüfung setzt Klartext die Stufe selbst. */
(() => {
  'use strict';
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function button(text, attrs = {}, className = 'btn') { const node = el('button', className, text); node.type = 'button'; for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; }
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Aufgaben');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Aufgaben', response.status)); }
    if (!response.ok) { const error = new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Aufgaben', response.status)); error.status = response.status; throw error; }
    return data;
  }
  const germanDate = value => value ? value.split('-').reverse().join('.') : '';
  const FILTERS = [['brand', 'Firma'], ['project', 'Projekt'], ['stage', 'Stufe'], ['kind', 'Art'], ['person', 'Verantwortlich'], ['due', 'Frist']];
  // Fällig diese Woche counts overdue tasks too, like the tile on Heute.
  const DUE = {week: task => window.KlartextStage.dueThisWeek(task), overdue: task => window.KlartextStage.overdue(task)};

  function mount(host) {
    if (!host || host.querySelector('[data-structure-view="projects"]')) return;
    const root = el('section', 'tasksWorkspace');
    root.dataset.structureView = 'projects'; root.hidden = true; root.setAttribute('aria-labelledby', 'tasksTitle');
    // Each filter and the Mehr menu sit in a positioned wrap, so the popover opens right under its button without inline styles.
    window.KlartextShell?.setActions('projects', [{label: 'Video hinzufügen', target: '[data-task-add-video]'}, {label: '+ Aufgabe', primary: true, target: '[data-task-new]'}]);
    const filters = FILTERS.map(([name, text]) => `<span class="tasksFilterWrap"><button type="button" class="btn tasksFilter" data-tasks-filter="${name}" aria-expanded="false">${text}<span class="tasksFilterCount" hidden></span></button><div class="popover tasksPopover" data-tasks-popover="${name}" hidden></div></span>`).join('');
    root.innerHTML = `<div class="tasksLayout"><nav class="tasksTree" aria-label="Firmen und Projekte"><div class="tasksTreeHead"><button type="button" class="btn isQuiet" data-tasks-tree-toggle aria-expanded="true"></button></div><div data-tasks-tree></div><div class="tasksTreeFoot"><button type="button" class="btn isQuiet" data-brand-new>+ Firma</button><button type="button" class="btn isQuiet" data-project-new>+ Projekt</button></div></nav>
      <section class="tasksMain"><div class="tasksHead"><div class="tasksScopeHead"><h2 id="tasksTitle" class="tasksScopeTitle">Alle Aufgaben</h2><span class="tasksCardMeta" data-tasks-subtitle hidden></span></div>
      <label class="field tasksScopeSelect"><span class="srOnly">Bereich</span><select id="tasksScopeSelect"></select></label><button type="button" class="btn" data-task-add-video>Video hinzufügen</button><button type="button" class="btn isPrimary" data-task-new>+ Aufgabe</button>
      <span class="tasksFilterWrap"><button type="button" class="btn isQuiet" data-tasks-more aria-haspopup="menu" aria-expanded="false">Mehr</button><div class="popover tasksMenu" data-tasks-menu role="menu" hidden><button type="button" role="menuitem" data-task-batch>Mehrere anlegen</button><button type="button" role="menuitem" data-menu-add-video>Video hinzufügen</button><button type="button" role="menuitem" data-menu-project-new>+ Projekt</button><button type="button" role="menuitem" data-menu-brand-new>+ Firma</button><button type="button" role="menuitem" data-project-edit hidden>Projekt bearbeiten</button><button type="button" role="menuitem" data-tasks-fields>Felder bearbeiten</button></div></span></div>
      <div class="tasksToolbar"><label class="field tasksSearch"><input id="tasksSearch" type="search" placeholder="Titel oder Nummer" aria-label="Suche"></label><button type="button" class="btn tasksFilter" data-tasks-filters-toggle aria-expanded="false">Filter<span class="tasksFilterCount" hidden></span></button>${filters}
      <div class="tasksViews" role="group" aria-label="Ansicht"><button type="button" class="btn" data-tasks-view="board" aria-pressed="true">Board</button><button type="button" class="btn" data-tasks-view="list" aria-pressed="false">Liste</button></div></div>
      <details class="tasksBrief card" data-tasks-brief hidden><summary>Briefing</summary><p data-tasks-brief-text></p></details>
      <p class="status tasksStatus" data-tasks-status role="status" aria-live="polite"></p><div data-tasks-body></div></section></div>
      <aside class="tasksPanel" data-task-panel hidden aria-labelledby="taskPanelTitle"><header class="tasksPanelHeader"><button type="button" class="btn isQuiet" data-task-panel-close>Zurück</button><h2 id="taskPanelTitle" class="srOnly"></h2>
      <div class="tasksPanelTitle"><span class="tasksPanelNumber"></span><input id="taskTitle" class="tasksTitleInput" maxlength="200" aria-label="Titel"></div>
      <div class="tasksPanelStage"><ol class="stageLadder" data-stage-ladder aria-label="Stufe"></ol><p class="tasksPanelStageName"></p></div>
      <div class="tasksPanelMeta"><label class="field"><span class="tasksDueHead">Frist<span data-task-due></span></span><input id="taskDeadline" type="date"></label><label class="field"><span>Projekt</span><select id="taskProject"></select></label>
      <label class="field"><span>Verantwortlich</span><select id="taskAssignee"></select></label><label class="field"><span>Art</span><select id="taskKind"></select></label></div></header>
      <p class="tasksSaveStatus" data-task-save-status role="status" aria-live="polite"></p><button type="button" class="btn" data-task-reload hidden>Aktuellen Stand neu laden</button>
      <details class="tasksPanelSection" data-panel-section="material"><summary>Rohmaterial · <span class="tasksSectionCount">0</span></summary><div class="tasksSectionBody"><div data-task-material></div><button type="button" class="btn" data-task-show-material>Im Material zeigen</button></div></details>
      <details class="tasksPanelSection" data-panel-section="video"><summary>Video · <span class="tasksSectionCount">0</span></summary><div class="tasksSectionBody"><div data-task-videos></div><button type="button" class="btn" data-task-link-video>+ Video verknüpfen</button>
      <div class="tasksPicker" data-task-video-picker hidden><label class="field"><input id="taskVideoSearch" type="search" placeholder="Video suchen" aria-label="Video suchen"></label><div data-task-video-options></div></div>
      <button type="button" class="btn" data-task-panel-add-video>Video hinzufügen</button></div></details>
      <details class="tasksPanelSection" data-panel-section="versions"><summary>Versionen · <span class="tasksSectionCount">0</span></summary><div class="tasksSectionBody"><p class="tasksCardMeta" data-task-rounds></p><div data-task-versions></div>
      <label class="btn tasksUpload">Neue Version hochladen<input type="file" data-version-upload accept="video/mp4,video/quicktime,video/webm,.mov,image/jpeg,image/png,image/webp"></label>
      <progress class="tasksProgress" data-version-progress max="100" value="0" hidden></progress><p class="tasksSaveStatus" data-version-status role="status" aria-live="polite"></p></div></details>
      <details class="tasksPanelSection" data-panel-section="post"><summary>Beitrag · <span class="tasksSectionCount">0</span></summary><div class="tasksSectionBody"><div data-task-posts></div><button type="button" class="btn" data-task-plan-post>Beitrag planen</button></div></details>
      <section class="tasksPanelSection" data-panel-section="brief"><h3>Briefing und eigene Felder</h3><div class="tasksFieldRow tasksCustom" data-task-custom></div>
      <label class="field"><span>Briefing</span><textarea id="taskBrief" rows="6" maxlength="20000"></textarea></label></section>
      <button type="button" class="btn isDanger" data-task-delete>Aufgabe löschen</button></aside>
      <dialog class="tasksDialog dlg" data-tasks-dialog tabindex="-1" aria-labelledby="tasksDialogTitle"><form method="dialog" data-tasks-dialog-form><header class="tasksDialogHead"><h2 id="tasksDialogTitle"></h2><button type="button" class="btn isQuiet isIcon" data-dialog-close aria-label="Schließen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header><div class="tasksDialogFields" data-tasks-dialog-fields></div><p class="status isError" data-tasks-dialog-error role="alert"></p><div class="dlgActions"><button type="button" class="btn" data-dialog-cancel>Abbrechen</button><button type="submit" class="btn isPrimary" data-dialog-confirm>Speichern</button></div></form></dialog>`;
    host.append(root);
    const $ = selector => root.querySelector(selector);
    const SVG = 'http://www.w3.org/2000/svg', treeIcon = document.createElementNS(SVG, 'svg');
    treeIcon.setAttribute('viewBox', '0 0 24 24'); treeIcon.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of [['rect', {x: 3, y: 4, width: 18, height: 16, rx: 2}], ['path', {d: 'M9 4v16'}]]) {
      const part = document.createElementNS(SVG, tag);
      for (const [name, value] of Object.entries(attrs)) part.setAttribute(name, String(value));
      treeIcon.append(part);
    }
    $('[data-tasks-tree-toggle]').append(treeIcon);
    // One line under the toolbar: hints in the normal colour, errors in the error colour.
    const tell = (text, error = false) => { const node = $('[data-tasks-status]'); node.textContent = text; node.classList.toggle('isError', error); };
    const readView = () => { try { return localStorage.getItem('klartext-tasks-view') === 'list' ? 'list' : 'board'; } catch { return 'board'; } };
    let data = null, scope = 'all', view = readView(), loadSerial = 0, openTrigger = null;
    // Stufe, Art and Verantwortlich choose several values; Firma and Projekt set the one scope the tree shows too.
    const chosen = {stage: new Set(), kind: new Set(), person: new Set(), due: new Set()};
    const SCOPES = {brand: value => value.startsWith('brand:') || value === 'no-brand', project: value => value.startsWith('project:') || ['no-project', 'archive'].includes(value)};
    let openId = null, saveTimer = null, pollTimer = null;
    const drafts = new Map();
    const TERMINAL = new Set(['done', 'error', 'cancelled']);
    const goneVideos = new Set(); // linked videos whose job answered 404 while polling
    const VERSION_FILE = /\.(mp4|mov|webm|jpe?g|png|webp)$/i;

    const projectOf = id => data.projects.find(project => project.id === id);
    const brandOf = id => data.brands.find(brand => brand.id === id);
    const label = (list, id) => list.find(entry => entry.id === id)?.label || id;
    const activeProjects = () => data.projects.filter(project => !project.archived);
    const personName = id => (data.people || []).find(person => person.id === id)?.name || '';
    const brandlessProjects = list => list.filter(project => !brandOf(project.brand_id));
    const versionsOf = task => (data.reviews?.versions || []).filter(version => version.task_id === task.id).sort((a, b) => b.number - a.number);
    const newestVersion = task => versionsOf(task)[0] || null;
    // Firma und Projekt der Aufgabe, nur was es gibt.
    const placeOf = task => { const project = projectOf(task.project_id); return [brandOf(project?.brand_id)?.name, project?.name].filter(Boolean); };
    const CLIENT_STAGES = ['raw', 'edited', 'subtitles'];
    const role = () => document.body.dataset.role;
    // Ohne Rolle (noch kein /api/me) gilt Schreiben als erlaubt; der Server entscheidet.
    const canEdit = () => !['pruefer', 'kunde', 'gast'].includes(role());
    // The team deletes only its own versions that are not approved yet (spec 4.12 point 13).
    const mayDeleteVersion = version => version.status !== 'approved' && (!role() || role() === 'owner' || version.created_by === window.KlartextMe?.name);

    function inScope(task) {
      const project = projectOf(task.project_id);
      if (scope.startsWith('project:')) return project?.id === scope.slice(8);
      if (scope === 'no-project') return !project;
      if (scope === 'archive') return project?.archived === true;
      if (project?.archived) return false;
      if (scope === 'all') return true;
      if (!project) return false;
      if (scope === 'no-brand') return !brandOf(project.brand_id);
      return scope.startsWith('brand:') && project.brand_id === scope.slice(6);
    }
    function visibleTasks() {
      const query = $('#tasksSearch').value.trim().toLocaleLowerCase('de').replace(/^#/, '');
      const pass = (name, value) => !chosen[name].size || chosen[name].has(value);
      const tasks = data.tasks.filter(task => inScope(task) && pass('stage', task.stage) && pass('kind', task.kind) && pass('person', task.assignee || 'none')
        && (!chosen.due.size || [...chosen.due].some(value => DUE[value](task)))
        && (!query || String(task.number) === query || task.title.toLocaleLowerCase('de').includes(query)));
      return tasks.sort((a, b) => (a.deadline || '9999-99-99').localeCompare(b.deadline || '9999-99-99') || a.number - b.number);
    }
    function scopeName() {
      if (scope.startsWith('project:')) return projectOf(scope.slice(8))?.name || 'Projekt';
      if (scope.startsWith('brand:')) return brandOf(scope.slice(6))?.name || 'Firma';
      return {all: 'Alle Aufgaben', 'no-brand': 'Ohne Firma', 'no-project': 'Ohne Projekt', archive: 'Archiv'}[scope];
    }
    function scopeButton(value, text, count, extra = {}) {
      const node = button('', {'data-tasks-scope': value, ...extra}, 'btn isQuiet tasksScope');
      node.append(el('span', '', text), el('span', 'tasksCount', String(count)));
      if (value === scope) node.setAttribute('aria-current', 'true');
      return node;
    }
    const countFor = value => { const previous = scope; scope = value; const count = data.tasks.filter(inScope).length; scope = previous; return count; };

    function renderTree() {
      const tree = $('[data-tasks-tree]'), select = $('#tasksScopeSelect'), entries = [];
      const group = (value, text, projects, extra = {}) => {
        const wrap = el('div', 'tasksGroup');
        wrap.append(scopeButton(value, text, countFor(value), extra)); entries.push([value, text]);
        for (const project of projects) {
          wrap.append(scopeButton(`project:${project.id}`, project.name, countFor(`project:${project.id}`), {'data-archived': String(project.archived), class: 'btn isQuiet tasksScope tasksProject'}));
          entries.push([`project:${project.id}`, `  ${project.name}`]);
        }
        return wrap;
      };
      const nodes = [group('all', 'Alle Aufgaben', [])];
      for (const brand of data.brands) nodes.push(group(`brand:${brand.id}`, brand.name, activeProjects().filter(project => project.brand_id === brand.id)));
      nodes.push(group('no-brand', 'Ohne Firma', brandlessProjects(activeProjects())), group('no-project', 'Ohne Projekt', []),
        group('archive', 'Archiv', data.projects.filter(project => project.archived)));
      tree.replaceChildren(...nodes);
      select.replaceChildren(...entries.map(([value, text]) => new Option(text, value)));
      select.value = scope;
    }
    function renderHeader() {
      $('#tasksTitle').textContent = scopeName();
      const project = scope.startsWith('project:') ? projectOf(scope.slice(8)) : null;
      $('[data-tasks-subtitle]').textContent = project ? [brandOf(project.brand_id)?.name || 'Ohne Firma', project.archived ? 'Archiviert' : ''].filter(Boolean).join(' · ') : '';
      $('[data-tasks-subtitle]').hidden = !project;
      $('[data-tasks-brief]').hidden = !project?.brief;
      $('[data-tasks-brief-text]').textContent = project?.brief || '';
      $('[data-project-edit]').hidden = !project;
      for (const node of root.querySelectorAll('[data-project-new],[data-menu-project-new]')) node.hidden = Boolean(project) || ['no-project', 'archive'].includes(scope);
      for (const toggle of root.querySelectorAll('[data-tasks-view]')) toggle.setAttribute('aria-pressed', String(toggle.dataset.tasksView === view));
      for (const [name, text] of FILTERS) {
        const trigger = $(`[data-tasks-filter="${name}"]`), badge = trigger.querySelector('.tasksFilterCount'), count = SCOPES[name] ? Number(SCOPES[name](scope)) : chosen[name].size;
        badge.textContent = String(count); badge.hidden = !count;
        // The badge alone reads as "Stufe 1"; the name says what the number means.
        if (count) trigger.setAttribute('aria-label', `${text}, ${count} gewählt`); else trigger.removeAttribute('aria-label');
      }
      // On the phone Firma and Projekt live in the Bereich select; the Filter button counts the rest.
      const folded = $('[data-tasks-filters-toggle]'), picked = ['stage', 'kind', 'person', 'due'].reduce((sum, name) => sum + chosen[name].size, 0);
      folded.querySelector('.tasksFilterCount').textContent = String(picked); folded.querySelector('.tasksFilterCount').hidden = !picked;
      if (picked) folded.setAttribute('aria-label', `Filter, ${picked} gewählt`); else folded.removeAttribute('aria-label');
    }
    // Filter popovers and the Mehr menu: one open at a time, Escape or a click outside closes it.
    // Alle in Projekt keeps a chosen company: all of its projects.
    const allOf = name => name === 'project' && scope.startsWith('brand:') ? scope : 'all';
    const isChosen = (name, value) => SCOPES[name] ? scope === (value || allOf(name)) : value ? chosen[name].has(value) : !chosen[name].size;
    function filterOptions(name) {
      if (name === 'brand') return [...data.brands.map(brand => [`brand:${brand.id}`, brand.name]), ['no-brand', 'Ohne Firma']];
      if (name === 'project') {
        const brand = scope.startsWith('brand:') ? scope.slice(6) : null;
        return [...activeProjects().filter(project => !brand || project.brand_id === brand).map(project => [`project:${project.id}`, brand ? project.name : `${brandOf(project.brand_id)?.name || 'Ohne Firma'} · ${project.name}`]),
          ['no-project', 'Ohne Projekt'], ['archive', 'Archiv']];
      }
      if (name === 'person') return [['none', 'Ohne Verantwortliche'], ...(data.people || []).map(person => [person.id, person.name])];
      if (name === 'due') return [['week', 'Fällig diese Woche'], ['overdue', 'Überfällig']];
      return (name === 'stage' ? data.stages : data.kinds).map(entry => [entry.id, entry.label]);
    }
    const popoverItems = () => [...openTrigger.nextElementSibling.querySelectorAll('button')].filter(node => node.offsetParent);
    function closePopover(focus = false) {
      const trigger = openTrigger; if (!trigger) return;
      openTrigger = null; trigger.nextElementSibling.hidden = true; trigger.setAttribute('aria-expanded', 'false');
      if (focus) trigger.focus();
    }
    function togglePopover(trigger) {
      const again = trigger === openTrigger; closePopover(); if (again || !data) return;
      const name = trigger.dataset.tasksFilter;
      if (name) trigger.nextElementSibling.replaceChildren(...[['', 'Alle'], ...filterOptions(name)].map(([value, text]) => button(text, {'data-filter-option': value, 'aria-pressed': String(isChosen(name, value))}, '')));
      else $('[data-tasks-fields]').hidden = Boolean(role()) && role() !== 'owner';
      const pop = trigger.nextElementSibling;
      pop.hidden = false; trigger.setAttribute('aria-expanded', 'true'); openTrigger = trigger;
      // A filter near the right end of row 2 opens leftwards, so the page never gets wider than the screen.
      if (name) { pop.removeAttribute('data-end'); pop.toggleAttribute('data-end', pop.getBoundingClientRect().right > document.documentElement.clientWidth); }
      popoverItems()[0]?.focus();
    }
    function chooseFilter(option) {
      const pop = option.closest('[data-tasks-popover]'), name = pop.dataset.tasksPopover, value = option.dataset.filterOption;
      if (SCOPES[name]) { scope = value || allOf(name); closePopover(true); }
      else if (!value) chosen[name].clear();
      else if (chosen[name].has(value)) chosen[name].delete(value);
      else chosen[name].add(value);
      for (const entry of pop.querySelectorAll('[data-filter-option]')) entry.setAttribute('aria-pressed', String(isChosen(name, entry.dataset.filterOption)));
      refilter();
    }
    function showTree(open) {
      const toggle = $('[data-tasks-tree-toggle]'), text = open ? 'Bereiche einklappen' : 'Bereiche zeigen';
      $('.tasksLayout').dataset.tree = open ? 'open' : 'closed';
      // Open it sits in the head of the tree, closed it waits at the start of the toolbar.
      if (open) $('.tasksTreeHead').append(toggle); else $('.tasksToolbar').prepend(toggle);
      toggle.setAttribute('aria-label', text); toggle.title = text; toggle.setAttribute('aria-expanded', String(open));
    }
    try { showTree(localStorage.getItem('klartext-tasks-tree') !== '0'); } catch { showTree(true); }
    function renderList(tasks) {
      const groups = data.stages.map(stage => [stage, tasks.filter(task => task.stage === stage.id)]).filter(([, own]) => own.length);
      // A search or filter without a match is not an empty page: the next step is to widen it.
      const narrowed = $('#tasksSearch').value.trim() || Object.values(chosen).some(set => set.size);
      if (!groups.length) return [window.KlartextStage.emptyState(narrowed ? {icon: 'tasks', title: 'Keine Aufgabe passt', text: 'Ändere die Suche oder die Filter.'} : {icon: 'tasks', title: 'Noch keine Aufgaben hier', text: 'Leg mit „+ Aufgabe“ die erste an.'})];
      const list = el('div', 'tasksList');
      for (const [stage, own] of groups) {
        const group = el('section', 'tasksGroup'), head = el('h3', 'tasksGroupHead');
        group.dataset.taskGroup = stage.id; group.setAttribute('aria-label', stage.label);
        head.append(window.KlartextStage.chip(stage.id, stage.label), el('span', 'tasksCount', String(own.length)));
        group.append(head);
        for (const task of own) {
          const row = el('div', 'tasksRow card'), main = el('div', 'tasksRowMain'), due = el('span', 'tasksRowDue'), who = el('span', 'tasksRowWho');
          row.dataset.taskRow = task.id; row.tabIndex = 0; row.setAttribute('role', 'button');
          main.append(el('strong', 'tasksRowTitle', task.title), el('span', 'tasksCardMeta', [...placeOf(task), label(data.kinds, task.kind)].join(' · ')));
          due.append(...[window.KlartextStage.due(task.deadline, task.stage)].filter(Boolean));
          who.append(...[window.KlartextStage.initial(personName(task.assignee))].filter(Boolean));
          row.append(el('span', 'tasksRowNumber', `#${task.number}`), main, due, who);
          group.append(row);
        }
        list.append(group);
      }
      return [list];
    }
    function renderBoard(tasks) {
      const board = el('div', 'tasksBoard'), editable = canEdit();
      for (const stage of data.stages) {
        const column = el('section', 'tasksColumn'); column.dataset.taskColumn = stage.id; column.setAttribute('aria-label', stage.label);
        const own = tasks.filter(task => task.stage === stage.id), head = el('h3', 'tasksColumnHead'), count = el('span', 'tasksCount', String(own.length));
        count.dataset.taskColumnCount = ''; head.append(window.KlartextStage.chip(stage.id, stage.label), count); column.append(head);
        for (const task of own) {
          const card = el('article', 'tasksCard card'); card.dataset.taskCard = task.id; card.draggable = editable; card.tabIndex = 0;
          const version = newestVersion(task), foot = el('div', 'tasksCardFoot'), due = window.KlartextStage.due(task.deadline, task.stage);
          // The deadline is said as the chip says it: overdue or soon in words, else just the date.
          const spokenDue = due?.querySelector('.srOnly')?.textContent || (task.deadline && `Frist ${germanDate(task.deadline)}`);
          card.setAttribute('role', 'button'); card.setAttribute('aria-label', [task.title, `#${task.number}`, stage.label, spokenDue].filter(Boolean).join(', '));
          card.append(el('strong', 'tasksCardTitle', task.title),
            el('span', 'tasksCardMeta', [`#${task.number}`, ...placeOf(task), version && `V${version.number}`].filter(Boolean).join(' · ')));
          foot.append(...[due, window.KlartextStage.initial(personName(task.assignee))].filter(Boolean));
          if (foot.children.length) card.append(foot);
          column.append(card);
        }
        board.append(column);
      }
      return [board];
    }
    function render() {
      renderTree(); renderHeader();
      const tasks = visibleTasks();
      $('[data-tasks-body]').replaceChildren(...(view === 'list' ? renderList(tasks) : renderBoard(tasks)));
      if (openId) renderLadder();
    }
    function refilter() { tell(''); render(); }
    function moveTask(id, stage) {
      const task = data.tasks.find(entry => entry.id === id);
      if (!task || task.stage === stage) return saving;
      const previous = task.stage;
      task.stage = stage; render();
      saving = saving.then(async () => {
        const current = data.tasks.find(entry => entry.id === id) || task, base = current.revision;
        try {
          const updated = await request(`/api/tasks/${id}`, 'PATCH', {revision: base, stage});
          Object.assign(current, updated);
          // The user's own board move must not turn the open panel's next save into a false conflict.
          const draft = drafts.get(id);
          if (draft?.revision === base) { draft.revision = updated.revision; if (openId === id && !pending(id)) { $('#taskAssignee').value = current.assignee || ''; $('#taskDeadline').value = current.deadline || ''; } }
          render(); return true;
        } catch (error) {
          current.stage = previous; render();
          // After the reload, so the reload does not clear the reason.
          if (error.status === 409) await load();
          tell(error.message, true);
          if (openId === id) setSaveStatus(error.message);
          return false;
        }
      });
      return saving;
    }
    // Every move onto a stage goes through here: 1 to 3 the user sets, from Zur Prüfung on the matching action opens or one sentence says why not.
    function stageAction(task, target, origin) {
      if (!task || target === task.stage) return;
      const say = text => origin === 'ladder' ? setSaveStatus(text) : tell(text);
      if (!canEdit()) return say('Du kannst Aufgaben hier nur ansehen.');
      if (CLIENT_STAGES.includes(target)) {
        // Late stages set by hand before Block I come back while the task has no version; the server checks the same.
        if (CLIENT_STAGES.includes(task.stage) || ['review', 'changes', 'approved'].includes(task.stage) && !versionsOf(task).length) moveTask(task.id, target);
        else if (['planned', 'published'].includes(task.stage)) say('Diese Aufgabe ist schon geplant oder veröffentlicht. Die Stufe folgt dem Beitrag.');
        else say('Diese Aufgabe ist schon in der Prüfung. Für Änderungen lädst du eine neue Version hoch und sendest sie erneut.');
        return;
      }
      const version = newestVersion(task);
      if (target === 'review') {
        if (!version) return say('Zur Prüfung geht es mit einer Version. Exportiere sie im Studio oder lade sie im Panel hoch.');
        if (version.status === 'in_review') return say('Die neueste Version ist schon in Prüfung.');
        if (version.status === 'approved') return say('Die neueste Version ist schon freigegeben.');
        showPanel(task.id).then(() => {
          if (openId !== task.id) return;
          openSection('versions');
          root.querySelector('[data-version-submit]')?.focus();
          say('Sende die neueste Version mit „Zur Prüfung senden“.');
        });
      } else if (target === 'changes' || target === 'approved') {
        if (role() === 'team') return say('Freigeben und Änderungen anfordern machen die Prüfer in Freigaben.');
        if (target === 'changes' && !version) return say('Änderungen gibt es erst mit einer Version.');
        if (target === 'changes' && version.status !== 'in_review') return say('Änderungen anfordern geht, wenn die neueste Version in Prüfung ist.');
        if (!version) return say('Freigabe fehlt: Es gibt noch keine Version.');
        if (version.status === 'approved' && target === 'approved') return say('Die neueste Version ist schon freigegeben.');
        window.KlartextReview?.open(version.id);
      } else if (target === 'planned') {
        if (role() && role() !== 'owner') return say('Beiträge plant Dominik im Kalender.');
        const planned = task.posts.find(id => data.posts.find(post => post.id === id)?.status === 'planned');
        if (planned) window.KlartextPlanning?.openPost(planned);
        else window.KlartextPlanning?.compose({task_id: task.id});
      } else if (target === 'published') say('Veröffentlicht setzt Klartext, sobald der Beitrag gepostet ist.');
    }

    // Task panel: unsaved edits belong to one task and remember the revision they were typed on,
    // so they are never saved onto another task or silently onto a newer version from another device.
    const openTask = () => data?.tasks.find(task => task.id === openId);
    const setSaveStatus = text => { $('[data-task-save-status]').textContent = text; };
    const pending = id => Object.keys(drafts.get(id)?.fields || {}).length > 0;
    let saving = Promise.resolve(true);
    // From 1101 px the board gives way to the panel (hasPanel, tasks.css); below it the panel lies over the content.
    const setPanel = open => { $('[data-task-panel]').hidden = !open; root.classList.toggle('hasPanel', open); syncModal(); };
    // On the phone the panel covers the screen: the page, topbar and tab bar behind it are inert while it shows here (WCAG 2.4.3).
    // Only what this page made inert is freed again.
    const phone = window.matchMedia('(max-width:700px)');
    let modal = false;
    function syncModal(active = document.body.dataset.activeWorkspace === 'projects') {
      const next = active && phone.matches && !$('[data-task-panel]').hidden;
      if (next === modal) return;
      modal = next;
      for (const node of [$('.tasksLayout'), ...document.querySelectorAll('body>.skipLink,.topbar,.tabBar,.sidebar')]) node.inert = next;
    }
    phone.addEventListener('change', () => syncModal());
    async function showPanel(id) {
      // A second click on the open task keeps its unsaved edits.
      if (id === openId && !$('[data-task-panel]').hidden) return;
      clearTimeout(saveTimer);
      if (openId && pending(openId) && !await save(openId)) return;
      const task = data?.tasks.find(entry => entry.id === id); if (!task) return;
      openId = id; drafts.set(id, {fields: {}, revision: task.revision});
      fillPanel(task, true);
      // No text field gets the focus, on the phone that would open the keyboard.
      setPanel(true); $('[data-task-panel-close]').focus();
    }
    // Other pages hand over a task id; the panel needs the page and a fresh list first.
    async function open(id) {
      if (document.body.dataset.activeWorkspace !== 'projects') window.KlartextEditor?.setWorkspace('projects');
      await load();
      await showPanel(id);
    }
    // The section of the current stage; Neu without a video still waits for Rohmaterial.
    const sectionFor = task => ({raw: task.media.length ? 'video' : 'material', edited: 'video', subtitles: 'versions', review: 'versions', changes: 'versions', approved: 'versions', planned: 'post', published: 'post'})[task.stage] || 'material';
    function openSection(name) {
      const section = $(`[data-panel-section="${name}"]`);
      if (section.tagName === 'DETAILS') section.open = true;
      section.scrollIntoView({block: 'nearest'});
    }
    function renderLadder() {
      const task = openTask(), ladder = $('[data-stage-ladder]'); if (!task) return;
      // Rebuilt only when the stage list changes, so a focused step keeps its focus while the stage moves.
      if ([...ladder.querySelectorAll('[data-ladder-stage]')].map(node => node.dataset.ladderStage).join() !== data.stages.map(stage => stage.id).join()) {
        ladder.replaceChildren(...data.stages.map(stage => { const item = el('li'); item.append(button('', {'data-ladder-stage': stage.id}, '')); return item; }));
      }
      const index = data.stages.findIndex(stage => stage.id === task.stage), editable = canEdit();
      ladder.querySelectorAll('[data-ladder-stage]').forEach((node, i) => {
        const stage = data.stages[i];
        node.setAttribute('aria-label', stage.label); node.title = stage.label; node.disabled = !editable;
        node.classList.toggle('isDone', i < index);
        if (i === index) { node.setAttribute('aria-current', 'step'); node.dataset.stage = stage.id; } else { node.removeAttribute('aria-current'); delete node.dataset.stage; }
      });
      $('.tasksPanelStageName').replaceChildren(...(index < 0 ? [] : [window.KlartextStage.chip(task.stage, data.stages[index].label)]));
      // An overdue or soon deadline warns next to its label, like on the card.
      const due = window.KlartextStage.due(task.deadline, task.stage);
      $('[data-task-due]').replaceChildren(...(due?.dataset.due ? [due] : []));
    }
    function fillPanel(task, fresh = false) {
      $('#taskKind').replaceChildren(...data.kinds.map(kind => new Option(kind.label, kind.id)));
      const projects = data.projects.filter(project => !project.archived || project.id === task.project_id);
      $('#taskProject').replaceChildren(...(task.project_id ? [] : [new Option('Ohne Projekt', '')]),
        ...projects.map(project => new Option(`${brandOf(project.brand_id)?.name || 'Ohne Firma'} · ${project.name}`, project.id)));
      $('#taskTitle').value = task.title; $('#taskKind').value = task.kind;
      $('#taskDeadline').value = task.deadline || ''; $('#taskProject').value = task.project_id || ''; $('#taskBrief').value = task.brief;
      $('#taskAssignee').replaceChildren(new Option('Niemand', ''), ...(data.people || []).map(person => new Option(person.name, person.id)));
      $('#taskAssignee').value = task.assignee || '';
      // Dominik's own fields from Abläufe; values of removed fields stay saved but are not shown.
      $('[data-task-custom]').replaceChildren(...(data.fields || []).map(field => {
        const label = el('label', 'field');
        const input = field.type === 'select' ? el('select') : el('input');
        if (field.type === 'select') input.append(new Option('Nicht gesetzt', ''), ...field.options.map(option => new Option(option, option)));
        else { input.type = field.type; if (field.type === 'text') input.maxLength = 500; if (field.type === 'number') input.step = 'any'; }
        input.dataset.customField = field.id; input.value = task.custom?.[field.id] ?? '';
        label.append(el('span', '', field.name), input); return label;
      }));
      $('[data-task-custom]').hidden = !(data.fields || []).length;
      // Prüfer only read: every field stays visible but locked; the server would answer 403 anyway.
      for (const node of root.querySelectorAll('#taskTitle,.tasksPanelMeta :is(input,select),[data-task-custom] :is(input,select),#taskBrief')) node.disabled = !canEdit();
      // A newly opened task shows the section of its stage; after that the user's open and closed sections stay.
      if (fresh) for (const section of root.querySelectorAll('details[data-panel-section]')) section.open = section.dataset.panelSection === sectionFor(task);
      setSaveStatus(''); $('[data-task-reload]').hidden = true; $('[data-task-video-picker]').hidden = true;
      renderLadder(); renderPanelLinks();
    }
    // After a reload an untouched panel shows the newest saved state; typed edits keep their old revision so saving them reports a conflict.
    function refreshPanel() {
      const task = openTask(), draft = drafts.get(openId);
      if (!task) { setPanel(false); drafts.delete(openId); openId = null; tell('Die geöffnete Aufgabe gibt es nicht mehr.'); return; }
      if (draft && !pending(openId)) { draft.revision = task.revision; fillPanel(task); } else renderPanelLinks();
    }
    function renderPanelLinks() {
      const task = openTask(); if (!task) return;
      $('#taskPanelTitle').textContent = `#${task.number} ${task.title}`;
      $('.tasksPanelNumber').textContent = `#${task.number}`;
      const count = (name, list) => { $(`[data-panel-section="${name}"] .tasksSectionCount`).textContent = String(list.length); };
      const versions = versionsOf(task);
      count('versions', versions);
      $('[data-task-rounds]').textContent = `Änderungsrunden: ${task.change_rounds || 0}`;
      $('[data-task-versions]').replaceChildren(...(versions.length ? versions.map(version => {
        const row = el('div', 'tasksLinked'), info = el('div', 'tasksLinkedInfo');
        row.dataset.taskVersion = version.id;
        info.append(el('strong', '', `V${version.number} · ${window.KlartextStage.statusLabel(version.status)}`),
          el('span', 'tasksCardMeta', `${version.open_comments} ${version.open_comments === 1 ? 'offener Kommentar' : 'offene Kommentare'} · ${version.source === 'export' ? 'aus dem Klartext-Export' : version.filename}`));
        row.append(info, button('Ansehen', {'data-version-open': ''}));
        if (version === versions[0] && ['open', 'changes'].includes(version.status)) row.append(button('Zur Prüfung senden', {'data-version-submit': ''}));
        if (mayDeleteVersion(version)) row.append(button('Löschen', {'data-version-delete': ''}, 'btn isDanger'));
        return row;
      }) : [el('p', 'tasksEmpty', 'Noch keine Version. Lade eine Datei hoch oder übernimm einen Export.')]));
      // Files can disappear from the NAS or be forgotten; the link stays until someone removes it here.
      const material = task.material.map(id => data.material?.find(item => item.id === id) || {id, gone: true, missing: true});
      count('material', material);
      $('[data-task-material]').replaceChildren(...(material.length ? material.map(item => {
        const row = el('div', 'tasksLinked tasksMaterial'), info = el('div', 'tasksLinkedInfo');
        row.dataset.taskMaterialItem = item.id;
        if (!item.missing) {
          // A small lazy still from the server, never the original from the NAS.
          const image = el('img', 'tasksMaterialThumb'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
          image.addEventListener('error', () => image.remove(), {once: true}); image.src = item.still_url; row.append(image);
        }
        info.append(el('strong', '', item.gone ? 'Datei nicht verfügbar' : item.name), el('span', 'tasksCardMeta', item.gone ? 'nicht mehr vorhanden' : item.missing ? 'Datei nicht gefunden' : item.kind === 'photo' ? 'Foto' : 'Video'));
        row.append(info, button('Lösen', {'data-unlink-material': '', 'aria-label': `${item.name || 'Datei'} von der Aufgabe lösen`}));
        if (!item.missing && VERSION_FILE.test(item.name || '')) row.append(button('Als Version übernehmen', {'data-version-from-material': item.id}));
        return row;
      }) : [el('p', 'tasksEmpty', 'Noch kein Rohmaterial. Wähle Dateien auf der Seite Material aus.')]));
      $('[data-task-show-material]').hidden = !material.length;
      const videos = task.media.map(id => data.videos.find(video => video.id === id)).filter(Boolean);
      count('video', videos);
      $('[data-task-videos]').replaceChildren(...(videos.length ? videos.map(video => {
        const row = el('div', 'tasksLinked'), info = el('div', 'tasksLinkedInfo'), actions = el('div', 'tasksLinkedActions');
        row.dataset.taskVideo = video.id;
        const progress = el('span', 'tasksCardMeta', videoStatus(video)); progress.dataset.taskVideoProgress = '';
        info.append(el('strong', '', video.title), progress);
        if (video.captioned) actions.append(button('Export als Version übernehmen', {'data-version-from-export': video.id}));
        actions.append(button('Untertitel bearbeiten', {'data-jump': 'subtitles'}), button('Transkript', {'data-jump': 'transcribe'}), button('Text', {'data-jump': 'social'}),
          button('Lösen', {'data-unlink-video': '', 'aria-label': `${video.title} von der Aufgabe lösen`}));
        row.append(info, actions); return row;
      }) : [el('p', 'tasksEmpty', 'Noch kein Video verknüpft.')]));
      schedulePoll();
      const posts = task.posts.map(id => data.posts.find(post => post.id === id)).filter(Boolean);
      count('post', posts);
      $('[data-task-posts]').replaceChildren(...(posts.length ? posts.map(post => {
        const row = el('div', 'tasksPostRow'), node = button('', {'data-task-post': post.id}, 'btn tasksLinkedPost'), ig = post.instagram;
        row.dataset.taskPostRow = post.id;
        // While Instagram has the post, its state stands in for the post status, as in the calendar.
        const chip = el('span', 'chip', window.KlartextStage.postLabel(post, ig));
        if (ig) chip.dataset.igState = ig.status; else chip.dataset.status = post.status;
        const when = post.scheduled_local ? `${germanDate(post.scheduled_local.slice(0, 10))} ${post.scheduled_local.slice(11)}` : 'ohne Termin';
        node.append(el('strong', '', post.title), chip, el('span', 'tasksCardMeta', when));
        row.append(node);
        if (/^https:\/\//.test(ig?.permalink || '')) {
          const link = el('a', 'btn isQuiet', 'Auf Instagram ansehen');
          link.href = ig.permalink; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.dataset.taskPostLink = '';
          row.append(link);
        }
        return row;
      }) : [el('p', 'tasksEmpty', 'Noch kein Beitrag geplant.')]));
      renderVideoOptions();
    }
    function videoStatus(video) {
      if (goneVideos.has(video.id)) return 'Video nicht mehr vorhanden';
      if (video.state === 'queued') return `Wartet (${video.queue_position ?? '…'}.)`;
      if (['uploading', 'loading', 'decoding'].includes(video.state)) return 'Wird vorbereitet';
      if (video.state === 'transcribing') return `Wird transkribiert · ${Math.round(video.progress || 0)} %`;
      if (video.state === 'error') return 'Transkription fehlgeschlagen. Öffne das Video im Studio und starte sie neu.';
      if (video.state === 'cancelled') return 'Abgebrochen';
      return video.captioned ? 'Untertitel exportiert' : 'Transkribiert';
    }
    // While a linked video is still being transcribed, the open panel follows its job; a finished job reloads the list.
    function schedulePoll() {
      clearTimeout(pollTimer);
      const id = openId, running = (openTask()?.media || []).map(jobId => data.videos.find(video => video.id === jobId)).filter(video => video && !TERMINAL.has(video.state) && !goneVideos.has(video.id));
      if (!running.length) return;
      pollTimer = setTimeout(async () => {
        if (openId !== id) return;
        for (const video of running) {
          const line = root.querySelector(`[data-task-video="${video.id}"] [data-task-video-progress]`);
          try {
            const job = await request(`/api/jobs/${video.id}`);
            if (openId !== id) return;
            Object.assign(video, {state: job.state, progress: job.progress, queue_position: job.queue_position});
            if (TERMINAL.has(job.state)) return load();
          } catch (error) {
            // Deleted meanwhile: the row says so and the panel stops asking for this video.
            if (error.status !== 404) continue;
            goneVideos.add(video.id);
          }
          if (line) line.textContent = videoStatus(video);
        }
        schedulePoll();
      }, 1500);
    }
    function renderVideoOptions() {
      const task = openTask(); if (!task) return;
      const query = $('#taskVideoSearch').value.trim().toLocaleLowerCase('de');
      const options = data.videos.filter(video => !task.media.includes(video.id) && (!query || video.title.toLocaleLowerCase('de').includes(query))).slice(0, 50);
      $('[data-task-video-options]').replaceChildren(...(options.length ? options.map(video => button(video.title, {'data-video-option': video.id}, 'btn tasksOption'))
        : [el('p', 'tasksEmpty', 'Kein passendes Video in der Bibliothek.')]));
    }
    function queue(key, value) {
      const id = openId;
      drafts.get(id).fields[key] = value; setSaveStatus('Ungespeicherte Änderungen …');
      clearTimeout(saveTimer); saveTimer = setTimeout(() => save(id), 800);
    }
    function save(id = openId, extra = {}) {
      clearTimeout(saveTimer);
      saving = saving.then(async () => {
        const task = data?.tasks.find(entry => entry.id === id), draft = drafts.get(id);
        if (!task || !draft) return false;
        const sent = {...draft.fields, ...extra};
        if (!Object.keys(sent).length) return true;
        if (openId === id) setSaveStatus('Wird gespeichert …');
        try {
          const updated = await request(`/api/tasks/${id}`, 'PATCH', {revision: draft.revision, ...sent});
          Object.assign(task, updated); draft.revision = updated.revision;
          for (const [key, value] of Object.entries(sent)) if (Object.hasOwn(draft.fields, key) && draft.fields[key] === value) delete draft.fields[key];
          if (openId === id) {
            setSaveStatus(pending(id) ? 'Ungespeicherte Änderungen …' : 'Gespeichert'); renderPanelLinks();
            // Automations may have moved, assigned or scheduled the task; show that unless the user is still typing.
            if (!pending(id)) { $('#taskAssignee').value = task.assignee || ''; $('#taskDeadline').value = task.deadline || ''; }
          }
          render(); return true;
        } catch (error) {
          if (openId === id) { setSaveStatus(error.message); $('[data-task-reload]').hidden = error.status !== 409; }
          return false;
        }
      });
      return saving;
    }
    async function closePanel() {
      const id = openId;
      if (pending(id) && !await save(id)) return;
      if (openId !== id) return;
      setPanel(false); openId = null; drafts.delete(id);
      // Back to where the user was: the task's card or row, else the button that creates one.
      (root.querySelector(`[data-task-card="${id}"],[data-task-row="${id}"]`) || $('[data-task-new]')).focus();
    }
    function jump(target, jobId) {
      const task = openTask(), project = projectOf(task?.project_id);
      if (target === 'subtitles' && data.videos.find(video => video.id === jobId)?.state !== 'done') target = 'transcribe';
      if (pending(openId)) save(openId);
      window.KlartextEditor?.setWorkspace(target);
      window.openKlartextJob?.(jobId, {brand_id: brandOf(project?.brand_id) ? project.brand_id : null, task_id: task?.id ?? null});
    }
    // The composer fills itself from the saved task and links the post only when it saves; typed edits go first so it reads them.
    async function planPost() {
      const task = openTask(); if (!task) return;
      if (pending(task.id) && !await save(task.id)) return;
      window.KlartextPlanning?.compose({task_id: task.id});
    }
    function deleteTask() {
      const task = openTask(); if (!task) return;
      dialog(`Aufgabe #${task.number} „${task.title}“ löschen?`, [el('p', 'tasksDialogText', 'Videos und Beiträge bleiben erhalten.')], async () => {
        await request(`/api/tasks/${task.id}`, 'DELETE', {revision: drafts.get(task.id)?.revision ?? task.revision});
        drafts.delete(task.id); openId = null; setPanel(false);
      }, 'Aufgabe löschen', true).then(() => $('[data-task-new]').focus());
    }

    // Versions: Dominik and the people from the team list sign with their login name; anyone else is asked once in Freigaben.
    async function reviewerName() {
      const me = window.KlartextMe;
      if (me?.role === 'owner') return 'Dominik';
      if (me?.person_id) return me.name;
      return window.KlartextReview?.askReviewer ? await window.KlartextReview.askReviewer() : null;
    }
    async function afterVersionChange() { await load(); window.KlartextReview?.refresh?.(); }
    async function uploadVersion(file) {
      const task = openTask(), input = $('[data-version-upload]'); if (!task || !file) return;
      const author = await reviewerName(); if (!author) { input.value = ''; return; }
      const progress = $('[data-version-progress]'), status = $('[data-version-status]');
      progress.hidden = false; progress.value = 0; status.textContent = 'Wird hochgeladen …';
      try {
        await new Promise((resolve, reject) => {
          // XMLHttpRequest instead of fetch: only it reports upload progress.
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `/api/tasks/${task.id}/versions?filename=${encodeURIComponent(file.name)}&author=${encodeURIComponent(author)}`);
          xhr.setRequestHeader('X-Klartext', '1');
          xhr.upload.onprogress = event => { if (event.lengthComputable) progress.value = Math.round(event.loaded / event.total * 100); };
          xhr.onload = () => { let body = {}; try { body = JSON.parse(xhr.responseText); } catch {} if (xhr.status < 300) resolve(body); else reject(new Error(typeof body.detail === 'string' ? body.detail : 'Hochladen fehlgeschlagen.')); };
          xhr.onerror = () => reject(new Error('Verbindung unterbrochen. Lade die Datei noch mal hoch.'));
          xhr.send(file);
        });
        status.textContent = 'Hochgeladen.'; await afterVersionChange();
      } catch (error) { status.textContent = error.message; }
      finally { progress.hidden = true; input.value = ''; }
    }
    async function deleteVersion(versionId) {
      const version = data.reviews?.versions.find(entry => entry.id === versionId); if (!version) return;
      if (await window.KlartextConfirm.ask({title: `V${version.number} löschen?`, text: 'Datei und Kommentare dieser Version werden gelöscht.', confirm: 'Version löschen'}) !== 'confirm') return;
      const author = await reviewerName(); if (!author) return;
      try { await request(`/api/versions/${versionId}`, 'DELETE', {author}); $('[data-version-status]').textContent = 'Version gelöscht.'; await afterVersionChange(); }
      catch (error) { $('[data-version-status]').textContent = error.message; }
    }
    async function addVersionFrom(route, body, done) {
      const task = openTask(); if (!task) return;
      const author = await reviewerName(); if (!author) return;
      // The result shows in Versionen, also when the click came from Video or Rohmaterial.
      openSection('versions');
      $('[data-version-status]').textContent = 'Wird übernommen …';
      try { await request(`/api/tasks/${task.id}/versions/${route}`, 'POST', {...body, author}); $('[data-version-status]').textContent = done; await afterVersionChange(); }
      catch (error) { $('[data-version-status]').textContent = error.message; }
    }
    async function submitVersion(versionId) {
      const version = data.reviews.versions.find(entry => entry.id === versionId); if (!version) return;
      const author = await reviewerName(); if (!author) return;
      const status = $('[data-version-status]');
      status.textContent = 'Wird gesendet …';
      try {
        await request(`/api/versions/${versionId}/status`, 'POST', {action: 'submit', expected_status: version.status, author});
        // Same link as review.js copyLink: the Tailnet address when the server knows one, else this page.
        const base = data.reviews.share_origin || location.origin;
        const link = `${base}${base === location.origin ? location.pathname : '/'}#review/${versionId}`;
        let copied = false;
        try { await navigator.clipboard.writeText(link); copied = true; } catch {}
        status.textContent = copied ? 'Zur Prüfung gesendet. Link kopiert.' : 'Zur Prüfung gesendet.';
        await afterVersionChange(); window.dispatchEvent(new CustomEvent('klartext:tasks-changed'));
      } catch (error) { status.textContent = error.message; }
    }
    async function load() {
      const serial = ++loadSerial;
      tell('Aufgaben werden geladen …');
      try {
        // Reviews are optional here: without them the panel simply shows no versions.
        const [next, reviews] = await Promise.all([request('/api/workspace'), request('/api/reviews').catch(() => null)]);
        next.reviews = reviews || {reviewers: [], versions: [], comments: []};
        if (serial !== loadSerial) return;
        data = next; render(); tell('');
        if (openId) refreshPanel();
        root.dataset.tasksReady = 'true';
      } catch (error) { if (serial === loadSerial) tell(error.message, true); }
    }

    // One small form dialog serves every create and edit action of this page; it resolves with submit's result after the reload.
    function dialog(title, fields, submit, confirm = 'Speichern', danger = false) {
      return new Promise(resolve => {
        const node = $('[data-tasks-dialog]'), form = $('[data-tasks-dialog-form]');
        $('#tasksDialogTitle').textContent = title; $('[data-tasks-dialog-error]').textContent = '';
        $('[data-dialog-confirm]').textContent = confirm; $('[data-dialog-confirm]').className = danger ? 'btn isDanger' : 'btn isPrimary';
        // Form dialogs close with the X like Video hinzufügen; a question (danger) keeps Abbrechen only.
        $('[data-dialog-close]').hidden = danger;
        $('[data-tasks-dialog-fields]').replaceChildren(...fields);
        form.onsubmit = async event => {
          event.preventDefault();
          $('[data-dialog-confirm]').disabled = true;
          try { const result = await submit(); node.close(); await load(); resolve(result); }
          catch (error) { $('[data-tasks-dialog-error]').textContent = error.message; }
          finally { $('[data-dialog-confirm]').disabled = false; }
        };
        // The dialog itself takes the focus: a text field would open the keyboard on the phone (spec 4.3).
        node.showModal(); node.focus();
      });
    }
    function field(text, control) { const wrap = el('label', 'field'); wrap.append(el('span', '', text), control); return wrap; }
    function input(id, value = '', attrs = {}) { const node = el('input'); node.id = id; node.value = value; for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, val); return node; }
    function select(id, entries, value) { const node = el('select'); node.id = id; node.replaceChildren(...entries.map(([val, text]) => new Option(text, val))); if (value !== undefined) node.value = value; return node; }
    function projectChoices() { return activeProjects().map(project => [project.id, `${brandOf(project.brand_id)?.name || 'Ohne Firma'} · ${project.name}`]); }
    function defaultProject() {
      if (scope.startsWith('project:')) return scope.slice(8);
      if (scope.startsWith('brand:')) return activeProjects().find(project => project.brand_id === scope.slice(6))?.id;
      return activeProjects()[0]?.id;
    }
    // The dialog starts in the current scope: the project, or the company of the project or scope.
    function addVideo() {
      const project = scope.startsWith('project:') ? projectOf(scope.slice(8)) : null;
      const brandId = project ? project.brand_id : scope.startsWith('brand:') ? scope.slice(6) : null;
      window.KlartextAddVideo?.open({project_id: project?.id ?? null, brand_id: brandOf(brandId) ? brandId : null});
    }
    function newTask() {
      if (!activeProjects().length) { tell('Lege zuerst ein Projekt an.'); return; }
      const title = input('taskNewTitle', '', {maxlength: '200', required: ''});
      const project = select('taskNewProject', projectChoices(), defaultProject());
      const kind = select('taskNewKind', data.kinds.map(entry => [entry.id, entry.label]), 'video');
      dialog('Neue Aufgabe', [field('Titel', title), field('Projekt', project), field('Art', kind)],
        () => request('/api/tasks', 'POST', {project_id: project.value, title: title.value.trim(), kind: kind.value})).then(task => showPanel(task.id));
    }
    function batchTasks() {
      if (!activeProjects().length) { tell('Lege zuerst ein Projekt an.'); return; }
      const base = input('taskBatchBase', 'Reel', {maxlength: '190', required: ''});
      const count = input('taskBatchCount', '5', {type: 'number', min: '1', max: '20', required: ''});
      const project = select('taskBatchProject', projectChoices(), defaultProject());
      const kind = select('taskBatchKind', data.kinds.map(entry => [entry.id, entry.label]), 'video');
      dialog('Mehrere Aufgaben anlegen', [field('Grundname', base), field('Anzahl (1 bis 20)', count), field('Projekt', project), field('Art', kind)],
        () => request('/api/tasks/batch', 'POST', {project_id: project.value, base: base.value.trim(), count: Number(count.value), kind: kind.value})).then(created => created[0] && showPanel(created[0].id));
    }
    const brandChoices = () => [['', 'Ohne Firma'], ...data.brands.map(brand => [brand.id, brand.name])];
    function editProject() {
      const project = projectOf(scope.slice(8));
      if (!project) return;
      const name = input('projectName', project.name, {maxlength: '100', required: ''});
      const brand = select('projectBrand', brandChoices(), brandOf(project.brand_id) ? project.brand_id : '');
      const brief = el('textarea'); brief.id = 'projectBrief'; brief.rows = 6; brief.maxLength = 20000; brief.value = project.brief;
      const archived = input('projectArchived', '', {type: 'checkbox'}); archived.checked = project.archived;
      const archivedLabel = el('label', 'tasksCheck'); archivedLabel.append(archived, el('span', '', 'Archivieren (blendet das Projekt hier aus, löscht nichts)'));
      dialog('Projekt bearbeiten', [field('Name', name), field('Firma', brand), field('Briefing', brief), archivedLabel], async () => {
        const changes = {};
        if (name.value.trim() !== project.name) changes.name = name.value.trim();
        if ((brand.value || null) !== (project.brand_id || null)) changes.brand_id = brand.value || null;
        if (brief.value !== project.brief) changes.brief = brief.value;
        if (archived.checked !== project.archived) changes.archived = archived.checked;
        if (Object.keys(changes).length) await request(`/api/library/folders/${project.id}`, 'PATCH', changes);
      });
    }
    function newProject() {
      const name = input('projectName', '', {maxlength: '100', required: ''});
      const brand = select('projectNewBrand', brandChoices(), scope.startsWith('brand:') ? scope.slice(6) : '');
      dialog('Neues Projekt', [field('Name', name), field('Firma', brand)], async () => {
        const folder = await request('/api/library/folders', 'POST', {name: name.value.trim()});
        if (brand.value) await request(`/api/library/folders/${folder.id}`, 'PATCH', {brand_id: brand.value});
        scope = `project:${folder.id}`;
      });
    }
    function newBrand() {
      const name = input('brandNewName', '', {maxlength: '80', required: ''});
      const rules = el('textarea'); rules.id = 'brandNewRules'; rules.rows = 5; rules.maxLength = 6000; rules.required = true;
      rules.placeholder = 'Zum Beispiel: Siezen, sachlich, ein Emoji pro Absatz';
      dialog('Neue Firma', [field('Name', name), field('Schreibstil für den Tab Text', rules)], async () => {
        const brand = await request('/api/brands', 'POST', {name: name.value.trim(), rules: rules.value.trim()});
        window.KlartextText?.refreshBrands?.();
        scope = `brand:${brand.id}`;
      });
    }

    root.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target || !root.contains(target)) return;
      if (target.closest('[data-tasks-menu]')) closePopover(true);
      if (target.dataset.tasksFilter || target.hasAttribute('data-tasks-more')) togglePopover(target);
      else if (target.hasAttribute('data-filter-option')) chooseFilter(target);
      else if (target.hasAttribute('data-tasks-filters-toggle')) {
        const open = target.getAttribute('aria-expanded') !== 'true';
        target.setAttribute('aria-expanded', String(open)); $('.tasksToolbar').dataset.filters = open ? 'open' : 'closed';
      }
      else if (target.hasAttribute('data-tasks-fields')) window.KlartextEditor?.setWorkspace('automations');
      else if (target.hasAttribute('data-tasks-tree-toggle')) {
        const open = $('.tasksLayout').dataset.tree === 'closed';
        showTree(open); target.focus(); try { localStorage.setItem('klartext-tasks-tree', open ? '1' : '0'); } catch {}
      }
      else if (target.dataset.tasksScope) { scope = target.dataset.tasksScope; refilter(); }
      else if (target.dataset.tasksView) { view = target.dataset.tasksView; try { localStorage.setItem('klartext-tasks-view', view); } catch {} refilter(); }
      else if (target.hasAttribute('data-task-new')) newTask();
      else if (target.hasAttribute('data-task-batch')) batchTasks();
      else if (target.matches('[data-task-add-video],[data-menu-add-video]')) addVideo();
      else if (target.hasAttribute('data-project-edit')) editProject();
      else if (target.matches('[data-project-new],[data-menu-project-new]')) newProject();
      else if (target.matches('[data-brand-new],[data-menu-brand-new]')) newBrand();
      else if (target.matches('[data-dialog-cancel],[data-dialog-close]')) $('[data-tasks-dialog]').close();
      else if (target.hasAttribute('data-task-panel-close')) closePanel();
      else if (target.dataset.ladderStage) stageAction(openTask(), target.dataset.ladderStage, 'ladder');
      // Reload drops the own unsaved edits on purpose; the reload then shows the saved state.
      else if (target.hasAttribute('data-task-reload')) { drafts.get(openId).fields = {}; load(); }
      else if (target.hasAttribute('data-task-link-video')) { const picker = $('[data-task-video-picker]'); picker.hidden = !picker.hidden; renderVideoOptions(); if (!picker.hidden) $('#taskVideoSearch').focus(); }
      else if (target.hasAttribute('data-version-open')) window.KlartextReview?.open(target.closest('[data-task-version]').dataset.taskVersion);
      else if (target.hasAttribute('data-version-submit')) submitVersion(target.closest('[data-task-version]').dataset.taskVersion);
      else if (target.dataset.versionFromExport) addVersionFrom('from-export', {job_id: target.dataset.versionFromExport}, 'Export als neue Version übernommen.');
      else if (target.dataset.versionFromMaterial) addVersionFrom('from-material', {item_id: target.dataset.versionFromMaterial}, 'Als Version übernommen.');
      else if (target.hasAttribute('data-task-panel-add-video')) window.KlartextAddVideo?.open({task_id: openId});
      else if (target.hasAttribute('data-version-delete')) deleteVersion(target.closest('[data-task-version]').dataset.taskVersion);
      else if (target.dataset.videoOption) { const task = openTask(); $('[data-task-video-picker]').hidden = true; save(openId, {media: [...task.media, target.dataset.videoOption]}); }
      else if (target.dataset.jump) jump(target.dataset.jump, target.closest('[data-task-video]').dataset.taskVideo);
      else if (target.hasAttribute('data-unlink-video')) { const task = openTask(), id = target.closest('[data-task-video]').dataset.taskVideo; save(openId, {media: task.media.filter(entry => entry !== id)}); }
      else if (target.hasAttribute('data-unlink-material')) { const task = openTask(), id = target.closest('[data-task-material-item]').dataset.taskMaterialItem; save(openId, {material: task.material.filter(entry => entry !== id)}); }
      else if (target.hasAttribute('data-task-show-material')) { if (pending(openId)) save(openId); window.KlartextMaterial?.showTask(openId); }
      else if (target.dataset.taskPost) { if (pending(openId)) save(openId); window.KlartextPlanning?.openPost(target.dataset.taskPost); }
      else if (target.hasAttribute('data-task-plan-post')) planPost();
      else if (target.hasAttribute('data-task-delete')) deleteTask();
    });
    root.addEventListener('click', event => {
      const item = event.target.closest('[data-task-row],[data-task-card]');
      if (item && !event.target.closest('select,button')) showPanel(item.dataset.taskRow || item.dataset.taskCard);
    });
    root.addEventListener('focusin', event => { if (event.target.matches?.('[data-task-card]')) event.target.scrollIntoView({block: 'nearest', inline: 'nearest'}); });
    root.addEventListener('keydown', event => {
      const item = event.target.closest?.('[data-task-row],[data-task-card]');
      if ((event.key === 'Enter' || event.key === ' ') && item === event.target) { event.preventDefault(); item.click(); }
      if (event.key === 'Escape' && !$('[data-task-panel]').hidden && !$('[data-tasks-dialog]').open) closePanel();
    });
    $('#taskTitle').addEventListener('input', event => queue('title', event.target.value));
    $('#taskBrief').addEventListener('input', event => queue('brief', event.target.value));
    $('[data-task-custom]').addEventListener('input', event => {
      const input = event.target.closest('[data-custom-field]'), task = openTask(); if (!input || !task) return;
      const field = data.fields.find(entry => entry.id === input.dataset.customField);
      const value = input.value === '' ? null : field.type === 'number' ? Number(input.value) : input.value;
      queue('custom', {...(drafts.get(openId).fields.custom || task.custom || {}), [field.id]: value});
    });
    for (const [selector, key] of [['#taskKind', 'kind'], ['#taskProject', 'project_id'], ['#taskDeadline', 'deadline'], ['#taskAssignee', 'assignee']]) {
      $(selector).addEventListener('change', event => queue(key, event.target.value || null));
    }
    $('#taskVideoSearch').addEventListener('input', renderVideoOptions);
    $('[data-version-upload]').addEventListener('change', event => uploadVersion(event.target.files[0]));
    window.addEventListener('beforeunload', event => { if ([...drafts.keys()].some(pending)) { event.preventDefault(); event.returnValue = ''; } });
    const dropColumn = event => event.target.closest?.('[data-task-column]');
    const clearDropTargets = () => { for (const column of root.querySelectorAll('[data-drop-target]')) delete column.dataset.dropTarget; };
    root.addEventListener('dragstart', event => {
      const card = event.target.closest?.('[data-task-card]'); if (!card) return;
      if (!canEdit()) { event.preventDefault(); return; }
      event.dataTransfer.setData('text/plain', card.dataset.taskCard);
    });
    root.addEventListener('dragover', event => { const column = dropColumn(event); if (!column || !canEdit()) return; event.preventDefault(); column.dataset.dropTarget = 'true'; });
    root.addEventListener('dragleave', event => { const column = dropColumn(event); if (column && !column.contains(event.relatedTarget)) delete column.dataset.dropTarget; });
    root.addEventListener('dragend', clearDropTargets);
    root.addEventListener('drop', event => {
      const column = dropColumn(event);
      if (!column) return;
      event.preventDefault(); clearDropTargets();
      const id = event.dataTransfer.getData('text/plain');
      stageAction(data?.tasks.find(task => task.id === id), column.dataset.taskColumn, 'board');
    });
    $('#tasksScopeSelect').addEventListener('change', event => { scope = event.target.value; refilter(); });
    $('#tasksSearch').addEventListener('input', () => data && refilter());
    document.addEventListener('pointerdown', event => { if (openTrigger && !openTrigger.parentElement.contains(event.target)) closePopover(); });
    // Tab out closes it; a click outside already did, and some browsers move no focus on a click.
    root.addEventListener('focusout', event => { if (openTrigger && event.relatedTarget && !openTrigger.parentElement.contains(event.relatedTarget)) closePopover(); });
    // Capture phase: Escape closes the popover before the root handler would close the panel. Keys elsewhere stay free.
    document.addEventListener('keydown', event => {
      if (!openTrigger || !openTrigger.parentElement.contains(event.target)) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePopover(true); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = popoverItems(), index = items.indexOf(document.activeElement);
        event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      }
    }, true);
    window.addEventListener('klartext:tasks-changed', () => { if (data) load(); });
    window.addEventListener('klartext:open-task', event => { if (event.detail?.id) open(event.detail.id); });
    window.addEventListener('klartext:workspace-change', event => {
      syncModal(event.detail?.name === 'projects');
      if (event.detail?.name === 'projects') load();
      // Heute may already have loaded the old state; the saved change tells it to count again.
      else if (pending(openId)) save(openId).then(saved => saved && window.dispatchEvent(new CustomEvent('klartext:tasks-changed')));
    });
    if (document.body.dataset.activeWorkspace === 'projects') load();
    opener = open;
    // Heute opens the page with just this one filter, like a link: all tasks, no search, no other filter.
    filterer = (name, values) => {
      scope = 'all'; $('#tasksSearch').value = '';
      for (const set of Object.values(chosen)) set.clear();
      if (SCOPES[name]) scope = values[0] || 'all'; else for (const value of values) chosen[name].add(value);
      if (data) refilter();
    };
  }
  let opener = () => Promise.resolve(), filterer = () => {};
  window.KlartextTasks = Object.freeze({mount, open: id => opener(id), filter: (name, values) => filterer(name, values)});
})();
