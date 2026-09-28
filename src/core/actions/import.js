/**
 * Import and draft commit action handlers
 */

import { Store } from "../store.js";
import { UI, UIState } from "../scope.js";
import { Router } from "../router.js";
import { CFG } from "../../config/constants.js";
import { migrateSchema } from "../../config/settings.js";
import { toast } from "../../utils/dom.js";
import { uid, minutesToHM, safeCssUrl, safeColor } from "../../utils/helpers.js";
import { Tasks } from "../../domain/tasks.js";
import { RAG } from "../../domain/rag.js";
import { Planner } from "../../domain/planner.js";
import { addDays, dateOnly, fromIso } from "../../utils/date.js";

/* Late-import the view helper so this core module has no static views dep. */
let _resetCoursesViewState = null;
async function resetCoursesViewState() {
  if (!_resetCoursesViewState) {
    const mod = await import("../../views/courses.js");
    _resetCoursesViewState = mod.resetCoursesViewState;
  }
  return _resetCoursesViewState();
}

export function summarizeImportPlan(suggestedPlan, stats, planItems) {
  const totalMinutes = Number(suggestedPlan && suggestedPlan.totalMinutes) || 0;
  const scheduledBlocks = (planItems || []).length;
  const reviewBlocks = (planItems || []).filter(function (item) {
    return /^Review:/i.test(String(item && item.label ? item.label : ""));
  }).length;
  const deadlineCount = Number(stats && stats.events) || 0;
  const readingCount = Number(stats && stats.readings) || 0;
  const lessonCount = Number(stats && stats.lessons) || 0;
  const unscheduledCount = ((suggestedPlan && suggestedPlan.unscheduled) || [])
    .length;
  const summaryParts = [
    minutesToHM(totalMinutes),
    /* Proposed, not scheduled: nothing is written until the student confirms
       the preview the import opens. */
    scheduledBlocks +
      " block" +
      (scheduledBlocks === 1 ? "" : "s") +
      " ready to review",
    deadlineCount + " deadline" + (deadlineCount === 1 ? "" : "s"),
    readingCount + " reading" + (readingCount === 1 ? "" : "s"),
    lessonCount + " topic" + (lessonCount === 1 ? "" : "s"),
  ];
  const plannedText = summaryParts.join(" • ");
  const reviewText =
    reviewBlocks > 0
      ? " with " +
        reviewBlocks +
        " review block" +
        (reviewBlocks === 1 ? "" : "s")
      : " without additional review blocks";
  const capacityText = unscheduledCount
    ? " " +
      unscheduledCount +
      " item" +
      (unscheduledCount === 1 ? "" : "s") +
      " still need attention."
    : " All imported work fits the current study capacity.";
  return "Suggested plan: " + plannedText + reviewText + "." + capacityText;
}

/** Collections a backup may restore, in export order. */
const BACKUP_ARRAY_KEYS = [
  "courses",
  "events",
  "lessons",
  "readings",
  "documents",
  "chunks",
  "chat",
  "activity",
  "plan",
];

/** Stable entity ids only — never raw attacker-controlled strings in data-* attrs. */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Check a parsed backup file before anything is written to the database.
 * `settings` is an object in every export, so it is validated separately
 * from the array collections.
 *
 * @returns {string|null} A human-readable problem, or null when usable.
 */
export function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "This does not look like a Journey A.I backup file.";
  }
  if (!data.version) {
    return "This backup has no schema version, so it cannot be restored safely.";
  }
  for (let i = 0; i < BACKUP_ARRAY_KEYS.length; i++) {
    const key = BACKUP_ARRAY_KEYS[i];
    const value = data[key];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) return '"' + key + '" must be an array.';
    if (
      value.some(function (entry) {
        return !entry || typeof entry !== "object";
      })
    ) {
      return '"' + key + '" contains an entry that is not an object.';
    }
    /* Every collection entity must carry a stable, safe id: it later lands in
       data-id / id attributes when views re-render the restored rows. */
    for (let j = 0; j < value.length; j++) {
      const entry = value[j];
      if (!entry || typeof entry !== "object") continue;
      if (entry.id != null && !SAFE_ID_RE.test(String(entry.id))) {
        return (
          '"' +
          key +
          '" has an invalid id. Ids may only contain letters, numbers, hyphens and underscores (max 64).'
        );
      }
    }
  }
  if (
    data.settings !== undefined &&
    data.settings !== null &&
    (typeof data.settings !== "object" || Array.isArray(data.settings))
  ) {
    return '"settings" must be an object.';
  }
  /* Backup fields later land in style= sinks (course colors, banner URLs).
     Neutralize them here so a crafted file cannot inject CSS. */
  if (Array.isArray(data.courses)) {
    for (let i = 0; i < data.courses.length; i++) {
      const course = data.courses[i];
      if (!course || typeof course !== "object") continue;
      if (
        course.color != null &&
        safeColor(course.color) !== String(course.color).trim()
      ) {
        course.color = "";
      }
      if (
        course.image != null &&
        safeCssUrl(course.image) !== String(course.image).trim()
      ) {
        course.image = null;
      }
    }
  }
  if (data.planMeta !== undefined && data.planMeta !== null) {
    if (typeof data.planMeta !== "object" || Array.isArray(data.planMeta)) {
      return '"planMeta" must be an object.';
    }
  }
  let bytes = 0;
  try {
    bytes = JSON.stringify(data).length * 2;
  } catch (_e) {
    return "This backup could not be read.";
  }
  if (bytes > CFG.storage.maxBytes * 0.9) {
    return (
      "This backup is too large for browser storage (" +
      Math.round(bytes / 1024) +
      " kB). Remove some files from Library first."
    );
  }
  return null;
}

/**
 * Validate, migrate and apply a backup to the live database.
 * Throws with a user-presentable message when the file cannot be restored.
 *
 * @param {object} data - Parsed backup object
 * @returns {object} The applied backup
 */
export function applyBackup(data) {
  const problem = validateBackup(data);
  if (problem) throw new Error(problem);

  const migrated = migrateSchema(data);
  if (!migrated) {
    throw new Error(
      "This backup was made by a newer version of Journey A.I. Update the app before restoring it.",
    );
  }

  /* A key already trusted in this browser wins: backups never carry one. */
  const currentKey = Store.db.settings.apiKey || "";

  BACKUP_ARRAY_KEYS.forEach(function (key) {
    if (Array.isArray(migrated[key])) Store.db[key] = migrated[key];
  });
  if (migrated.planMeta !== undefined)
    Store.db.planMeta = migrated.planMeta || null;
  if (migrated.settings && typeof migrated.settings === "object") {
    const { apiKey: _ignored, ...incoming } = migrated.settings;
    Store.db.settings = {
      ...Store.db.settings,
      ...incoming,
      apiKey: currentKey,
    };
  }

  Store.deduplicateData(Store.db);
  RAG.reindexAll();
  Store.saveNow();
  Store.emit("change", { entity: "all", op: "restore", id: null });
  return migrated;
}

export function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () =>
      toast("The browser could not read that file.", "bad", "Import error");
    reader.onload = () => {
      try {
        let data;
        try {
          data = JSON.parse(reader.result);
        } catch (_e) {
          throw new Error(
            "That file is not valid JSON, so nothing was imported.",
          );
        }
        applyBackup(data);
        toast("Data imported successfully.", "ok");
      } catch (e) {
        toast(e.message || "Import failed.", "bad", "Import error");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

export function commitDraft() {
  const draft = UI.draft;
  if (!draft) return;
  let courseId = draft.courseId;
  /* A course deleted while the review screen was open must not receive
     lessons/events under a dead id — they would be invisible everywhere. */
  if (
    courseId &&
    !Store.db.courses.some(function (course) {
      return course.id === courseId;
    })
  ) {
    courseId = null;
  }
  const nc = draft.newCourse;
  const detectedCourse =
    (draft.payloads || [])
      .map(function (payload) {
        return (
          payload.result && payload.result.pnu && payload.result.pnu.course
        );
      })
      .find(function (course) {
        return course && (course.code || course.title);
      }) || {};
  if (!courseId) {
    /* Always create a course for the import: detected info wins, then the
       typed fields, then the file name. Never orphan the payload data. */
    const firstPayload = (draft.payloads || [])[0];
    const fileBase = String((firstPayload && firstPayload.name) || "")
      .replace(/\.[^.]+$/, "")
      .trim();
    const newC = {
      id: uid("crs"),
      code: (nc && nc.code) || detectedCourse.code || "",
      title:
        (nc && nc.title) ||
        detectedCourse.title ||
        fileBase ||
        "Imported course",
      color: CFG.palette[Store.db.courses.length % CFG.palette.length],
      instructor: "",
      term: "Term",
      days: "",
      room: "",
      credits: 3,
      startDate: Store.db.settings.termStart,
      endDate: Store.db.settings.termEnd,
      createdAt: new Date().toISOString(),
    };
    Store.db.courses.push(newC);
    courseId = newC.id;
  } else {
    const existingCourse = Store.db.courses.find(function (course) {
      return course.id === courseId;
    });
    if (existingCourse) {
      /* A re-upload is usually a corrected syllabus: detected values win. */
      if (detectedCourse.code) existingCourse.code = detectedCourse.code;
      if (detectedCourse.title) existingCourse.title = detectedCourse.title;
    }
  }
  (draft.payloads || []).forEach((p) => {
    const r = p.result;
    if (!r) return;
    (r.lessons || [])
      .filter((l) => l.include !== false && l.topic)
      .forEach((l) => {
        const termStart = fromIso(Store.db.settings.termStart);
        const weekStart = l.start
          ? fromIso(l.start)
          : termStart && l.week != null
            ? addDays(termStart, Math.max(0, l.week - 1) * 7)
            : null;
        const start = weekStart ? dateOnly(weekStart) : null;
        const end = weekStart ? dateOnly(addDays(weekStart, 2)) : null;
        const duplicate = Store.db.lessons.find(function (lesson) {
          return (
            lesson.courseId === courseId &&
            lesson.week === l.week &&
            lesson.topic === l.topic
          );
        });
        if (duplicate) {
          if (!duplicate.start && start) duplicate.start = start;
          if (!duplicate.end && end) duplicate.end = end;
          return;
        }
        Store.db.lessons.push({
          id: uid("lsn"),
          topic: l.topic,
          week: l.week,
          courseId: courseId,
          notes: "",
          done: false,
          start: start,
          end: end,
          readings: [],
          eventIds: [],
          source: "import",
        });
      });
    (r.events || [])
      .filter((e) => e.include !== false && e.title)
      .forEach((e) => {
        const ev = {
          id: uid("ev"),
          title: e.title,
          type: e.type || "assignment",
          courseId: courseId,
          due: e.due || null,
          weight: e.weight != null ? e.weight : null,
          points: e.points != null ? e.points : null,
          pointsEarned: null,
          notes: "",
          status: "todo",
          createdAt: new Date().toISOString(),
          confidence: e.confidence || 0.5,
          sourceDocId: null,
          source: "import",
          readingIds: [],
          subtasks: Tasks.subtasksFor(
            e.type || "assignment",
            e.weight,
            null,
            e.due ? new Date(e.due) : null,
          ),
        };
        Store.db.events.push(ev);
        Tasks.recompute(ev);
      });
    (r.readings || [])
      .filter((rd) => rd.include !== false && rd.title)
      .forEach((rd) => {
        Store.db.readings.push({
          id: uid("rdg"),
          title: rd.title,
          courseId: courseId,
          week: rd.week || null,
          source: rd.source || "",
          pages: rd.pages || "",
          status: rd.optional ? "optional" : "required",
          docId: null,
        });
      });
    const doc = {
      id: uid("doc"),
      name: p.name || "Imported document",
      kind: p.kind || "other",
      courseId: courseId,
      text: p.text || "",
      chars: (p.text || "").length,
      tables: r.tables || [],
      analysis: r.pnu || null,
      standardAnalysis: r.standard || null,
      importedAt: new Date().toISOString(),
      chunkCount: 0,
    };
    Store.db.documents.push(doc);
  });
  Store.deduplicateData(Store.db);
  /* Importing must not silently replace a plan the student already has.
     Draft the schedule and hand it to the same preview the manual generate
     action uses: nothing is written until they press Confirm & Save. */
  const suggestedPlan = Planner.generateInteractive({
    courseId: courseId || "all",
  });
  const importStats = {
    events: (draft.payloads || []).reduce(function (total, p) {
      return (
        total +
        ((p && p.result && p.result.events) || []).filter(function (e) {
          return e && e.include !== false && e.title;
        }).length
      );
    }, 0),
    readings: (draft.payloads || []).reduce(function (total, p) {
      return (
        total +
        ((p && p.result && p.result.readings) || []).filter(function (rd) {
          return rd && rd.include !== false && rd.title;
        }).length
      );
    }, 0),
    lessons: (draft.payloads || []).reduce(function (total, p) {
      return (
        total +
        ((p && p.result && p.result.lessons) || []).filter(function (l) {
          return l && l.include !== false && l.topic;
        }).length
      );
    }, 0),
  };
  const reviewable = suggestedPlan.planItems.length > 0;
  const planSummary = summarizeImportPlan(
    suggestedPlan.meta,
    importStats,
    suggestedPlan.planItems,
  );
  UIState.set("plannerPreview", reviewable ? suggestedPlan : null);
  UI.draft = null;
  /* Reindex mutates chunks/chunkCount — it must run before the save, or a
     reload restores the previous index and the new syllabus stays unindexed. */
  RAG.reindexAll();
  Store.saveNow();
  /* Land back on My courses with a clean filter so the new/updated card
     cannot be hidden by a leftover search or filter. */
  resetCoursesViewState();
  Router.navigate("courses");
  toast(
    reviewable
      ? "Import committed. " +
          planSummary +
          " Nothing is scheduled yet — review the plan in Planner."
      : "Import committed. No open work was available to schedule.",
    reviewable ? "ok" : "info",
  );
}

export function cancelDraft() {
  UI.draft = null;
  Router.scheduleRender();
}
