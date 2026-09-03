const CACHE_NAME = 'mapa-shell-v1';
const SHELL_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Estrategia: shell de la app en caché; los tiles del mapa y las APIs
// (Nominatim, OSRM, Overpass, Wikipedia) siempre van a la red porque
// cambian constantemente y no tiene sentido cachearlos indefinidamente.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  const isShellFile = SHELL_FILES.some((f) => url.endsWith(f.replace('./', '')));

  if (isShellFile) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
  // Todo lo demás (tiles, APIs) pasa directo a la red sin interceptar.
});
