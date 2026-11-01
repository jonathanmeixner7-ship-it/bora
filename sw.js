// Service Worker: macht Bora! installierbar und offline nutzbar (erst Netz, sonst Zwischenspeicher)
const C = 'bora-v9';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'style.css?v=9', 'data.js?v=9', 'app.js?v=9', 'audio.js?v=9', 'icon-192.png', 'flag.svg']))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
