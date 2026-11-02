// Service Worker: macht Bora! installierbar und offline nutzbar (erst Netz, sonst Zwischenspeicher)
const C = 'bora-v12';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'style.css?v=12', 'data.js?v=12', 'app.js?v=12', 'audio.js?v=12', 'icon-192.png', 'flag.svg', 'zettel.html']))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
