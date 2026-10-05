// Offline support: keeps a copy of every file the app needs, so it opens and
// plays with no connection. Change VERSION whenever any of these files change;
// phones pick up the new copy the next time the app opens online.
const VERSION = 'blockblast-v1';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'app/app.css',
  'app/main.js',
  'app/profiles.js',
  'app/feedback.js',
  'app/icons/apple-touch-icon.png',
  'app/icons/icon-192.png',
  'app/icons/icon-512.png',
  'engine/index.js',
  'engine/board.js',
  'engine/pieces.js',
  'engine/rng.js',
  'engine/solver.js',
  'engine/difficulty.js',
  'engine/generator.js',
  'engine/scoring.js',
  'engine/game.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('blockblast-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache first: the app starts instantly and the same way with or without a connection.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() =>
    e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
