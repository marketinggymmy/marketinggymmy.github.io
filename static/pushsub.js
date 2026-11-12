/* Mitteilungen auf diesem Gerät: ein Helfer für Freigaben und die Instagram-Einrichtung. Wer Abos haben darf, entscheidet der Server. */
(() => {
  'use strict';
  const keyBytes = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), char => char.charCodeAt(0));
  const deviceLabel = () => /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer';
  const browserCan = () => !!(navigator.serviceWorker && window.PushManager && window.Notification);
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Mitteilungen');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Mitteilungen', response.status)); }
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Mitteilungen', response.status));
    return data;
  }

  // Safari on iPhone and iPad delivers web push only to a Klartext added to the home screen.
  function supported() {
    if (/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone) return {ok: false, reason: 'Füge Klartext erst über Teilen „Zum Home-Bildschirm“ hinzu.'};
    if (!browserCan()) return {ok: false, reason: 'Dieses Gerät kann hier keine Mitteilungen empfangen.'};
    return {ok: true, reason: ''};
  }

  async function subscription() {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? registration.pushManager.getSubscription() : null;
  }

  async function state() {
    if (!supported().ok) return 'unsupported';
    const current = await subscription();
    if (!current) return 'off';
    return (await request(`/api/push/mine?endpoint=${encodeURIComponent(current.endpoint)}`)).subscribed ? 'on' : 'off';
  }

  async function enable() {
    if (!browserCan()) throw new Error('Dieses Gerät kann hier keine Mitteilungen empfangen. Auf dem iPhone Klartext zuerst zum Home-Bildschirm hinzufügen.');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Mitteilungen wurden auf diesem Gerät nicht erlaubt.');
    const registration = await navigator.serviceWorker.register('/sw.js'), {key} = await request('/api/push/key');
    const subscribed = (await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(key)})).toJSON();
    await request('/api/push/subscribe', 'POST', {endpoint: subscribed.endpoint, keys: subscribed.keys, label: deviceLabel()});
  }

  async function disable() {
    if (!browserCan()) return;
    const current = await subscription();
    if (!current) return;
    await request('/api/push/subscribe', 'DELETE', {endpoint: current.endpoint});
    await current.unsubscribe();
  }

  window.KlartextPush = Object.freeze({supported, state, enable, disable});
})();
