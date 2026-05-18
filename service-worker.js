// Offline-first: precache the app shell + vendored OCR engine so the tool
// works at the table with no signal. Bump CACHE to ship updates.
const CACHE = 'codenames-helper-v1';

const ASSETS = [
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
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/core/tesseract-core-simd-lstm.js',
  './vendor/tesseract/core/tesseract-core-simd-lstm.wasm',
  './vendor/tesseract/core/tesseract-core-lstm.js',
  './vendor/tesseract/core/tesseract-core-lstm.wasm',
  './vendor/tesseract/lang/eng.traineddata.gz',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first; fall back to network and store new GETs (e.g. samples).
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
