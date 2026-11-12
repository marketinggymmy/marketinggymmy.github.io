/* Finanzen (only Dominik): price and billing per task, budget per project, totals per brand and month, CSV for Excel. */
(() => {
  'use strict';
  const BILLING = [['offen', 'Offen'], ['abgerechnet', 'Abgerechnet'], ['bezahlt', 'Bezahlt']];
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Finanzen');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Finanzen', response.status)); }
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Finanzen', response.status));
    return data;
  }
  const plain = cents => cents == null ? '' : (cents / 100).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false});
  const money = cents => `${(cents / 100).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €`;
  function cents(text) {
    const value = text.replace(/[\s€]/g, '');
    if (!value) return null;
    if (!/^\d{1,9}([.,]\d{1,2})?$/.test(value)) return NaN;
    const [euros, rest = ''] = value.split(/[.,]/);
    return Number(euros) * 100 + Number(rest.padEnd(2, '0'));
  }
  const monthName = month => new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('de-DE', {month: 'long', year: 'numeric'});

  function mount(host) {
    if (!host || host.querySelector('[data-structure-view="finance"]')) return;
    const root = el('section', 'financePage'); root.dataset.structureView = 'finance'; root.hidden = true; root.setAttribute('aria-label', 'Finanzen');
    window.KlartextShell?.setActions('finance', [{label: 'Als CSV herunterladen', target: '[data-finance-csv]'}]);
    root.innerHTML = `<p class="pageIntro">Nur für dich sichtbar, eine Aufgabe zählt im Monat ihrer Frist oder sonst im Monat ihrer Anlage.</p>
      <p class="status" data-finance-status role="status" aria-live="polite"></p>
      <div class="financeFilters"><div class="field"><label for="financeBrand">Firma</label><select id="financeBrand"></select></div><div class="field"><label for="financeMonth">Monat</label><select id="financeMonth"></select></div>
        <a class="btn" data-finance-csv download>Als CSV herunterladen</a></div>
      <div class="financeTotals" data-finance-totals></div>
      <div class="tableWrap"><table class="table"><thead><tr><th>Nr</th><th>Aufgabe</th><th>Projekt</th><th>Monat</th><th>Stufe</th><th class="num">Preis in €</th><th>Stand</th></tr></thead>
        <tbody data-finance-rows></tbody></table></div>
      <h2>Budgets</h2>
      <div class="tableWrap"><table class="table"><thead><tr><th>Projekt</th><th class="num">Budget in €</th><th class="num">Verplant</th><th class="num">Rest</th></tr></thead>
        <tbody data-finance-projects></tbody></table></div>`;
    host.append(root);
    const $ = selector => root.querySelector(selector);
    let data = null, brands = [];
    // Errors also show as a toast: the status line sits above a table that can be long. It keeps the text but stays quiet then, so the sentence is said once.
    const status = (text, error = false) => { const node = $('[data-finance-status]'); node.setAttribute('aria-live', error ? 'off' : 'polite'); node.textContent = text; node.classList.toggle('isError', error); if (error) window.KlartextToast?.show(text, {tone: 'error'}); };
    // Table fields have the .field look without a visible label; their aria-label names them.
    const cell = (control, className = '') => { const td = el('td', className), wrap = el('span', 'field'); wrap.append(control); td.append(wrap); return td; };
    const query = () => { const params = new URLSearchParams(); if ($('#financeBrand').value) params.set('brand', $('#financeBrand').value); if ($('#financeMonth').value) params.set('month', $('#financeMonth').value); return params.toString(); };

    function render() {
      // Saving one row rebuilds the table; keep the focused field and every unsaved entry (an invalid one too), with what was typed.
      const active = document.activeElement;
      const keep = [...new Set([...root.querySelectorAll('[data-finance-price], [data-finance-budget]')].filter(input => input.value !== input.defaultValue).concat(active))].flatMap(node => {
        const row = node?.closest?.('[data-finance-task], [data-finance-project]');
        return row && root.contains(row) ? [{key: row.dataset.financeTask || row.dataset.financeProject, attr: [...node.attributes].find(a => a.name.startsWith('data-finance-'))?.name, value: node.value, invalid: node.getAttribute('aria-invalid') === 'true', focus: node === active}] : [];
      });
      const month = $('#financeMonth').value;
      $('#financeMonth').replaceChildren(new Option('Alle Monate', ''), ...data.months.map(value => new Option(monthName(value), value)));
      $('#financeMonth').value = data.months.includes(month) ? month : '';
      $('[data-finance-csv]').href = `/api/finance/export.csv${query() ? `?${query()}` : ''}`;
      $('[data-finance-totals]').replaceChildren(...[['gesamt', 'Gesamt'], ...BILLING].map(([key, label]) => {
        const box = el('div', 'card'); box.dataset.financeTotal = key; box.append(el('span', '', label), el('strong', '', money(data.totals[key]))); return box;
      }));
      $('[data-finance-rows]').replaceChildren(...(data.rows.length ? data.rows.map(row => {
        const tr = el('tr'); tr.dataset.financeTask = row.task_id;
        const price = el('input'); price.dataset.financePrice = ''; price.inputMode = 'decimal'; price.defaultValue = plain(row.price_cents); price.setAttribute('aria-label', `Preis für ${row.title}`);
        const billing = el('select'); billing.dataset.financeBilling = ''; billing.setAttribute('aria-label', `Stand für ${row.title}`);
        billing.append(...BILLING.map(([value, label]) => new Option(label, value))); billing.value = row.billing;
        const cells = [String(row.number), row.title, [row.brand, row.project].filter(Boolean).join(' · '), monthName(row.month)].map(text => el('td', '', text));
        const stage = el('td'); stage.append(window.KlartextStage.chip(row.stage_id, row.stage));
        tr.append(...cells, stage, cell(price, 'num'), cell(billing)); return tr;
      }) : [(() => { const tr = el('tr'), td = el('td'); td.colSpan = 7; td.append(window.KlartextStage.emptyState({icon: 'money', title: 'Keine Aufgaben in dieser Auswahl', text: 'Wähl eine andere Firma oder einen anderen Monat.'})); tr.append(td); return tr; })()]));
      $('[data-finance-projects]').replaceChildren(...data.projects.map(project => {
        const tr = el('tr'); tr.dataset.financeProject = project.id;
        const budget = el('input'); budget.dataset.financeBudget = ''; budget.inputMode = 'decimal'; budget.defaultValue = plain(project.budget_cents); budget.setAttribute('aria-label', `Budget für ${project.name}`);
        const rest = project.budget_cents == null ? '' : money(project.budget_cents - project.spent_cents);
        tr.append(el('td', '', project.name), cell(budget, 'num'), el('td', 'num', money(project.spent_cents)),
          el('td', `num${project.budget_cents != null && project.spent_cents > project.budget_cents ? ' adminHot' : ''}`, rest));
        return tr;
      }));
      for (const entry of keep) {
        const again = root.querySelector(`[data-finance-task="${entry.key}"] [${entry.attr}], [data-finance-project="${entry.key}"] [${entry.attr}]`);
        // A saved entry now matches the server; show the server's format unless the user is still in the field.
        if (!again || (!entry.focus && cents(entry.value) === cents(again.defaultValue))) continue;
        again.value = entry.value;
        if (entry.invalid) again.setAttribute('aria-invalid', 'true');
        if (entry.focus) again.focus();
      }
    }
    async function load() {
      try {
        if (!brands.length) {
          brands = (await request('/api/workspace')).brands;
          $('#financeBrand').replaceChildren(new Option('Alle Firmen', ''), ...brands.map(brand => new Option(brand.name, brand.id)));
        }
        data = await request(`/api/finance${query() ? `?${query()}` : ''}`);
        render(); root.dataset.financeReady = 'true';
      } catch (error) { status(error.message, true); }
    }
    // A failed save marks the field, so render() keeps its value and the next save reports it.
    async function save(url, body, selector) {
      try {
        await request(url, 'PUT', body);
        const invalid = root.querySelector('[aria-invalid="true"]');
        status(invalid ? 'Gespeichert. Ein Feld hat noch einen ungültigen Wert.' : 'Gespeichert', Boolean(invalid));
        await load();
      }
      catch (error) {
        // Look the field up again: another save may have rebuilt the table meanwhile. Only an unsaved value is marked.
        const field = root.querySelector(selector);
        if (field && field.value !== field.defaultValue) field.setAttribute('aria-invalid', 'true');
        status(error.message, true);
      }
    }
    for (const id of ['#financeBrand', '#financeMonth']) $(id).addEventListener('change', load);
    root.addEventListener('change', event => {
      const row = event.target.closest('[data-finance-task]'), project = event.target.closest('[data-finance-project]');
      const input = row?.querySelector('[data-finance-price]') || project?.querySelector('[data-finance-budget]');
      if (!input) return;
      const value = cents(input.value);
      if (Number.isNaN(value)) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      if (row) {
        if (Number.isNaN(value)) { status('Der Preis ist keine Zahl. Gib ihn als Zahl an, zum Beispiel 450,50.', true); return; }
        save(`/api/finance/tasks/${row.dataset.financeTask}`, {price_cents: value, billing: row.querySelector('[data-finance-billing]').value}, `[data-finance-task="${row.dataset.financeTask}"] [data-finance-price]`);
      } else {
        if (Number.isNaN(value)) { status('Das Budget ist keine Zahl. Gib es als Zahl an, zum Beispiel 2000.', true); return; }
        save(`/api/finance/projects/${project.dataset.financeProject}`, {budget_cents: value}, `[data-finance-project="${project.dataset.financeProject}"] [data-finance-budget]`);
      }
    });
    window.addEventListener('klartext:workspace-change', event => { if (event.detail?.name === 'finance') load(); });
  }
  window.KlartextFinance = Object.freeze({mount});
})();
