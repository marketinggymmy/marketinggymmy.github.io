/* Material: read-only view of linked NAS/PC folders. Files are attached to tasks; work stages live on the tasks. */
(() => {
  'use strict';
  const PAGE = 200, TASK_FILES = 50, TASK_HITS = 30;
  const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
  const kindLabels = {photo: 'Foto', video: 'Video'};
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function button(text, attrs = {}, className = '') { const node = el('button', className, text); node.type = 'button'; for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; }
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Material');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Material', response.status)); }
    if (!response.ok) { const error = new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Material', response.status)); error.status = response.status; throw error; }
    return data;
  }
  const size = bytes => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  const day = ns => new Date(Number(ns) / 1e6).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'});
  const folder = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const stem = name => name.replace(/\.[^.]+$/, '');

  function mount(host) {
    const root = host?.querySelector('[data-structure-view="material"]');
    if (!root || root.dataset.materialMounted) return;
    root.dataset.materialMounted = 'true'; root.classList.add('materialWorkspace');
    // The topbar names the page, so the section carries the name instead of an own heading.
    root.removeAttribute('aria-labelledby'); root.setAttribute('aria-label', 'Material');
    window.KlartextShell?.setActions('material', [{label: 'Alle neu einlesen', target: '[data-material-scan-all]'}, {label: 'Ordner verbinden', target: '[data-material-connect]'}]);
    root.innerHTML = `<header class="materialHeading"><p class="status" data-material-count></p>
      <div class="materialActions"><button type="button" class="btn" data-material-scan-all>Alle neu einlesen</button><button type="button" class="btn" data-material-connect>Ordner verbinden</button></div></header>
      <p class="status" data-material-connect-hint hidden>Ordner verbindest du am PC. Öffne Klartext dort.</p>
      <p class="status" data-material-status role="status" aria-live="polite"></p>
      <details class="materialSources card"><summary>Quellen</summary><div data-material-sources></div></details>
      <div class="materialFilterBar"><div class="field materialSearch"><label for="materialSearch">Suche</label><input id="materialSearch" type="search" placeholder="Dateiname oder Ordner"></div>
      <details class="materialFilters" data-material-filters><summary class="btn">Filter</summary><div class="materialFilterFields"><div class="field"><label for="materialBrand">Firma</label><select id="materialBrand"></select></div>
      <div class="field"><label for="materialKind">Typ</label><select id="materialKind"><option value="">Fotos und Videos</option><option value="photo">Fotos</option><option value="video">Videos</option></select></div>
      <div class="field"><label for="materialLink">Zuordnung</label><select id="materialLink"><option value="">Alle</option><option value="none">Ohne Aufgabe</option><option value="linked">Mit Aufgabe</option></select></div>
      <label class="check"><input type="checkbox" data-material-missing-toggle>Fehlende anzeigen</label><button type="button" class="btn isQuiet" data-material-reset>Filter zurücksetzen</button></div></details></div>
      <span class="materialTaskFilter" data-material-task-filter hidden></span>
      <div class="materialSelection card" data-material-selection hidden><strong data-material-selection-count></strong><div class="field"><label for="materialSelectionBrand">Firma</label><select id="materialSelectionBrand"></select></div><button type="button" class="btn" data-material-set-brand>Firma setzen</button>
      <button type="button" class="btn isPrimary" data-material-new-task>Aufgabe anlegen</button><button type="button" class="btn" data-material-add-task>Zu Aufgabe hinzufügen</button><button type="button" class="btn isQuiet" data-material-clear>Auswahl aufheben</button></div>
      <h2 class="srOnly">Dateien</h2><div class="materialGrid" data-material-grid></div><button type="button" class="btn materialMore" data-material-more hidden>Mehr laden</button>
      <dialog class="dlg" data-material-dialog aria-labelledby="materialDialogTitle"><form method="dialog" data-material-dialog-form><header class="materialDialogHead"><h2 id="materialDialogTitle"></h2><button type="button" class="btn isQuiet" data-material-dialog-close aria-label="Schließen">${CLOSE}</button></header>
      <div class="materialDialogFields" data-material-dialog-fields></div><p class="status isError" data-material-dialog-error role="alert"></p>
      <div class="dlgActions"><button type="button" class="btn" data-material-dialog-cancel>Abbrechen</button><button type="submit" class="btn isPrimary" data-material-dialog-confirm>Speichern</button></div></form></dialog>
      <dialog class="dlg isWide materialViewer" data-material-viewer aria-labelledby="materialViewerTitle"><header class="materialDialogHead"><h2 id="materialViewerTitle"></h2><button type="button" class="btn isQuiet" data-material-viewer-close aria-label="Schließen">${CLOSE}</button></header><div data-material-viewer-body></div></dialog>`;
    const $ = selector => root.querySelector(selector);
    let data = null, workspace = null, shown = PAGE, selection = new Set(), anchor = null, taskFilter = null, pollTimer = null;
    let shownKey = '', shownBrands = '';
    const toggleMode = () => window.matchMedia('(pointer: coarse), (max-width: 700px)').matches;
    const status = (text, error = false, quiet = false) => { const node = $('[data-material-status]'); node.setAttribute('aria-live', quiet ? 'off' : 'polite'); node.textContent = text; node.classList.toggle('isError', error); };
    // The selection bar sticks far below the status line, so its answers show as a toast too; the status line keeps them quietly.
    const notify = (text, error = false) => { status(text, error, true); window.KlartextToast?.show(text, error ? {tone: 'error'} : undefined); };
    // Prüfer read Material only (access.py); the card stays a plain picture for them.
    const reader = () => window.KlartextMe?.role === 'pruefer';
    const brandName = id => data.brands.find(brand => brand.id === id)?.name;
    const tasksFor = itemId => (workspace?.tasks || []).filter(task => task.material?.includes(itemId));
    const stageLabel = id => workspace?.stages.find(stage => stage.id === id)?.label || id;

    function visible() {
      const brand = $('#materialBrand').value, kind = $('#materialKind').value, link = $('#materialLink').value;
      const query = $('#materialSearch').value.trim().toLocaleLowerCase('de'), missing = $('[data-material-missing-toggle]').checked;
      return data.items.filter(item => (missing || !item.missing) && (!kind || item.kind === kind)
        && (!brand || (brand === 'none' ? !item.brand_id : item.brand_id === brand))
        && (!link || (link === 'none' ? !tasksFor(item.id).length : tasksFor(item.id).length > 0))
        && (!taskFilter || tasksFor(item.id).some(task => task.id === taskFilter))
        && (!query || item.relative_path.toLocaleLowerCase('de').includes(query)))
        .sort((a, b) => b.mtime_ns - a.mtime_ns || a.relative_path.localeCompare(b.relative_path, 'de'));
    }
    // A small still from the server, loaded near the screen; the original only loads in the viewer (Ansehen).
    function preview(item) {
      const image = el('img', 'materialThumb'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), {once: true}); image.src = item.still_url;
      return image;
    }
    function card(item) {
      const node = el('article', 'materialCard card'); node.dataset.materialCard = item.id;
      node.dataset.selected = String(selection.has(item.id));
      const body = el('div', 'materialCardBody');
      if (!reader()) { body.tabIndex = 0; body.setAttribute('role', 'button'); body.setAttribute('aria-label', `${item.name} auswählen`); body.setAttribute('aria-pressed', String(selection.has(item.id))); }
      const frame = el('div', 'materialFrame');
      if (item.missing) frame.append(el('span', 'materialMissing', 'Datei nicht gefunden')); else frame.append(preview(item));
      const info = el('div', 'materialInfo'), name = el('strong', 'materialName', item.name); name.title = item.name;
      const meta = el('span', 'materialMeta', [brandName(item.brand_id), kindLabels[item.kind], size(item.size), day(item.mtime_ns), folder(item.relative_path) || 'Hauptordner'].filter(Boolean).join(' · '));
      meta.title = meta.textContent; info.append(name, meta);
      const chips = el('div', 'materialChips');
      // A missing file can only be forgotten, so Geändert and Gesehen give way to Vergessen.
      const changedHere = item.changed && !item.missing;
      // Geändert and the button never shrink; the task chips give way inside their own clipping box and keep the full text in the title.
      if (changedHere) { const changed = el('span', 'chip', 'Geändert'); changed.dataset.status = 'changes'; chips.append(changed); }
      const linked = tasksFor(item.id);
      if (linked.length) { const tasks = el('span', 'materialTasks'); tasks.append(...linked.map(task => window.KlartextStage.chip(task.stage, `#${task.number} · ${stageLabel(task.stage)}`))); chips.append(tasks); }
      for (const chip of chips.querySelectorAll('.chip')) chip.title = chip.textContent;
      if (changedHere) chips.append(button('Gesehen', {'data-material-ack': ''}, 'btn isQuiet'));
      if (item.missing) chips.append(button('Vergessen', {'data-material-forget': ''}, 'btn isDanger'));
      body.append(frame, info);
      // Chips with their buttons, the box and Ansehen sit outside the body, so none of them counts as a click on the card.
      const overlay = el('div', 'materialOverlay'), pick = el('label', 'materialSelect check'), check = el('input');
      check.type = 'checkbox'; check.dataset.materialCheck = ''; check.checked = selection.has(item.id); check.setAttribute('aria-label', `${item.name} auswählen`);
      pick.append(check); overlay.append(pick);
      if (!item.missing) overlay.append(button('Ansehen', {'data-material-preview': '', 'aria-label': `${item.name} ansehen`}, 'btn isQuiet materialView'));
      node.append(body, chips, overlay);
      return node;
    }
    function render() {
      const list = visible();
      $('[data-material-count]').textContent = `${list.length} von ${data.items.filter(item => !item.missing).length} Dateien`;
      $('[data-material-grid]').replaceChildren(...(list.length ? list.slice(0, shown).map(card)
        : [window.KlartextStage.emptyState(data.sources.length ? {icon: 'folder', title: 'Keine Datei passt', text: 'Ändere die Suche oder die Filter.'}
          : {icon: 'folder', title: 'Noch kein Material', text: 'Verbinde einen Ordner auf der NAS, dann erscheinen deine Fotos und Videos hier.'})]));
      $('[data-material-more]').hidden = list.length <= shown;
      renderChrome();
    }
    // Everything around the grid; cheap enough for every poll and keeps the previews in place.
    function renderChrome() {
      $('[data-material-connect]').hidden = !data.can_connect; $('[data-material-connect-hint]').hidden = data.can_connect;
      renderSelection();
      const task = workspace?.tasks.find(entry => entry.id === taskFilter);
      $('[data-material-task-filter]').hidden = !task; $('[data-material-task-filter]').textContent = task ? `Aufgabe #${task.number} ${task.title}` : '';
      const changed = [$('#materialBrand').value, $('#materialKind').value, $('#materialLink').value, $('[data-material-missing-toggle]').checked].filter(Boolean).length;
      $('[data-material-filters] summary').textContent = changed ? `Filter · ${changed}` : 'Filter';
      renderSources();
    }
    function renderSelection() {
      for (const node of root.querySelectorAll('[data-material-card]')) {
        const on = selection.has(node.dataset.materialCard);
        node.dataset.selected = String(on); node.querySelector('[data-material-check]').checked = on;
        node.querySelector('.materialCardBody[role="button"]')?.setAttribute('aria-pressed', String(on));
      }
      const count = selection.size;
      $('[data-material-selection]').hidden = !count; $('[data-material-selection-count]').textContent = `${count} ausgewählt`;
    }
    function renderSources() {
      const statusText = source => source.scanning ? 'wird eingelesen …' : !source.active ? 'getrennt' : source.status === 'ready' ? `${source.count} Dateien` : source.status === 'incomplete' ? `unvollständig: ${source.error}` : source.status === 'error' ? `nicht erreichbar: ${source.error || ''}` : 'noch nicht eingelesen';
      $('[data-material-sources]').replaceChildren(...(data.sources.length ? data.sources.map(source => {
        const row = el('div', 'materialSource'); row.dataset.materialSource = source.id;
        const info = el('div', 'materialSourceInfo'); info.append(el('strong', '', source.name), el('span', 'materialMeta', source.path), el('span', 'materialMeta', statusText(source)));
        const brandField = el('div', 'field'), brand = el('select'); brandField.append(brand); brand.dataset.materialSourceBrand = source.id; brand.setAttribute('aria-label', `Standard-Firma für ${source.name}`);
        brand.replaceChildren(new Option('Ohne Standard-Firma', ''), ...data.brands.map(entry => new Option(entry.name, entry.id))); brand.value = source.brand_id || '';
        const actions = el('div', 'materialSourceActions');
        if (source.active) actions.append(brandField, button('Neu einlesen', {'data-material-source-scan': ''}, 'btn'), button('Trennen', {'data-material-source-disconnect': ''}, 'btn isDanger'));
        else actions.append(button('Wieder verbinden', {'data-material-source-reconnect': ''}, 'btn'));
        row.append(info, actions); return row;
      }) : [el('p', 'status', 'Noch keine Quelle verbunden.')]));
    }
    function fillBrandFilters() {
      for (const [select, first] of [[$('#materialBrand'), 'Alle Firmen'], [$('#materialSelectionBrand'), null]]) {
        const value = select.value;
        select.replaceChildren(...(first ? [new Option(first, '')] : []), new Option('Ohne Firma', first ? 'none' : ''), ...data.brands.map(brand => new Option(brand.name, brand.id)));
        select.value = value;
      }
    }
    async function load(poll = false) {
      try {
        [data, workspace] = await Promise.all([request('/api/material'), request('/api/workspace').catch(() => null)]);
        const known = new Set(data.items.map(item => item.id));
        selection = new Set([...selection].filter(id => known.has(id)));
        const brands = JSON.stringify(data.brands);
        if (brands !== shownBrands) { fillBrandFilters(); shownBrands = brands; }
        // A poll during a scan rebuilds the grid only when files or their tasks changed; new cards reload previews.
        const key = JSON.stringify([data.items, (workspace?.tasks || []).map(task => [task.id, task.number, task.stage, task.material])]);
        if (poll && key === shownKey) renderChrome(); else render();
        shownKey = key; root.dataset.materialReady = 'true';
        clearTimeout(pollTimer);
        if (data.scanning) pollTimer = setTimeout(() => load(true), 1500);
      } catch (error) { status(error.message, true); }
    }

    function select(itemId, event) {
      if (reader()) return;
      const order = visible().slice(0, shown).map(item => item.id);
      if (event.shiftKey && anchor && order.includes(anchor)) {
        const [from, to] = [order.indexOf(anchor), order.indexOf(itemId)].sort((a, b) => a - b);
        selection = new Set(order.slice(from, to + 1));
      } else if (event.ctrlKey || event.metaKey || toggleMode()) {
        if (selection.has(itemId)) selection.delete(itemId); else selection.add(itemId);
        anchor = itemId;
      } else { selection = new Set([itemId]); anchor = itemId; }
      renderSelection();
    }
    function dialog(title, fields, submit, ready = true) {
      const node = $('[data-material-dialog]');
      $('#materialDialogTitle').textContent = title; $('[data-material-dialog-error]').textContent = '';
      $('[data-material-dialog-fields]').replaceChildren(...fields);
      $('[data-material-dialog-form]').onsubmit = async event => {
        event.preventDefault(); $('[data-material-dialog-confirm]').disabled = true;
        try { await submit(); node.close(); } catch (error) { $('[data-material-dialog-error]').textContent = error.message; }
        finally { $('[data-material-dialog-confirm]').disabled = false; }
      };
      node.showModal(); $('[data-material-dialog-confirm]').disabled = !ready;
    }
    function field(text, control) { const wrap = el('label', 'field'); wrap.append(el('span', '', text), control); return wrap; }
    function choice(id, entries, value) { const node = el('select'); node.id = id; node.replaceChildren(...entries.map(([val, text]) => new Option(text, val))); if (value !== undefined) node.value = value; return node; }
    const activeProjects = () => (workspace?.projects || []).filter(project => !project.archived);
    const projectLabel = project => `${brandName(project.brand_id) || 'Ohne Firma'} · ${project.name}`;
    function newTask() {
      const items = data.items.filter(item => selection.has(item.id));
      if (items.length > TASK_FILES) { notify(`Eine Aufgabe kann höchstens ${TASK_FILES} Dateien haben. Wähl weniger aus.`, true); return; }
      if (!activeProjects().length) { notify('Lege zuerst unter Aufgaben ein Projekt an.', true); return; }
      const brands = [...new Set(items.map(item => item.brand_id).filter(Boolean))];
      const brandProjects = brands.length === 1 ? activeProjects().filter(project => project.brand_id === brands[0]) : [];
      const title = el('input'); title.id = 'materialTaskTitle'; title.maxLength = 200; title.required = true; title.value = stem(items[0].name);
      const project = choice('materialTaskProject', activeProjects().map(entry => [entry.id, projectLabel(entry)]), (brandProjects[0] || activeProjects()[0]).id);
      const kind = choice('materialTaskKind', [['video', 'Video'], ['bild', 'Bild']], items.some(item => item.kind === 'video') ? 'video' : 'bild');
      dialog(`Aufgabe aus ${items.length} ${items.length === 1 ? 'Datei' : 'Dateien'} anlegen`, [field('Titel', title), field('Projekt', project), field('Art', kind)], async () => {
        const task = await request('/api/tasks', 'POST', {project_id: project.value, title: title.value.trim(), kind: kind.value, material: items.map(item => item.id)});
        selection.clear(); status(`Aufgabe #${task.number} angelegt.`); await load();
        window.KlartextTasks?.open(task.id);
      });
    }
    function addToTask() {
      const ids = [...selection], tasks = (workspace?.tasks || []).filter(task => activeProjects().some(project => project.id === task.project_id)).sort((a, b) => b.number - a.number);
      if (!tasks.length) { notify('Es gibt noch keine offene Aufgabe. Lege eine an.', true); return; }
      const meta = task => projectLabel(activeProjects().find(project => project.id === task.project_id));
      const search = el('input'); search.id = 'materialTaskSearch'; search.type = 'search'; search.placeholder = 'Titel, Nummer oder Firma';
      const list = el('div', 'materialTaskOptions'); list.dataset.materialTaskOptions = '';
      let picked = null;
      function fill() {
        const query = search.value.trim().toLocaleLowerCase('de');
        const hits = tasks.filter(task => `#${task.number} ${task.title} ${meta(task)}`.toLocaleLowerCase('de').includes(query)).slice(0, TASK_HITS);
        // A pick the search hides is dropped, so confirming never hits a task that is out of sight.
        if (!hits.some(task => task.id === picked)) { picked = null; $('[data-material-dialog-confirm]').disabled = true; }
        list.replaceChildren(...(hits.length ? hits.map(task => {
          const option = button('', {'data-material-task-option': task.id, 'aria-pressed': String(task.id === picked)}, 'btn materialTaskOption');
          option.append(el('strong', '', `#${task.number} ${task.title}`), el('span', 'materialMeta', meta(task))); return option;
        }) : [el('p', 'status', 'Keine Aufgabe passt zur Suche.')]));
      }
      search.addEventListener('input', fill);
      list.addEventListener('click', event => {
        const option = event.target.closest('[data-material-task-option]'); if (!option) return;
        picked = option.dataset.materialTaskOption; $('[data-material-dialog-confirm]').disabled = false;
        for (const node of list.querySelectorAll('[data-material-task-option]')) node.setAttribute('aria-pressed', String(node === option));
      });
      fill();
      dialog('Zu Aufgabe hinzufügen', [field('Aufgabe suchen', search), list], async () => {
        // Fresh state: the task may have changed on another device since this page loaded.
        workspace = await request('/api/workspace');
        const task = workspace.tasks.find(entry => entry.id === picked);
        if (!task) throw new Error('Die Aufgabe gibt es nicht mehr.');
        const material = [...new Set([...task.material, ...ids])];
        if (material.length > TASK_FILES) throw new Error(`Eine Aufgabe kann höchstens ${TASK_FILES} Dateien haben. Diese hat schon ${task.material.length}.`);
        await request(`/api/tasks/${task.id}`, 'PATCH', {revision: task.revision, material});
        selection.clear(); status(`Zu Aufgabe #${task.number} hinzugefügt.`); await load();
        window.KlartextTasks?.open(task.id);
      }, false);
    }
    async function setBrand() {
      const ids = [...selection], brand = $('#materialSelectionBrand').value || null;
      try { await request('/api/material/items', 'PATCH', {item_ids: ids, brand_id: brand}); notify(`Firma für ${ids.length} ${ids.length === 1 ? 'Datei' : 'Dateien'} gesetzt.`); await load(); }
      catch (error) { notify(error.message, true); }
    }
    function view(item) {
      const viewer = $('[data-material-viewer]'), media = item.kind === 'photo' ? el('img') : el('video');
      if (item.kind === 'photo') media.alt = item.name; else { media.controls = true; media.playsInline = true; }
      media.src = item.media_url; $('#materialViewerTitle').textContent = item.name;
      $('[data-material-viewer-body]').replaceChildren(media); viewer.showModal();
    }
    async function connect() {
      status('Wähle den Ordner im Fenster auf dem PC.');
      try { const result = await request('/api/material/sources', 'POST'); status(result.cancelled ? 'Kein Ordner gewählt.' : 'Ordner wird eingelesen …'); await load(); }
      catch (error) { status(error.message, true); }
    }
    async function act(url, method, body, message) {
      try { await request(url, method, body); if (message) status(message); await load(); } catch (error) { status(error.message, true); }
    }

    root.addEventListener('click', async event => {
      const target = event.target.closest('button'), cardNode = event.target.closest('[data-material-card]');
      const item = cardNode && data?.items.find(entry => entry.id === cardNode.dataset.materialCard);
      if (item && event.target.matches('[data-material-check]')) { select(item.id, {ctrlKey: true, shiftKey: event.shiftKey}); return; }
      if (!target) { if (item && event.target.closest('.materialCardBody')) select(item.id, event); return; }
      const sourceId = target.closest('[data-material-source]')?.dataset.materialSource;
      if (target.hasAttribute('data-material-connect')) connect();
      else if (target.hasAttribute('data-material-scan-all')) act('/api/material/scan', 'POST', undefined, 'Wird neu eingelesen …');
      else if (target.hasAttribute('data-material-source-scan')) act(`/api/material/sources/${sourceId}/scan`, 'POST', undefined, 'Wird neu eingelesen …');
      else if (target.hasAttribute('data-material-source-disconnect')) {
        const source = data.sources.find(entry => entry.id === sourceId); if (!source) return;
        if (await window.KlartextConfirm.ask({title: `Quelle „${source.name}“ trennen?`, text: 'Klartext liest den Ordner danach nicht mehr ein. Die Dateien auf der NAS bleiben unverändert.', confirm: 'Trennen'}) !== 'confirm') return;
        act(`/api/material/sources/${sourceId}/disconnect`, 'POST', undefined, 'Quelle getrennt. Die Dateien auf der NAS bleiben unverändert.');
      }
      else if (target.hasAttribute('data-material-source-reconnect')) act(`/api/material/sources/${sourceId}/reconnect`, 'POST', undefined, 'Quelle wieder verbunden.');
      else if (target.hasAttribute('data-material-reset')) { for (const id of ['#materialBrand', '#materialKind', '#materialLink']) $(id).value = ''; $('#materialSearch').value = ''; $('[data-material-missing-toggle]').checked = false; taskFilter = null; shown = PAGE; render(); }
      else if (target.hasAttribute('data-material-more')) { shown += PAGE; render(); }
      else if (target.hasAttribute('data-material-set-brand')) setBrand();
      else if (target.hasAttribute('data-material-new-task')) newTask();
      else if (target.hasAttribute('data-material-add-task')) addToTask();
      else if (target.hasAttribute('data-material-clear')) { selection.clear(); renderSelection(); }
      else if (target.matches('[data-material-dialog-cancel], [data-material-dialog-close]')) $('[data-material-dialog]').close();
      else if (target.hasAttribute('data-material-viewer-close')) $('[data-material-viewer]').close();
      else if (item && target.hasAttribute('data-material-preview')) view(item);
      else if (item && target.hasAttribute('data-material-ack')) act('/api/material/items/acknowledge', 'POST', {item_ids: [item.id]});
      else if (item && target.hasAttribute('data-material-forget')) {
        if (await window.KlartextConfirm.ask({title: `„${item.name}“ vergessen?`, text: 'Die Datei fehlt auf der NAS. Verweise in Aufgaben zeigen danach „nicht verfügbar“.', confirm: 'Vergessen'}) !== 'confirm') return;
        act(`/api/material/items/${item.id}`, 'DELETE', undefined, 'Eintrag vergessen. Verweise in Aufgaben zeigen jetzt „nicht verfügbar“.');
      }
    });
    // Esc closes the dialog too; dropping the video stops it streaming from the NAS.
    $('[data-material-viewer]').addEventListener('close', () => $('[data-material-viewer-body]').replaceChildren());
    root.addEventListener('keydown', event => {
      const body = event.target.closest?.('.materialCardBody');
      if (body && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(body.closest('[data-material-card]').dataset.materialCard, event); }
    });
    root.addEventListener('change', event => {
      const sourceId = event.target.dataset?.materialSourceBrand;
      if (sourceId) act(`/api/material/sources/${sourceId}`, 'PATCH', {brand_id: event.target.value || null}, 'Standard-Firma gespeichert. Neue Dateien dieser Quelle bekommen sie automatisch.');
    });
    for (const id of ['#materialBrand', '#materialKind', '#materialLink', '#materialSearch', '[data-material-missing-toggle]']) $(id).addEventListener('input', () => { if (data) { shown = PAGE; render(); } });
    // Phones fold the filters away behind „Filter“; wider screens always show them (the summary is hidden there).
    const narrow = window.matchMedia('(max-width: 700px)'), fold = () => { $('[data-material-filters]').open = !narrow.matches; };
    fold(); narrow.addEventListener('change', fold);
    window.addEventListener('klartext:workspace-change', event => { if (event.detail?.name === 'material') load(); else { clearTimeout(pollTimer); if (taskFilter) { taskFilter = null; $('[data-material-missing-toggle]').checked = false; } } });
    showTask = taskId => { taskFilter = taskId; $('[data-material-missing-toggle]').checked = true; window.KlartextEditor?.setWorkspace('material'); };
  }
  let showTask = () => {};
  window.KlartextMaterial = Object.freeze({mount, showTask: taskId => showTask(taskId)});
})();
