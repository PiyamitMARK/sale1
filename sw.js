/**
 * ข้าวซอย 90 — Service Worker
 * Strategy: Cache-First สำหรับ assets, Network-First สำหรับ Firebase
 */

const CACHE_NAME = 'kaosoi90-v1';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 วัน

// ไฟล์ที่ต้อง pre-cache ตอน install
const PRECACHE_URLS = [
  '/',
  '/customer.html',
  '/customer.css',
  '/customer.js',
  '/darkmode.js',
  '/menu-manager.js',
  '/admin.html',
  '/admin.css',
  '/admin.js',
  '/styles.css',
  '/app.js',
  '/backoffice.html',
  '/manifest.json',
  // Google Fonts (จะ cache ตอนใช้งานครั้งแรก)
];

// Domains ที่ไม่ cache (Firebase real-time, Analytics)
const NO_CACHE_PATTERNS = [
  /firebasedatabase\.app/,
  /firebaseio\.com/,
  /googleapis\.com\/identitytoolkit/,
  /securetoken\.google\.com/,
  /recaptcha/,
];

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // cache ทีละไฟล์ ถ้าไฟล์ไหน fail ไม่หยุด
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(() => {/* ไม่บังคับ */})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ==================== FETCH ====================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ข้ามถ้าไม่ใช่ GET
  if (request.method !== 'GET') return;

  // ข้าม Firebase / Auth / reCAPTCHA — ให้ network ทำงานตามปกติ
  if (NO_CACHE_PATTERNS.some(p => p.test(request.url))) return;

  // Google Fonts CSS → Stale-While-Revalidate
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Google Fonts files + cdnjs → Cache-First (นาน)
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ไฟล์ images/ → Cache-First
  if (url.pathname.startsWith('/images/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML, CSS, JS → Stale-While-Revalidate (เร็ว + อัปเดตพร้อมกัน)
  if (
    request.destination === 'document' ||
    request.destination === 'script'   ||
    request.destination === 'style'
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // อื่นๆ → Network-First fallback to cache
  event.respondWith(networkFirst(request));
});

// ==================== Strategies ====================

/** Cache-First: ใช้ cache ถ้ามี, ไป network ถ้าไม่มี */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/** Stale-While-Revalidate: ส่ง cache ก่อน, อัปเดต cache ใน background */
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

/** Network-First: ลอง network ก่อน, fallback to cache */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ==================== Background Sync (future) ====================
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
