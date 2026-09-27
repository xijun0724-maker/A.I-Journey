/**
 * Library View — Document Catalog, Real-Time Filter & Search, AI Retrieval Hub
 * Structured with strict information hierarchy, balanced metric grid, and zero empty space.
 */

import { Store } from "../core/store.js";
import { esc, sortBy, uniq } from "../utils/helpers.js";
import { KIND_LABEL } from "../config/constants.js";
import { fmtDate } from "../utils/date.js";
import { empty, courseChip, docs, pageHead, statBox } from "./shared.js";
import { q, qa } from "../utils/dom.js";

export function library() {
  const docList = sortBy(
    docs(),
    function (d) {
      return d.importedAt;
    },
    -1,
  );
  const usage = Store.usage();
  const courses = Store.db.courses || [];

  let h = pageHead(
    "Library",
    "Textbooks, lecture notes, handouts and briefs. Everything here is searchable by the AI assistant.",
    '<button class="btn primary" data-act="go-import">+ Add documents</button>',
  );

  if (location.protocol === "file:") {
    h +=
      '<div class="notice info mb"><div>You are opening this file directly from disk. Word, text and paste imports work here; PDF parsing needs a local server such as <code>npx --yes serve .</code> because browsers block PDF workers on <code>file://</code>.</div></div>';
  }

  const chunkCount = (Store.db.chunks || []).length;
  const courseCount = uniq(
    Store.db.documents
      .map(function (d) {
        return d.courseId;
      })
      .filter(Boolean),
  ).length;
  const storageBytes = usage.bytes || 0;
  const storageLimit = 5242880;
  const storagePct = Math.min(100, Math.round((storageBytes / storageLimit) * 100));

  // ── HIERARCHY LEVEL 1: BALANCED 4-CARD KPI PULSE (PRIMARY METRIC ROW) ──
  h += '<div class="library-stats-grid mb">';
  h += statBox(docList.length, "Cataloged Documents", "indexed in your local library", "info");
  h += statBox(chunkCount, "Searchable Passages", "semantic AI knowledge chunks", "ok");
  h += statBox(courseCount, "Courses Covered", courseCount === 1 ? "1 active course linked" : courseCount + " active courses linked", "info");
  h += statBox(usage.pretty, "Storage Used", storagePct + "% of ~5 MB limit", storagePct > 80 ? "warn" : "info");
  h += '</div>';

  // ── HIERARCHY LEVEL 2 & 3: MAIN WORKSPACE + AI KNOWLEDGE SIDEBAR ─────────
  h += '<div class="library-layout-grid">';

  // Left Column: Document Catalog (Primary Workstation)
  h += '<div class="library-main-col">';
  h += '<div class="card library-docs-card">';

  // Card Header with Dynamic Live Filter Status (No duplicate counts or storage stats)
  h += '<div class="card-head">';
  h += '<div>';
  h += '<h2 class="u-m-0">Course Documents</h2>';
  h += '<span class="tiny muted" id="libFilterCount">All documents shown</span>';
  h += '</div>';
  h += '</div>';

  if (!docList.length) {
    h += empty(
      "",
      "No documents yet",
      "Upload a syllabus, textbook chapter, lecture notes or assignment brief.",
      '<button class="btn primary mt" data-act="go-import">Add documents</button>',
    );
  } else {
    // Filter & Search Toolbar
    h += '<div class="library-filter-toolbar">';
    h += '<div class="library-search-box">';
    h += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lib-search-icon" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    h += '<input type="text" id="libSearchInput" placeholder="Filter documents by name or keyword…" aria-label="Search documents">';
    h += '</div>';

    h += '<div class="library-filter-selects">';
    h += '<select id="libCourseFilter" class="library-select" aria-label="Filter by course">';
    h += '<option value="all">All courses</option>';
    courses.forEach(function (c) {
      const cLabel = esc(c.code ? c.code + " · " + c.title : c.title);
      h += '<option value="' + esc(c.id) + '">' + cLabel + '</option>';
    });
    h += '</select>';

    h += '<select id="libTypeFilter" class="library-select" aria-label="Filter by document type">';
    h += '<option value="all">All types</option>';
    h += '<option value="syllabus">Syllabus</option>';
    h += '<option value="notes">Lecture notes</option>';
    h += '<option value="textbook">Textbook</option>';
    h += '<option value="brief">Assignment brief</option>';
    h += '<option value="other">Other</option>';
    h += '</select>';
    h += '</div>';
    h += '</div>'; // .library-filter-toolbar

    // Document List
    h += '<div class="doc-list" id="libDocList">';
    docList.forEach(function (d) {
      const extMatch = d.name && d.name.match(/\.([a-z0-9]+)$/i);
      const extRaw = extMatch ? extMatch[1].toUpperCase() : (d.kind || "DOC").toUpperCase();
      const ext = extRaw.slice(0, 4);
      let extClass = "doc-icon-default";
      if (ext === "PDF") extClass = "doc-icon-pdf";
      else if (ext === "DOC" || ext === "DOCX") extClass = "doc-icon-doc";
      else if (ext === "TXT" || ext === "MD") extClass = "doc-icon-txt";

      const charCount = (d.chars || (d.text || "").length).toLocaleString();
      const passageLabel = d.chunkCount ? d.chunkCount + " passages" : "not indexed";

      h += '<div class="doc-row" data-doc-name="' + esc(d.name) + '" data-doc-course="' + esc(d.courseId || "") + '" data-doc-kind="' + esc(d.kind || "") + '">';
      h += '<div class="doc-icon ' + extClass + '">';
      h += '<span class="doc-icon-text">' + esc(ext) + '</span>';
      h += '</div>';

      h += '<div class="doc-info">';
      h += '<div class="doc-title-row">';
      h += '<a href="#" class="doc-title-link" data-act="view-doc" data-id="' + esc(d.id) + '" title="View ' + esc(d.name) + '">' + esc(d.name) + '</a>';
      h += '</div>';

      h += '<div class="doc-meta-row">';
      h += '<span class="doc-badge kind">' + esc(KIND_LABEL[d.kind] || d.kind) + '</span>';
      if (d.courseId) {
        h += '<span class="doc-badge course">' + courseChip(d.courseId) + '</span>';
      }
      h += '<span class="doc-meta-stat passages"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="u-icon-xs" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>' + esc(passageLabel) + '</span>';
      h += '<span class="doc-meta-divider">&middot;</span>';
      h += '<span class="doc-meta-stat">' + charCount + ' chars</span>';
      h += '<span class="doc-meta-divider">&middot;</span>';
      h += '<span class="doc-meta-stat date">' + fmtDate(d.importedAt) + '</span>';
      h += '</div>';
      h += '</div>'; // .doc-info

      h += '<div class="doc-actions">';
      h += '<button type="button" class="btn xs" data-act="view-doc" data-id="' + esc(d.id) + '" title="Open document viewer">Open</button>';
      h += '<button type="button" class="btn xs ghost" data-act="practise-doc" data-id="' + esc(d.id) + '" title="Test yourself on this document from memory">Practise</button>';
      h += '<button type="button" class="btn xs ghost" data-act="doc-reanalyse" data-id="' + esc(d.id) + '" title="Re-run syllabus and deadline analysis">Re-analyse</button>';
      h += '<button type="button" class="btn xs danger" data-act="del-doc" data-id="' + esc(d.id) + '" title="Remove document from library">Remove</button>';
      h += '</div>';

      h += '</div>'; // .doc-row
    });
    h += '</div>'; // .doc-list

    // Empty filter feedback if search yields 0 items
    h += '<div id="libEmptyFilter"  class="library-empty-filter u-hidden">';
    h += '<p class="small muted">No documents match the active search or course filter.</p>';
    h += '</div>';

    // ── INTAKE BANNER: SUPPORTED ACADEMIC FORMATS GUIDE ────────────────────
    h += '<div class="library-intake-banner">';
    h += '<div class="lib-intake-icon">';
    h += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>';
    h += '</div>';
    h += '<div class="lib-intake-body">';
    h += '<strong class="lib-intake-title">Supported Academic Materials</strong>';
    h += '<p class="lib-intake-desc">Course syllabi, lecture presentations, textbook chapters, or reading lists. The AI tutor parses and indexes every section on-device for precise search and study plan generation.</p>';
    h += '<div class="lib-intake-formats">';
    h += '<span class="lib-format-badge">PDF Documents</span>';
    h += '<span class="lib-format-badge">Word (.docx)</span>';
    h += '<span class="lib-format-badge">Plain Text &amp; Markdown</span>';
    h += '</div>';
    h += '</div>';
    h += '</div>'; // .library-intake-banner
  }

  h += '</div>'; // .card
  h += '</div>'; // .library-main-col

  // Right Column: AI Retrieval Engine Hub & Device Privacy
  h += '<div class="library-side-col">';

  // 1. AI Knowledge Base Card (Engine Configuration, No Duplicate Counts)
  h += '<div class="card library-ai-card">';
  h += '<div class="card-head">';
  h += '<div class="u-row-8">';
  h += '<h3 class="u-copy-15">AI Knowledge Base</h3>';
  h += '<span  class="badge ok xs u-fwt-600">Active</span>';
  h += '</div>';
  h += '</div>';
  h += '<p  class="small muted u-lh-145">Uploaded materials are parsed on-device and sliced into semantic passages. When querying the AI Assistant, relevant excerpts are retrieved and cited verbatim.</p>';

  h += '<div class="library-kv-box">';
  h += '<div class="kv"><span class="k">Retrieval Engine</span><span class="v badge info xs">BM25 Ready</span></div>';
  h += '<div class="kv"><span class="k">Indexing Mode</span><strong class="v">On-device Lexical</strong></div>';
  h += '<div class="kv"><span class="k">Passage Slicing</span><strong class="v">~500 chars (overlap: 50)</strong></div>';
  h += '</div>';

  h += '<button type="button" class="btn block sm mt" data-act="reindex">Rebuild retrieval index</button>';
  h += '</div>'; // .card

  // 2. Storage & Privacy Card (Distinct Architectural Focus, No Duplicate Metrics)
  h += '<div class="card library-storage-card">';
  h += '<div class="card-head">';
  h += '<h3 class="u-copy-15">Storage &amp; Privacy</h3>';
  h += '</div>';
  h += '<div class="library-privacy-content">';
  h += '<div class="library-privacy-callout">';
  h += '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lib-privacy-shield" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';
  h += '<strong>Local On-Device Sandbox</strong>';
  h += '</div>';
  h += '<p  class="small muted u-my-4-lh-145">All course documents, raw text, and retrieval indices live strictly on your local device. Nothing leaves your browser without your explicit AI provider key.</p>';
  h += '<div  class="library-kv-box u-m-0">';
  h += '<div class="kv"><span class="k">Data Residency</span><strong class="v">Browser IndexedDB</strong></div>';
  h += '<div class="kv"><span class="k">External Transmission</span><span class="v badge ok xs">Citations Only</span></div>';
  h += '<div class="kv"><span class="k">Size Guideline</span><strong class="v">&le; 2 MB per textbook</strong></div>';
  h += '</div>';
  h += '</div>';
  h += '</div>'; // .card

  h += '</div>'; // .library-side-col
  h += '</div>'; // .library-layout-grid

  return h;
}

/** Wire live filter and search listeners for the Library view */
export function afterLibrary(root) {
  const container = root || document;
  const searchInput = q("#libSearchInput", container);
  const courseFilter = q("#libCourseFilter", container);
  const typeFilter = q("#libTypeFilter", container);
  const docRows = qa(".doc-row", container);
  const emptyFilterMsg = q("#libEmptyFilter", container);
  const countBadge = q("#libFilterCount", container);

  function filterDocs() {
    const qStr = (searchInput?.value || "").toLowerCase().trim();
    const cVal = courseFilter?.value || "all";
    const tVal = typeFilter?.value || "all";
    let visibleCount = 0;

    docRows.forEach((row) => {
      const name = (row.getAttribute("data-doc-name") || "").toLowerCase();
      const course = row.getAttribute("data-doc-course") || "";
      const kind = row.getAttribute("data-doc-kind") || "";

      const matchesQuery = !qStr || name.includes(qStr);
      const matchesCourse = cVal === "all" || course === cVal;
      const matchesType = tVal === "all" || kind === tVal;

      if (matchesQuery && matchesCourse && matchesType) {
        row.style.display = "";
        visibleCount++;
      } else {
        row.style.display = "none";
      }
    });

    if (emptyFilterMsg) {
      emptyFilterMsg.style.display = visibleCount === 0 && docRows.length > 0 ? "block" : "none";
    }
    if (countBadge) {
      if (visibleCount === docRows.length) {
        countBadge.textContent = "All documents shown";
      } else {
        countBadge.textContent = `Showing ${visibleCount} of ${docRows.length} documents`;
      }
    }
  }

  if (searchInput) searchInput.addEventListener("input", filterDocs);
  if (courseFilter) courseFilter.addEventListener("change", filterDocs);
  if (typeFilter) typeFilter.addEventListener("change", filterDocs);
}

export const libraryView = {
  title: "Library",
  fn: library,
  after: afterLibrary,
};
