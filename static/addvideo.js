/* Dialog Video hinzufügen: Datei, Aufgabe und Transkription in einem Aufruf (POST /api/videos). Geöffnet von Heute, Studio-Topbar, Aufgaben und Aufgabenpanel. */
(() => {
  'use strict';
  const LANGUAGES = [['auto', 'Automatisch erkennen'], ['de', 'Deutsch'], ['en', 'Englisch'], ['fr', 'Französisch'], ['es', 'Spanisch'], ['it', 'Italienisch'], ['nl', 'Niederländisch'], ['pl', 'Polnisch'], ['pt', 'Portugiesisch'], ['tr', 'Türkisch']];
  // The same four qualities with the same ids as the studio and the settings (B5).
  const MODELS = [['tiny', 'Schnell'], ['base', 'Kompakt'], ['small', 'Ausgewogen'], ['medium', 'Gründlich']];
  const NO_FILE = 'Noch keine Datei gewählt.';
  async function request(url, options = {}) {
    const response = await KlartextRequest.send(url, {...options, headers: {Accept: 'application/json', ...options.headers}});
    let body = null; try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : KlartextRequest.failed(options.method, '', response.status));
    return body;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'addVideoDialog'; dialog.className = 'dlg addVideoDialog'; dialog.tabIndex = -1; dialog.setAttribute('aria-labelledby', 'addVideoHeading');
  dialog.innerHTML = `<form class="addVideoForm" data-addvideo-form novalidate>
    <header class="addVideoHead"><h2 id="addVideoHeading">Video hinzufügen</h2><button type="button" class="btn isQuiet isIcon" data-addvideo-close aria-label="Schließen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header>
    <label class="addVideoDrop" data-addvideo-drop for="addVideoFile"><input id="addVideoFile" class="addVideoFile" type="file" accept=".mp4,.mov,.webm,.mp3,.wav,.m4a"><strong>Video hier ablegen oder auswählen</strong><span class="status" data-addvideo-filename>${NO_FILE}</span></label>
    <div class="field"><label for="addVideoTitle">Titel</label><input id="addVideoTitle" maxlength="200" autocomplete="off"></div>
    <div class="addVideoColumns" data-addvideo-project-rows>
      <div class="field"><label for="addVideoBrand">Firma</label><select id="addVideoBrand"><option value="">Firma wählen</option></select></div>
      <div class="field"><label for="addVideoProject">Projekt</label><select id="addVideoProject"></select></div>
    </div>
    <div class="field" data-addvideo-project-name hidden><label for="addVideoProjectName">Name des neuen Projekts</label><input id="addVideoProjectName" maxlength="100" autocomplete="off"></div>
    <div class="addVideoColumns">
      <div class="field"><label for="addVideoLanguage">Sprache</label><select id="addVideoLanguage"></select></div>
      <div class="field"><label for="addVideoModel">Qualität</label><select id="addVideoModel"></select></div>
    </div>
    <details class="addVideoSpeaker" data-addvideo-speaker><summary>Sprecher</summary><div class="field"><label for="addVideoSpeaker">Sprecherprofil</label><select id="addVideoSpeaker"><option value="">Ohne Sprecherprofil</option></select></div></details>
    <div class="addVideoTask"><label class="addVideoCheck check" data-addvideo-task-row for="addVideoTask"><input id="addVideoTask" type="checkbox" checked>Aufgabe anlegen</label>
    <p class="status" data-addvideo-task-note role="status"></p></div>
    <p class="status isError" data-addvideo-error role="alert"></p>
    <progress class="addVideoProgress" data-addvideo-progress max="100" value="0" hidden></progress>
    <div class="dlgActions"><button type="button" class="btn" data-addvideo-cancel>Abbrechen</button><button type="submit" class="btn isPrimary" data-addvideo-submit disabled>Video hinzufügen</button></div>
  </form>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const file = $('#addVideoFile'), title = $('#addVideoTitle'), brand = $('#addVideoBrand'), project = $('#addVideoProject'), projectName = $('#addVideoProjectName');
  const language = $('#addVideoLanguage'), model = $('#addVideoModel'), speaker = $('#addVideoSpeaker'), taskBox = $('#addVideoTask');
  const submit = $('[data-addvideo-submit]'), progress = $('[data-addvideo-progress]'), error = $('[data-addvideo-error]'), drop = $('[data-addvideo-drop]');
  language.replaceChildren(...LANGUAGES.map(([value, text]) => new Option(text, value)));
  model.replaceChildren(...MODELS.map(([value, text]) => new Option(text, value)));
  let brands = [], projects = [], task = null, titleTyped = false, serial = 0;

  function sync() {
    const isNew = project.value === '__new';
    $('[data-addvideo-project-name]').hidden = !isNew;
    const needsProject = taskBox.checked && !task;
    const projectOk = isNew ? projectName.value.trim() !== '' : project.value !== '';
    submit.disabled = !file.files.length || (needsProject && !projectOk) || (isNew && !projectName.value.trim());
    // A locked button says why (spec 4.8 point 8): first the video, then the project, then what happens.
    $('[data-addvideo-task-note]').textContent = !file.files.length ? 'Wähl zuerst ein Video.'
      : needsProject && !projectOk ? (isNew ? 'Gib dem neuen Projekt einen Namen.' : 'Wähl ein Projekt oder leg mit „Neues Projekt …“ eins an.')
      : !task ? 'Legt eine Aufgabe auf Stufe Neu an und öffnet sie.' : task.number ? `Wird an Aufgabe #${task.number} angehängt.` : 'Wird an die Aufgabe angehängt.';
  }
  // Projects of the chosen company plus projects without a known company; archived ones never.
  function projectOptions() {
    const known = new Set(brands.map(entry => entry.id)), current = project.value;
    const list = projects.filter(entry => !entry.archived && (!brand.value || entry.brand_id === brand.value || !known.has(entry.brand_id)));
    project.replaceChildren(new Option('Projekt wählen', ''), ...list.map(entry => new Option(entry.name, entry.id)), new Option('Neues Projekt …', '__new'));
    project.value = current;
    if (project.value !== current) project.value = '';
  }
  function selectProject(id) {
    const chosen = projects.find(entry => entry.id === id);
    if (chosen && brands.some(entry => entry.id === chosen.brand_id)) brand.value = chosen.brand_id;
    projectOptions();
    if (chosen) project.value = id;
    sync();
  }
  function reset(options) {
    task = options.task_id ? {id: options.task_id, number: null} : null;
    titleTyped = false; file.value = ''; title.value = ''; projectName.value = ''; error.textContent = ''; progress.hidden = true; progress.value = 0;
    $('[data-addvideo-filename]').textContent = NO_FILE;
    taskBox.checked = true; brand.replaceChildren(new Option('Firma wählen', '')); project.replaceChildren(); speaker.value = '';
    $('details[data-addvideo-speaker]').open = false;
    $('[data-addvideo-project-rows]').hidden = !!task; $('[data-addvideo-task-row]').hidden = !!task;
    sync();
  }
  async function open(options = {}) {
    reset(options);
    delete dialog.dataset.addvideoReady;
    if (!dialog.open) dialog.showModal();
    dialog.focus(); // Spec 4.3: kein Autofokus auf Textfelder beim Öffnen.
    const run = ++serial;
    const [brandList, library, speakers, settings, workspace] = await Promise.allSettled([request('/api/brands'), request('/api/library'), request('/api/speakers'), request('/api/settings'), task ? request('/api/workspace') : null]);
    if (run !== serial || !dialog.open) return;
    brands = brandList.status === 'fulfilled' ? brandList.value : [];
    projects = library.status === 'fulfilled' ? library.value.folders : [];
    brand.replaceChildren(new Option('Firma wählen', ''), ...brands.map(entry => new Option(entry.name, entry.id)));
    speaker.replaceChildren(new Option('Ohne Sprecherprofil', ''), ...(speakers.status === 'fulfilled' ? speakers.value : []).map(entry => new Option(entry.name, entry.id)));
    // Team members get 403 on the settings; the quality then stays Ausgewogen.
    const preset = settings.status === 'fulfilled' ? settings.value?.transcription_model : '';
    model.value = MODELS.some(([value]) => value === preset) ? preset : 'small';
    language.value = 'de';
    const found = task && workspace.status === 'fulfilled' ? (workspace.value.tasks || []).find(entry => entry.id === task.id) : null;
    if (found) task = {id: found.id, number: found.number};
    if (brands.some(entry => entry.id === options.brand_id)) brand.value = options.brand_id;
    selectProject(options.project_id || '');
    dialog.dataset.addvideoReady = 'true';
  }

  function upload(form) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/videos'); xhr.setRequestHeader('X-Klartext', '1'); xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.addEventListener('progress', event => { if (event.lengthComputable) { progress.max = event.total; progress.value = event.loaded; } });
      xhr.addEventListener('load', () => {
        let body = null; try { body = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && body?.job) resolve(body);
        else reject(new Error(typeof body?.detail === 'string' ? body.detail : 'Das Video konnte nicht angelegt werden.'));
      });
      xhr.addEventListener('error', () => reject(new Error(KlartextRequest.failed('POST'))));
      xhr.send(form);
    });
  }
  async function createFolder() {
    const folder = await request('/api/library/folders', {method: 'POST', headers: {'X-Klartext': '1', 'Content-Type': 'application/json'}, body: JSON.stringify({name: projectName.value.trim(), brand_id: brand.value || null})});
    if (!folder?.id) throw new Error('Das Projekt konnte nicht angelegt werden.');
    // Keep the new project selected so a retry after a failed upload sends its id instead of creating it again.
    projects.push(folder); selectProject(folder.id); submit.disabled = true;
    return folder.id;
  }
  $('[data-addvideo-form]').addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true; error.textContent = ''; progress.hidden = false; progress.value = 0;
    try {
      const projectId = task ? '' : project.value === '__new' ? await createFolder() : project.value;
      const form = new FormData();
      form.append('file', file.files[0]); form.append('title', title.value.trim()); form.append('project_id', projectId);
      form.append('task_id', task?.id || ''); form.append('create_task', !task && taskBox.checked ? '1' : '0');
      form.append('language', language.value); form.append('model', model.value); form.append('speaker_id', speaker.value);
      const result = await upload(form);
      dialog.close();
      window.KlartextLibrary?.refresh(result.job.id);
      window.dispatchEvent(new CustomEvent('klartext:tasks-changed'));
      if (!result.task) window.openKlartextJob?.(result.job.id);
      else if (window.KlartextTasks?.open) window.KlartextTasks.open(result.task.id);
      else { window.KlartextEditor?.setWorkspace('projects'); window.dispatchEvent(new CustomEvent('klartext:open-task', {detail: {id: result.task.id}})); }
    } catch (failure) { error.textContent = failure.message; progress.hidden = true; sync(); }
  });
  file.addEventListener('change', () => {
    const chosen = file.files[0];
    $('[data-addvideo-filename]').textContent = chosen ? chosen.name : NO_FILE;
    if (chosen && !titleTyped) title.value = chosen.name.replace(/\.[^.]+$/, '');
    sync();
  });
  for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add('isDragging'); });
  for (const name of ['dragleave', 'drop']) drop.addEventListener(name, () => drop.classList.remove('isDragging'));
  drop.addEventListener('drop', event => { event.preventDefault(); if (event.dataTransfer?.files?.length) { file.files = event.dataTransfer.files; file.dispatchEvent(new Event('change')); } });
  title.addEventListener('input', () => { titleTyped = title.value.trim() !== ''; });
  brand.addEventListener('change', () => { projectOptions(); sync(); });
  project.addEventListener('change', () => selectProject(project.value));
  projectName.addEventListener('input', sync);
  taskBox.addEventListener('change', sync);
  for (const close of dialog.querySelectorAll('[data-addvideo-cancel],[data-addvideo-close]')) close.addEventListener('click', () => dialog.close());

  window.KlartextAddVideo = Object.freeze({open, close: () => dialog.close()});
})();
