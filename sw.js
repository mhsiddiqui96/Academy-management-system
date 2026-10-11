// At-Turath Academy — অফলাইনে অ্যাপ খোলার জন্য।
// নিয়ম: ইন্টারনেট থাকলে সবসময় নতুন ফাইল আনে (তাই আপডেট সঙ্গে সঙ্গে আসে),
// ইন্টারনেট না থাকলে শেষবার রাখা কপি দেখায়। ডেটা (Firebase) এখানে আসে না।
const CACHE = 'at-turath-v1';
const CORE = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/config.js', 'js/vendor/firebase.js',
  'manifest.json', 'icons/emblem.png', 'icons/logo.png', 'icons/icon-192.png', 'icons/favicon-48.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Firebase, ফন্ট ইত্যাদি ব্রাউজার নিজে সামলায়
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
