const CACHE_NAME = 'temichevvet-owner-shell-v6';
const STATIC_ASSETS = [
  '/portal/app.css',
  '/portal/app.css?v=20260724-push1',
  '/portal/app.js?v=20260724-push1',
  '/manifest.webmanifest',
  '/portal/icons/lk-icon-64.png',
  '/portal/icons/lk-icon-180.png',
  '/portal/icons/lk-icon-192.png',
  '/portal/icons/lk-icon-512.png',
  '/portal/icons/lk-icon-maskable-512.png',
];
const STATIC_PATHS = new Set(STATIC_ASSETS.map((asset) => new URL(asset, self.location.origin).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/v1/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request));
    return;
  }

  if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }

  const title = typeof payload.title === 'string' ? payload.title : 'Новое сообщение TemichevVet';
  const body = typeof payload.body === 'string' ? payload.body : 'В личном кабинете новое сообщение.';
  const url = typeof payload.url === 'string' ? payload.url : '/portal?section=notifications';
  const badgeCount = Number.isFinite(Number(payload.badge)) ? Math.max(1, Number(payload.badge)) : 1;

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body,
      icon: '/portal/icons/lk-icon-192.png',
      badge: '/portal/icons/lk-icon-192.png',
      tag: typeof payload.tag === 'string' ? payload.tag : 'temichevvet-owner-messages',
      renotify: true,
      data: { url },
    }),
    setBadge(badgeCount),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/portal?section=notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ('navigate' in client) await client.navigate(targetUrl);
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

async function setBadge(count) {
  if (self.navigator && 'setAppBadge' in self.navigator) {
    try { await self.navigator.setAppBadge(count); } catch {}
  }
}
