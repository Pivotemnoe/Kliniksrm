/* Public offline page only. Never cache API responses, sessions or patient data. */
const CACHE = 'staff-app-offline-v1';
const OFFLINE = '/staff/offline.html';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('staff-app-offline-') && key !== CACHE) await caches.delete(key);
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/staff/') || event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE)) || new Response('Нет связи с CRM', { status: 503 })));
});
self.addEventListener('push', event => event.waitUntil((async () => {
  let data; try { data = event.data?.json(); } catch { return; }
  // Notification text is deliberately generic; patient details require login.
  await self.registration.showNotification('TemichevVet', { body: 'Есть обновление по вашей записи. Откройте приложение.',
    tag: 'staff-app-update', icon: '/staff/icon-192.png', data: { href: '/staff/inbox' } });
})()));
self.addEventListener('notificationclick', event => { event.notification.close(); event.waitUntil((async () => {
  const target = new URL('/staff/inbox', self.location.origin).href;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = clients.find(client => new URL(client.url).pathname.startsWith('/staff/'));
  if (existing) { await existing.focus(); existing.postMessage({ type: 'STAFF_APP_UPDATED' }); }
  else await self.clients.openWindow(target);
})()); });
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_STAFF_APP_NOTIFICATIONS') event.waitUntil(self.registration.getNotifications().then(items => Promise.all(items.filter(item => item.tag === 'staff-app-update').map(item => item.close()))));
});
