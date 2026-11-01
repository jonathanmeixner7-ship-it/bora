// Service Worker: macht Bora! installierbar und offline nutzbar (erst Netz, sonst Zwischenspeicher)
const C = 'bora-v6';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'style.css?v=6', 'data.js?v=6', 'app.js?v=6', 'audio.js?v=6', 'icon-192.png']))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
