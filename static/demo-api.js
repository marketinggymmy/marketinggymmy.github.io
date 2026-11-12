/* Vorschau ohne Server: GET-Anfragen an /api/ kommen aus demo-data.json, alles andere wird freundlich abgelehnt. */
(() => {
  'use strict';
  const realFetch = window.fetch.bind(window);
  const data = realFetch('/demo-data.json').then(r => r.json()).catch(() => ({}));
  const NOTE = 'Vorschau mit Demodaten. Hier wird nichts gespeichert.';
  const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, options);
    const method = String(options.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
    if (method !== 'GET') {
      window.KlartextToast?.show(NOTE);
      return json({detail: NOTE}, 403);
    }
    const all = await data;
    const key = url.pathname + url.search;
    if (key in all) return json(all[key]);
    if (url.pathname in all) return json(all[url.pathname]);
    const file = await realFetch(url.pathname);  // aufgezeichnete Bilder liegen als Datei
    return file.ok ? file : json({detail: NOTE}, 404);
  };
  // XHR-Uploads gibt es in der Vorschau nicht.
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (String(method).toUpperCase() !== 'GET') { window.KlartextToast?.show(NOTE); return open.call(this, 'GET', '/demo-blocked', ...rest); }
    return open.call(this, method, url, ...rest);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('div');
    badge.className = 'demoBadge';
    badge.textContent = 'Vorschau · Demodaten';
    document.body.append(badge);
  });
})();
