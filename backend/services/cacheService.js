/**
 * Cache Service untuk Abjad.in (v2 — Hybrid Mode)
 * ──────────────────────────────────────────────────
 * STRATEGI: In-Memory cache SELALU dipakai sebagai lapisan pertama.
 * Jika Firestore tersedia (production di Cloud Run), data juga disimpan ke Firestore.
 * Jika Firestore tidak tersedia (local dev tanpa credentials), fallback ke in-memory saja.
 * 
 * Ini menghilangkan bottleneck 20-25 detik ketika Firestore credentials tidak ada.
 */

// ============================================================
// IN-MEMORY CACHE (always-available, process lifetime)
// ============================================================
const memCache = new Map();

function memSet(key, value, ttlSeconds = 3600) {
  const expiredAt = Date.now() + (ttlSeconds * 1000);
  memCache.set(key, { value, expiredAt });
}

function memGet(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiredAt) {
    memCache.delete(key);
    return null;
  }
  return entry.value;
}

// ============================================================
// FIRESTORE CACHE (optional, only when credentials available)
// ============================================================
let db = null;
let firestoreAvailable = false;
const FIRESTORE_TIMEOUT_MS = 3000; // Hard timeout untuk Firestore operations

try {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  db = admin.firestore();
  firestoreAvailable = true;
} catch (e) {
  console.warn('[CacheService] Firestore not available, using in-memory cache only:', e.message);
}

/**
 * Helper: race Firestore operation dengan timeout
 */
function withTimeout(promise, ms = FIRESTORE_TIMEOUT_MS) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Firestore timeout (${ms}ms)`)), ms)
  );
  return Promise.race([promise, timeoutPromise]);
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Set a value in the cache (memory + Firestore jika tersedia)
 */
async function set(key, value, ttlSeconds = 3600) {
  // Selalu simpan ke memory
  memSet(key, value, ttlSeconds);

  // Fire-and-forget ke Firestore jika tersedia
  if (firestoreAvailable && db) {
    const expiredAt = Date.now() + (ttlSeconds * 1000);
    withTimeout(
      db.collection('cache').doc(key).set({ value, expiredAt })
    ).catch(() => { /* silent fail */ });
  }
}

/**
 * Get a value from the cache (memory first, Firestore fallback)
 */
async function get(key) {
  // Check memory first (zero latency)
  const memResult = memGet(key);
  if (memResult !== null) return memResult;

  // Fallback ke Firestore jika tersedia
  if (!firestoreAvailable || !db) return null;

  try {
    const docRef = db.collection('cache').doc(key);
    const doc = await withTimeout(docRef.get());

    if (!doc.exists) return null;

    const data = doc.data();
    if (!data || !data.expiredAt || Date.now() > data.expiredAt) {
      // Expired — cleanup async
      withTimeout(docRef.delete()).catch(() => {});
      return null;
    }

    // Simpan ke memory untuk akses berikutnya
    const remainingTtl = Math.floor((data.expiredAt - Date.now()) / 1000);
    if (remainingTtl > 0) memSet(key, data.value, remainingTtl);

    return data.value;
  } catch (error) {
    // Firestore error (timeout, credentials, dll) — silent fail
    return null;
  }
}

/**
 * Delete a value from the cache
 */
async function deleteCache(key) {
  memCache.delete(key);
  if (firestoreAvailable && db) {
    withTimeout(db.collection('cache').doc(key).delete()).catch(() => {});
  }
}

module.exports = {
  get,
  set,
  delete: deleteCache,
  // Expose for testing
  memGet,
  memSet,
  firestoreAvailable: () => firestoreAvailable
};
