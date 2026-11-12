'use strict';
// Klartext service worker: shows push notifications only. It caches nothing, so the app is always fresh.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || 'Klartext', {
    body: data.body || '', icon: '/static/icon-192.png', badge: '/static/icon-192.png', data: {url: data.url || '/'}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.openWindow(url));
});
