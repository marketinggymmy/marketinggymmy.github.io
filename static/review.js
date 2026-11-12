/* Freigaben: versions, timecoded comments and approvals for Dominik and his bosses. Names, not accounts. */
(() => {
  'use strict';
  const statusLabel = status => window.KlartextStage.statusLabel(status);
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function button(text, attrs = {}, className = '') { const node = el('button', className, text); node.type = 'button'; for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; }
  async function request(url, method = 'GET', body) {
    const multipart = body instanceof FormData;
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body && !multipart ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: multipart ? body : JSON.stringify(body)} : {})}, 'Freigaben');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Freigaben', response.status)); }
    if (!response.ok) { const error = new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Freigaben', response.status)); error.status = response.status; throw error; }
    return data;
  }
  const germanDate = iso => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'}); };
  const state = {reviews: null, workspace: null};
  const view = {root: null};

  function newestPerTask(reviews = state.reviews) {
    const newest = new Map();
    for (const version of reviews.versions) if (!newest.has(version.task_id) || newest.get(version.task_id).number < version.number) newest.set(version.task_id, version);
    return [...newest.values()];
  }
  // What waits on whom: reviewers judge versions in review, Dominik also sends open ones, the team reworks open and changed ones.
  const GROUPS = {owner: {waiting: ['in_review', 'open'], working: ['changes']}, team: {waiting: ['open', 'changes'], working: ['in_review']},
    reviewer: {waiting: ['in_review'], working: ['open', 'changes']}};
  const role = (reviews = state.reviews) => reviews?.me?.role || document.body.dataset.role || 'owner';
  const plan = (reviews = state.reviews) => GROUPS[role(reviews)] || GROUPS.reviewer;
  // One count for the badge, this page and the Heute tile: the newest version per task that waits on this role.
  function waiting(reviews = state.reviews) { return reviews ? newestPerTask(reviews).filter(version => plan(reviews).waiting.includes(version.status)) : []; }
  // The badge sits on the sidebar point and on the phone tab bar.
  function updateBadge() {
    const count = waiting().length;
    for (const nav of document.querySelectorAll('[data-workspace="review"], .tabBar [data-shell-route="review"]')) {
      let badge = nav.querySelector('[data-review-badge]');
      if (!badge) { badge = el('span', 'reviewBadge'); badge.dataset.reviewBadge = ''; nav.append(badge); }
      const said = `${count} ${count === 1 ? 'Version wartet' : 'Versionen warten'} auf dich`;
      badge.textContent = String(count); badge.hidden = !count; badge.setAttribute('aria-label', said);
      // The sidebar point's own aria-label hides the badge, so it carries the number itself.
      if (nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', count ? `Freigaben, ${said}` : 'Freigaben');
    }
  }
  function context(version) {
    const task = state.workspace?.tasks.find(entry => entry.id === version.task_id);
    const project = state.workspace?.projects.find(entry => entry.id === task?.project_id);
    const brand = state.workspace?.brands.find(entry => entry.id === project?.brand_id);
    return {task, project, brand};
  }
  async function refresh() {
    view.root?.removeAttribute('data-review-ready');
    try {
      const [reviews, workspace] = await Promise.all([request('/api/reviews'), request('/api/workspace')]);
      state.reviews = reviews; state.workspace = workspace;
      updateBadge(); renderPage();
      return true;
    } catch (error) {
      if (view.root) { const status = view.root.querySelector('[data-review-page-status]'); status.textContent = error.message; status.classList.add('isError'); }
      return false;
    }
  }

  // The review list for the badge; a call while one is on its way shares it, so Heute and the badge ask once at start-up.
  let pendingReviews = null;
  function loadReviews() {
    pendingReviews ||= request('/api/reviews').then(reviews => { state.reviews = reviews; updateBadge(); return reviews; })
      .finally(() => { pendingReviews = null; });
    return pendingReviews;
  }
  async function loadBadge() { try { await loadReviews(); } catch {} }

  // A small still from the server for videos and pictures alike; the version file only loads in the review overlay.
  function thumb(version) {
    const box = el('div', 'reviewThumb'), image = el('img');
    image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
    image.addEventListener('error', () => image.remove(), {once: true}); image.src = version.still_url;
    box.append(image);
    return box;
  }
  function row(version) {
    const {task, brand} = context(version);
    const node = button('', {'data-review-row': version.id, 'data-review-task': version.task_id}, 'reviewTile card'), foot = el('span', 'reviewTileFoot');
    foot.append(window.KlartextStage.statusChip(version.status));
    if (version.open_comments > 0) foot.append(el('span', 'reviewTileComments', `${version.open_comments} ${version.open_comments === 1 ? 'offener Kommentar' : 'offene Kommentare'}`));
    node.append(thumb(version), el('strong', 'reviewTileTitle', task ? `#${task.number} ${task.title}` : 'Aufgabe fehlt'),
      el('span', 'reviewTileMeta', `${brand?.name || 'Ohne Firma'} · V${version.number}`), foot);
    return node;
  }
  function group(key, title, list) {
    const section = el('section', 'reviewGroup'), head = el('div', 'reviewGroupHead'), tiles = el('div', 'reviewTiles');
    section.dataset.reviewGroup = key;
    head.append(el('h2', '', title), el('span', 'reviewCount', String(list.length)));
    tiles.append(...list.map(row));
    section.append(head, list.length ? tiles : window.KlartextStage.emptyState({icon: 'check', title: 'Nichts zu tun', text: 'Neue Versionen zur Prüfung erscheinen hier.'}));
    return section;
  }
  function renderPage() {
    if (!view.root || !state.reviews) return;
    const $ = selector => view.root.querySelector(selector);
    const newest = newestPerTask(), monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const oldest = (a, b) => a.status_at.localeCompare(b.status_at), latest = (a, b) => b.status_at.localeCompare(a.status_at);
    const waitingHere = waiting().sort(oldest);
    const groups = [['waiting', 'Wartet auf dich', waitingHere], ['working', 'In Arbeit', newest.filter(v => plan().working.includes(v.status)).sort(latest)],
      ['done', 'Erledigt', newest.filter(v => v.status === 'approved' && new Date(v.status_at).getTime() >= monthAgo).sort(latest)]];
    // Guests are greeted with the name they typed, never as „Gast“.
    const me = window.KlartextMe, signedIn = me?.person_id || me?.role === 'owner' ? me.name : '';
    const first = (state.reviews.me?.name || storedName() || signedIn || '').trim().split(/\s+/)[0];
    $('[data-review-greeting]').textContent = first ? `Hallo ${first}` : 'Hallo';
    const count = waitingHere.length;
    $('[data-review-summary]').textContent = count ? `${count} ${count === 1 ? 'Version wartet' : 'Versionen warten'} auf dich` : 'Gerade wartet nichts auf dich.';
    const status = $('[data-review-page-status]'); status.textContent = ''; status.classList.remove('isError');
    $('[data-review-groups]').replaceChildren(...groups.filter(([key, , list]) => key === 'waiting' || list.length).map(entry => group(...entry)));
    $('[data-reviewers-list]').textContent = state.reviews.reviewers.join(', ');
    renderPush();
    view.root.dataset.reviewReady = 'true';
  }

  // Mitteilungen auf diesem Gerät: for Dominik and everyone in the team list, never for guests (the server says the same).
  async function renderPush() {
    const card = view.root.querySelector('[data-review-push]'), text = card.querySelector('[data-review-push-text]'), toggle = card.querySelector('[data-review-push-toggle]');
    const mine = state.reviews.me, who = role();
    card.hidden = who === 'gast' || (who !== 'owner' && !(mine ? mine.name : window.KlartextMe?.person_id));
    if (card.hidden) return;
    const push = window.KlartextPush, support = push ? push.supported() : {ok: false, reason: 'Dieses Gerät kann hier keine Mitteilungen empfangen.'};
    const say = (message, error = false) => { text.textContent = message; text.classList.toggle('isError', error); };
    if (!support.ok) { say(support.reason); toggle.hidden = true; return; }
    let current;
    try { current = await push.state(); } catch (error) { say(error.message, true); toggle.hidden = true; return; }
    if (current === 'unsupported') { say('Dieses Gerät kann hier keine Mitteilungen empfangen.'); toggle.hidden = true; return; }
    say(current === 'on' ? 'Mitteilungen sind auf diesem Gerät an.' : 'Lass dich benachrichtigen, wenn eine Version auf dich wartet.');
    toggle.dataset.pushState = current; toggle.textContent = current === 'on' ? 'Ausschalten' : 'Einschalten'; toggle.hidden = false;
  }
  async function togglePush(toggle) {
    const push = window.KlartextPush, text = view.root.querySelector('[data-review-push-text]');
    toggle.disabled = true;
    try { await (toggle.dataset.pushState === 'on' ? push.disable() : push.enable()); await renderPush(); }
    catch (error) { text.textContent = error.message; text.classList.add('isError'); }
    finally { toggle.disabled = false; }
  }
  function editReviewers() {
    const editor = view.root.querySelector('[data-reviewers-editor]');
    editor.hidden = false;
    const input = view.root.querySelector('#reviewersInput');
    input.value = state.reviews.reviewers.join('\n'); input.focus();
  }
  async function saveReviewers() {
    const names = view.root.querySelector('#reviewersInput').value.split('\n').map(name => name.trim()).filter(Boolean);
    const status = view.root.querySelector('[data-reviewers-error]');
    try { state.reviews.reviewers = await request('/api/reviewers', 'PUT', {names}); view.root.querySelector('[data-reviewers-editor]').hidden = true; status.textContent = ''; renderPage(); }
    catch (error) { status.textContent = error.message; }
  }

  function mount(host) {
    const root = host?.querySelector('[data-structure-view="review"]');
    if (!root || root.dataset.reviewMounted) return;
    root.dataset.reviewMounted = 'true'; root.classList.add('reviewWorkspace'); view.root = root;
    // The topbar already says Freigaben, so the page opens with the greeting instead of a second heading.
    root.removeAttribute('aria-labelledby'); root.setAttribute('aria-label', 'Freigaben');
    root.innerHTML = `<p class="reviewGreeting" data-review-greeting>Hallo</p><p class="reviewSummary" data-review-summary></p>
      <p class="status" data-review-page-status role="status" aria-live="polite"></p><div class="reviewGroups" data-review-groups></div>
      <section class="card reviewPush" data-review-push hidden><h2>Mitteilungen auf diesem Gerät</h2><p class="status" data-review-push-text></p>
      <button type="button" class="btn" data-review-push-toggle hidden>Einschalten</button></section>
      <section class="reviewReviewers"><h2>Prüfer</h2><p data-reviewers-list></p><button type="button" class="btn" data-reviewers-edit>Prüfer bearbeiten</button>
      <div data-reviewers-editor hidden><div class="field"><label for="reviewersInput">Ein Name pro Zeile (1 bis 20)</label><textarea id="reviewersInput" rows="5"></textarea></div>
      <p class="reviewError" data-reviewers-error role="alert"></p><button type="button" class="btn isPrimary" data-reviewers-save>Speichern</button></div></section>`;
    root.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target) return;
      if (target.dataset.reviewRow) open(target.dataset.reviewRow);
      else if (target.hasAttribute('data-reviewers-edit')) editReviewers();
      else if (target.hasAttribute('data-reviewers-save')) saveReviewers();
      else if (target.hasAttribute('data-review-push-toggle')) togglePush(target);
    });
    window.addEventListener('klartext:workspace-change', event => { if (event.detail?.name === 'review') refresh(); });
    window.addEventListener('hashchange', openFromHash);
    loadBadge().then(openFromHash);
  }

  // Review overlay: one per page on <body>, so it opens from Projekte, Freigaben and direct links alike.
  const NAME_KEY = 'klartext-reviewer';
  const actionLabels = {submit: 'Zur Prüfung senden', request_changes: 'Änderungen anfordern', approve: 'Freigeben', revoke: 'Freigabe zurücknehmen'};
  const doneLabels = {submit: 'Zur Prüfung gesendet', request_changes: 'Änderungen angefordert', approve: 'Freigegeben', revoke: 'Freigabe zurückgenommen'};
  const allowedFrom = {submit: ['open', 'changes'], request_changes: ['in_review'], approve: ['open', 'in_review', 'changes'], revoke: ['approved']};
  // Spec 4.12 point 13, the same table as review_api: the server decides, the overlay only leaves out what it would refuse.
  const REVIEWER = ['approve', 'request_changes', 'revoke'];
  const ROLE_ACTIONS = {owner: ['submit', ...REVIEWER], team: ['submit'], pruefer: REVIEWER, kunde: REVIEWER, gast: REVIEWER};
  const REVIEWER_FROM = {approve: ['in_review'], request_changes: ['in_review']};
  const REVOKE_WINDOW = 15 * 60 * 1000;
  const COLORS = [['#ff5252', 'Rot'], ['#ffd54f', 'Gelb'], ['#40c4ff', 'Blau']];
  const VOICE_TYPES = [['audio/webm', '.webm'], ['audio/mp4', '.m4a'], ['audio/ogg', '.ogg']];
  const emptyDraft = () => ({strokes: [], color: COLORS[0][0], drawing: false, stroke: null, voice: null, voiceSeconds: 0, voiceUrl: null, recorder: null, startedAt: 0, stopTimer: null});
  const overlay = {node: null, versionId: null, anchor: {mode: null, start: null, end: null}, filter: 'open', pick: null, shown: null, undoTimer: null, draft: emptyDraft(), trigger: null, inert: []};
  const $o = selector => overlay.node.querySelector(selector);
  const fmt = seconds => { const whole = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`; };
  const currentVersion = () => state.reviews?.versions.find(version => version.id === overlay.versionId);
  const commentsOf = versionId => state.reviews.comments.filter(comment => comment.version_id === versionId);
  // quiet: a toast says the same sentence, so the message line keeps it without announcing it twice.
  const setMessage = (text, quiet = false) => { const node = $o('[data-review-message]'); node.setAttribute('aria-live', quiet ? 'off' : 'polite'); node.textContent = text; };
  function storedName() { try { return localStorage.getItem(NAME_KEY) || null; } catch { return null; } }
  // Dominik and the people from the team list sign with their login name; only guests type one, once per device.
  const myName = () => state.reviews?.me?.name || storedName();
  function pickName() {
    overlay.dialog.querySelector('#reviewerNameInput').value = storedName() || '';
    // Spec 4.3: the dialog itself takes the focus, so the iPhone keyboard does not jump up.
    overlay.dialog.showModal(); overlay.dialog.focus();
    return new Promise(resolve => { overlay.pick = resolve; });
  }
  function finishPick(name) {
    if (name) { try { localStorage.setItem(NAME_KEY, name); } catch {} }
    overlay.dialog.close();
    overlay.pick?.(name); overlay.pick = null;
    renderOverlay();
  }
  async function reviewer() { return myName() || await pickName(); }
  function mayAct(action, version) {
    const who = role();
    if (!ROLE_ACTIONS[who]?.includes(action) || !allowedFrom[action].includes(version.status)) return false;
    if (who === 'owner' || who === 'team') return true;
    if (action !== 'revoke') return REVIEWER_FROM[action].includes(version.status);
    return version.status_by === myName() && Date.now() - Date.parse(version.status_at) <= REVOKE_WINDOW;
  }

  function buildOverlay() {
    const node = el('div', 'reviewOverlay');
    node.dataset.reviewOverlay = ''; node.hidden = true;
    node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-labelledby', 'reviewOverlayTitle');
    node.innerHTML = `<header class="reviewOverlayHeader"><button type="button" class="btn" data-review-close>Zurück</button>
      <div class="reviewOverlayHeading"><h2 id="reviewOverlayTitle" tabindex="-1"></h2><p data-review-context></p></div>
      <label class="reviewVersion field"><span>Version</span><select data-review-version-select aria-label="Version"></select></label><span data-review-status></span>
      <button type="button" class="btn isQuiet" data-reviewer-name></button><button type="button" class="btn isQuiet" data-review-open-task hidden></button></header>
      <div class="reviewActions"><button type="button" class="btn" data-review-more aria-expanded="false" aria-controls="reviewMoreMenu" hidden>Mehr</button>${Object.keys(actionLabels).map(action => `<button type="button" class="btn" data-review-action="${action}">${actionLabels[action]}</button>`).join('')}<button type="button" class="btn" data-review-copy-link>Link kopieren</button><div class="popover reviewMore" id="reviewMoreMenu" data-review-more-menu hidden></div></div>
      <p class="reviewMessage" data-review-message role="status" aria-live="polite"></p>
      <div class="reviewBody"><section class="reviewStage"><div class="reviewMedia"><video id="reviewVideo" controls playsinline preload="metadata"></video><img id="reviewImage" alt="Version zur Prüfung" hidden><canvas id="reviewCanvas" aria-hidden="true"></canvas></div>
      <div class="reviewTimeline" data-review-timeline aria-label="Kommentare auf der Zeitleiste"></div>
      <form class="reviewComposer" data-comment-form><div class="reviewModes" role="group" aria-label="Bezug des Kommentars"><button type="button" class="btn" data-comment-mode="time">Zeitpunkt</button><button type="button" class="btn" data-comment-mode="range">Bereich bis hier</button><button type="button" class="btn" data-comment-mode="general">Allgemein</button></div>
      <p class="reviewAnchor" data-comment-anchor></p><div class="field"><label for="reviewCommentText">Kommentar</label><textarea id="reviewCommentText" rows="3" maxlength="5000" placeholder="Was soll sich ändern?"></textarea></div>
      <div class="reviewTools" data-comment-tools><div class="reviewDrawTools"><button type="button" class="btn" data-draw-toggle aria-pressed="false">Zeichnen</button><span class="reviewDrawOptions" data-draw-options hidden>${COLORS.map(([color, name]) => `<button type="button" class="btn isIcon reviewSwatch" data-draw-color="${color}" aria-label="Farbe ${name}" aria-pressed="false"></button>`).join('')}<button type="button" class="btn" data-draw-undo>Rückgängig</button><button type="button" class="btn" data-draw-clear>Leeren</button></span></div>
      <div class="reviewVoiceTools"><button type="button" class="btn" data-voice-record>Sprachmemo aufnehmen</button><button type="button" class="btn" data-voice-stop hidden>Aufnahme beenden</button><span class="reviewVoiceTimer" data-voice-timer></span><audio data-voice-preview controls hidden></audio><button type="button" class="btn isDanger" data-voice-discard hidden>Sprachmemo verwerfen</button></div></div><p class="reviewError" data-comment-error role="alert"></p><button type="submit" class="btn" data-comment-save>Kommentar speichern</button></form></section>
      <aside class="reviewComments" aria-label="Kommentare"><div class="reviewFilters" role="group" aria-label="Kommentare filtern"><button type="button" class="btn" data-comment-filter="open" aria-pressed="true">Offen</button><button type="button" class="btn" data-comment-filter="resolved" aria-pressed="false">Erledigt</button><button type="button" class="btn" data-comment-filter="all" aria-pressed="false">Alle</button></div><div data-review-comment-list></div></aside></div>
      <dialog class="dlg" data-reviewer-dialog aria-labelledby="reviewerDialogTitle" tabindex="-1"><form class="reviewNameForm" data-reviewer-form><h2 id="reviewerDialogTitle">Wer prüft hier?</h2>
      <label class="field"><span>Dein Name</span><input id="reviewerNameInput" maxlength="40" autocomplete="name" required></label><p class="status">Dein Name wird auf diesem Gerät gespeichert.</p>
      <div class="dlgActions"><button type="button" class="btn" data-reviewer-cancel>Abbrechen</button><button type="submit" class="btn isPrimary" data-reviewer-confirm>Weiter</button></div></form></dialog>`;
    document.body.append(node); overlay.node = node;
    // The name picker lives on <body>: it must also show when the overlay itself is hidden (Projekte panel).
    overlay.dialog = node.querySelector('[data-reviewer-dialog]'); document.body.append(overlay.dialog);
    overlay.dialog.querySelector('[data-reviewer-cancel]').addEventListener('click', () => finishPick(null));
    overlay.dialog.querySelector('[data-reviewer-form]').addEventListener('submit', event => {
      event.preventDefault();
      const input = overlay.dialog.querySelector('#reviewerNameInput'), name = input.value.trim().replace(/\s+/g, ' ');
      if (name) finishPick(name); else input.focus();
    });
    const video = $o('#reviewVideo');
    node.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target?.hasAttribute('data-review-more')) setMore(false);
      if (!target) return;
      if (target.hasAttribute('data-review-more')) setMore($o('[data-review-more-menu]').hidden);
      else if (target.hasAttribute('data-review-close')) close();
      else if (target.dataset.reviewAction) act(target.dataset.reviewAction);
      else if (target.hasAttribute('data-review-copy-link')) copyLink();
      else if (target.hasAttribute('data-reviewer-name')) pickName();
      else if (target.hasAttribute('data-review-open-task')) openTask();
      else if (target.dataset.commentMode) setAnchor(target.dataset.commentMode);
      else if (target.dataset.commentFilter) { overlay.filter = target.dataset.commentFilter; renderOverlay(); }
      else if (target.dataset.commentMarker) jumpTo(target.dataset.commentMarker);
      else if (target.classList.contains('reviewCommentJump')) jumpTo(target.closest('[data-comment]').dataset.comment);
      else if (target.hasAttribute('data-comment-resolve')) resolve(target.closest('[data-comment]').dataset.comment);
      else if (target.hasAttribute('data-comment-delete')) remove(target.closest('[data-comment]').dataset.comment);
      else if (target.hasAttribute('data-draw-toggle')) setDrawing(!overlay.draft.drawing);
      else if (target.dataset.drawColor) { overlay.draft.color = target.dataset.drawColor; renderTools(); }
      else if (target.hasAttribute('data-draw-undo')) { overlay.draft.strokes.pop(); paint(); renderTools(); }
      else if (target.hasAttribute('data-draw-clear')) { overlay.draft.strokes = []; paint(); renderTools(); }
      else if (target.hasAttribute('data-voice-record')) startVoice();
      else if (target.hasAttribute('data-voice-stop')) overlay.draft.recorder?.stop();
      else if (target.hasAttribute('data-voice-discard')) discardVoice();
    });
    const canvas = $o('#reviewCanvas');
    canvas.addEventListener('pointerdown', event => {
      if (!overlay.draft.drawing) return;
      event.preventDefault();
      // Capture keeps the stroke when a finger leaves the canvas; some browsers refuse it, drawing still works.
      try { canvas.setPointerCapture(event.pointerId); } catch {}
      overlay.draft.stroke = {color: overlay.draft.color, points: [point(event)]};
      overlay.draft.strokes.push(overlay.draft.stroke); paint();
    });
    canvas.addEventListener('pointermove', event => {
      const stroke = overlay.draft.stroke; if (!stroke) return;
      const next = point(event), last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(next.x - last.x, next.y - last.y) < .003 || stroke.points.length >= 2000) return;
      stroke.points.push(next); paint();
    });
    for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { if (overlay.draft.stroke) { overlay.draft.stroke = null; renderTools(); } });
    window.addEventListener('resize', fitCanvas);
    $o('#reviewImage').addEventListener('load', fitCanvas);
    $o('[data-review-version-select]').addEventListener('change', event => open(event.target.value));
    $o('#reviewCommentText').addEventListener('focus', anchorIfUnset);
    $o('[data-comment-form]').addEventListener('submit', event => { event.preventDefault(); saveComment(); });
    overlay.dialog.addEventListener('cancel', event => { event.preventDefault(); finishPick(null); });
    video.addEventListener('loadedmetadata', () => { renderTimeline(); fitCanvas(); });
    video.addEventListener('timeupdate', () => { if (!overlay.anchor.mode) renderAnchor(); paint(); });
    video.addEventListener('play', () => { overlay.shown = null; if (overlay.draft.drawing) setDrawing(false); });
    video.addEventListener('error', () => { if (video.getAttribute('src')) setMessage('Dieses Video kann dein Browser nicht abspielen. Versuche es in einem anderen Browser oder lade eine H.264-Version hoch.'); });
    PHONE.addEventListener('change', () => { if (!node.hidden) renderOverlay(); });
  }
  // Phones (spec 4.6): the fixed bar keeps the filled button; with two or more other actions those wait under „Mehr“.
  const PHONE = window.matchMedia('(max-width: 700px)');
  function placeActions() {
    const menu = $o('[data-review-more-menu]'), buttons = [...Object.keys(actionLabels).map(action => $o(`[data-review-action="${action}"]`)), $o('[data-review-copy-link]')];
    const others = buttons.filter(node => !node.hidden && !node.classList.contains('isPrimary'));
    const tuck = PHONE.matches && others.length > 1 && buttons.some(node => node.classList.contains('isPrimary'));
    // The phone head keeps to Zurück, Version and status (spec 4.8 point 6): „Aufgabe öffnen“ waits under „Mehr“ as well.
    const toTask = $o('[data-review-open-task]'), tucked = PHONE.matches && !toTask.hidden ? [toTask] : [];
    $o('.reviewActions').append(...buttons.filter(node => !tuck || !others.includes(node)), menu);
    if (!tucked.length) $o('.reviewOverlayHeader').append(toTask);
    menu.replaceChildren(...(tuck ? others : []), ...tucked);
    $o('[data-review-more]').hidden = !menu.children.length; setMore(false);
    // Phones show the comments before the form, so the form moves behind them; only on a change, a move would end typing.
    const form = $o('[data-comment-form]'), home = PHONE.matches ? $o('.reviewBody') : $o('.reviewStage');
    if (form.parentElement !== home) home.append(form);
  }
  function setMore(open) {
    const menu = $o('[data-review-more-menu]');
    menu.hidden = !open; $o('[data-review-more]').setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button:not(:disabled)')?.focus();
  }
  // Drawings: strokes are stored with coordinates from 0 to 1, so they fit any screen size.
  const media = () => currentVersion()?.kind === 'bild' ? $o('#reviewImage') : $o('#reviewVideo');
  function point(event) {
    const rect = $o('#reviewCanvas').getBoundingClientRect(), clamp = value => Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
    return {x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height)};
  }
  function fitCanvas() {
    if (!overlay.node || overlay.node.hidden) return;
    const target = media(), canvas = $o('#reviewCanvas'), ratio = window.devicePixelRatio || 1;
    Object.assign(canvas.style, {left: `${target.offsetLeft}px`, top: `${target.offsetTop}px`, width: `${target.offsetWidth}px`, height: `${target.offsetHeight}px`});
    canvas.width = Math.max(1, Math.round(target.offsetWidth * ratio)); canvas.height = Math.max(1, Math.round(target.offsetHeight * ratio));
    paint();
  }
  function shownStrokes() {
    const draft = overlay.draft;
    if (draft.drawing || draft.strokes.length) return draft.strokes;
    const comments = commentsOf(overlay.versionId);
    const selected = comments.find(comment => comment.id === overlay.shown);
    if (selected) return selected.drawing || [];
    const time = $o('#reviewVideo').currentTime;
    return comments.find(comment => comment.drawing && comment.start !== null && Math.abs(comment.start - time) <= 1)?.drawing || [];
  }
  function paint() {
    if (!overlay.node) return;
    const canvas = $o('#reviewCanvas'), context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = Math.max(3, canvas.width / 160);
    for (const stroke of shownStrokes()) {
      context.strokeStyle = stroke.color; context.beginPath();
      stroke.points.forEach((p, index) => context[index ? 'lineTo' : 'moveTo'](p.x * canvas.width, p.y * canvas.height));
      if (stroke.points.length === 1) context.lineTo(stroke.points[0].x * canvas.width + .5, stroke.points[0].y * canvas.height);
      context.stroke();
    }
  }
  function setDrawing(active) {
    overlay.draft.drawing = active;
    if (active) { $o('#reviewVideo').pause(); overlay.shown = null; fitCanvas(); }
    $o('#reviewCanvas').classList.toggle('isDrawing', active);
    renderTools(); paint();
  }
  function renderTools() {
    const draft = overlay.draft;
    $o('[data-draw-toggle]').setAttribute('aria-pressed', String(draft.drawing));
    $o('[data-draw-toggle]').textContent = draft.drawing ? 'Zeichnen beenden' : draft.strokes.length ? `Zeichnung (${draft.strokes.length})` : 'Zeichnen';
    $o('[data-draw-options]').hidden = !draft.drawing;
    for (const swatch of overlay.node.querySelectorAll('[data-draw-color]')) swatch.setAttribute('aria-pressed', String(swatch.dataset.drawColor === draft.color));
    $o('[data-draw-undo]').disabled = !draft.strokes.length; $o('[data-draw-clear]').disabled = !draft.strokes.length;
    const recording = draft.recorder?.state === 'recording';
    $o('[data-voice-record]').hidden = recording || Boolean(draft.voice); $o('[data-voice-stop]').hidden = !recording;
    $o('audio[data-voice-preview]').hidden = !draft.voice; $o('[data-voice-discard]').hidden = !draft.voice;
    $o('[data-voice-timer]').textContent = recording ? 'Aufnahme läuft …' : draft.voice ? `Sprachmemo ${Math.round(draft.voiceSeconds)} s` : '';
  }
  // Voice memos need the microphone, which browsers only allow on the PC itself or over HTTPS.
  async function startVoice() {
    const draft = overlay.draft;
    if (draft.recorder?.state === 'recording') return;
    anchorIfUnset();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { $o('[data-comment-error]').textContent = 'Sprachmemos brauchen eine sichere Verbindung (HTTPS). Am PC selbst funktionieren sie immer.'; return; }
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const type = VOICE_TYPES.find(([mime]) => MediaRecorder.isTypeSupported?.(mime))?.[0];
      const recorder = new MediaRecorder(stream, type ? {mimeType: type} : undefined), chunks = [];
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearTimeout(draft.stopTimer); stream.getTracks().forEach(track => track.stop());
        if (draft !== overlay.draft) return;
        const mime = (recorder.mimeType || type || 'audio/webm').split(';')[0];
        draft.voice = new Blob(chunks, {type: mime});
        draft.voiceSeconds = Math.min(120, Math.max(.1, (Date.now() - draft.startedAt) / 1000));
        if (draft.voiceUrl) URL.revokeObjectURL(draft.voiceUrl);
        draft.voiceUrl = URL.createObjectURL(draft.voice); $o('audio[data-voice-preview]').src = draft.voiceUrl;
        renderTools();
      };
      draft.recorder = recorder; draft.startedAt = Date.now(); recorder.start();
      draft.stopTimer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), 120000);
      $o('[data-comment-error]').textContent = ''; renderTools();
    } catch { stream?.getTracks().forEach(track => track.stop()); $o('[data-comment-error]').textContent = 'Kein Zugriff auf das Mikrofon. Erlaub es im Browser und versuch es noch mal.'; }
  }
  function discardVoice() {
    const draft = overlay.draft;
    if (draft.voiceUrl) URL.revokeObjectURL(draft.voiceUrl);
    Object.assign(draft, {voice: null, voiceSeconds: 0, voiceUrl: null, recorder: null});
    $o('audio[data-voice-preview]').removeAttribute('src'); renderTools();
  }
  function resetDraft() {
    if (overlay.draft.recorder?.state === 'recording') overlay.draft.recorder.stop();
    discardVoice(); overlay.draft = emptyDraft();
    $o('#reviewCanvas').classList.remove('isDrawing'); renderTools(); paint();
  }
  function renderAnchor() {
    const version = currentVersion(), anchor = overlay.anchor, video = $o('#reviewVideo');
    let text;
    if (version?.kind === 'bild') text = 'Kommentar zum Bild';
    else if (anchor.mode === 'general') text = 'Allgemein zum ganzen Video';
    else if (anchor.mode === 'range') text = `${fmt(anchor.start)} bis ${fmt(anchor.end)}`;
    else text = `Bei ${fmt(anchor.mode === 'time' ? anchor.start : video.currentTime)}`;
    $o('[data-comment-anchor]').textContent = text;
    for (const mode of ['time', 'range', 'general']) $o(`[data-comment-mode="${mode}"]`).setAttribute('aria-pressed', String(anchor.mode === mode));
  }
  function anchorIfUnset() { if (currentVersion()?.kind === 'video' && !overlay.anchor.mode) setAnchor('time'); }
  function setAnchor(mode) {
    const video = $o('#reviewVideo'); video.pause();
    if (mode === 'time') overlay.anchor = {mode, start: video.currentTime, end: null};
    else if (mode === 'general') overlay.anchor = {mode, start: null, end: null};
    else if (overlay.anchor.start === null || video.currentTime <= overlay.anchor.start) { setMessage('Setze zuerst mit „Zeitpunkt“ den Anfang, spule zum Ende und tippe dann auf „Bereich bis hier“.'); return; }
    else overlay.anchor = {mode, start: overlay.anchor.start, end: video.currentTime};
    renderAnchor();
  }
  function renderTimeline() {
    const version = currentVersion(), video = $o('#reviewVideo'), timeline = $o('[data-review-timeline]');
    if (!version || version.kind === 'bild' || !(video.duration > 0) || !Number.isFinite(video.duration)) { timeline.replaceChildren(); return; }
    timeline.replaceChildren(...visibleComments().filter(comment => comment.start !== null).map(comment => {
      const marker = button('', {'data-comment-marker': comment.id, 'aria-label': `Kommentar bei ${fmt(comment.start)} von ${comment.author}`}, comment.end !== null ? 'reviewMarker reviewMarkerRange' : 'reviewMarker');
      marker.style.left = `${Math.min(100, comment.start / video.duration * 100)}%`;
      if (comment.end !== null) marker.style.width = `${Math.min(100, (comment.end - comment.start) / video.duration * 100)}%`;
      return marker;
    }));
  }
  function visibleComments() {
    return commentsOf(overlay.versionId).filter(comment => overlay.filter === 'all' || (overlay.filter === 'open' ? !comment.resolved : comment.resolved))
      .sort((a, b) => (a.start ?? -1) - (b.start ?? -1) || a.created_at.localeCompare(b.created_at));
  }
  function renderComments() {
    const list = visibleComments();
    $o('[data-review-comment-list]').replaceChildren(...(list.length ? list.map(comment => {
      const item = el('article', comment.resolved ? 'reviewComment reviewCommentResolved' : 'reviewComment'); item.dataset.comment = comment.id;
      const head = el('div', 'reviewCommentHead');
      const where = comment.start === null ? 'Allgemein' : comment.end !== null ? `${fmt(comment.start)} bis ${fmt(comment.end)}` : fmt(comment.start);
      head.append(button(where, {}, 'btn reviewCommentJump'), el('strong', '', comment.author), el('span', 'reviewCommentDate', germanDate(comment.created_at)));
      item.append(head);
      if (comment.text) item.append(el('p', 'reviewCommentText', comment.text));
      if (comment.drawing) item.append(el('span', 'reviewCommentBadge', 'Mit Zeichnung · zum Ansehen auf die Zeit tippen'));
      if (comment.voice) { const audio = el('audio'); audio.controls = true; audio.preload = 'none'; audio.src = `/api/comments/${comment.id}/voice`; audio.setAttribute('aria-label', `Sprachmemo von ${comment.author}`); item.append(audio); }
      const actions = el('div', 'reviewCommentActions');
      actions.append(button(comment.resolved ? 'Wieder öffnen' : 'Erledigt', {'data-comment-resolve': ''}, 'btn'));
      if (role() === 'owner' || comment.author === myName()) actions.append(button('Löschen', {'data-comment-delete': ''}, 'btn isDanger'));
      item.append(actions);
      return item;
    }) : [el('p', 'status', overlay.filter === 'resolved' ? 'Noch nichts erledigt.' : 'Keine Kommentare.')]));
  }
  function renderOverlay() {
    const version = currentVersion();
    if (!overlay.node || !version) return;
    const {task, project, brand} = context(version);
    $o('#reviewOverlayTitle').textContent = task ? `#${task.number} ${task.title}` : 'Aufgabe fehlt';
    $o('[data-review-context]').textContent = [brand?.name || 'Ohne Firma', project?.name || 'Ohne Projekt', `V${version.number} hochgeladen von ${version.created_by} am ${germanDate(version.created_at)}`].join(' · ');
    const siblings = state.reviews.versions.filter(entry => entry.task_id === version.task_id).sort((a, b) => a.number - b.number);
    const select = $o('[data-review-version-select]');
    select.replaceChildren(...siblings.map(entry => new Option(`V${entry.number} · ${statusLabel(entry.status)}`, entry.id))); select.value = version.id;
    const chip = window.KlartextStage.statusChip(version.status); chip.dataset.reviewStatus = '';
    $o('[data-review-status]').replaceWith(chip);
    const openCount = commentsOf(version.id).filter(comment => !comment.resolved).length, who = role();
    // One filled button: send while open, approve while in review.
    const primary = version.status === 'in_review' ? 'approve' : ['open', 'changes'].includes(version.status) ? 'submit' : null;
    for (const action of Object.keys(actionLabels)) {
      const node = $o(`[data-review-action="${action}"]`);
      node.hidden = !mayAct(action, version); node.disabled = action === 'request_changes' && !openCount;
      node.classList.toggle('isPrimary', !node.hidden && action === primary);
    }
    const undo = $o('[data-review-action="revoke"]');
    undo.textContent = who === 'owner' ? actionLabels.revoke : 'Rückgängig';
    const name = myName(), picker = $o('[data-reviewer-name]');
    picker.hidden = Boolean(state.reviews.me?.name); picker.textContent = name ? `Prüfer: ${name}` : 'Wer prüft hier?';
    const toTask = $o('[data-review-open-task]');
    toTask.hidden = !task || !['owner', 'team'].includes(who);
    if (task) toTask.textContent = `Aufgabe #${task.number} öffnen`;
    placeActions();
    // The own undo ends 15 minutes after the approval; redraw then, so the button goes away by itself.
    clearTimeout(overlay.undoTimer);
    if (who !== 'owner' && !undo.hidden) overlay.undoTimer = setTimeout(renderOverlay, REVOKE_WINDOW - (Date.now() - Date.parse(version.status_at)) + 1000);
    const image = version.kind === 'bild';
    $o('#reviewVideo').hidden = image; $o('#reviewImage').hidden = !image; $o('[data-review-timeline]').hidden = image;
    for (const mode of ['time', 'range', 'general']) $o(`[data-comment-mode="${mode}"]`).hidden = image;
    for (const filter of root().querySelectorAll('[data-comment-filter]')) filter.setAttribute('aria-pressed', String(filter.dataset.commentFilter === overlay.filter));
    renderAnchor(); renderComments(); renderTimeline(); renderTools(); paint();
  }
  const root = () => overlay.node;
  function openTask() {
    const {task} = context(currentVersion());
    close(false);
    if (task) window.KlartextTasks?.open(task.id);
  }
  function jumpTo(commentId) {
    const comment = state.reviews.comments.find(entry => entry.id === commentId), video = $o('#reviewVideo');
    if (!comment) return;
    if (overlay.draft.drawing) setDrawing(false);
    overlay.shown = comment.id;
    if (comment.start !== null) { video.pause(); video.currentTime = comment.start; }
    paint();
  }
  async function saveComment() {
    const version = currentVersion(); if (!version) return;
    const author = await reviewer(); if (!author) return;
    const video = $o('#reviewVideo'), anchor = overlay.anchor;
    let start = null, end = null;
    if (version.kind !== 'bild' && anchor.mode !== 'general') {
      start = anchor.mode ? anchor.start : video.currentTime;
      end = anchor.mode === 'range' ? anchor.end : null;
    }
    const round = value => value === null ? null : Math.round(value * 100) / 100;
    const draft = overlay.draft, form = new FormData();
    if (draft.recorder?.state === 'recording') { $o('[data-comment-error]').textContent = 'Die Aufnahme läuft noch. Beende sie zuerst.'; return; }
    form.append('data', JSON.stringify({author, text: $o('#reviewCommentText').value, start: round(start), end: round(end),
      drawing: draft.strokes.length ? draft.strokes : null, voice_seconds: draft.voice ? Math.round(draft.voiceSeconds * 10) / 10 : null}));
    if (draft.voice) form.append('voice', draft.voice, `sprachmemo${VOICE_TYPES.find(([mime]) => mime === draft.voice.type)?.[1] || '.webm'}`);
    $o('[data-comment-save]').disabled = true; $o('[data-comment-error]').textContent = '';
    try {
      state.reviews.comments.push(await request(`/api/versions/${version.id}/comments`, 'POST', form));
      $o('#reviewCommentText').value = ''; overlay.anchor = {mode: null, start: null, end: null};
      resetDraft(); renderOverlay(); updateBadge();
    } catch (error) { $o('[data-comment-error]').textContent = error.message; retryName(error); }
    finally { $o('[data-comment-save]').disabled = false; }
  }
  // The server refused the typed guest name: it must not stay on this device, so the dialog asks again.
  const NAME_REFUSED = ['Mit diesem Namen darfst du nicht unterschreiben.', 'Der Name enthält Zeichen, die hier nicht gehen. Nimm nur Buchstaben, Ziffern, Punkt, Bindestrich und Apostroph.'];
  function retryName(error) {
    if (!NAME_REFUSED.includes(error.message)) return;
    try { localStorage.removeItem(NAME_KEY); } catch {}
    pickName();
  }
  // The message line sits out of sight once the overlay is closed or scrolled on a phone; the toast shows where the tap was.
  function fail(error) {
    setMessage(error.message, true);
    window.KlartextToast.show(error.message, {tone: 'error'});
    retryName(error);
  }
  // The toast's undo may run after the overlay moved on, so the version comes by id.
  async function act(action, versionId = overlay.versionId) {
    const version = state.reviews?.versions.find(entry => entry.id === versionId); if (!version) return;
    const author = await reviewer(); if (!author) return;
    const {task} = context(version);
    try {
      Object.assign(version, await request(`/api/versions/${version.id}/status`, 'POST', {action, expected_status: version.status, author}));
      // Reviewers never see the board, so the message speaks of the post and its stage.
      const kept = {planned: 'geplant', published: 'veröffentlicht'}[task?.stage];
      setMessage(kept ? `${doneLabels[action]}. Der Beitrag ist schon ${kept}, die Stufe bleibt.` : '');
      const undo = action === 'approve' && role() !== 'owner' ? {action: {label: 'Rückgängig', run: () => act('revoke', version.id)}, ms: 10000} : {};
      window.KlartextToast.show(doneLabels[action], undo);
      renderOverlay();
      // The pressed button is gone now: keep the focus in the bar, on the undo or else on the title.
      if (overlay.versionId === version.id) { const back = $o('[data-review-action="revoke"]'); (back.getClientRects().length ? back : $o('#reviewOverlayTitle')).focus(); }
      refresh();
      window.dispatchEvent(new CustomEvent('klartext:tasks-changed'));
    } catch (error) {
      fail(error);
      if (error.status === 409) { await refresh(); renderOverlay(); }
    }
  }
  async function resolve(commentId) {
    const comment = state.reviews.comments.find(entry => entry.id === commentId); if (!comment) return;
    const author = await reviewer(); if (!author) return;
    try { Object.assign(comment, await request(`/api/comments/${commentId}`, 'PATCH', {resolved: !comment.resolved, author})); renderOverlay(); }
    catch (error) { fail(error); }
  }
  async function remove(commentId) {
    const comment = state.reviews.comments.find(entry => entry.id === commentId); if (!comment) return;
    if (await window.KlartextConfirm.ask({title: `Kommentar von ${comment.author} löschen?`, confirm: 'Kommentar löschen'}) !== 'confirm') return;
    const author = await reviewer(); if (!author) return;
    try {
      await request(`/api/comments/${commentId}`, 'DELETE', {author});
      state.reviews.comments = state.reviews.comments.filter(entry => entry.id !== commentId);
      // The pressed button goes with the comment; the focus stays in the review.
      renderOverlay(); $o('#reviewOverlayTitle').focus();
    } catch (error) { fail(error); }
  }
  function copyLink() {
    const base = state.reviews?.share_origin || location.origin;
    const link = `${base}${base === location.origin ? location.pathname : '/'}#review/${overlay.versionId}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => setMessage('Link kopiert.'), () => setMessage(link));
    else setMessage(link);
  }
  async function open(versionId) {
    if (!overlay.node) buildOverlay();
    if (!state.workspace || !state.reviews?.versions.some(version => version.id === versionId)) await refresh();
    const version = state.reviews?.versions.find(entry => entry.id === versionId);
    if (!version) return false;
    const switching = overlay.versionId !== versionId;
    overlay.versionId = versionId;
    if (switching) {
      overlay.anchor = {mode: null, start: null, end: null}; overlay.shown = null;
      $o('#reviewCommentText').value = ''; $o('[data-comment-error]').textContent = ''; setMessage(''); resetDraft();
    }
    const url = `/api/versions/${versionId}/file`, video = $o('#reviewVideo'), image = $o('#reviewImage');
    if (version.kind === 'bild') { video.pause(); if (image.getAttribute('src') !== url) image.src = url; }
    else if (video.getAttribute('src') !== url) video.src = url;
    if (overlay.node.hidden) { overlay.trigger = document.activeElement; setModal(true); }
    overlay.node.hidden = false; document.body.classList.add('reviewOpen');
    if (location.hash !== `#review/${versionId}`) history.replaceState(null, '', `#review/${versionId}`);
    renderOverlay(); fitCanvas(); $o('#reviewOverlayTitle').focus();
    return true;
  }
  // The overlay is modal (WCAG 2.4.3): what lies behind it is inert while it shows; only what it made inert is freed again.
  const BEHIND = 'body>.skipLink,.sidebar,.appShell,.tabBar';
  function setModal(on) {
    if (on) overlay.inert = [...document.querySelectorAll(BEHIND)].filter(node => !node.inert);
    for (const node of overlay.inert) node.inert = on;
    if (!on) overlay.inert = [];
  }
  function close(restore = true) {
    if (!overlay.node) return;
    const shown = !overlay.node.hidden, version = currentVersion(), taskId = version?.task_id;
    if (overlay.draft.recorder?.state === 'recording') overlay.draft.recorder.stop();
    $o('#reviewVideo').pause(); overlay.node.hidden = true; overlay.versionId = null;
    document.body.classList.remove('reviewOpen');
    history.replaceState(null, '', location.pathname + location.search);
    if (!shown) return;
    setModal(false);
    // The focus goes back to the opener; drawn anew after an action, it is found again as Ansehen in the task panel or as the tile of the task.
    const back = [overlay.trigger, document.querySelector(`[data-task-version="${version?.id}"] [data-version-open]`), document.querySelector(`[data-review-task="${taskId}"]`)]
      .find(node => node?.isConnected && node !== document.body && node.getClientRects().length);
    if (restore) back?.focus();
  }
  function openFromHash() { const match = location.hash.match(/^#review\/([0-9a-f]{32})$/); if (match) open(match[1]); }
  const isTextEntry = target => target?.closest?.('input,textarea,select,[contenteditable="true"]');
  document.addEventListener('keydown', event => {
    if (!overlay.node || overlay.node.hidden || document.querySelector('dialog:modal')) return;
    if (event.key === 'Escape') {
      if ($o('[data-review-more-menu]').hidden) close(); else { setMore(false); $o('[data-review-more]').focus(); }
      return;
    }
    if ((event.code !== 'Space' && event.key !== ' ') || isTextEntry(event.target) || currentVersion()?.kind === 'bild') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) { const video = $o('#reviewVideo'); if (video.paused) video.play().catch(() => {}); else video.pause(); }
  }, true);
  async function askReviewer() { if (!overlay.node) buildOverlay(); if (!state.reviews) await refresh(); return state.reviews ? reviewer() : null; }
  window.KlartextReview = Object.freeze({mount, open: versionId => open(versionId), refresh, askReviewer, waiting, reviews: loadReviews});
})();
