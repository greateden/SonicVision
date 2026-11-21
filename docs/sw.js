const prefix = 'sonicvision-';
const cacheName = prefix + 'streaming-v2';
const files = [
  'index.html', 'style.css', 'app.js', 'protocol.js', 'stream.js', 'video.js', 'video-run.js',
  'playout.js', 'decode.js', 'mic.js', 'modem/sonance_wasm.js', 'modem/sonance_wasm_bg.wasm',
].map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.href === self.registration.scope) url.href = files[0];
  if (!files.includes(url.href)) return;
  event.respondWith(caches.open(cacheName).then(cache => cache.match(url.href))
    .then(response => response ?? fetch(event.request)));
});
