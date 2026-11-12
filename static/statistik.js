/* Statistik: Dominik's analytics dashboard in a sandboxed frame, loaded the first time the page opens. */
(() => {
  'use strict';
  function mount(host) {
    if (!host || host.querySelector('[data-structure-view="statistik"]')) return;
    const root = document.createElement('section');
    root.className = 'statistikWorkspace'; root.dataset.structureView = 'statistik'; root.hidden = true;
    root.setAttribute('aria-label', 'Statistik');
    root.innerHTML = `<header class="statistikHeading"><p class="pageIntro">Instagram und Anzeigen aus „Meta Auswertung“ · wird jeden Montag aktualisiert</p>
      <a class="btn isQuiet" data-statistik-open href="/statistik/" target="_blank" rel="noopener">In neuem Tab öffnen</a></header>
      <div class="card statistikFrameWrap" data-statistik-frame></div>`;
    host.append(root);
    window.addEventListener('klartext:workspace-change', event => {
      if (event.detail?.name !== 'statistik' || root.querySelector('iframe')) return;
      const frame = document.createElement('iframe');
      // Own sandbox: the dashboard's scripts run, but cannot reach Klartext.
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
      frame.className = 'statistikFrame'; frame.title = 'Statistik'; frame.src = '/statistik/';
      root.querySelector('[data-statistik-frame]').append(frame);
    });
  }
  window.KlartextStatistik = Object.freeze({mount});
})();
