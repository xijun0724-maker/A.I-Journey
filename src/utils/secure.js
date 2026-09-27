/**
 * Secure storage for sensitive data (API keys).
 *
 * The key is held in sessionStorage for the current tab only, with a
 * last-used audit and a TTL. `stripKey()` removes it from every localStorage
 * write, so it never reaches disk.
 *
 * There is exactly one credential — the OpenRouter key, kept under the
 * `openrouter` slot so a session that predates the Gemini removal keeps it.
 * Gemini's slots are pruned on read: a key for an endpoint the app no longer
 * calls must never be mistaken for a live credential.
 *
 * Note: the value is not encrypted. A browser cannot keep a secret from
 * same-origin script, and the guard that actually matters is not persisting
 * the key at all - which `stripKey()` enforces on every save path.
 */

const SESSION_KEY = "journeyai.secure.v2";
const KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const KEY_TTL_ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;

/** The one key slot, and the pre-v5 slots that must never be read again. */
const SLOT = "openrouter";
const LEGACY_SLOTS = ["gemini", "apiKey"];

function getSessionStorage() {
  return typeof globalThis !== "undefined" ? globalThis.sessionStorage : null;
}

function getStore() {
  try {
    const ss = getSessionStorage();
    if (!ss) return { keys: {}, meta: {} };
    const raw = ss.getItem(SESSION_KEY);
    if (!raw) return { keys: {}, meta: {} };
    const parsed = JSON.parse(raw);
    if (parsed.version !== 2) return { keys: {}, meta: {} };
    /* Prune Gemini's credentials (and the pre-namespacing alias) the first
       time anything touches the store. */
    let pruned = false;
    parsed.keys = parsed.keys || {};
    parsed.meta = parsed.meta || {};
    for (const legacy of LEGACY_SLOTS) {
      if (legacy in parsed.keys) {
        delete parsed.keys[legacy];
        pruned = true;
      }
      if (legacy in parsed.meta) {
        delete parsed.meta[legacy];
        pruned = true;
      }
    }
    if (pruned) saveStore(parsed);
    return parsed;
  } catch (_e) {
    return { keys: {}, meta: {} };
  }
}

function saveStore(obj) {
  try {
    const ss = getSessionStorage();
    if (!ss) return;
    ss.setItem(SESSION_KEY, JSON.stringify({ version: 2, ...obj }));
  } catch (_e) {
    // degraded: the key stays in memory for this page load only
  }
}

function now() {
  return Date.now();
}

export function setApiKey(key) {
  const store = getStore();
  store.meta = store.meta || {};
  if (key && key.trim().length > 10) {
    store.keys[SLOT] = {
      value: key.trim(),
      created: now(),
      lastUsed: now(),
    };
    delete store.meta[SLOT];
  } else {
    delete store.keys[SLOT];
    delete store.meta[SLOT];
  }
  saveStore(store);
}

export function getApiKey() {
  const store = getStore();
  const entry = store.keys[SLOT];
  if (!entry) return "";
  const idle = now() - (entry.lastUsed || entry.created);
  const aged = now() - entry.created;
  if (idle > KEY_TTL_MS || aged > KEY_TTL_ABSOLUTE_MS) {
    clearApiKey(true);
    return "";
  }
  entry.lastUsed = now();
  if (now() - entry.created > KEY_TTL_MS / 2) {
    entry.created = now();
  }
  saveStore(store);
  return entry.value;
}

export function clearApiKey(expired = false) {
  const store = getStore();
  delete store.keys[SLOT];
  store.meta = store.meta || {};
  if (expired) {
    store.meta[SLOT] = { expired: true, at: now() };
  } else {
    delete store.meta[SLOT];
  }
  saveStore(store);
}

/** @returns {{present: boolean, expired: boolean}} — lets Settings explain the fallback */
export function keyStatus() {
  const store = getStore();
  const entry = store.keys[SLOT];
  if (entry) {
    const idle = now() - (entry.lastUsed || entry.created);
    const aged = now() - entry.created;
    const expired = idle > KEY_TTL_MS || aged > KEY_TTL_ABSOLUTE_MS;
    return { present: !expired, expired };
  }
  if (store.meta && store.meta[SLOT] && store.meta[SLOT].expired) {
    return { present: false, expired: true };
  }
  return { present: false, expired: false };
}

export function hasApiKey() {
  return !!getApiKey();
}

export function hydrateKey(settings) {
  if (!settings) return;
  const key = getApiKey();
  if (key) settings.apiKey = key;
  else delete settings.apiKey;
}

export function stripKey(db) {
  if (!db || !db.settings) return db;
  const { apiKey: _apiKey, ...rest } = db.settings;
  return { ...db, settings: { ...rest, apiKey: "" } };
}
