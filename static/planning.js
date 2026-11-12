/* Planning calendar. Instagram details come from instagram.js; posting happens on the server. */
(() => {
  'use strict';
  const D = window.KlartextPlanningDates;
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${({plus:'<path d="M12 5v14M5 12h14"/>',left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'})[name]}</svg>`;
  function node(tag, className = '', text = '') { const el = document.createElement(tag); el.className = className; el.textContent = text; return el; }
  async function request(url, method = 'GET', body) {
    const multipart = body instanceof FormData;
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body && !multipart ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: multipart ? body : JSON.stringify(body)} : {})}, 'Kalender');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Kalender', response.status)); }
    if (!response.ok) {
      const error = new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Kalender', response.status));
      error.status = response.status; throw error;
    }
    return data;
  }
  function mount(host) {
    const root = host?.querySelector('[data-structure-view="planning"]');
    if (!root || root.dataset.planningMounted) return;
    root.dataset.planningMounted = 'true'; root.classList.add('planningWorkspace');
    // The topbar names the page, so the section carries the name instead of an own heading.
    root.removeAttribute('aria-labelledby'); root.setAttribute('aria-label', 'Kalender');
    window.KlartextShell?.setActions('planning', [{label: 'Neuer Beitrag', primary: true, target: '[data-planning-new]'}]);
    root.innerHTML = `<header class="planningHeading"><div class="planningCalendarNav planningCalendarOnly"><button type="button" class="btn" data-planning-today>Heute</button><button type="button" class="btn isQuiet" data-planning-prev aria-label="Vorheriger Zeitraum">${icon('left')}</button><button type="button" class="btn isQuiet" data-planning-next aria-label="Nächster Zeitraum">${icon('right')}</button><h2 data-planning-period aria-live="polite"></h2><button type="button" class="btn" data-planning-filters-toggle aria-expanded="false" aria-controls="planningFilters">Filter</button></div><div class="planningViews planningCalendarOnly" data-planning-views role="group" aria-label="Zeitraum"><button type="button" class="btn" data-planning-view="month" aria-pressed="true">Monat</button><button type="button" class="btn" data-planning-view="week" aria-pressed="false">Woche</button></div><div class="planningModes" role="group" aria-label="Ansicht"><button type="button" class="btn" data-planning-mode="calendar" aria-pressed="true">Kalender</button><button type="button" class="btn" data-planning-mode="grid" aria-pressed="false">Raster</button></div><div class="planningFilters planningCalendarOnly" id="planningFilters"><div class="field planningFilter"><label class="srOnly" for="planningBrandFilter">Firma</label><select id="planningBrandFilter"><option value="">Alle Firmen</option></select></div><div class="field planningFilter"><label class="srOnly" for="planningProjectFilter">Projekt</label><select id="planningProjectFilter"><option value="">Alle Projekte</option></select></div></div><button type="button" class="btn planningCalendarOnly" data-planning-tray-open aria-controls="planningSheet" aria-expanded="false">Ablage</button><button type="button" class="btn isPrimary" data-planning-new>${icon('plus')}Neuer Beitrag</button><p class="status planningReadonly" data-planning-readonly hidden>Beiträge plant Dominik.</p></header>
      <p data-planning-loading role="status">Kalender wird geladen …</p><div class="planningLoadError card" hidden><p data-planning-load-error role="alert"></p><button type="button" class="btn" data-planning-retry>Erneut laden</button></div>
      <div class="planningLayout" hidden><aside class="planningTray" data-planning-tray aria-label="Ablage"></aside>
      <section class="planningCalendar" aria-label="Beitragskalender"><div class="planningCalendarScroll scrollBox" data-planning-scroll tabindex="0" aria-label="Kalender, bei Bedarf horizontal scrollen"><div data-planning-grid class="planningGrid"></div></div><ol class="planningWeekList" data-planning-week-list aria-label="Woche" hidden></ol></section></div>
      <div class="planningSheet" id="planningSheet" data-planning-sheet role="region" aria-label="Ablage" hidden></div>
      <dialog class="dlg" data-planning-date-dialog aria-labelledby="planningScheduleTitle"><form data-planning-schedule-form><h2 id="planningScheduleTitle">Termin setzen</h2><p class="status" data-planning-schedule-for></p><div class="planningFieldRow"><div class="field"><label for="planningScheduleDate">Datum</label><input id="planningScheduleDate" type="date" required></div><div class="field"><label for="planningScheduleTime">Uhrzeit</label><input id="planningScheduleTime" type="time"></div></div><p class="status isError" data-planning-schedule-error role="alert" hidden></p><div class="dlgActions"><button type="button" class="btn" data-planning-schedule-cancel>Abbrechen</button><button type="submit" class="btn isPrimary">Übernehmen</button></div></form></dialog>
      <section class="igGridView" data-ig-grid-view hidden aria-label="Raster-Vorschau"></section>
      <dialog id="planningComposer" class="dlg isWide planningComposer" aria-labelledby="planningComposerTitle"><form id="planningForm"><header class="planningComposerHeader"><h2 id="planningComposerTitle">Beitrag planen</h2><div class="planningComposerState" data-planning-ig-head></div><button id="planningClose" type="button" class="btn isQuiet" aria-label="Beitragseditor schließen">${icon('close')}</button></header><div class="planningComposerBody"><div class="planningFields">
      <div class="field"><label for="planningTitle">Titel</label><input id="planningTitle" maxlength="200" required></div><div class="planningFieldRow"><div class="field"><label for="planningBrand">Firma</label><select id="planningBrand"></select></div><div class="field"><label for="planningProject">Projekt</label><select id="planningProject"></select></div></div>
      <div class="field"><label for="planningFile">Datei</label><select id="planningFile"></select></div><p class="status" data-planning-approval hidden>Freigabe fehlt, Instagram postet erst nach der Freigabe</p>
      <div class="field"><label for="planningCaption">Beitragstext</label><textarea id="planningCaption" rows="5" maxlength="20000" placeholder="Dein Text für diesen Beitrag …"></textarea></div>
      <label class="planningSwitch check"><input id="planningInstagramOn" type="checkbox">Auf Instagram posten</label><p class="status" data-planning-ig-setup hidden><span></span> <button type="button" class="btn isQuiet">Zur Einrichtung</button></p>
      <details id="planningInstagramDetails" class="planningSection"><summary>Instagram-Angaben</summary><fieldset id="planningInstagram" class="planningInstagram"></fieldset></details>
      <details class="planningSection" data-planning-more><summary>Weitere Kanäle (Notiz)</summary><p class="status">Diese Kanäle postest du selbst, Klartext merkt sie sich nur.</p><div data-planning-channels></div></details>
      <details class="planningSection" data-planning-cover><summary>Titelbild für den Kalender</summary><img id="planningCoverThumbnail" class="planningCoverThumbnail" alt="Gewähltes Titelbild" hidden><div class="planningCoverActions"><label class="btn planningUpload">Bild auswählen<input id="planningCoverFile" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="planningFrame" type="button" class="btn">Standbild aus dem Video</button><button id="planningClearCover" type="button" class="btn isQuiet">Titelbild entfernen</button></div><p class="status">PNG, JPEG oder WebP bis 5 MB, nur für den Kalender.</p></details>
      <fieldset class="planningSchedule"><legend>Termin</legend><div class="planningFieldRow"><div class="field"><label for="planningDate">Datum</label><input id="planningDate" type="date"></div><div class="field"><label for="planningTime">Uhrzeit</label><input id="planningTime" type="time"></div></div><p class="status" data-planning-zone></p></fieldset>
      </div><aside class="planningPreview"><h3>Beitragsvorschau</h3><div class="field"><label for="planningPreviewChannel">Kanal</label><select id="planningPreviewChannel"></select></div><div class="planningPreviewStage"><video id="planningVideo" controls playsinline preload="metadata" hidden></video><img id="planningImage" alt="Gewählte Datei" hidden><img id="planningCover" alt="Gewähltes Titelbild" hidden><span id="planningPreviewEmpty">Datei wählen, um den Beitrag anzusehen.</span></div><p id="planningVideoError" class="status isError" hidden>Diese Datei kann der Browser nicht abspielen. Die Zuordnung bleibt erhalten.</p><h4 id="planningPreviewTitle"></h4><p id="planningPreviewCaption"></p><p class="status">Leertaste spielt das sichtbare Video ab oder pausiert es. In Textfeldern bleibt sie ein Leerzeichen.</p></aside></div>
      <div class="planningComposerFooter"><div class="planningFeedback"><p id="planningError" class="status isError" role="alert"></p><button id="planningReload" type="button" class="btn" hidden>Aktuellen Stand neu laden</button><p id="planningSaveStatus" class="status" role="status" aria-live="polite"></p></div><div class="planningFooterActions"><div class="planningFooterStart"><button id="planningDelete" type="button" class="btn isDanger">Beitrag löschen</button><button id="planningDuplicate" type="button" class="btn isQuiet">Duplizieren</button><button id="planningUnplan" type="button" class="btn isQuiet">Zurück auf Entwurf</button><button type="button" class="btn isQuiet" data-planning-mark-posted>Als veröffentlicht markieren</button></div><div class="planningFooterEnd"><button id="planningDraft" type="button" class="btn">Entwurf speichern</button><button id="planningPlan" type="button" class="btn isPrimary">Planen</button></div></div></div></form></dialog>`;
    const $ = selector => root.querySelector(selector), id = value => $(`#${value}`);
    const dialog = id('planningComposer'), form = id('planningForm'), video = id('planningVideo');
    let instagram = null, mode = 'calendar', gridView = null;
    const canEdit = () => snapshot?.can_edit !== false;
    const readView = () => { try { return localStorage.getItem('klartext-planning-view') === 'week' ? 'week' : 'month'; } catch { return 'month'; } };
    let snapshot = null, anchor = D.today(), view = readView(), current = null, baseline = '', trigger = null, busy = false, loadSerial = 0, coverId = null, coverGeneration = 0;
    // Phones get a week list and nothing is draggable there; below 1101 px the Ablage is a sheet behind „Ablage“ (spec 4.7).
    const small = window.matchMedia('(max-width: 700px)'), phone = () => small.matches;
    const narrow = window.matchMedia('(max-width: 1100px)'), folded = () => narrow.matches;
    const sheet = $('[data-planning-sheet]'), trayOpen = $('[data-planning-tray-open]'), dateDialog = $('[data-planning-date-dialog]');
    let scheduling = null;
    // taskId: the task a new post is planned from; files: the composer's catalog once loaded; opened: guards late catalog answers.
    let taskId = null, files = null, opened = 0;
    const zone = () => snapshot?.timezone;
    const defined = value => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
    const when = local => `${local.slice(8, 10)}.${local.slice(5, 7)}. ${local.slice(11, 16)}`;
    const catalogFor = query => request(`/api/instagram/catalog${query}`).catch(() => ({}));
    const active = () => document.body.dataset.activeWorkspace === 'planning' && !root.hidden;
    function options(select, entries, empty, selected = select.value) {
      select.replaceChildren(); if (empty !== undefined) select.add(new Option(empty, ''));
      for (const entry of entries) select.add(new Option(entry.name || entry.title, entry.id));
      select.value = selected;
    }
    function catalogOptions() {
      options(id('planningBrandFilter'), snapshot.brands, 'Alle Firmen'); options(id('planningProjectFilter'), snapshot.projects, 'Alle Projekte');
    }
    function filteredPosts() {
      const brand = id('planningBrandFilter').value, project = id('planningProjectFilter').value;
      return snapshot.posts.filter(post => (!brand || post.brand_id === brand) && (!project || post.project_id === project));
    }
    const brandName = brandId => snapshot.brands.find(entry => entry.id === brandId)?.name;
    function postCard(post) {
      const button = node('button', 'planningPost'); button.type = 'button'; button.dataset.planningPost = post.id; button.draggable = canEdit() && !phone();
      if (post.cover_id) { const image = node('img', 'planningPostCover'); image.src = `/api/planning/covers/${encodeURIComponent(post.cover_id)}`; image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => image.remove()); button.append(image); }
      const copy = node('span', 'planningPostCopy');
      copy.append(node('strong', '', post.title));
      if (post.scheduled_local) { const time = node('span', 'planningPostTime', post.scheduled_local.slice(11)); time.title = post.timezone; copy.append(time); }
      if (brandName(post.brand_id)) copy.append(node('span', '', brandName(post.brand_id)));
      // While Instagram posts the entry, its state stands in for the post status.
      const igState = post.channels.includes('instagram') ? snapshot.instagram_states?.[post.id] : null;
      const label = window.KlartextStage.postLabel(post, igState);
      const state = node('span', 'planningPostState'), chip = node('span', 'chip', label);
      if (igState) chip.dataset.igState = igState.status; else chip.dataset.status = post.status;
      state.append(chip);
      if (igState?.permalink) { const link = node('span', 'planningPostLink'); link.innerHTML = icon('link'); link.title = 'Auf Instagram veröffentlicht'; state.append(link); }
      copy.append(state);
      const reason = window.KlartextStage.postReason(igState);
      if (reason) copy.append(node('span', 'planningPostReason', reason));
      if (post.media_id?.startsWith('job:') && !snapshot.media.some(media => media.id === post.media_id)) copy.append(node('span', 'planningWarning', 'Video fehlt'));
      button.append(copy); button.setAttribute('aria-label', `${post.title}, ${label}${reason ? `, ${reason}` : ''}${post.scheduled_local ? `, ${post.scheduled_local.replace('T', ' ')}` : ''}`); return button;
    }
    function fillTray(target, tasks, drafts) {
      const schedule = (value, title) => {
        if (!canEdit()) return [];
        const button = node('button', 'btn', 'Termin setzen'); button.type = 'button'; button.dataset.planningSchedule = value; button.setAttribute('aria-label', `Termin setzen für ${title}`); return [button];
      };
      const group = (title, entries) => { if (!entries.length) return []; const section = node('section', 'planningTrayGroup'); section.append(node('h3', '', title), ...entries); return [section]; };
      const taskEntries = tasks.map(task => {
        const entry = node('div', 'planningTrayItem'), copy = node('span', 'planningPostCopy'); entry.dataset.planningTrayTask = task.id; entry.draggable = canEdit() && !phone();
        copy.append(node('strong', '', `#${task.number} ${task.title}`)); if (brandName(task.brand_id)) copy.append(node('span', '', brandName(task.brand_id)));
        entry.append(copy, ...schedule(`task:${task.id}`, task.title)); return entry;
      });
      const draftEntries = drafts.map(post => { const entry = node('div', 'planningTrayItem'); entry.append(postCard(post), ...schedule(`post:${post.id}`, post.title)); return entry; });
      target.replaceChildren(node('h2', '', 'Ablage'), ...group('Freigegeben, ohne Termin', taskEntries), ...group('Entwürfe', draftEntries));
      if (!taskEntries.length && !draftEntries.length) target.append(node('p', 'status', 'Alles eingeplant.'));
    }
    const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    function render() {
      if (!snapshot) return;
      const posts = filteredPosts(), mobile = phone(), shown = mobile ? 'week' : view;
      const brand = id('planningBrandFilter').value, project = id('planningProjectFilter').value;
      const tasks = (snapshot.tray_tasks || []).filter(task => (!brand || task.brand_id === brand) && (!project || task.project_id === project));
      const drafts = posts.filter(post => !post.scheduled_local);
      // The entries live in one place only: the aside on wide screens, the sheet below 1101 px.
      $(folded() ? '[data-planning-tray]' : '[data-planning-sheet]').replaceChildren();
      fillTray($(folded() ? '[data-planning-sheet]' : '[data-planning-tray]'), tasks, drafts);
      trayOpen.textContent = `Ablage · ${tasks.length + drafts.length}`;
      // A folded filter still says it is on.
      const picked = [brand, project].filter(Boolean).length;
      $('[data-planning-filters-toggle]').textContent = picked ? `Filter · ${picked}` : 'Filter';
      for (const el of root.querySelectorAll('[data-planning-view]')) el.setAttribute('aria-pressed', String(el.dataset.planningView === view));
      const grid = $('[data-planning-grid]'), list = $('[data-planning-week-list]'); grid.replaceChildren(); list.replaceChildren();
      $('[data-planning-scroll]').hidden = mobile; list.hidden = !mobile;
      const today = D.today(zone()), days = D.days(anchor, shown);
      const cards = date => posts.filter(post => post.scheduled_local?.slice(0, 10) === date).sort((a, b) => a.scheduled_local.localeCompare(b.scheduled_local)).map(postCard);
      if (mobile) days.forEach((date, index) => {
        const entries = cards(date), day = node('li', `planningListDay${date === today ? ' isToday' : ''}${entries.length ? '' : ' isFree'}`); day.dataset.planningDate = date;
        if (date === today) day.setAttribute('aria-current', 'date');
        day.append(node('h3', '', `${WEEKDAYS[index]} ${date.slice(8, 10)}.${date.slice(5, 7)}.${entries.length ? '' : ' · frei'}`), ...entries);
        list.append(day);
      });
      else {
        for (const day of WEEKDAYS) { const label = node('div', 'planningWeekday', day); label.dataset.planningWeekday = ''; grid.append(label); }
        for (const date of days) {
          const cell = node('section', `planningDay${date === today ? ' isToday' : ''}${date.slice(0, 7) !== anchor.slice(0, 7) && shown === 'month' ? ' isOutside' : ''}`); cell.dataset.planningDate = date;
          const add = node('button', 'btn isQuiet planningDayAdd', String(Number(date.slice(8))));
          add.type = 'button'; add.disabled = !canEdit(); add.dataset.newOnDay = date; add.setAttribute('aria-label', `Beitrag am ${D.label(date, {day: 'numeric', month: 'long', year: 'numeric'})} erstellen`);
          cell.append(add, ...cards(date)); grid.append(cell);
        }
      }
      $('[data-planning-period]').textContent = shown === 'month' ? D.label(anchor) : `${D.label(days[0], {day: 'numeric', month: 'short'})} bis ${D.label(days[6], {day: 'numeric', month: 'short', year: 'numeric'})}`;
    }
    function setView(value) { view = value; try { localStorage.setItem('klartext-planning-view', value); } catch {} render(); }
    function closeSheet() { sheet.hidden = true; trayOpen.setAttribute('aria-expanded', 'false'); }
    function openSchedule(value) {
      const [kind, itemId] = value.split(':'), item = (kind === 'task' ? snapshot.tray_tasks || [] : snapshot.posts).find(entry => entry.id === itemId);
      if (!item || !canEdit()) return;
      scheduling = {kind, id: itemId}; closeSheet();
      $('[data-planning-schedule-for]').textContent = item.title; $('[data-planning-schedule-error]').hidden = true;
      // 09:00 today, or tomorrow once today's 09:00 has passed, so the default never lies in the past.
      const now = D.now(zone()), today = now.slice(0, 10);
      id('planningScheduleDate').value = now.slice(11) > '09:00' ? D.move(today, 'day', 1) : today; id('planningScheduleTime').value = '09:00';
      // Focus on a button, not on the date field, so phones do not open a picker on their own.
      dateDialog.showModal(); $('[data-planning-schedule-cancel]').focus();
    }
    async function load() {
      const serial = ++loadSerial; $('[data-planning-loading]').hidden = !!snapshot; $('.planningLoadError').hidden = true;
      try {
        const data = await request('/api/planning');
        if (serial !== loadSerial) return;
        if (!data || !['posts', 'brands', 'projects', 'media', 'channels'].every(key => Array.isArray(data[key])) || typeof data.publishing_enabled !== 'boolean') throw new Error('Die Daten sind unvollständig. Lade die Seite neu.');
        if (!snapshot) anchor = D.today(data.timezone);
        snapshot = data; catalogOptions(); render(); $('.planningLayout').hidden = mode === 'grid';
        $('[data-planning-new]').hidden = !canEdit(); $('[data-planning-readonly]').hidden = canEdit(); root.dataset.planningReady = 'true'; return true;
      } catch (error) { if (serial === loadSerial) { $('[data-planning-load-error]').textContent = `Kalender nicht geladen. ${error.message}`; $('.planningLoadError').hidden = false; } }
      finally { if (serial === loadSerial) $('[data-planning-loading]').hidden = true; }
    }
    function values() {
      const local = id('planningDate').value ? `${id('planningDate').value}T${id('planningTime').value || '09:00'}` : null;
      const channels = [...(instagramOn() ? ['instagram'] : []), ...[...root.querySelectorAll('[data-planning-channel]:checked')].map(el => el.dataset.planningChannel)];
      // An Instagram text from an older post stays; the composer only edits the texts of the note channels.
      const network_captions = {...current?.network_captions};
      for (const input of root.querySelectorAll('[data-planning-override]')) { if (input.value) network_captions[input.dataset.planningOverride] = input.value; else delete network_captions[input.dataset.planningOverride]; }
      // The zone comes from the settings, a doubled hour from their default unless the saved time stays as it was.
      return {title: id('planningTitle').value, brand_id: id('planningBrand').value || null, project_id: id('planningProject').value || null, media_id: id('planningFile').value || null, cover_id: coverId, caption: id('planningCaption').value, network_captions, channels, instagram: instagramValue(), scheduled_local: local, fold: current && local === current.scheduled_local ? current.fold : null};
    }
    const dirty = () => dialog.open && JSON.stringify(values()) !== baseline;
    const instagramOn = () => id('planningInstagramOn').checked;
    // Switching Instagram off keeps the details, so switching it on again restores them.
    const instagramValue = () => instagram && instagramOn() ? instagram.value() : current?.instagram ?? null;
    const versionsOf = data => data?.versions || [];
    function setInstagram(on) {
      id('planningInstagramDetails').open = on; id('planningInstagram').disabled = !on;
      id('planningInstagramDetails').querySelector('summary').setAttribute('aria-disabled', String(!on));
    }
    function fileOptions(data, selected) {
      const select = id('planningFile'), versions = versionsOf(data);
      select.replaceChildren(new Option('Keine Datei', ''));
      for (const [label, entries] of [['Freigegeben', versions.filter(entry => entry.status === 'approved')], ['Ohne Freigabe', versions.filter(entry => entry.status !== 'approved')], ['Exporte', data.exports || []]]) {
        if (!entries.length) continue;
        const group = document.createElement('optgroup'); group.label = label;
        group.append(...entries.map(entry => new Option(entry.name, entry.ref))); select.append(group);
      }
      if (selected && ![...select.options].some(option => option.value === selected)) select.add(new Option(data.exports ? 'Zugeordnete Datei fehlt' : 'Zugeordnete Datei', selected));
      select.value = selected;
    }
    function lockPlan() {
      const date = id('planningDate').value, channel = instagramOn() || !!root.querySelector('[data-planning-channel]:checked');
      const reason = !id('planningFile').value ? 'Zum Planen fehlt noch die Datei.' : !date ? 'Zum Planen fehlt noch der Termin.'
        : !channel ? 'Zum Planen fehlt ein Kanal: Instagram oder ein weiterer Kanal.'
        : `${date}T${id('planningTime').value || '09:00'}` < D.now(zone()) ? 'Der Termin liegt in der Vergangenheit.' : '';
      id('planningPlan').disabled = busy || !!reason; id('planningPlan').title = reason;
    }
    function preview() {
      id('planningPreviewTitle').textContent = id('planningTitle').value;
      const channel = id('planningPreviewChannel').value;
      id('planningPreviewCaption').textContent = root.querySelector(`[data-planning-override="${channel}"]`)?.value || id('planningCaption').value || 'Noch kein Beitragstext.';
      for (const row of root.querySelectorAll('[data-planning-channel-row]')) row.querySelector('textarea').hidden = !row.querySelector('input').checked;
      const file = id('planningFile').value;
      $('[data-planning-approval]').hidden = !instagramOn() || !file || !files || versionsOf(files).some(entry => entry.ref === file && entry.status === 'approved');
      // Instagram stays on without an account; the hint says why nothing posts yet.
      const brand = snapshot.brands.find(entry => entry.id === id('planningBrand').value), setup = $('[data-planning-ig-setup]');
      setup.hidden = !instagramOn() || brand?.has_instagram !== false;
      if (brand) setup.querySelector('span').textContent = `Für ${brand.name} ist noch kein Instagram-Konto eingerichtet. Klartext postet erst nach der Einrichtung in den Einstellungen.`;
      setup.querySelector('button').hidden = !canEdit();
      instagram?.refresh(); lockPlan();
    }
    const fileUrl = ref => ref.startsWith('version:') ? `/api/versions/${encodeURIComponent(ref.slice(8))}/file` : snapshot.media.find(item => item.id === ref)?.url;
    const kindOf = ref => [...versionsOf(files), ...(files?.exports || [])].find(entry => entry.ref === ref)?.kind;
    function updateMedia() {
      video.pause(); const ref = id('planningFile').value, url = ref && fileUrl(ref), image = !!url && kindOf(ref) === 'image', still = id('planningImage');
      video.hidden = !url || image; still.hidden = !image; id('planningPreviewEmpty').hidden = !!url || !!coverId;
      id('planningVideoError').hidden = true; id('planningFrame').disabled = busy || video.hidden;
      if (image) still.src = url; else still.removeAttribute('src');
      if (url && !image) { video.src = url; video.poster = coverId ? `/api/planning/covers/${encodeURIComponent(coverId)}` : ''; }
      else { video.removeAttribute('src'); video.load(); }
    }
    function setCover(value, url) {
      coverId = value; const image = id('planningCover'), thumbnail = id('planningCoverThumbnail'); image.hidden = !value; thumbnail.hidden = !value;
      if (value) { image.src = url || `/api/planning/covers/${encodeURIComponent(value)}`; thumbnail.src = image.src; } else { image.removeAttribute('src'); thumbnail.removeAttribute('src'); }
      video.poster = value ? image.src : ''; id('planningPreviewEmpty').hidden = !!value || !video.hidden || !id('planningImage').hidden;
    }
    function show(post, opener, catalog) {
      closeSheet(); current = post?.id ? post : null; taskId = current ? null : post?.task_id || null; files = null; const serial = ++opened;
      trigger = opener || trigger || $('[data-planning-new]'); coverGeneration++;
      // A new post posts on Instagram; without an account a hint leads to the settings.
      const value = {title: 'Neuer Beitrag', brand_id: id('planningBrandFilter').value || null, project_id: id('planningProjectFilter').value || null, media_id: null, caption: '', network_captions: {}, channels: ['instagram'], scheduled_local: null, timezone: zone() || 'Europe/Berlin', ...post};
      id('planningComposerTitle').textContent = current ? 'Beitrag bearbeiten' : 'Beitrag planen';
      options(id('planningBrand'), snapshot.brands, 'Keine Firma', value.brand_id || ''); options(id('planningProject'), snapshot.projects, 'Kein Projekt', value.project_id || '');
      fileOptions({}, value.media_id || '');
      id('planningTitle').value = value.title; id('planningCaption').value = value.caption;
      id('planningDate').value = value.scheduled_local?.slice(0, 10) || ''; id('planningTime').value = value.scheduled_local?.slice(11) || '';
      id('planningInstagramOn').checked = value.channels.includes('instagram');
      const channels = $('[data-planning-channels]'); channels.replaceChildren();
      for (const channel of snapshot.channels.filter(entry => entry.id !== 'instagram')) {
        const row = node('div', 'planningChannelRow'); row.dataset.planningChannelRow = channel.id;
        const label = node('label', 'planningChannelCheck check'); const check = node('input'); check.type = 'checkbox'; check.dataset.planningChannel = channel.id; check.checked = value.channels.includes(channel.id); label.append(check, document.createTextNode(channel.name));
        const field = node('div', 'field'), input = node('textarea'); input.rows = 2; input.maxLength = 20000; input.dataset.planningOverride = channel.id; input.value = value.network_captions[channel.id] || ''; input.placeholder = 'Optional: abweichender Text'; input.setAttribute('aria-label', `Abweichender Text für ${channel.name}`); field.append(input); row.append(label, field); channels.append(row);
      }
      options(id('planningPreviewChannel'), snapshot.channels, undefined, value.channels[0] || snapshot.channels[0]?.id || '');
      const loading = catalog || catalogFor(current ? `?post_id=${encodeURIComponent(current.id)}` : '');
      instagram = window.KlartextInstagram?.editor(id('planningInstagram'), value, snapshot, {head: $('[data-planning-ig-head]'), catalog: loading, file: () => id('planningFile').value || null}) || null;
      setInstagram(instagramOn());
      for (const details of root.querySelectorAll('[data-planning-more],[data-planning-cover]')) details.open = false;
      $('[data-planning-zone]').textContent = `Zeitzone ${value.timezone}, änderbar in den Einstellungen`;
      id('planningCoverFile').value = ''; setCover(value.cover_id || null); updateMedia(); preview();
      id('planningError').textContent = ''; id('planningSaveStatus').textContent = ''; id('planningReload').hidden = true;
      for (const name of ['planningDuplicate', 'planningUnplan', 'planningDelete']) id(name).hidden = !current;
      $('[data-planning-mark-posted]').hidden = !(current?.status === 'planned' && !current.channels.includes('instagram'));
      id('planningDraft').textContent = current?.status === 'planned' ? 'Als Entwurf speichern' : 'Entwurf speichern';
      id('planningUnplan').disabled = !value.scheduled_local; baseline = JSON.stringify(values());
      $('.planningFooterActions').hidden = !canEdit();
      if (!canEdit()) for (const control of form.querySelectorAll('input,select,textarea,button')) if (control.id !== 'planningClose') control.disabled = true;
      if (!dialog.open) dialog.showModal(); id('planningClose').focus(); $('.planningComposerBody').scrollTop = 0;
      loading.then(data => {
        if (serial !== opened || !dialog.open) return; files = data; fileOptions(data, id('planningFile').value); preview();
        if (kindOf(id('planningFile').value) === 'image') updateMedia();  // the catalog knows the kind, the first look did not
      });
    }
    function close(force = false, restore = true) {
      if (!dialog.open) return true;
      if (busy) return false;
      if (!force && dirty()) return false;
      coverGeneration++; video.pause(); dialog.close();
      if (restore && active()) {
        const replacement = current && [...root.querySelectorAll('[data-planning-post]')].find(el => el.dataset.planningPost === current.id);
        // Below 1101 px the opener may sit in the closed sheet; then „Ablage“ takes the focus.
        // „Neuer Beitrag“ hidden behind its topbar copy still counts, the shell hands its focus to the copy.
        const newPost = $('[data-planning-new]'), shown = node => node?.isConnected && (node.getClientRects().length || node === newPost && !node.hidden);
        ([trigger, replacement].find(shown) || (folded() ? trayOpen : newPost)).focus();
      }
      return true;
    }
    // Closes the composer; unsaved changes go only after the Klartext question. Resolves true once it is closed.
    async function closeAsking(restore = true) {
      if (close(false, restore)) return true;
      if (busy || await window.KlartextConfirm.ask({title: 'Änderungen verwerfen?', text: 'Deine ungespeicherten Änderungen an diesem Beitrag gehen verloren.', confirm: 'Verwerfen'}) !== 'confirm') return false;
      return close(true, restore);
    }
    function setBusy(value, message = '') {
      busy = value; form.setAttribute('aria-busy', String(value)); id('planningSaveStatus').textContent = message;
      for (const control of form.querySelectorAll('button,input,select,textarea')) control.disabled = value;
      if (!value) { id('planningFrame').disabled = video.hidden; id('planningUnplan').disabled = !current?.scheduled_local; lockPlan(); }
    }
    function adopt(post) {
      const index = snapshot.posts.findIndex(entry => entry.id === post.id);
      if (index >= 0) snapshot.posts[index] = post; else snapshot.posts.push(post);
      render();
    }
    async function mutate(kind) {
      if (busy || !snapshot) return;
      const saving = kind === 'draft' || kind === 'plan';
      if (saving && !form.reportValidity()) return;
      if (!saving && !current) return;
      if (kind === 'delete' && await window.KlartextConfirm.ask({title: current.title ? `Beitrag „${current.title}“ löschen?` : 'Beitrag löschen?', text: 'Videos und Titelbild bleiben erhalten.', confirm: 'Beitrag löschen'}) !== 'confirm') return;
      if (kind === 'duplicate' && dirty()) { id('planningError').textContent = 'Änderungen zuerst speichern. Dupliziert wird der gespeicherte Beitrag.'; return; }
      setBusy(true, 'Wird gespeichert …'); id('planningError').textContent = ''; id('planningReload').hidden = true;
      try {
        let result;
        const url = current ? `/api/planning/posts/${encodeURIComponent(current.id)}` : '/api/planning/posts';
        // The post only comes into being here; a post planned from a task is linked to it by the server.
        if (saving) result = await request(url, current ? 'PATCH' : 'POST', {...values(), status: kind === 'plan' ? 'planned' : 'draft', ...(current ? {revision: current.revision} : taskId ? {task_id: taskId} : {})});
        else if (kind === 'duplicate') result = await request(`${url}/duplicate`, 'POST', {revision: current.revision});
        else if (kind === 'unplan') result = await request(url, 'PATCH', {...values(), revision: current.revision, scheduled_local: null, fold: null, status: 'draft'});
        else if (kind === 'posted') result = await request(url, 'PATCH', {...values(), revision: current.revision, status: 'posted'});
        else { await request(url, 'DELETE', {revision: current.revision}); snapshot.posts = snapshot.posts.filter(post => post.id !== current.id); render(); }
        if (result) adopt(result);
        // Ablage, calendar and counter come from one answer, so every change reloads the snapshot.
        await load();
        setBusy(false, 'Gespeichert');
        if (saving) window.KlartextToast?.show(result.status === 'planned' ? `Geplant für ${when(result.scheduled_local)}` : 'Entwurf gespeichert');
        window.dispatchEvent(new CustomEvent('klartext:tasks-changed'));
        if (kind === 'duplicate') show(result, trigger); else close(true);
      } catch (error) {
        // A new post meets 409 when its task already has a post; the server's sentence says so, reloading shows that post.
        id('planningError').textContent = error.status === 409 && current ? 'Der Beitrag wurde inzwischen geändert. Deine Eingaben bleiben erhalten. Kopier den Text bei Bedarf, bevor du neu lädst.' : error.message;
        id('planningReload').hidden = error.status !== 409; setBusy(false, 'Nicht gespeichert');
      }
    }
    async function upload(blob, filename) {
      const generation = coverGeneration; setBusy(true, 'Titelbild wird gespeichert …'); id('planningError').textContent = '';
      try { const data = new FormData(); data.append('file', blob, filename); const result = await request('/api/planning/covers', 'POST', data); if (generation === coverGeneration && dialog.open) setCover(result.id, result.url); setBusy(false, 'Titelbild bereit · Beitrag noch speichern'); }
      catch (error) { id('planningError').textContent = `Titelbild nicht gespeichert. ${error.message}`; setBusy(false, 'Nicht gespeichert'); }
    }
    async function fileCover() {
      const file = id('planningCoverFile').files[0]; if (!file || busy) return;
      if (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { id('planningError').textContent = 'Wähl ein PNG-, JPEG- oder WebP-Bild bis 5 MB.'; return; }
      setBusy(true, 'Bild wird geprüft …');
      try { const image = await createImageBitmap(file); image.close(); } catch { id('planningError').textContent = 'Dieses Bild lässt sich nicht öffnen. Wähl ein anderes.'; setBusy(false, 'Nicht gespeichert'); return; }
      await upload(file, file.name);
    }
    async function frameCover() {
      if (busy || video.hidden) return;
      if (video.readyState < 2 || !video.videoWidth) { id('planningError').textContent = 'Das Video lädt noch. Versuch es gleich noch mal.'; return; }
      setBusy(true, 'Standbild wird vorbereitet …');
      try {
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
        if (!blob) throw new Error('Das Standbild ließ sich nicht lesen. Versuch es noch mal.');
        if (blob.size > 5 * 1024 * 1024) throw new Error('Das Standbild ist größer als 5 MB. Wähl ein eigenes Bild.');
        await upload(blob, 'video-frame.jpg');
      } catch (error) { id('planningError').textContent = error.message; setBusy(false, 'Nicht gespeichert'); }
    }
    root.addEventListener('click', event => {
      const schedule = event.target.closest('[data-planning-schedule]'); if (schedule) { openSchedule(schedule.dataset.planningSchedule); return; }
      const card = event.target.closest('[data-planning-post]'); if (card) { show(snapshot.posts.find(post => post.id === card.dataset.planningPost), card); return; }
      const date = event.target.closest('[data-new-on-day]'); if (date) { show({scheduled_local: `${date.dataset.newOnDay}T09:00`}, date); return; }
      const choice = event.target.closest('[data-planning-view]'); if (choice) setView(choice.dataset.planningView);
    });
    $('[data-planning-new]').addEventListener('click', event => { if (snapshot) show(null, event.currentTarget); });
    trayOpen.addEventListener('click', () => { const open = sheet.hidden; sheet.hidden = !open; trayOpen.setAttribute('aria-expanded', String(open)); if (open) sheet.querySelector('button')?.focus(); });
    document.addEventListener('click', event => { if (!sheet.hidden && !sheet.contains(event.target) && !trayOpen.contains(event.target)) closeSheet(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !sheet.hidden) { closeSheet(); trayOpen.focus(); } });
    for (const query of [small, narrow]) query.addEventListener('change', () => { closeSheet(); render(); });
    $('[data-planning-schedule-cancel]').addEventListener('click', () => dateDialog.close());
    // Below 1101 px the opener sits in the closed sheet, so the focus goes back to the Ablage button.
    dateDialog.addEventListener('close', () => { if (folded() && !dialog.open) trayOpen.focus(); });
    $('[data-planning-filters-toggle]').addEventListener('click', event => {
      const open = event.currentTarget.getAttribute('aria-expanded') !== 'true';
      event.currentTarget.setAttribute('aria-expanded', String(open)); $('.planningHeading').dataset.filters = open ? 'open' : 'closed';
    });
    $('[data-planning-ig-setup] button').addEventListener('click', () => window.KlartextEditor?.setWorkspace('settings'));
    $('[data-planning-schedule-form]').addEventListener('submit', async event => {
      event.preventDefault(); if (!scheduling || busy) return;
      const local = `${id('planningScheduleDate').value}T${id('planningScheduleTime').value || '09:00'}`, error = $('[data-planning-schedule-error]');
      // A task gets its post only from the composer; a draft just takes the date.
      if (scheduling.kind === 'task') { dateDialog.close(); await composeRequest({task_id: scheduling.id, date: local}); return; }
      const post = snapshot.posts.find(entry => entry.id === scheduling.id); if (!post) { dateDialog.close(); return; }
      busy = true; error.hidden = true;
      try { adopt(await request(`/api/planning/posts/${encodeURIComponent(post.id)}`, 'PATCH', {revision: post.revision, scheduled_local: local, fold: null})); load(); dateDialog.close(); window.KlartextToast?.show(`Termin gesetzt für ${when(local)}`); }
      catch (failure) { error.textContent = failure.message; error.hidden = false; }
      finally { busy = false; }
    });
    function setMode(value) {
      mode = value; closeSheet();
      for (const el of root.querySelectorAll('.planningCalendarOnly')) el.hidden = mode === 'grid';
      for (const el of root.querySelectorAll('[data-planning-mode]')) el.setAttribute('aria-pressed', String(el.dataset.planningMode === mode));
      $('.planningLayout').hidden = mode === 'grid' || !snapshot; $('[data-ig-grid-view]').hidden = mode !== 'grid';
      if (mode === 'grid' && snapshot) {
        if (gridView) gridView.reload();
        else gridView = window.KlartextInstagram?.grid($('[data-ig-grid-view]'), snapshot, {
          open: postId => { const post = snapshot.posts.find(entry => entry.id === postId); if (post) show(post); },
          changed: () => load()}) || null;
      }
    }
    for (const el of root.querySelectorAll('[data-planning-mode]')) el.addEventListener('click', () => setMode(el.dataset.planningMode));
    $('[data-planning-retry]').addEventListener('click', load);
    for (const name of ['planningBrandFilter', 'planningProjectFilter']) id(name).addEventListener('change', render);
    $('[data-planning-today]').addEventListener('click', () => { anchor = D.today(zone()); render(); });
    for (const [selector, direction] of [['[data-planning-prev]', -1], ['[data-planning-next]', 1]]) $(selector).addEventListener('click', () => { anchor = D.move(anchor, phone() ? 'week' : view, direction); render(); });
    // Saving is always one of the two buttons, never Enter in a field.
    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', preview); form.addEventListener('change', preview);
    id('planningFile').addEventListener('change', updateMedia);
    id('planningInstagramOn').addEventListener('change', () => setInstagram(instagramOn()));
    id('planningInstagramDetails').querySelector('summary').addEventListener('click', event => { if (!instagramOn()) event.preventDefault(); });
    id('planningDate').addEventListener('change', () => { if (id('planningDate').value && !id('planningTime').value) id('planningTime').value = '09:00'; });
    id('planningClose').addEventListener('click', () => closeAsking()); dialog.addEventListener('cancel', event => { event.preventDefault(); closeAsking(); });
    for (const [name, kind] of [['planningDuplicate', 'duplicate'], ['planningUnplan', 'unplan'], ['planningDelete', 'delete'], ['planningDraft', 'draft'], ['planningPlan', 'plan']]) id(name).addEventListener('click', () => mutate(kind));
    $('[data-planning-mark-posted]').addEventListener('click', () => mutate('posted'));
    id('planningCoverFile').addEventListener('change', fileCover); id('planningFrame').addEventListener('click', frameCover); id('planningClearCover').addEventListener('click', () => { if (!busy) setCover(null); });
    id('planningReload').addEventListener('click', async () => {
      if (await window.KlartextConfirm.ask({title: 'Aktuellen Stand laden?', text: 'Deine ungespeicherten Änderungen gehen dabei verloren.', confirm: 'Neu laden'}) !== 'confirm') return;
      const postId = current?.id;
      setBusy(true, 'Aktueller Stand wird geladen …');
      const loaded = await load(); setBusy(false);
      if (!loaded) { id('planningError').textContent = 'Aktueller Stand nicht geladen. Deine Eingaben bleiben erhalten, versuch es noch mal.'; return; }
      if (postId) { const post = snapshot?.posts.find(entry => entry.id === postId); if (post) show(post, trigger); else { id('planningError').textContent = 'Der Beitrag wurde gelöscht. Deine Eingaben sind weiterhin vorhanden und können kopiert werden.'; } }
    });
    video.addEventListener('error', () => { if (video.hasAttribute('src')) id('planningVideoError').hidden = false; });
    root.addEventListener('dragstart', event => {
      if (!event.dataTransfer || busy) return;
      const task = event.target.closest('[data-planning-tray-task]'); if (task) { event.dataTransfer.setData('application/x-klartext-task', task.dataset.planningTrayTask); event.dataTransfer.effectAllowed = 'copy'; return; }
      const card = event.target.closest('[data-planning-post]'); if (card) { event.dataTransfer.setData('application/x-klartext-planning', card.dataset.planningPost); event.dataTransfer.effectAllowed = 'move'; }
    });
    root.addEventListener('dragover', event => { if (event.target.closest('[data-planning-date]') && ['application/x-klartext-planning', 'application/x-klartext-task'].some(type => event.dataTransfer?.types.includes(type))) event.preventDefault(); });
    root.addEventListener('drop', async event => {
      const day = event.target.closest('[data-planning-date]'), postId = event.dataTransfer?.getData('application/x-klartext-planning'), taskId = event.dataTransfer?.getData('application/x-klartext-task');
      if (!day || !(postId || taskId) || busy || !canEdit() || phone()) return; event.preventDefault();
      // A task opens the prefilled composer; its post comes into being only when a button there saves.
      if (taskId) { await composeRequest({task_id: taskId, date: day.dataset.planningDate}); return; }
      const post = snapshot.posts.find(entry => entry.id === postId); if (!post) return;
      busy = true;
      try { adopt(await request(`/api/planning/posts/${encodeURIComponent(post.id)}`, 'PATCH', {revision: post.revision, scheduled_local: `${day.dataset.planningDate}T${post.scheduled_local?.slice(11) || '09:00'}`, fold: null})); load(); }
      catch (error) { busy = false; show(post, $('[data-planning-new]')); id('planningError').textContent = `Verschieben fehlgeschlagen: ${error.message} Der bisherige Stand bleibt erhalten.`; id('planningReload').hidden = error.status !== 409; }
      finally { busy = false; }
    });
    const isTextEntry = target => target.closest('textarea,[contenteditable="true"],input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="range"])');
    function videoIsVisible() {
      if (!dialog.open || video.hidden || !video.getClientRects().length || getComputedStyle(video).visibility !== 'visible') return false;
      const frame = video.getBoundingClientRect(), clip = $('.planningComposerBody').getBoundingClientRect(), bounds = dialog.getBoundingClientRect();
      return Math.max(frame.left, clip.left, bounds.left, 0) < Math.min(frame.right, clip.right, bounds.right, document.documentElement.clientWidth) &&
        Math.max(frame.top, clip.top, bounds.top, 0) < Math.min(frame.bottom, clip.bottom, bounds.bottom, window.innerHeight);
    }
    root.addEventListener('keydown', event => {
      const checkbox = event.target.closest('[data-planning-channel],#planningInstagramOn');
      if (checkbox && event.key === 'Enter') { event.preventDefault(); checkbox.click(); }
      const file = event.target.closest('#planningCoverFile');
      if (file && event.key === 'Enter') { event.preventDefault(); file.click(); }
    });
    document.addEventListener('keydown', event => {
      if (!active() || event.isComposing || (event.code !== 'Space' && event.key !== ' ') || isTextEntry(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat && videoIsVisible()) { if (video.paused) video.play().catch(() => { id('planningVideoError').hidden = false; }); else video.pause(); }
    }, true);
    document.addEventListener('keyup', event => { if (active() && (event.code === 'Space' || event.key === ' ') && !isTextEntry(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    document.addEventListener('click', event => { const route = event.target.closest('[data-workspace],[data-shell-route]'); if (active() && route && dialog.open && !close(false, false)) { event.preventDefault(); event.stopImmediatePropagation(); closeAsking(false).then(closed => { if (closed) route.click(); }); } }, true);
    window.addEventListener('beforeunload', event => { if (dirty() || busy) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('klartext:workspace-change', event => {
      if (event.detail?.name === 'planning') { if (!dialog.open && !busy) load(); }
      else { video.pause(); closeSheet(); if (dialog.open && !close(false, false)) { window.KlartextEditor?.setWorkspace('planning'); closeAsking(false).then(closed => { if (closed) window.KlartextEditor?.setWorkspace(event.detail.name); }); } }
    });
    // The Projekte page opens one saved post directly in this editor.
    openPostRequest = async postId => {
      window.KlartextEditor?.setWorkspace('planning');
      const post = await load() && snapshot.posts.find(entry => entry.id === postId);
      if (!post) return false;
      show(post); return true;
    };
    // The task panel opens the composer prefilled; nothing is stored until a button saves.
    composeRequest = async (prefill = {}) => {
      window.KlartextEditor?.setWorkspace('planning');
      if (!await load() || !canEdit() || (dialog.open && !await closeAsking())) return false;
      let defaults = {}, linked = null;
      if (prefill.task_id) {
        const workspace = await request('/api/workspace').catch(() => null);
        const task = workspace?.tasks?.find(entry => entry.id === prefill.task_id);
        if (!task) { window.KlartextToast?.show('Aufgabe nicht gefunden. Lade die Seite neu.'); return false; }
        // One task, one open post: a planned post first, then a draft; only without one a new post comes into being.
        const own = status => snapshot.posts.find(post => task.posts.includes(post.id) && post.status === status);
        linked = own('planned') || own('draft');
        if (linked && (linked.status === 'planned' || linked.media_id)) { show(linked); return true; }
        const captions = !linked && task.media[0] ? await request(`/api/jobs/${encodeURIComponent(task.media[0])}/captions`).catch(() => null) : null;
        defaults = {title: task.title, project_id: task.project_id, brand_id: workspace.projects.find(entry => entry.id === task.project_id)?.brand_id || null, caption: captions?.variants?.[0]?.text || undefined};
      }
      const value = {...defined(defaults), ...defined(prefill)};
      const catalog = await catalogFor(value.task_id ? `?task_id=${encodeURIComponent(value.task_id)}` : '');
      // Versions come approved first, each group newest first.
      const file = value.file ?? (value.task_id ? (versionsOf(catalog)[0] || catalog.exports?.[0])?.ref : null) ?? null;
      // A draft without a file takes the task's file, unsaved, as if chosen here.
      if (linked) { show({...linked, media_id: file}, undefined, Promise.resolve(catalog)); return true; }
      const scheduled = value.date ? (value.date.length > 10 ? value.date : `${value.date}T09:00`) : null;
      show(defined({task_id: value.task_id, title: value.title, brand_id: value.brand_id, project_id: value.project_id, caption: value.caption,
        media_id: file, scheduled_local: scheduled}), undefined, Promise.resolve(catalog));
      return true;
    };
    if (active()) load();
  }
  let openPostRequest = async () => false, composeRequest = async () => false;
  window.KlartextPlanning = Object.freeze({mount, openPost: postId => openPostRequest(postId), compose: prefill => composeRequest(prefill)});
})();
