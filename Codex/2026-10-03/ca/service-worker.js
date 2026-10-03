const CACHE_NAME = 'yourkitchen-shell-v10';
const APP_FILES = [
  './', './index.html', './privacy.html', './styles.css', './script.js', './translations.js',
  './manifest.webmanifest', './supabase-config.js', './assets/icon.svg',
  './assets/recipes/tomato-soup.jpg', './assets/recipes/mushroom-rice.webp',
  './assets/recipes/lemon-pasta.webp', './assets/recipes/chickpea-salad.webp',
  './assets/recipes/chili-noodles.jpg', './assets/recipes/potato-tacos.jpg',
  './assets/recipes/fried-rice.jpg', './assets/recipes/butter-beans.jpg',
  './assets/recipes/apple-crumble.webp', './assets/recipes/mug-cake.jpg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('yourkitchen-') && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) { const copy=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)); }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
