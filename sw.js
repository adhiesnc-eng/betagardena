const CACHE_NAME = 'gardena-v1.2.8';
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Konfigurasi Database IndexedDB Lokal
const DB_NAME = 'GARDENA_DB';
const STORE_NAME = 'offline_attendance';

// Konfigurasi Endpoint Firebase Realtime Database
const FIREBASE_REST_URL = "https://gardena-4a8b1-default-rtdb.asia-southeast1.firebasedatabase.app/GARDENA/DATA.json";

// 1. Install & Cache App Shell
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// 2. Activate & Hapus Cache Lama
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Intercept Network Requests
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Bypass cache untuk request Firebase, Google Apps Script, dan static weights model AI
  if (
    url.includes('firebasedatabase.app') ||
    url.includes('googleapis.com') ||
    url.includes('script.google.com') ||
    url.includes('justadudewhohacks.github.io')
  ) {
    return e.respondWith(fetch(e.request));
  }

  // Stale-While-Revalidate untuk aset lokal
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      if (cachedResponse) {
        fetch(e.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});

// 4. Background Sync Saat Kembali Online
self.addEventListener('sync', e => {
  if (e.tag === 'sync-absensi') {
    e.waitUntil(sendOfflineDataToFirebase());
  }
});

// Sinkronisasi data offline langsung ke Firebase REST API
async function sendOfflineDataToFirebase() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const allData = await getAllRecords(store);

  for (const item of allData) {
    try {
      const payload = Array.isArray(item.payload) ? item.payload[0] : item.payload;
      
      // Kirim via POST langsung ke node DATA di Firebase
      const response = await fetch(FIREBASE_REST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const deleteTx = db.transaction(STORE_NAME, 'readwrite');
        await deleteTx.objectStore(STORE_NAME).delete(item.id);
      }
    } catch (err) {
      console.error("Gagal sinkron data offline ID: " + item.id, err);
    }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllRecords(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
