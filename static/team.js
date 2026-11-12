/* Team page (only Dominik): people, their Tailscale login, role and, for clients, their brands; plus who has how much to do. */
(() => {
  'use strict';
  const ROLES = [['team', 'Team'], ['pruefer', 'Prüfer'], ['kunde', 'Kunde']];
  const roleName = id => Object.fromEntries(ROLES)[id] || id;
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function button(text, attrs = {}, className = '') { const node = el('button', className, text); node.type = 'button'; for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; }
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Team');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Team', response.status)); }
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Team', response.status));
    return data;
  }
  const iso = day => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  function isoWeek(day) {
    const t = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }

  function mount(host) {
    if (!host || host.querySelector('[data-structure-view="team"]')) return;
    const root = el('section', 'teamPage'); root.dataset.structureView = 'team'; root.hidden = true; root.setAttribute('aria-label', 'Team');
    window.KlartextShell?.setActions('team', [{label: 'Person hinzufügen', target: '[data-team-new]'}]);
    root.innerHTML = `<p class="pageIntro">Klartext erkennt Personen an ihrem Tailscale-Login und zeigt jedem nur, was seine Rolle darf.</p>
      <button type="button" class="btn" data-team-new>Person hinzufügen</button>
      <p class="status" data-team-status role="status" aria-live="polite"></p>
      <section class="card" data-team-share aria-labelledby="teamShareTitle"><h2 id="teamShareTitle">Person einladen</h2>
        <ol class="teamSteps"><li>In Tailscale das Gerät teilen. <a href="https://login.tailscale.com/admin/machines" target="_blank" rel="noopener">Tailscale öffnen</a></li>
          <li>Die Person hier eintragen.</li><li>Am iPhone in Safari „Zum Home-Bildschirm“ wählen.</li>
          <li>Unbekannte Logins sehen nur Freigaben und Anfragen. Trage Chefs als Prüfer ein, dann sehen sie alles außer Team und Finanzen.</li></ol></section>
      <div class="tableWrap" hidden><table class="table" data-team-list><thead><tr><th>Name</th><th>Login</th><th>Rolle</th><th>Firmen</th><th>Status</th><th aria-label="Aktionen"></th></tr></thead><tbody></tbody></table></div>
      <div data-team-empty hidden></div>
      <section class="card" aria-labelledby="teamLoadTitle"><h2 id="teamLoadTitle">Auslastung</h2>
        <p class="status">Offene Aufgaben je Person nach Frist.</p><div class="tableWrap" data-team-load></div></section>
      <form class="card" data-team-form><h2 data-team-form-title>Person hinzufügen</h2>
        <div class="teamFields"><div class="field"><label for="teamName">Name</label><input id="teamName" maxlength="40" required></div>
        <div class="field"><label for="teamLogin">Tailscale-Login</label><input id="teamLogin" type="email" placeholder="name@gmail.com"></div>
        <div class="field"><label for="teamRole">Rolle</label><select id="teamRole"></select></div></div>
        <fieldset class="teamBrands" data-team-brands><legend>Firmen des Kunden</legend><div class="teamBrandList" data-team-brand-list></div></fieldset>
        <p class="status" data-team-role-hint></p>
        <div class="teamActions"><button type="submit" class="btn isPrimary" data-team-save>Speichern</button><button type="button" class="btn" data-team-cancel hidden>Abbrechen</button></div>
      </form>`;
    host.append(root);
    const $ = selector => root.querySelector(selector);
    $('[data-team-empty]').append(window.KlartextStage.emptyState({icon: 'people', title: 'Noch niemand eingetragen', text: 'Deine Chefs können auch ohne Eintrag prüfen.'}));
    const hints = {team: 'Arbeitet an Projekten, Aufgaben, Material und Freigaben. Planen, Posten und Finanzen bleiben bei dir.',
      pruefer: 'Sieht alles außer Team und Finanzen, darf prüfen, kommentieren, freigeben und anfragen, sonst nichts ändern.', kunde: 'Sieht nur die Freigaben und Anfragen der gewählten Firmen.'};
    for (const [value, label] of ROLES) $('#teamRole').add(new Option(label, value));
    let people = [], workspace = null, editing = null;
    const status = (text, error = false) => { const node = $('[data-team-status]'); node.textContent = text; node.classList.toggle('isError', error); };
    const open = () => (workspace?.tasks || []).filter(task => task.stage !== 'published');
    const brandName = id => workspace?.brands.find(brand => brand.id === id)?.name || id;

    function renderBrands(selected = []) {
      $('[data-team-brand-list]').replaceChildren(...(workspace?.brands || []).map(brand => {
        const label = el('label', 'check'), box = el('input'); box.type = 'checkbox'; box.dataset.teamBrand = brand.id; box.checked = selected.includes(brand.id);
        label.append(box, document.createTextNode(brand.name)); return label;
      }));
    }
    function syncRole() {
      const role = $('#teamRole').value;
      $('[data-team-brands]').hidden = role !== 'kunde'; $('[data-team-role-hint]').textContent = hints[role] || '';
    }
    function renderLoad() {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const weeks = [0, 1, 2, 3].map(index => { const start = new Date(monday); start.setDate(monday.getDate() + index * 7); const end = new Date(start); end.setDate(start.getDate() + 6); return {label: `KW ${isoWeek(start)}`, end: iso(end)}; });
      const columns = ['Überfällig', ...weeks.map(week => week.label), 'Später', 'Ohne Frist'];
      const bucket = deadline => !deadline ? columns.length - 1 : deadline < iso(today) ? 0 : (weeks.findIndex(week => deadline <= week.end) + 1 || columns.length - 2);
      const persons = [{id: 'owner', name: 'Dominik'}, ...people.filter(person => person.role === 'team')];
      const table = el('table', 'table'), head = el('tr');
      head.append(el('th', '', 'Person'), ...columns.map(label => el('th', 'num', label)));
      table.append(el('thead')); table.tHead.append(head);
      const body = el('tbody');
      for (const person of persons) {
        const counts = columns.map(() => 0);
        for (const task of open()) if (task.assignee === person.id) counts[bucket(task.deadline)] += 1;
        const row = el('tr'); row.dataset.loadPerson = person.id;
        const name = el('th', '', person.name); name.scope = 'row';
        row.append(name, ...counts.map((count, index) => el('td', `num${index === 0 && count ? ' adminHot' : ''}`, String(count))));
        body.append(row);
      }
      table.append(body); $('[data-team-load]').replaceChildren(table);
    }
    function render() {
      $('[data-team-list]').tBodies[0].replaceChildren(...people.map(person => {
        const row = el('tr'); row.dataset.teamPerson = person.id;
        const chip = el('span', 'chip', person.login ? 'Aktiv' : 'Ohne Login'); chip.dataset.status = person.login ? 'accepted' : 'draft';
        const state = el('td'), actions = el('td'), wrap = el('div', 'teamActions');
        state.append(chip);
        wrap.append(button('Bearbeiten', {'data-team-edit': ''}, 'btn isQuiet'),
          button('Entfernen', {'data-team-remove': ''}, 'btn isDanger'));
        actions.append(wrap);
        row.append(el('td', '', person.name), el('td', '', person.login || 'Kein Login hinterlegt'), el('td', '', roleName(person.role)),
          el('td', '', person.role === 'kunde' ? person.brands.map(brandName).join(', ') || 'Keine' : 'Alle'), state, actions);
        return row;
      }));
      $('[data-team-list]').closest('.tableWrap').hidden = !people.length; $('[data-team-empty]').hidden = !!people.length;
      renderLoad();
    }
    function fillForm(person) {
      editing = person?.id || null;
      $('#teamName').value = person?.name || ''; $('#teamLogin').value = person?.login || ''; $('#teamRole').value = person?.role || 'team';
      renderBrands(person?.brands || []); syncRole();
      $('[data-team-form-title]').textContent = person ? `${person.name} bearbeiten` : 'Person hinzufügen';
      $('[data-team-cancel]').hidden = !person;
    }
    async function load() {
      try {
        [people, workspace] = await Promise.all([request('/api/team').then(data => data.people), request('/api/workspace').catch(() => null)]);
        render(); if (!editing) fillForm(null); root.dataset.teamReady = 'true';
      } catch (error) { status(error.message, true); }
    }
    $('[data-team-form]').addEventListener('submit', async event => {
      event.preventDefault();
      const body = {name: $('#teamName').value.trim(), login: $('#teamLogin').value.trim() || null, role: $('#teamRole').value,
        brands: [...root.querySelectorAll('[data-team-brand]:checked')].map(box => box.dataset.teamBrand)};
      if (body.role !== 'kunde') body.brands = [];
      try {
        const saved = await request(editing ? `/api/team/${encodeURIComponent(editing)}` : '/api/team', editing ? 'PATCH' : 'POST', body);
        people = editing ? people.map(person => person.id === saved.id ? saved : person) : [...people, saved];
        status(`${saved.name} gespeichert.`); fillForm(null); render();
      } catch (error) { status(error.message, true); }
    });
    $('#teamRole').addEventListener('change', syncRole);
    root.addEventListener('click', async event => {
      const target = event.target.closest('button'); if (!target) return;
      const person = people.find(entry => entry.id === target.closest('[data-team-person]')?.dataset.teamPerson);
      if (target.hasAttribute('data-team-cancel')) fillForm(null);
      else if (target.hasAttribute('data-team-new')) { fillForm(null); $('#teamName').focus(); }
      else if (person && target.hasAttribute('data-team-edit')) { fillForm(person); $('#teamName').focus(); }
      else if (person && target.hasAttribute('data-team-remove')) {
        if (await window.KlartextConfirm.ask({title: `${person.name} entfernen?`, text: `Aufgaben von ${person.name} haben danach keine Verantwortlichen mehr.`, confirm: 'Entfernen'}) !== 'confirm') return;
        try { await request(`/api/team/${encodeURIComponent(person.id)}`, 'DELETE'); people = people.filter(entry => entry.id !== person.id); status(`${person.name} entfernt. Ihre Aufgaben haben keine Verantwortlichen mehr.`); render(); }
        catch (error) { status(error.message, true); }
      }
    });
    window.addEventListener('klartext:workspace-change', event => { if (event.detail?.name === 'team') load(); });
  }
  window.KlartextTeam = Object.freeze({mount});
})();
