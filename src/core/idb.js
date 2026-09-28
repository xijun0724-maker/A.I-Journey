/**
 * Minimal IndexedDB helpers for Journey A.I.
 *
 * localStorage stays the synchronous bootstrap path (and the only path in
 * tests / happy-dom, where `indexedDB` is undefined). IndexedDB is an async
 * mirror with a larger capacity: every successful persist also writes here,
 * and `Store.hydrateFromIDB()` can restore from it when localStorage is
 * missing, corrupt, or older.
 */

const DB_NAME = "journeyai";
const STORE = "kv";
const DB_VERSION = 1;

export function idbAvailable() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch (_e) {
    return false;
  }
}

function openDB() {
  return new Promise(function (resolve, reject) {
    if (!idbAvailable()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = function () {
      const db = req.result;
      if (db && db.objectStoreNames && !db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error || new Error("IndexedDB open failed"));
    };
    req.onblocked = function () {
      reject(new Error("IndexedDB open blocked"));
    };
  });
}

function runTx(mode, fn) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      let req;
      try {
        const tx = db.transaction(STORE, mode);
        tx.onabort = function () {
          reject(tx.error || new Error("IndexedDB transaction aborted"));
        };
        req = fn(tx.objectStore(STORE));
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error || new Error("IndexedDB request failed"));
        };
      } catch (e) {
        reject(e);
        return;
      }
      if (!req) resolve(undefined);
    }).finally(function () {
      try {
        db.close();
      } catch (_e) {
        /* ignore */
      }
    });
  });
}

/** Read a key. Resolves `null` when missing or IndexedDB is unavailable. */
export async function idbGet(key) {
  if (!idbAvailable()) return null;
  try {
    const value = await runTx("readonly", function (store) {
      return store.get(key);
    });
    return value === undefined ? null : value;
  } catch (_e) {
    return null;
  }
}

/**
 * Write a key. Resolves `true` on success, `false` when IndexedDB is
 * unavailable or the write fails. Never throws.
 */
export async function idbSet(key, value) {
  if (!idbAvailable()) return false;
  try {
    await runTx("readwrite", function (store) {
      return store.put(value, key);
    });
    return true;
  } catch (_e) {
    return false;
  }
}
