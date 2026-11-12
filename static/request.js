/* Ein Wortlaut für alle Seiten, wenn der Server nicht erreichbar ist oder ohne Grund ablehnt (Spec 4.2: Verbindung fehlgeschlagen). Die Request-Helfer der Seiten rufen beides auf. */
(() => {
  'use strict';
  // what names the page's data for reading ("Aufgaben nicht geladen."); writing always says that nothing was saved.
  function failed(method = 'GET', what = '', status = 0) {
    if (status === 422) return 'Nicht gespeichert. Prüf deine Eingaben und versuch es noch mal.';
    if (String(method).toUpperCase() !== 'GET') return 'Nicht gespeichert. Verbindung fehlgeschlagen, versuch es noch mal.';
    return what ? `${what} nicht geladen. Verbindung fehlgeschlagen, lade die Seite neu.` : 'Verbindung fehlgeschlagen. Prüf, ob Tailscale an ist, und lade die Seite neu.';
  }
  // Without a connection fetch throws the browser's own text ("Failed to fetch", Safari "Load failed"); a deliberate abort stays an abort.
  async function send(url, options = {}, what = '') {
    try { return await fetch(url, options); } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new Error(failed(options.method, what));
    }
  }
  window.KlartextRequest = Object.freeze({send, failed});
})();
