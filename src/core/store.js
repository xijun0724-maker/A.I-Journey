/**
 * Persistence layer for Journey A.I.
 *
 * localStorage is the synchronous bootstrap path (and the only path when
 * IndexedDB is unavailable, e.g. tests / happy-dom). IndexedDB mirrors every
 * successful persist with a larger capacity; `hydrateFromIDB()` restores from
 * it when localStorage is missing, unreadable, or older than the mirror.
 */

import { CFG } from "../config/constants.js";
import { debounce, fmtBytes, slug, uid } from "../utils/helpers.js";
import { toast } from "../utils/dom.js";
import { createBlankDB, migrateSchema } from "../config/settings.js";
import { stripKey } from "../utils/secure.js";
import { idbAvailable, idbGet, idbSet } from "./idb.js";
import { recompute as recomputeTask } from "../domain/tasks.js";

// Sidecar key: last successful persist timestamp for the main DB key.
// Used to decide whether IndexedDB holds a newer snapshot than localStorage.
const AT_KEY = CFG.storageKey + ".at";

// Singleton database instance
let db = null;

/* Monotonic mirror revision. Bumped on every successful persist and stored
   with the IndexedDB record so hydrate can break timestamp ties and other
   tabs can tell a real write from a same-ms rewrite. */
let _rev = 0;

/* Set when stored data belongs to a newer app version or failed migration.
   While quarantined, persist() refuses to write so the newer bytes in
   localStorage are never overwritten by a blank/older schema. */
let _quarantined = false;

function isQuarantined() {
  return _quarantined;
}

/**
 * Lock the live database's top-level shape in tests and dev.
 *
 * `Object.seal` allows reassigning schema keys (`db.courses = []`) but throws
 * in strict mode when code invents a new root key (`db.coursez = []`) — the
 * typo class of bug that silently never persists. Production stays unsealed so
 * a future migration can add keys before they land in `createBlankDB`.
 * @param {Object} d
 * @returns {Object} The same object, sealed when applicable
 */
function maybeSeal(d) {
  if (!d || typeof d !== "object") return d;
  try {
    const env =
      (typeof import.meta !== "undefined" && import.meta.env) || undefined;
    const privileged =
      (env && (env.DEV || env.MODE === "test")) ||
      (typeof process !== "undefined" &&
        process.env &&
        (process.env.NODE_ENV === "test" || process.env.VITEST));
    if (privileged) Object.seal(d);
  } catch (_e) {
    /* sealing is a development aid only */
  }
  return d;
}

// Event bus: lightweight pub/sub for Store changes
const listeners = {};

/**
 * Subscribe to a Store event.
 * @param {string} event - Event name (e.g. 'save', 'load', 'reset')
 * @param {Function} fn - Callback
 * @returns {Function} Unsubscribe function
 */
function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return function () {
    listeners[event] = listeners[event].filter(function (f) {
      return f !== fn;
    });
  };
}

/**
 * Emit a Store event.
 * @param {string} event - Event name
 * @param {*} data - Event payload
 */
function emit(event, data) {
  (listeners[event] || []).forEach(function (fn) {
    try {
      fn(data);
    } catch (e) {
      if (typeof console !== "undefined" && console.error)
        console.error('Store listener for "' + event + '" failed', e);
    }
  });
}

// Maximum localStorage key count before eviction
const MAX_STORAGE_KEYS = 200;

/**
 * Evict oldest Journey-owned keys when storage is near capacity.
 * Never touches other applications' keys on a shared origin.
 * Always keeps the main DB key and its timestamp sidecar.
 */
function evictIfNeeded() {
  try {
    let keys = Object.keys(localStorage).filter(function (k) {
      return k.startsWith("journeyai.");
    });
    if (keys.length < MAX_STORAGE_KEYS) return;
    // Drop oldest Journey keys first, but always keep the current DB key.
    for (let i = 0; i < keys.length && keys.length >= MAX_STORAGE_KEYS; i++) {
      const k = keys[i];
      if (k !== CFG.storageKey && k !== AT_KEY) {
        localStorage.removeItem(k);
        keys = keys.filter(function (x) {
          return x !== k;
        });
      }
    }
  } catch (_e) {
    console.warn("Store: eviction failed", _e);
  }
}

/**
 * Validate that an object is a plain, non-circular object safe for JSON serialization.
 */
function isValidData(value) {
  if (!value || typeof value !== "object") return false;
  try {
    const seen = new WeakSet();
    JSON.stringify(value, function (_key, val) {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return false;
        seen.add(val);
      }
      return val;
    });
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Create a blank database with default settings.
 * Delegates to the schema module so there is a single source of truth.
 * @returns {Object} Blank database
 */
function blank() {
  return createBlankDB();
}

function deduplicateData(data) {
  let changed = false;
  function dedupe(list, keyOf, merge) {
    const seen = {};
    const out = [];
    (list || []).forEach(function (item) {
      const key = keyOf(item);
      if (!key || !seen[key]) {
        if (key) seen[key] = item;
        out.push(item);
        return;
      }
      changed = true;
      if (merge) merge(seen[key], item);
    });
    return out;
  }
  data.lessons = dedupe(
    data.lessons,
    function (lesson) {
      return [
        lesson.courseId || "",
        lesson.week == null ? "none" : lesson.week,
        slug(lesson.topic),
      ].join("|");
    },
    function (first, duplicate) {
      if (!first.start && duplicate.start) first.start = duplicate.start;
      if (!first.end && duplicate.end) first.end = duplicate.end;
      if (duplicate.done) first.done = true;
    },
  );
  data.events = dedupe(
    data.events,
    function (event) {
      return [
        event.courseId || "",
        slug(event.title),
        event.due ? event.due.slice(0, 10) : "none",
      ].join("|");
    },
    function (first, duplicate) {
      if (!first.due && duplicate.due) first.due = duplicate.due;
      if (first.weight == null && duplicate.weight != null)
        first.weight = duplicate.weight;
      if (first.points == null && duplicate.points != null)
        first.points = duplicate.points;
    },
  );
  data.readings = dedupe(
    data.readings,
    function (reading) {
      return [
        reading.courseId || "",
        reading.week == null ? "none" : reading.week,
        slug(reading.title),
      ].join("|");
    },
    function (first, duplicate) {
      if (!first.source && duplicate.source) first.source = duplicate.source;
      if (!first.pages && duplicate.pages) first.pages = duplicate.pages;
    },
  );
  if (changed) {
    data.plan = [];
    data.planMeta = null;
  }
  return changed;
}

function getLsAt() {
  try {
    return Number(localStorage.getItem(AT_KEY)) || 0;
  } catch (_e) {
    return 0;
  }
}

/** Persisted mirror revision sidecar (`journeyai.db.v1.rev`), 0 when absent. */
function getLsRev() {
  try {
    return Number(localStorage.getItem(AT_KEY + ".rev")) || 0;
  } catch (_e) {
    return 0;
  }
}

/** Post a save notice on the cross-tab channel (no-op when unsupported). */
function broadcastSave(rev, savedAt) {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("journeyai-store");
    ch.postMessage({ key: CFG.storageKey, rev: rev, savedAt: savedAt });
    ch.close();
  } catch (_e) {
    /* channel is best-effort; storage events still cover localStorage writes */
  }
}

/**
 * Parse, migrate and adopt a JSON snapshot into the live db.
 * Throws on unreadable input. Returns nothing; sets `db` / `_quarantined`.
 */
function ingestRaw(raw) {
  const d = JSON.parse(raw);
  if (!d || typeof d !== "object") throw new Error("bad");
  const base = blank();
  if (!d.settings || typeof d.settings !== "object") d.settings = {};
  Object.keys(base).forEach(function (k) {
    if (d[k] === undefined) d[k] = base[k];
  });
  Object.keys(base.settings).forEach(function (k) {
    if (d.settings[k] === undefined) d.settings[k] = base.settings[k];
  });

  const migrated = migrateSchema(d);
  if (!migrated) {
    /* Newer-version or half-migrated data: run blank in memory but refuse
       every future persist so the stored bytes stay exactly as they are. */
    _quarantined = true;
    db = maybeSeal(blank());
    setTimeout(function () {
      toast(
        "This browser holds data from a newer version of Journey A.I. It was left untouched - update the app or export a backup from the newer version first.",
        "bad",
        "Storage version",
      );
    }, 400);
    return;
  }
  _quarantined = false;
  db = maybeSeal(migrated);
  if (deduplicateData(db)) setTimeout(persist, 0);
}

/**
 * Load database from localStorage (synchronous bootstrap path).
 * @returns {Object} Database object
 */
function load() {
  _activeCid = undefined;
  let raw = null;
  try {
    raw = localStorage.getItem(CFG.storageKey);
  } catch (_e) {
    raw = null;
  }
  if (!raw) {
    _quarantined = false;
    db = maybeSeal(blank());
    emit("load", db);
    return db;
  }
  try {
    ingestRaw(raw);
  } catch (_e) {
    db = maybeSeal(blank());
    setTimeout(function () {
      toast("Saved data could not be read and was reset.", "bad", "Storage");
    }, 400);
  }
  emit("load", db);
  return db;
}

/**
 * Restore from the IndexedDB mirror when it holds a newer (or only) snapshot
 * than localStorage. No-op when IndexedDB is unavailable, quarantined, or
 * localStorage is same-age/newer. Call after `load()`, before views render.
 * @returns {Promise<boolean>} True when the mirror was adopted
 */
async function hydrateFromIDB() {
  if (_quarantined) return false;
  if (!idbAvailable()) return false;

  let rec = null;
  try {
    rec = await idbGet(CFG.storageKey);
  } catch (_e) {
    return false;
  }
  if (!rec || typeof rec.json !== "string") return false;

  let lsRaw = null;
  try {
    lsRaw = localStorage.getItem(CFG.storageKey);
  } catch (_e) {
    lsRaw = null;
  }
  const lsAt = getLsAt();
  const idbAt = Number(rec.savedAt) || 0;
  const idbRev = Number(rec.rev) || 0;
  const lsRev = getLsRev();
  // localStorage present and strictly newer (or same-time newer rev) → keep it.
  if (lsRaw) {
    if (lsAt > idbAt) return false;
    if (lsAt === idbAt && lsRev >= idbRev) return false;
  }

  try {
    ingestRaw(rec.json);
  } catch (_e) {
    return false;
  }
  if (idbRev > _rev) _rev = idbRev;
  // Mirror back so the sidecar timestamp and localStorage catch up.
  persist();
  emit("load", db);
  return true;
}

/**
 * Persist database to localStorage and mirror to IndexedDB.
 * @returns {boolean} True if a durable copy was written
 */
function persist() {
  if (_quarantined) return false;
  try {
    // Strip the API key from the persisted copy without clearing the live session key.
    const snapshot = stripKey(db);
    const json = JSON.stringify(snapshot);
    if (json.length > CFG.storage.maxBytes * 0.95) {
      toast(
        "Storage is approaching capacity - export a backup and remove some files in Library.",
        "warn",
        "Storage warning",
      );
    }
    evictIfNeeded();

    const savedAt = Date.now();
    _rev += 1;
    let lsOk = false;
    try {
      localStorage.setItem(CFG.storageKey, json);
      try {
        localStorage.setItem(AT_KEY, String(savedAt));
        localStorage.setItem(AT_KEY + ".rev", String(_rev));
      } catch (_at) {
        /* sidecar is best-effort; hydrate falls back to IDB savedAt/rev */
      }
      lsOk = true;
    } catch (_ls) {
      /* quota exceeded — IndexedDB mirror below is the overflow path */
    }

    if (idbAvailable()) {
      idbSet(CFG.storageKey, {
        json: json,
        savedAt: savedAt,
        rev: _rev,
      }).catch(function (_e) {
        /* fire-and-forget; next persist retries */
      });
    }
    broadcastSave(_rev, savedAt);

    if (!lsOk && !idbAvailable()) {
      toast(
        "Browser storage is full - recent changes may be lost. Export a backup now, then remove files in Library.",
        "bad",
        "Storage full",
      );
      return false;
    }

    emit("save", { bytes: json.length });
    return true;
  } catch (_e) {
    toast(
      "Browser storage is full - recent changes may be lost. Export a backup now, then remove files in Library.",
      "bad",
      "Storage full",
    );
    return false;
  }
}

/**
 * Debounced save (250ms)
 */
const save = debounce(function () {
  persist();
}, 250);

/**
 * Immediate save
 * @returns {boolean} False when quarantined or the write failed
 */
function saveNow() {
  return persist();
}

/**
 * Replace the entire database with a new object (seed, migration, reset).
 * Validates the new object before accepting it.
 * @param {Object} newDb - The new database object
 */
function update(newDb) {
  if (!isValidData(newDb)) {
    console.error("Store.update: rejected invalid data");
    return;
  }
  db = maybeSeal(newDb);
  saveNow();
  emit("update", db);
}

/**
 * Get storage usage stats
 * @returns {Object} Usage stats
 */
function usage() {
  try {
    const s = localStorage.getItem(CFG.storageKey) || "";
    return {
      bytes: s.length * 2,
      pretty: fmtBytes(s.length * 2),
      cap: CFG.storage.maxBytes,
    };
  } catch (_e) {
    return { bytes: 0, pretty: "0 B", cap: CFG.storage.maxBytes };
  }
}

/* ---- lookups ---- */
function course(id) {
  return (
    (db.courses || []).find(function (c) {
      return c.id === id;
    }) || null
  );
}

function courseName(id) {
  const c = course(id);
  return c ? c.code || c.title : "Unassigned";
}

function courseColor(id) {
  const c = course(id);
  return c ? c.color || CFG.palette[0] : "#67717a";
}

function event(id) {
  return (
    (db.events || []).find(function (e) {
      return e.id === id;
    }) || null
  );
}

function doc(id) {
  return (
    (db.documents || []).find(function (d) {
      return d.id === id;
    }) || null
  );
}

function lesson(id) {
  return (
    (db.lessons || []).find(function (l) {
      return l.id === id;
    }) || null
  );
}

/**
 * Remove a course and all associated data
 * @param {string} id - Course ID
 */
function removeCourse(id) {
  db.courses = db.courses.filter(function (c) {
    return c.id !== id;
  });
  db.lessons = db.lessons.filter(function (l) {
    return l.courseId !== id;
  });
  db.events = db.events.filter(function (e) {
    return e.courseId !== id;
  });
  db.readings = db.readings.filter(function (r) {
    return r.courseId !== id;
  });
  const docs = db.documents
    .filter(function (d) {
      return d.courseId === id;
    })
    .map(function (d) {
      return d.id;
    });
  db.documents = db.documents.filter(function (d) {
    return d.courseId !== id;
  });
  db.chunks = db.chunks.filter(function (c) {
    return docs.indexOf(c.docId) === -1 && c.courseId !== id;
  });
  db.plan = (db.plan || []).filter(function (p) {
    return p.courseId !== id;
  });
  saveNow();
  emit("change", { entity: "courses", op: "remove", id });
}

/**
 * Reset all data to blank state
 */
function resetAll() {
  _activeCid = undefined;
  db = maybeSeal(blank());
  saveNow();
  emit("reset", db);
  emit("change", { entity: "all", op: "reset", id: null });
}

function notifyChange(entity, op, id) {
  saveNow();
  emit("change", { entity, op, id });
}

/**
 * Build a Store entity namespace.
 *
 * Every entity shares one insert/update/remove rule: find by id → assign →
 * notify, or build the default shape → push → notify. That rule is written
 * once here; each entity supplies only its defaults, an optional `onSave`
 * hook (recompute derived fields) and an optional `cascade` (side-arrays to
 * prune on removal). `get`/`all`/`save`/`remove` come from the factory, so a
 * new entity is a descriptor rather than a copy of ~40 lines.
 *
 * @param {Object} spec
 * @param {string} spec.name - Collection key on the DB (`db[name]`)
 * @param {Function} spec.defaults - `(data) => default record` (no spread)
 * @param {Function} [spec.onSave] - Run on every saved record
 * @param {Function} [spec.cascade] - `(id) => void`, extra cleanup on remove
 * @returns {Object} The namespace
 */
function makeEntity({ name, defaults, onSave, cascade }) {
  return {
    all() {
      return (db && db[name]) || [];
    },
    get(id) {
      return ((db && db[name]) || []).find((x) => x.id === id) || null;
    },
    save(data) {
      if (!data) return null;
      const list = db[name] || [];
      const existing = data.id ? list.find((x) => x.id === data.id) : null;
      if (existing) {
        Object.assign(existing, data);
        if (onSave) onSave(existing);
        notifyChange(name, "update", existing.id);
        return existing;
      }
      const rec = Object.assign(defaults(data), data);
      if (onSave) onSave(rec);
      list.push(rec);
      db[name] = list;
      notifyChange(name, "insert", rec.id);
      return rec;
    },
    remove(id) {
      db[name] = (db[name] || []).filter((x) => x.id !== id);
      if (cascade) cascade(id);
      notifyChange(name, "remove", id);
      return true;
    },
  };
}

/* Per-entity default shapes: the data the factory needs to create a record. */
function courseDefaults(data) {
  return {
    id: data.id || uid("crs"),
    code: data.code || "",
    name: data.name || "",
    color: data.color || (CFG.palette && CFG.palette[0]) || "#2f5d8c",
    termId: data.termId || "current",
    starred: !!data.starred,
  };
}
function eventDefaults(data) {
  return {
    id: data.id || uid("ev"),
    title: data.title || "",
    courseId: data.courseId || "",
    type: data.type || "assignment",
    due: data.due || "",
    status: data.status || "open",
    createdAt: data.createdAt || new Date().toISOString(),
  };
}
function lessonDefaults(data) {
  return {
    id: data.id || uid("lsn"),
    courseId: data.courseId || "",
    title: data.title || "",
    done: !!data.done,
  };
}
function readingDefaults(data) {
  return {
    id: data.id || uid("rdg"),
    courseId: data.courseId || "",
    title: data.title || "",
    done: !!data.done,
  };
}
function documentDefaults(data) {
  return {
    id: data.id || uid("doc"),
    name: data.name || "",
    courseId: data.courseId || "",
    text: data.text || "",
  };
}

const coursesNamespace = {
  ...makeEntity({ name: "courses", defaults: courseDefaults }),
  /* Course removal is a cascade, not a row delete, so it keeps its own verb. */
  remove(id) {
    removeCourse(id);
    return true;
  },
  toggleStar(id) {
    const c = course(id);
    if (!c) return false;
    c.starred = !c.starred;
    notifyChange("courses", "toggleStar", id);
    return c.starred;
  },
};

const eventsNamespace = {
  ...makeEntity({
    name: "events",
    defaults: eventDefaults,
    onSave: recomputeTask,
    cascade(id) {
      db.plan = (db.plan || []).filter((p) => p.eventId !== id);
    },
  }),
  toggle(id) {
    const ev = event(id);
    if (!ev) return null;
    const goingDone = ev.status !== "done";
    ev.status = goingDone ? "done" : "open";
    ev.completedAt = goingDone ? new Date().toISOString() : null;
    (ev.subtasks || []).forEach((s) => {
      s.done = goingDone;
    });
    recomputeTask(ev);
    notifyChange("events", "toggle", id);
    return ev;
  },
  toggleSubtask(eventId, subId) {
    const ev = event(eventId);
    if (!ev) return null;
    const sub = (ev.subtasks || []).find((s) => s.id === subId);
    if (!sub) return null;
    sub.done = !sub.done;
    recomputeTask(ev);
    notifyChange("events", "toggle-subtask", eventId);
    return sub;
  },
};

const lessonsNamespace = {
  ...makeEntity({ name: "lessons", defaults: lessonDefaults }),
  toggle(id) {
    const l = lesson(id);
    if (!l) return false;
    l.done = !l.done;
    notifyChange("lessons", "toggle", id);
    return l.done;
  },
};

const readingsNamespace = {
  ...makeEntity({ name: "readings", defaults: readingDefaults }),
  toggle(id) {
    const r = readingsNamespace.get(id);
    if (!r) return false;
    r.status = r.status === "done" ? "required" : "done";
    r.done = r.status === "done";
    notifyChange("readings", "toggle", id);
    return r.done;
  },
};

const documentsNamespace = makeEntity({
  name: "documents",
  defaults: documentDefaults,
  cascade(id) {
    db.chunks = (db.chunks || []).filter((c) => c.docId !== id);
  },
});

/* ── Chat conversations ─────────────────────────────────────────────
   The transcript is stored as one flat message list; a *conversation* is
   the group of messages sharing a cid. Messages stored before this concept
   existed carry no cid and form one legacy conversation, so old data keeps
   its shape with no schema migration. */

const LEGACY_CID = "c-legacy";

function cidOf(msg) {
  return (msg && msg.cid) || LEGACY_CID;
}

/*
 * Which conversation is open — session view state, deliberately not part of
 * the persisted schema:
 *   undefined → nothing chosen yet: resume the newest conversation (the
 *               pre-conversation behaviour, so a reload shows the transcript)
 *   null      → "New" was pressed: nothing open, the landing page shows
 *   string    → that conversation is open
 */
let _activeCid;

const chatNamespace = {
  all() {
    return (db && db.chat) || [];
  },

  /** cid of the open conversation, or null when the landing page shows. */
  activeId() {
    if (_activeCid === null) return null;
    const list = this.all();
    if (typeof _activeCid === "string") return _activeCid;
    return list.length ? cidOf(list[list.length - 1]) : null;
  },

  /** Messages of the open conversation, oldest first. */
  activeMessages() {
    const id = this.activeId();
    if (!id) return [];
    return this.all().filter(function (m) {
      return cidOf(m) === id;
    });
  },

  /**
   * Conversations, newest first: one entry per cid, titled by the
   * conversation's first user message (falling back to its first message,
   * so a drill-only conversation still has a label).
   *
   * @param {string} [query] - Keep only conversations whose text matches,
   *   case-insensitively; omit to keep them all
   * @returns {Array<{cid: string, title: string, ts: number}>}
   */
  conversations(query) {
    const needle = String(query == null ? "" : query).toLowerCase();
    const groups = new Map();
    this.all().forEach(function (m, i) {
      const cid = cidOf(m);
      const text = String(m.content == null ? "" : m.content);
      let g = groups.get(cid);
      if (!g) {
        g = {
          cid: cid,
          title: "",
          firstText: text,
          last: i,
          ts: m.ts || 0,
          hit: false,
        };
        groups.set(cid, g);
      }
      g.last = i;
      g.ts = m.ts || g.ts;
      if (m.role === "user" && !g.title && text) g.title = text;
      if (needle && text.toLowerCase().indexOf(needle) !== -1) g.hit = true;
    });
    const out = [];
    groups.forEach(function (g) {
      if (needle && !g.hit) return;
      out.push({
        cid: g.cid,
        title: g.title || g.firstText,
        ts: g.ts,
        last: g.last,
      });
    });
    /* Newest first by position in the log, not by timestamp, so messages
       without a ts still sort the way they were written. */
    out.sort(function (a, b) {
      return b.last - a.last;
    });
    out.forEach(function (c) {
      delete c.last;
    });
    return out;
  },

  /**
   * Start a fresh conversation: nothing is open, so the assistant shows the
   * landing page. The previous conversation stays in `chat` and in Recents.
   */
  newConversation() {
    _activeCid = null;
    notifyChange("chat", "new", null);
  },

  /** Open an existing conversation. */
  open(cid) {
    _activeCid = cid || null;
    notifyChange("chat", "open", _activeCid);
  },

  /**
   * Append one message, assigning it to the open conversation (creating one
   * when nothing is open). A user message always focuses the conversation it
   * lands in; an assistant message only follows the open one, so a reply
   * arriving after the student pressed New cannot pull them out of the
   * landing page. Pass `{ open: true }` when the message itself should open
   * its conversation (e.g. a practice drill started from the Library).
   *
   * Persists without emitting `change`: the assistant paints messages
   * incrementally, and a change event would schedule a full re-render of the
   * transcript mid-stream. Callers refresh Recents themselves.
   *
   * @param {Object} msg - Message to append
   * @param {Object} [opts] - { cid, open }
   */
  append(msg, opts) {
    if (!msg) return;
    const o = opts || {};
    const cid = o.cid || msg.cid || this.activeId() || uid("c");
    msg.cid = cid;
    if (o.open || _activeCid !== null || msg.role === "user") {
      _activeCid = cid;
    }
    const list = db.chat || [];
    list.push(msg);
    const max = CFG.maxChatMessages || 100;
    db.chat = list.length > max ? list.slice(list.length - max) : list;
    saveNow();
  },

  /** Remove one conversation entirely. */
  removeConversation(cid) {
    if (!cid) return;
    db.chat = (db.chat || []).filter(function (m) {
      return cidOf(m) !== cid;
    });
    if (_activeCid === cid) _activeCid = null;
    notifyChange("chat", "remove", cid);
  },

  clear() {
    db.chat = [];
    _activeCid = undefined;
    notifyChange("chat", "clear", null);
  },
};

const planNamespace = {
  get() {
    return {
      blocks: (db && db.plan) || [],
      meta: (db && db.planMeta) || null,
    };
  },
  save(blocks, meta) {
    db.plan = blocks || [];
    if (meta !== undefined) db.planMeta = meta;
    notifyChange("plan", "save", null);
  },
  clear() {
    db.plan = [];
    db.planMeta = null;
    notifyChange("plan", "clear", null);
  },
};

const settingsNamespace = {
  get() {
    return (db && db.settings) || {};
  },
  update(patch) {
    if (!patch || typeof patch !== "object") return db.settings;
    Object.assign(db.settings, patch);
    notifyChange("settings", "update", null);
    return db.settings;
  },
};

// Export the Store API
export const Store = {
  get db() {
    return db;
  },
  /** Current cross-tab mirror revision (0 before the first persist). */
  rev() {
    return _rev;
  },
  blank,
  load,
  hydrateFromIDB,
  persist,
  isQuarantined,
  deduplicateData,
  save,
  saveNow,
  update,
  on,
  emit,
  usage,
  course,
  courseName,
  courseColor,
  event,
  doc,
  lesson,
  removeCourse,
  resetAll,

  // Deep entity namespaces
  courses: coursesNamespace,
  events: eventsNamespace,
  tasks: eventsNamespace,
  lessons: lessonsNamespace,
  readings: readingsNamespace,
  documents: documentsNamespace,
  chat: chatNamespace,
  plan: planNamespace,
  settings: settingsNamespace,
};

export default Store;
