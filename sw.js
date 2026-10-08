// Offline-tolerant app shell. Bump VERSION on each release so users receive updates.
const VERSION = 'cbt-v1';
const SHELL = ['./', 'index.html', 'app.js', 'lib.js', 'styles.css', 'firebase-config.js', 'manifest.webmanifest', 'privacy.html', 'terms.html', 'icon-192.png', 'icon-512.png'];
const SDK = 'https://www.gstatic.com/firebasejs/'; // versioned, immutable Firebase SDK files
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  // Firestore, Auth and every other API call go straight to the network. Never cached.
  if (r.url.startsWith(SDK)) return e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(x => x.put(r, c)); } return res; })));
  if (new URL(r.url).origin !== location.origin) return;
  // Same-origin files: serve cached copy instantly, refresh it in the background.
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => {
    const net = fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(x => x.put(r, c)); } return res; })
      .catch(() => hit || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    return hit || net;
  }));
});
