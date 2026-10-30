// Service worker: nhận thông báo đẩy (Web Push) và mở đúng màn hình khi bấm vào thông báo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Sổ Bán Hàng Gốm', body: event.data ? event.data.text() : '' }; }
  const url = './?' + new URLSearchParams({ book: d.book_id || '', open: d.link || '' }).toString();
  event.waitUntil(self.registration.showNotification(d.title || 'Sổ Bán Hàng Gốm', {
    body: d.body || '', tag: d.tag || ('n' + (d.id || Date.now())), icon: './icon-192.png', badge: './badge-72.png',
    data: { url }, renotify: d.level === 'bad' || d.level === 'warn',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ type: 'open', url }); return; } }
    await self.clients.openWindow(url);
  })());
});
