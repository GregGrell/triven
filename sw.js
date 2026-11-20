// Triven service worker: makes the site installable and shows a friendly page when offline.
// It deliberately caches nothing else: pages, code and data always come from the network, so a new build is
// picked up straight away (the app's own update check handles reloading).
const CACHE = 'triven-offline-v1';
const OFFLINE = ['offline.html', 'logo.svg', 'img/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;   // only page loads; everything else goes straight to the network
  e.respondWith(fetch(e.request).catch(() => caches.match('offline.html')));
});
