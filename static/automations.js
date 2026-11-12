/* Abläufe (only Dominik): "when X, then Y" rules with their log, and the custom fields every task can carry. */
(() => {
  'use strict';
  const FIELD_TYPES = [['text', 'Text'], ['number', 'Zahl'], ['date', 'Datum'], ['select', 'Auswahl']];
  // Rules set only the first three stages; from Zur Prüfung on Klartext sets the stage itself (task_store.CLIENT_STAGES).
  const CLIENT_STAGES = ['raw', 'edited', 'subtitles'];
  const VALUE_LABELS = {set_stage: 'Neue Stufe', assign: 'Person', deadline: 'Tage bis zur Frist', notify: 'Text der Mitteilung'};
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function button(text, attrs = {}, className = '') { const node = el('button', className, text); node.type = 'button'; for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; }
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Abläufe');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Abläufe', response.status)); }
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Abläufe', response.status));
    return data;
  }

  function mount(host) {
    if (!host || host.querySelector('[data-structure-view="automations"]')) return;
    const root = el('section', 'automationsPage'); root.dataset.structureView = 'automations'; root.hidden = true; root.setAttribute('aria-label', 'Abläufe');
    window.KlartextShell?.setActions('automations', [{label: 'Neuer Ablauf', target: '#ruleName'}]);
    root.innerHTML = `<p class="pageIntro">Wiederkehrende Schritte laufen hier automatisch, und eigene Felder ergänzen das Aufgabenpanel.</p>
      <p class="status" data-automations-status role="status" aria-live="polite"></p>
      <section class="automationsSection" aria-labelledby="rulesTitle"><h2 id="rulesTitle">Abläufe</h2><div class="automationsList" data-rule-list></div></section>
      <form class="card automationsForm" data-rule-form><h2>Ablauf anlegen</h2>
        <div class="automationsFields"><label class="field"><span>Name</span><input id="ruleName" maxlength="80" placeholder="z. B. Prüfung an Carla"></label>
          <label class="field"><span>Wenn</span><select id="ruleTrigger"></select></label><label class="field" data-rule-stage-wrap><span>Stufe</span><select id="ruleStage"></select></label>
          <label class="field"><span>Dann</span><select id="ruleAction"></select></label><label class="field"><span data-rule-value-label></span><span data-rule-value-slot></span></label></div>
        <div class="automationsActions"><button type="submit" class="btn isPrimary" data-rule-save>Ablauf anlegen</button></div>
        <p class="automationsHint">Was ein Ablauf ändert, löst keinen weiteren aus.</p></form>
      <section class="card automationsForm" aria-labelledby="ruleLogTitle"><h2 id="ruleLogTitle">Protokoll</h2><div data-rule-log></div></section>
      <section class="automationsSection" aria-labelledby="fieldsTitle"><h2 id="fieldsTitle">Eigene Felder</h2>
        <p class="automationsHint">Erscheinen im Aufgabenpanel. Entfernte Felder verschwinden aus der Anzeige, gespeicherte Werte bleiben in den Aufgaben.</p>
        <div class="automationsList" data-field-list></div></section>
      <form class="card automationsForm" data-field-form><h2>Feld anlegen</h2>
        <div class="automationsFields"><label class="field"><span>Feldname</span><input id="fieldName" maxlength="40" required></label><label class="field"><span>Art</span><select id="fieldType"></select></label>
          <label class="field" data-field-options-wrap><span>Möglichkeiten, mit Komma getrennt</span><input id="fieldOptions" placeholder="9:16, 1:1, 4:5"></label></div>
        <div class="automationsActions"><button type="submit" class="btn" data-field-save>Feld anlegen</button></div></form>`;
    host.append(root);
    const $ = selector => root.querySelector(selector);
    let data = null, workspace = null, fields = [];
    const status = (text, error = false) => { const node = $('[data-automations-status]'); node.textContent = text; node.classList.toggle('isError', error); };
    function row(key, value, name, meta, ...controls) {
      const card = el('article', 'card automationsRow'); card.dataset[key] = value;
      const info = el('div', 'automationsInfo'); info.append(el('strong', '', name), el('span', 'automationsMeta', meta));
      const actions = el('div', 'automationsActions'); actions.append(...controls);
      card.append(info, actions); return card;
    }
    const stageName = id => workspace?.stages.find(stage => stage.id === id)?.label || id;
    const personName = id => workspace?.people.find(person => person.id === id)?.name || 'nicht mehr im Team';
    for (const [value, label] of FIELD_TYPES) $('#fieldType').add(new Option(label, value));

    function describe(rule) {
      const when = `${data.triggers[rule.trigger]}${rule.trigger === 'stage' ? ` „${stageName(rule.stage)}“` : ''}`;
      const value = {set_stage: () => `„${stageName(rule.value)}“`, assign: () => personName(rule.value), deadline: () => `${rule.value} ${rule.value === 1 ? 'Tag' : 'Tage'}`,
        notify: () => rule.value ? `„${rule.value}“` : ''}[rule.action]();
      return `Wenn ${when}, dann ${data.actions[rule.action]}${value ? `: ${value}` : ''}`;
    }
    function valueControl() {
      const action = $('#ruleAction').value;
      let control;
      if (action === 'set_stage' || action === 'assign') {
        control = el('select');
        control.append(...(action === 'set_stage' ? workspace.stages.filter(stage => CLIENT_STAGES.includes(stage.id)).map(stage => new Option(stage.label, stage.id)) : workspace.people.map(person => new Option(person.name, person.id))));
      } else {
        control = el('input');
        if (action === 'deadline') { control.type = 'number'; control.min = '0'; control.max = '365'; control.value = '2'; }
        else { control.maxLength = 200; control.placeholder = 'optional'; }
      }
      control.id = 'ruleValue';
      $('[data-rule-value-label]').textContent = VALUE_LABELS[action];
      $('[data-rule-value-slot]').replaceChildren(control);
    }
    function render() {
      $('[data-rule-stage-wrap]').hidden = $('#ruleTrigger').value !== 'stage';
      $('[data-field-options-wrap]').hidden = $('#fieldType').value !== 'select';
      $('[data-rule-list]').replaceChildren(...(data.rules.length ? data.rules.map(rule => {
        const toggle = el('label', 'check'), box = el('input'); box.type = 'checkbox'; box.checked = rule.enabled; box.dataset.ruleToggle = '';
        toggle.append(box, document.createTextNode('Aktiv'));
        return row('rule', rule.id, rule.name, describe(rule), toggle, button('Entfernen', {'data-rule-remove': ''}, 'btn isDanger'));
      }) : [window.KlartextStage.emptyState({icon: 'flow', title: 'Noch kein Ablauf', text: 'Leg unten deinen ersten an.'})]));
      const log = el('ul', 'automationsLog');
      log.append(...data.log.slice(0, 30).map(entry => {
        const when = new Date(entry.at).toLocaleString('de-DE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
        return el('li', '', `${when} · ${entry.rule} · ${entry.task} · ${entry.result === 'ok' ? 'erledigt' : entry.result}`);
      }));
      $('[data-rule-log]').replaceChildren(data.log.length ? log : el('p', 'status', 'Noch nichts ausgeführt.'));
      $('[data-field-list]').replaceChildren(...(fields.length ? fields.map(field => {
        const kind = Object.fromEntries(FIELD_TYPES)[field.type];
        return row('field', field.id, field.name, field.options.length ? `${kind}: ${field.options.join(', ')}` : kind,
          button('Entfernen', {'data-field-remove': ''}, 'btn isDanger'));
      }) : [el('p', 'status', 'Noch keine eigenen Felder.')]));
    }
    async function load() {
      try {
        [data, workspace, fields] = await Promise.all([request('/api/automations'), request('/api/workspace'), request('/api/fields').then(result => result.fields)]);
        if (!$('#ruleTrigger').options.length) {
          $('#ruleTrigger').append(...Object.entries(data.triggers).map(([value, label]) => new Option(label, value)));
          $('#ruleAction').append(...Object.entries(data.actions).map(([value, label]) => new Option(label, value)));
        }
        $('#ruleStage').replaceChildren(...workspace.stages.map(stage => new Option(stage.label, stage.id)));
        valueControl(); render(); root.dataset.automationsReady = 'true';
      } catch (error) { status(error.message, true); }
    }
    $('#ruleTrigger').addEventListener('change', render);
    $('#ruleAction').addEventListener('change', valueControl);
    $('#fieldType').addEventListener('change', render);
    $('[data-rule-form]').addEventListener('submit', async event => {
      event.preventDefault();
      const action = $('#ruleAction').value, raw = $('#ruleValue').value;
      const body = {name: $('#ruleName').value.trim() || data.actions[action], trigger: $('#ruleTrigger').value,
        stage: $('#ruleTrigger').value === 'stage' ? $('#ruleStage').value : null, action,
        value: action === 'deadline' ? Number(raw) : action === 'notify' ? raw.trim() : raw};
      try { data.rules = [...data.rules, await request('/api/automations', 'POST', body)]; $('#ruleName').value = ''; status('Ablauf angelegt.'); render(); }
      catch (error) { status(error.message, true); }
    });
    $('[data-field-form]').addEventListener('submit', async event => {
      event.preventDefault();
      const type = $('#fieldType').value;
      const body = {name: $('#fieldName').value.trim(), type, options: type === 'select' ? $('#fieldOptions').value.split(',').map(item => item.trim()).filter(Boolean) : []};
      try { fields = [...fields, await request('/api/fields', 'POST', body)]; $('#fieldName').value = ''; $('#fieldOptions').value = ''; status('Feld angelegt.'); render(); }
      catch (error) { status(error.message, true); }
    });
    root.addEventListener('change', async event => {
      const box = event.target.closest('[data-rule-toggle]'); if (!box) return;
      const id = box.closest('[data-rule]').dataset.rule;
      try { const saved = await request(`/api/automations/${id}`, 'PATCH', {enabled: box.checked}); data.rules = data.rules.map(rule => rule.id === id ? saved : rule); render(); }
      catch (error) { box.checked = !box.checked; status(error.message, true); }
    });
    root.addEventListener('click', async event => {
      const target = event.target.closest('[data-rule-remove], [data-field-remove]'); if (!target) return;
      const id = target.closest('[data-rule], [data-field]'), key = id.dataset.rule || id.dataset.field;
      const rule = data.rules.find(entry => entry.id === key), field = fields.find(entry => entry.id === key);
      const question = id.dataset.rule ? {title: `Ablauf „${rule?.name || ''}“ entfernen?`, text: 'Er löst danach nichts mehr aus.'} : {title: `Feld „${field?.name || ''}“ entfernen?`};
      if (await window.KlartextConfirm.ask({...question, confirm: 'Entfernen'}) !== 'confirm') return;
      try {
        if (id.dataset.rule) { await request(`/api/automations/${key}`, 'DELETE'); data.rules = data.rules.filter(rule => rule.id !== key); }
        else { await request(`/api/fields/${key}`, 'DELETE'); fields = fields.filter(field => field.id !== key); }
        status('Entfernt.'); render();
      } catch (error) { status(error.message, true); }
    });
    window.addEventListener('klartext:workspace-change', event => { if (event.detail?.name === 'automations') load(); });
  }
  window.KlartextAutomations = Object.freeze({mount});
})();
