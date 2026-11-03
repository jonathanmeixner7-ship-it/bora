// Service Worker: macht Bora! installierbar und offline nutzbar (erst Netz, sonst Zwischenspeicher)
const C = 'bora-v17';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'style.css?v=17', 'data.js?v=17', 'app.js?v=17', 'audio.js?v=17', 'icon-192.png', 'flag.svg', 'zettel.html']))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
