/* Einstellungen: Darstellung für alle Rollen (je Gerät, theme-boot.js); Instagram, Mitteilungen, Kalender (Zeitzone, doppelte Uhrzeit), Standard-Qualität der Transkription und Zugang über Tailscale nur für Dominik (access.py, roles.css). */
(() => {
  'use strict';
  const ZONES = [['Europe/Berlin', 'Berlin'], ['Europe/Vienna', 'Wien'], ['Europe/Zurich', 'Zürich'], ['Europe/London', 'London'], ['UTC', 'Weltzeit (UTC)']];
  function el(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Einstellungen');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Einstellungen', response.status)); }
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Einstellungen', response.status));
    return data;
  }

  function mount(host) {
    if (!host || host.querySelector('[data-structure-view="settings"]')) return;
    const root = el('section', 'settingsPage'); root.dataset.structureView = 'settings'; root.hidden = true; root.setAttribute('aria-label', 'Einstellungen');
    root.innerHTML = `<section class="card"><h2 id="settingsThemeTitle">Darstellung</h2>
        <fieldset class="themeSwatches" role="radiogroup" aria-labelledby="settingsThemeTitle" data-settings-theme></fieldset></section>
      <section class="card" data-settings-owner><h2>Instagram</h2><p class="status">Konten zuordnen, Standorte pflegen und Bilder für Instagram prüfen.</p>
        <button type="button" class="btn" data-ig-setup>Instagram einrichten</button>
        <p class="status" data-settings-instagram-status role="status"></p></section>
      <section class="card" data-settings-owner><h2>Mitteilungen</h2><p class="status">Mitteilungen schaltest du auf der Seite Freigaben für jedes Gerät ein.</p>
        <button type="button" class="btn" data-shell-route="review">Zu den Freigaben</button></section>
      <section class="card" data-settings-owner><h2>Kalender</h2>
        <label class="field"><span>Zeitzone</span><select id="settingsTimezone">${ZONES.map(([zone, city]) => `<option value="${zone}">${city}</option>`).join('')}</select></label>
        <label class="field"><span>Bei doppelter Uhrzeit (Umstellung auf Winterzeit)</span><select id="settingsFold"><option value="0">Erste Uhrzeit (noch Sommerzeit)</option><option value="1">Zweite Uhrzeit (schon Winterzeit)</option></select></label>
        <p class="status" data-settings-calendar-status role="status" aria-live="polite"></p></section>
      <section class="card" data-settings-owner><h2>Transkription</h2>
        <label class="field"><span>Standard-Qualität</span><select id="settingsModel"><option value="tiny">Schnell</option><option value="base">Kompakt</option><option value="small">Ausgewogen</option><option value="medium">Gründlich</option></select></label>
        <p class="status" data-settings-status role="status" aria-live="polite"></p></section>
      <section class="card" data-settings-owner><h2>Zugang</h2><p class="status" data-settings-origin></p>
        <ol class="settingsSteps"><li>In Tailscale das Gerät teilen.</li><li>Die Person im Team eintragen.</li><li>Am iPhone in Safari „Zum Home-Bildschirm“ wählen.</li></ol></section>`;
    host.append(root);
    const swatches = root.querySelector('[data-settings-theme]');
    for (const bg of KlartextTheme.BACKGROUNDS) {
      const label = el('label', 'themeSwatch'), radio = el('input', 'srOnly');
      label.dataset.swatch = bg.id; radio.type = 'radio'; radio.name = 'settingsTheme'; radio.value = bg.id;
      label.append(radio, el('span', '', bg.name)); swatches.append(label);
    }
    const showTheme = () => { swatches.querySelector(`input[value="${KlartextTheme.current()}"]`).checked = true; };
    swatches.addEventListener('change', event => KlartextTheme.set(event.target.value));
    window.addEventListener('klartext:theme-changed', showTheme); showTheme();
    const status = root.querySelector('[data-settings-status]'), select = root.querySelector('#settingsModel'), origin = root.querySelector('[data-settings-origin]');
    const zone = root.querySelector('#settingsTimezone'), fold = root.querySelector('#settingsFold'), calendarStatus = root.querySelector('[data-settings-calendar-status]');
    const report = (text, error = false, target = status) => { target.textContent = text; target.classList.toggle('isError', error); };
    async function load() {
      // Before /api/me answers nothing is ready; shell.js asks again once the role is there.
      if (!document.body.dataset.role) return;
      // Only Dominik reads the server settings; every other role sees just Darstellung.
      if (document.body.dataset.role !== 'owner') { root.dataset.settingsReady = 'true'; return; }
      try {
        const settings = await request('/api/settings');
        if (settings.transcription_model) select.value = settings.transcription_model;
        // A zone stored outside the short list stays choosable.
        if (settings.timezone && ![...zone.options].some(option => option.value === settings.timezone)) zone.add(new Option(settings.timezone, settings.timezone));
        if (settings.timezone) zone.value = settings.timezone;
        if ([0, 1].includes(settings.fold_default)) fold.value = String(settings.fold_default);
        origin.textContent = settings.share_origin ? `Im Tailnet erreichbar unter ${settings.share_origin}` : 'Nur am PC erreichbar';
        report(''); report('', false, calendarStatus);
      } catch (error) { report(error.message, true); }
      root.dataset.settingsReady = 'true';
    }
    // Each field saves alone, so a change here never overwrites another setting.
    const saveOnChange = (field, key, target, value = () => field.value) => field.addEventListener('change', async () => {
      report('Wird gespeichert …', false, target);
      try { await request('/api/settings', 'PUT', {[key]: value()}); report('Gespeichert', false, target); }
      catch (error) { report(error.message, true, target); }
    });
    saveOnChange(select, 'transcription_model', status);
    saveOnChange(zone, 'timezone', calendarStatus);
    saveOnChange(fold, 'fold_default', calendarStatus, () => Number(fold.value));
    // Only this click asks Meta about the account; loading the page never does.
    root.querySelector('[data-ig-setup]').addEventListener('click', async () => {
      if (document.body.dataset.role !== 'owner') return;
      try { window.KlartextInstagram?.setup(root, {brands: await request('/api/brands')}); }
      catch (error) { report(error.message, true, root.querySelector('[data-settings-instagram-status]')); }
    });
    window.addEventListener('klartext:workspace-change', event => { if (event.detail?.name === 'settings') load(); });
  }

  window.KlartextSettings = Object.freeze({mount});
})();
