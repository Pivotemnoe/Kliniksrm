/* Only the grooming path is controlled. No session, API or client data is cached. */
const STATIC_CACHE = 'grooming-staff-static-v3';
const OFFLINE = '/grooming/offline.html';
self.addEventListener('install', event => event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.add(OFFLINE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('grooming-staff-static-') && key !== STATIC_CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith('/grooming/')) event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
});
function safeUrl(value) {
  try { const url = new URL(value, self.location.origin); if (url.origin === self.location.origin && url.pathname.startsWith('/grooming/')) return url.href; } catch { /* Use the inbox. */ }
  return new URL('/grooming/notifications', self.location.origin).href;
}
self.addEventListener('push', event => event.waitUntil((async () => {
  let payload = {}; try { payload = event.data?.json() || {}; } catch { /* A generic notification is still visible. */ }
  await self.registration.showNotification('TemichevVet · Груминг', {
    body: payload.body === 'Проверка: уведомления подключены.' ? payload.body : 'Новое событие в вашем расписании. Откройте кабинет.',
    icon: '/brand/temichevvet-favicon-192.png', badge: '/brand/temichevvet-favicon-192.png',
    tag: /^grooming-staff:[a-zA-Z0-9-]+$/.test(payload.tag || '') ? payload.tag : 'grooming-staff:event',
    data: { url: safeUrl(payload.url) },
  });
  for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) if (new URL(client.url).pathname.startsWith('/grooming/')) client.postMessage({ type: 'GROOMING_INBOX_CHANGED' });
})()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safeUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (new URL(client.url).origin !== self.location.origin || !new URL(client.url).pathname.startsWith('/grooming/')) continue;
      try {
        // Focus during the notification gesture, before waiting for a page load on Android.
        const focused = await client.focus();
        if (client.url !== url && !await (focused || client).navigate(url)) continue;
        return;
      } catch { /* A suspended phone window may no longer be focusable. */ }
    }
    await self.clients.openWindow(url);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_GROOMING_NOTIFICATIONS') event.waitUntil(self.registration.getNotifications().then(items => items.filter(item => item.tag.startsWith('grooming-staff:')).forEach(item => item.close())));
});
