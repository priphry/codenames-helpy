// Offline-first, but memory-friendly on phones: only the tiny app shell is
// precached on install. The heavy OCR engine (~8 MB of wasm + language data)
// is cached lazily by the fetch handler the first time OCR actually runs, so
// install never spikes memory. Bump CACHE to ship updates.
const CACHE = 'codenames-helper-v2';

// Small, fast, always needed — safe to fetch together on install.
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/ocr.js',
  './js/keycard.js',
  './js/grid.js',
  './js/game.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/tesseract/tesseract.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first; anything not precached (the big Tesseract core/wasm/lang) is
// fetched from network once and then cached for offline use thereafter.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
