const CACHE_NAME = 'gardena-v1.2.7';
const ASSETS = ["./", "./manifest.json", "./icon-192.png", "./icon-512.png", "./index.html"];

// Database Config
const DB_NAME = 'GARDENA_DB';
const STORE_NAME = 'offline_attendance';

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('script.google.com')) return fetch(e.request);
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});

// Fitur Background Sync
self.addEventListener('sync', e => {
    if (e.tag === 'sync-absensi') {
        e.waitUntil(sendOfflineData());
    }
});

// Konfigurasi ulang fungsi pengiriman di Service Worker
async function sendOfflineData() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const allData = await store.getAll();

    // URL murni GAS tanpa query string data
    const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyDeWZyUvXj3qVOZXviPgN-d42jswXgkm2cvYlA7OBgGSPX-G_rxYti_rJWGVdpmi_f2A/exec";

    for (const data of allData) {
        try {
            // Kirim menggunakan POST menggunakan URLSearchParams / FormData agar kompatibel dengan doPost GAS
            const response = await fetch(`${WEB_APP_URL}?action=${data.action}`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.payload)
            }); 
            
            if (response.ok) {
                const deleteTx = db.transaction(STORE_NAME, 'readwrite');
                await deleteTx.objectStore(STORE_NAME).delete(data.id);
            }
        } catch (err) {
            console.error("Gagal sinkron data ID: " + data.id);
        }
    }
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
