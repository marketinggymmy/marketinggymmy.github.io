/* Anfragen: everyone asks for new content; Dominik accepts (the tasks appear in the chosen project) or declines with a reason. */
(() => {
  'use strict';
  const STATUS = {open: 'Offen', accepted: 'Angenommen', declined: 'Abgelehnt'};
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function button(text, attrs = {}, className = '') { const node = el('button', className, text); node.type = 'button'; for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; }
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Anfragen');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Anfragen', response.status)); }
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Anfragen', response.status));
    return data;
  }
  const germanDate = value => value ? value.slice(0, 10).split('-').reverse().join('.') : '';

  function mount(host) {
    if (!host || host.querySelector('[data-structure-view="requests"]')) return;
    const root = el('section', 'requestsPage'); root.dataset.structureView = 'requests'; root.hidden = true; root.setAttribute('aria-label', 'Anfragen');
    window.KlartextShell?.setActions('requests', [{label: 'Neue Anfrage', target: '#requestTitle'}]);
    root.innerHTML = `<p class="pageIntro" data-requests-intro></p>
      <p class="status" data-requests-status role="status" aria-live="polite"></p>
      <form class="card requestForm" data-request-form><h2>Neue Anfrage</h2>
        <div class="field"><label for="requestTitle">Titel</label><input id="requestTitle" maxlength="190" required placeholder="z. B. Reels zur Herbstaktion"></div>
        <div class="field"><label for="requestDescription">Beschreibung</label><textarea id="requestDescription" rows="4" maxlength="5000" placeholder="Was soll entstehen, für wen, wo wird es gezeigt?"></textarea></div>
        <div class="requestFields"><div class="field"><label for="requestBrand">Firma</label><select id="requestBrand"></select></div><div class="field"><label for="requestKind">Art</label><select id="requestKind"></select></div>
          <div class="field"><label for="requestQuantity">Anzahl</label><input id="requestQuantity" type="number" min="1" max="20" value="1" required></div><div class="field"><label for="requestWish">Wunschtermin</label><input id="requestWish" type="date"></div></div>
        <div class="requestActions"><button type="submit" class="btn isPrimary" data-request-send>Anfrage senden</button></div>
      </form>
      <h2 data-request-list-title>Deine Anfragen</h2><div class="requestList" data-request-list></div>`;
    host.append(root);
    const $ = selector => root.querySelector(selector);
    let entries = [], workspace = null, declining = null, changes = 0, poll = 0;
    const owner = () => window.KlartextMe?.role === 'owner';
    // With a toast the status line keeps the text but stays quiet, so the sentence is said once.
    const status = (text, error = false, toast = error) => { const node = $('[data-requests-status]'); node.setAttribute('aria-live', toast ? 'off' : 'polite'); node.textContent = text; node.classList.toggle('isError', error); if (toast) window.KlartextToast?.show(text, error ? {tone: 'error'} : undefined); };
    const field = (label, control) => { const wrap = el('label', 'field'); wrap.append(el('span', '', label), control); return wrap; };
    const brandName = id => workspace?.brands.find(brand => brand.id === id)?.name || 'Ohne Firma';
    const kindName = id => workspace?.kinds.find(kind => kind.id === id)?.label || id;

    function fillForm() {
      const brands = workspace?.brands || [], chosen = $('#requestBrand').value;
      $('#requestBrand').replaceChildren(...(window.KlartextMe?.role === 'kunde' ? [] : [new Option('Ohne Firma', '')]), ...brands.map(brand => new Option(brand.name, brand.id)));
      if (chosen) $('#requestBrand').value = chosen;
      $('#requestKind').replaceChildren(...(workspace?.kinds || [{id: 'video', label: 'Video'}]).map(kind => new Option(kind.label, kind.id)));
    }
    function projectsFor(entry) {
      const active = (workspace?.projects || []).filter(project => !project.archived);
      // The server refuses projects of another brand, so only offer the request's own.
      return entry.brand_id ? active.filter(project => project.brand_id === entry.brand_id) : active;
    }
    function render() {
      // Dominik mostly answers, so his list comes first and the form waits folded below it. The role is known only after /api/me.
      if (owner() && !$('.requestCompose')) {
        const compose = el('details', 'requestCompose'); compose.append(el('summary', 'btn', 'Neue Anfrage'), $('[data-request-form]')); root.append(compose);
      }
      $('[data-requests-intro]').textContent = owner()
        ? 'Hier landen Wünsche von Team, Chefs und Kunden, und Annehmen legt daraus Aufgaben an.'
        : 'Sag, was produziert werden soll, und Dominik sagt zu oder schreibt dir, warum es nicht geht.';
      $('[data-request-list-title]').textContent = owner() ? 'Alle Anfragen' : 'Deine Anfragen';
      $('[data-request-list]').replaceChildren(...(entries.length ? entries.map(entry => {
        const row = el('article', 'card requestCard'); row.dataset.request = entry.id;
        const head = el('div', 'requestHead'), chip = el('span', 'chip', STATUS[entry.status]); chip.dataset.status = entry.status;
        head.append(chip, el('strong', '', entry.title));
        row.append(head, el('p', 'requestMeta', [`${entry.quantity}× ${kindName(entry.kind)}`, brandName(entry.brand_id), `von ${entry.by_name}`, `am ${germanDate(entry.created_at)}`,
          ...(entry.wish_date ? [`Wunschtermin ${germanDate(entry.wish_date)}`] : [])].join(' · ')));
        if (entry.description) row.append(el('p', 'requestText', entry.description));
        if (entry.status === 'declined' && entry.reason) row.append(el('p', 'requestText', `Begründung: ${entry.reason}`));
        if (entry.status === 'accepted') row.append(el('p', 'requestMeta', `${entry.task_ids.length} ${entry.task_ids.length === 1 ? 'Aufgabe' : 'Aufgaben'} angelegt`));
        if (owner() && entry.status === 'open') {
          const actions = el('div', 'requestActions');
          if (declining === entry.id) {
            const reason = el('input'); reason.dataset.requestReason = ''; reason.maxLength = 500; reason.placeholder = 'Begründung für die Absage'; reason.setAttribute('aria-label', 'Begründung');
            actions.append(field('Begründung', reason), button('Absage senden', {'data-request-decline-confirm': ''}, 'btn isDanger'), button('Abbrechen', {'data-request-decline-cancel': ''}, 'btn'));
          } else {
            const project = el('select'); project.dataset.requestProject = ''; project.setAttribute('aria-label', 'Projekt für die Aufgaben');
            project.append(...projectsFor(entry).map(item => new Option(`${brandName(item.brand_id)} · ${item.name}`, item.id)));
            actions.append(field('Projekt', project), button('Annehmen', {'data-request-accept': ''}, 'btn'), button('Ablehnen', {'data-request-decline': ''}, 'btn isDanger'));
          }
          row.append(actions);
        }
        return row;
      }) : [window.KlartextStage.emptyState({icon: 'inbox', title: 'Noch keine Anfragen', text: owner() ? 'Wünsche von Team und Chefs landen hier.' : 'Schreib oben, was du brauchst.'})]));
    }
    async function load() {
      try {
        [entries, workspace] = await Promise.all([request('/api/requests').then(data => data.requests), request('/api/workspace').catch(() => null)]);
        fillForm(); render(); root.dataset.requestsReady = 'true';
      } catch (error) { status(error.message, true); }
    }
    // The requester sees Dominik's answer without reloading: every 10 s and on focus, only while Anfragen is shown.
    async function refresh() {
      if (owner() || !root.dataset.requestsReady || document.body.dataset.activeWorkspace !== 'requests' || document.hidden) return;
      const seen = changes;
      try {
        const fresh = (await request('/api/requests')).requests;
        if (seen !== changes) return; // a send or answer of this page landed meanwhile; the next tick catches up
        if (JSON.stringify(fresh) === JSON.stringify(entries)) return; // unchanged: keep the DOM, so marked text and focus stay
        // One toast for all answers of this poll: a second show() would close the first at once.
        const answered = fresh.filter(entry => entry.status !== 'open' && entries.find(item => item.id === entry.id)?.status === 'open');
        if (answered.length === 1) window.KlartextToast?.show(`Deine Anfrage „${answered[0].title}“ wurde ${answered[0].status === 'accepted' ? 'angenommen' : 'abgelehnt'}.`);
        else if (answered.length) window.KlartextToast?.show(`${answered.length} Anfragen wurden beantwortet.`);
        entries = fresh; render();
      } catch { /* offline for a moment: the next tick tries again */ }
    }
    $('[data-request-form]').addEventListener('submit', async event => {
      event.preventDefault();
      const body = {title: $('#requestTitle').value.trim(), description: $('#requestDescription').value.trim(), brand_id: $('#requestBrand').value || null,
        kind: $('#requestKind').value, quantity: Number($('#requestQuantity').value), wish_date: $('#requestWish').value || null};
      try {
        const saved = await request('/api/requests', 'POST', body);
        changes++; entries = [saved, ...entries.filter(item => item.id !== saved.id)];
        const compose = $('.requestCompose'); // the owner's status line sits far above the list, so a toast says it there
        status(owner() ? 'Anfrage gespeichert.' : 'Anfrage gesendet. Dominik wurde benachrichtigt.', false, Boolean(compose));
        $('#requestTitle').value = ''; $('#requestDescription').value = ''; $('#requestQuantity').value = '1'; $('#requestWish').value = ''; render();
        if (compose) { compose.open = false; compose.querySelector('summary').focus(); }
      } catch (error) { status(error.message, true); }
    });
    root.addEventListener('click', async event => {
      const target = event.target.closest('button'), row = target?.closest('[data-request]'); if (!row) return;
      const entry = entries.find(item => item.id === row.dataset.request); if (!entry) return;
      const replace = saved => { changes++; entries = entries.map(item => item.id === saved.id ? saved : item); declining = null; render(); };
      try {
        if (target.hasAttribute('data-request-accept')) {
          const project = row.querySelector('[data-request-project]').value;
          if (!project) { status('Für diese Firma gibt es noch kein Projekt. Leg zuerst unter Aufgaben eins an.', true); return; }
          const saved = await request(`/api/requests/${entry.id}/accept`, 'POST', {project_id: project});
          replace(saved); status(`${saved.task_ids.length} ${saved.task_ids.length === 1 ? 'Aufgabe' : 'Aufgaben'} angelegt.`);
          window.KlartextTasks?.open(saved.task_ids[0]);
        } else if (target.hasAttribute('data-request-decline')) { declining = entry.id; render(); root.querySelector(`[data-request="${entry.id}"] [data-request-reason]`)?.focus(); }
        else if (target.hasAttribute('data-request-decline-cancel')) { declining = null; render(); }
        else if (target.hasAttribute('data-request-decline-confirm')) {
          replace(await request(`/api/requests/${entry.id}/decline`, 'POST', {reason: row.querySelector('[data-request-reason]').value.trim()}));
          status('Anfrage abgelehnt.');
        }
      } catch (error) { status(error.message, true); }
    });
    window.addEventListener('klartext:workspace-change', event => {
      clearInterval(poll); poll = 0;
      if (event.detail?.name === 'requests') { load(); poll = setInterval(refresh, 10000); }
    });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
  }
  window.KlartextRequests = Object.freeze({mount});
})();
