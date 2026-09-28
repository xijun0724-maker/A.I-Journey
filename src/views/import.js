import { CFG, KIND_LABEL } from "../config/constants.js";
import { PNU_REQUIREMENT_ROW } from "../config/standards/pnu.js";
import { Store } from "../core/store.js";
import { UI, UIState } from "../core/scope.js";
import { Router } from "../core/router.js";
import { Pipeline } from "../domain/pipeline.js";
import { NLP } from "../domain/nlp.js";
import { esc } from "../utils/helpers.js";
import { fmtDate } from "../utils/date.js";
import { q, qa, toast } from "../utils/dom.js";
import { statBox, courseSelectOptions, pageHead, tableHtml } from "./shared.js";

export function importView() {
  if (!UI.draft) return importPick();
  return importReview();
}

export function importPick() {
  const defaultCourse =
    UIState.courseId !== "all"
      ? UIState.courseId
      : (Store.db.courses[0] && Store.db.courses[0].id) || "";
  return (
    pageHead(
      "Import documents",
      "Upload a syllabus, brief, notes or textbook. Journey A.I extracts the text and tables, then maps them to topics, deadlines, readings and subtasks.",
    ) +
    '<div class="grid g-2-1">' +
    '<div class="card">' +
    "<h2>1. Choose what to analyse</h2>" +
    '<div class="drop" id="dropZone" role="button" tabindex="0" aria-label="Choose files to analyse, or drop files here">' +
    '<div class="strong">Drop files here, or click to browse</div>' +
    '<div class="tiny muted mt-s">' +
    (window.Extract ? window.Extract.SUPPORTED : "PDF, Word, text, CSV") +
    " - a syllabus is the best place to start</div>" +
    '<input type="file" id="fileInput" multiple accept="' +
    (window.Extract ? window.Extract.accept : ".pdf,.docx,.txt,.csv") +
    '" class="hide" hidden>' +
    "</div>" +
    '<div class="row mt"><span class="tiny muted">Selected:</span><span class="tiny" id="pickedFiles">nothing yet</span></div>' +
    '<details class="acc mt"><summary>Or paste text instead (works offline, always available)</summary>' +
    '<label class="fld mt"><span>Name this text</span><input id="pasteName" placeholder="CS 301 syllabus"></label>' +
    '<textarea id="pasteText" class="u-minh-180" placeholder="Paste the syllabus, assignment brief or lecture notes here…"></textarea>' +
    '<button class="btn sm mt" id="usePasted">Analyse pasted text</button>' +
    "</details>" +
    "</div>" +
    '<div class="card">' +
    "<h2>2. Where does it belong?</h2>" +
    '<label class="fld"><span>Course</span><select id="impCourse">' +
    courseSelectOptions(defaultCourse, false) +
    '<option value="__new">+ Create a new course…</option></select></label>' +
    '<div id="newCourseFields" class="hide" hidden>' +
    '<div class="grid g2"><label class="fld"><span>Code</span><input id="newCode" placeholder="CS 301"></label>' +
    '<label class="fld"><span>Title</span><input id="newTitle" placeholder="Data Structures"></label></div>' +
    "</div>" +
    '<label class="fld"><span>Document type</span><select id="impKind">' +
    Object.keys(KIND_LABEL)
      .map(function (k) {
        return (
          '<option value="' +
          k +
          '"' +
          (k === "syllabus" ? " selected" : "") +
          ">" +
          KIND_LABEL[k] +
          "</option>"
        );
      })
      .join("") +
    "</select></label>" +
    '<div class="notice info"><div>Type it as <strong>Course syllabus</strong> and a full lesson roadmap with deadlines and readings is generated. Other types are indexed for the AI assistant and summarised.</div></div>' +
    '<div id="impMsg" class="mt"></div>' +
    "</div>" +
    "</div>"
  );
}

export function importBind(root) {
  const dz = q("#dropZone", root);
  if (!dz) return;
  const input = q("#fileInput", root);
  let picked = [];

  const courseSel = q("#impCourse", root);
  if (courseSel) {
    courseSel.addEventListener("change", function () {
      const fields = q("#newCourseFields", root);
      if (!fields) return;
      const show = courseSel.value === "__new";
      fields.classList.toggle("hide", !show);
      fields.hidden = !show;
    });
    /* With an empty course list "+ Create a new course…" is preselected, so
       no change event ever fires — show the fields immediately. */
    if (courseSel.value === "__new") {
      const fields = q("#newCourseFields", root);
      if (fields) {
        fields.classList.remove("hide");
        fields.hidden = false;
      }
    }
  }

  dz.addEventListener("click", function () {
    input.click();
  });
  dz.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      input.click();
    }
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    dz.addEventListener(ev, function (e) {
      e.preventDefault();
      dz.classList.add("over");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dz.addEventListener(ev, function (e) {
      e.preventDefault();
      dz.classList.remove("over");
    });
  });
  dz.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      picked = Array.prototype.slice.call(e.dataTransfer.files);
      onPicked();
    }
  });
  input.addEventListener("change", function () {
    picked = Array.prototype.slice.call(input.files || []);
    onPicked();
  });

  function onPicked() {
    q("#pickedFiles", root).textContent = picked.length
      ? picked
          .map(function (f) {
            return f.name;
          })
          .join(", ")
      : "nothing yet";
    if (picked.length) {
      const auto = window.Extract
        ? window.Extract.kind(picked[0].name)
        : "other";
      const sel = q("#impKind", root);
      if (sel) sel.value = auto;
      runFiles(picked);
    }
  }

  q("#usePasted", root).addEventListener("click", function () {
    const text = q("#pasteText", root).value.trim();
    if (text.length < 20) {
      toast("Paste at least a few lines of text to analyse.", "warn");
      return;
    }
    const name = q("#pasteName", root).value.trim() || "Pasted text";
    const kind = q("#impKind", root).value;
    UI.draft = {
      payloads: [
        Pipeline.analyseText(text, {
          name: name,
          courseId: resolveCourse(),
          kind: kind,
        }),
      ],
      courseId: resolveCourse(),
      newCourse: newCourseFields(),
    };
    Router.scheduleRender();
  });

  function resolveCourse() {
    const v = courseSel.value;
    if (v === "__new") return null;
    return v || null;
  }

  function newCourseFields() {
    const c = q("#newCode", root);
    const t = q("#newTitle", root);
    return { code: c ? c.value.trim() : "", title: t ? t.value.trim() : "" };
  }

  function runFiles(files) {
    const msg = q("#impMsg", root);
    const kind = q("#impKind", root).value;
    const courseId = resolveCourse();
    const payloads = [];
    msg.innerHTML =
      '<div class="notice info"><div id="impProg">Reading files…</div></div>';
    let chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        const prog = q("#impProg");
        if (prog) prog.textContent = "Analysing " + f.name + "…";
        return Pipeline.analyseFile(
          f,
          { courseId: courseId, kind: kind },
          function (p, t) {
            const el = q("#impProg");
            if (el)
              el.textContent =
                "Reading " + f.name + " - page " + p + " of " + t + "...";
          },
        )
          .then(function (payload) {
            payloads.push(payload);
          })
          .catch(function (err) {
            toast(err.message || "Could not read " + f.name, "bad", "Import");
          });
      });
    });
    chain.then(function () {
      if (!payloads.length) {
        msg.innerHTML = "";
        return;
      }
      UI.draft = {
        payloads: payloads,
        courseId: courseId,
        newCourse: newCourseFields(),
      };
      Router.scheduleRender();
    });
  }
}

export function importReview() {
  const draft = UI.draft;
  let h = pageHead(
    "Review what was found",
    "Nothing is saved until you confirm. Untick anything that is wrong or unwanted.",
    '<button class="btn" data-act="draft-cancel">Cancel</button>' +
      '<button class="btn primary" data-act="draft-commit">Add to my plan</button>',
  );

  draft.payloads.forEach(function (p, pi) {
    const r = p.result;
    const s = NLP.summary(r);
    const conf = Math.round(s.confidence * 100);
    const expectedStudyBlocks = Math.max(2, s.events + Math.min(3, s.lessons));
    h +=
      '<div class="card mb">' +
      '<div class="card-head"><h2>' +
      esc(p.name) +
      "</h2>" +
      '<span class="badge ' +
      (conf >= 70 ? "ok" : conf >= 45 ? "info" : "high") +
      '">overall confidence ' +
      conf +
      "%</span>" +
      '<span class="tag">' +
      (KIND_LABEL[p.kind] || p.kind) +
      "</span>" +
      (p.pages ? '<span class="tag">' + p.pages + " pages</span>" : "") +
      '<span class="spacer"></span><span class="tiny muted">' +
      (p.text || "").length.toLocaleString() +
      " characters extracted</span>" +
      "</div>" +
      '<div class="grid g4 mb">' +
      statBox(s.lessons, "Topics found") +
      statBox(s.events, "Deadlines found") +
      statBox(s.readings, "Readings found") +
      statBox(s.tables, "Tables extracted") +
      "</div>" +
      '<div class="notice info mb"><div><strong>Plan impact:</strong> This import should create about ' +
      expectedStudyBlocks +
      " study blocks, with " +
      s.events +
      " deadline item" +
      (s.events === 1 ? "" : "s") +
      " and " +
      s.readings +
      " reading" +
      (s.readings === 1 ? "" : "s") +
      ". The planner will prioritize the nearest deadlines and keep short review blocks before major submissions.</div></div>";

    if (!r.meta.syllabusLike) {
      h +=
        '<div class="notice warn mb"><div>This does not look like a syllabus. It has been indexed for the AI assistant, but the roadmap and deadline extraction below may be thin - check it over.</div></div>';
    }

    if (r.standard) h += standardReview(r.standard);
    if (r.pnu) h += pnuFeatureReview(r.pnu);

    h +=
      '<details class="acc" open><summary>Weekly topics (' +
      r.lessons.length +
      ')</summary><div class="mt-s">';
    if (!r.lessons.length) h += '<p class="small muted">None detected.</p>';
    r.lessons.forEach(function (l, i) {
      const key = pi + "." + i;
      l.include = l.include !== false;
      h +=
        '<div class="list-item flat"><input type="checkbox" data-draft="lesson" data-key="' +
        key +
        '" aria-label="Include lesson: ' +
        esc(l.topic) +
        '"' +
        (l.include ? " checked" : "") +
        ">" +
        '<div class="body"><div class="t">Week ' +
        (l.week || "?") +
        " - " +
        esc(l.topic) +
        "</div>" +
        '<div class="m">' +
        (l.start
          ? fmtDate(l.start)
          : '<span class="muted">no date - will be inferred from the term start</span>') +
        "</div></div></div>";
    });
    h += "</div></details>";

    h +=
      '<details class="acc mt" open><summary>Assignments, exams and deadlines (' +
      r.events.length +
      ')</summary><div class="mt-s">';
    if (!r.events.length)
      h +=
        '<p class="small muted">None detected. You can add tasks manually from the Tasks screen.</p>';
    r.events.forEach(function (e, i) {
      const key = pi + "." + i;
      e.include = e.include !== false;
      const conf2 = Math.round((e.confidence || 0.5) * 100);
      h +=
        '<div class="list-item"><input type="checkbox" data-draft="event" data-key="' +
        key +
        '" aria-label="Include event: ' +
        esc(e.title) +
        '"' +
        (e.include ? " checked" : "") +
        ">" +
        '<div class="body"><div class="t">' +
        esc(e.title) +
        "</div>" +
        '<div class="m">' +
        '<input type="date" class="draft-due input-compact" data-key="' +
        key +
        '" aria-label="Due date for ' +
        esc(e.title) +
        '" value="' +
        esc(e.due ? e.due.slice(0, 10) : "") +
        '">' +
        '<select class="draft-type select-compact" data-key="' +
        key +
        '" aria-label="Task type for ' +
        esc(e.title) +
        '">' +
        Object.keys(CFG.taskTypes)
          .map(function (k) {
            return (
              '<option value="' +
              k +
              '"' +
              (e.type === k ? " selected" : "") +
              ">" +
              CFG.taskTypes[k].label +
              "</option>"
            );
          })
          .join("") +
        "</select>" +
        '<span class="badge ' +
        (e.confidence >= 0.75 ? "ok" : e.confidence >= 0.55 ? "info" : "high") +
        '">' +
        conf2 +
        "% confident</span>" +
        (e.weight != null
          ? '<span class="tag">' + e.weight + "% of grade</span>"
          : "") +
        (e.points != null
          ? '<span class="tag">' + e.points + " points</span>"
          : "") +
        (e.week ? '<span class="tag">week ' + e.week + "</span>" : "") +
        (e.dueFromWeek
          ? '<span class="tag" title="Date inferred from the week it was listed under">date inferred</span>'
          : "") +
        (e.fromScheme
          ? '<span class="tag" title="From the grading breakdown - no deadline was listed">grading scheme</span>'
          : "") +
        (!e.due ? '<span class="badge high">no date</span>' : "") +
        "</div></div></div>";
    });
    h += "</div></details>";

    h +=
      '<details class="acc mt"><summary>Required readings (' +
      r.readings.length +
      ')</summary><div class="mt-s">';
    if (!r.readings.length) h += '<p class="small muted">None detected.</p>';
    r.readings.forEach(function (rd, i) {
      const key = pi + "." + i;
      rd.include = rd.include !== false;
      h +=
        '<div class="list-item flat"><input type="checkbox" data-draft="reading" data-key="' +
        key +
        '" aria-label="Include reading: ' +
        esc(rd.title) +
        '"' +
        (rd.include ? " checked" : "") +
        ">" +
        '<div class="body"><div class="t">' +
        esc(rd.title) +
        "</div>" +
        '<div class="m">' +
        (rd.week ? "week " + rd.week : "no week") +
        (rd.pages ? ' <i class="msep"></i> ' + esc(rd.pages) : "") +
        (rd.optional ? ' <i class="msep"></i> optional' : "") +
        "</div></div></div>";
    });
    h += "</div></details>";

    if (r.tables.length) {
      h +=
        '<details class="acc mt"><summary>Tables extracted (' +
        r.tables.length +
        ')</summary><div class="mt-s">';
      r.tables.forEach(function (t, ti) {
        h +=
          '<div class="table-note">Table ' +
          (ti + 1) +
          (t.page ? " (page " + t.page + ")" : "") +
          "</div>";
        h += tableHtml({
          label: "Extracted table data",
          cls: "mb scroll-sm",
          header: t.header,
          rows: t.rows
            .filter(function (row) {
              return PNU_REQUIREMENT_ROW.test(row.join(" "));
            })
            .slice(0, 40),
        });
        if (t.rows.length > 40)
          h +=
            '<div class="table-note">…and ' +
            (t.rows.length - 40) +
            " more rows</div>";
      });
      h += "</div></details>";
    }

    h +=
      '<details class="acc mt"><summary>Raw extracted text</summary><div class="snippet mt-s">' +
      esc((p.text || "").slice(0, 4000)) +
      ((p.text || "").length > 4000
        ? "\n\n… " +
          ((p.text || "").length - 4000).toLocaleString() +
          " more characters"
        : "") +
      "</div></details>";
    h += "</div>";
  });

  return h;
}

function standardReview(analysis) {
  const tone =
    analysis.score >= 90 ? "ok" : analysis.score >= 70 ? "info" : "high";
  const stdLabel = analysis.standardLabel || "Syllabus standard";
  let h =
    '<details class="acc mb" open><summary>' +
    esc(stdLabel) +
    ' <span class="badge ' +
    tone +
    '">' +
    analysis.score +
    "% - " +
    esc(analysis.scoreLabel) +
    '</span></summary><div class="mt-s">' +
    '<div class="grid g4 mb">' +
    statBox(analysis.checks.sessions, "Sessions detected") +
    statBox(analysis.checks.assessments, "Assessments detected") +
    statBox(analysis.checks.readings, "Resources detected") +
    statBox(
      analysis.grading.total == null ? "—" : analysis.grading.total + "%",
      "Grade total",
    ) +
    "</div>" +
    '<div class="standard-checks">' +
    analysis.sections
      .map(function (section) {
        return (
          '<div class="standard-check ' +
          section.status +
          '"><span class="standard-dot" aria-hidden="true"></span><span>' +
          esc(section.label) +
          '</span><span class="spacer"></span><span class="tiny muted">' +
          (section.status === "present" ? "Present" : "Review") +
          "</span></div>"
        );
      })
      .join("") +
    "</div>";

  if (analysis.findings.length || analysis.warnings.length) {
    h += '<div class="standard-findings mt">';
    analysis.findings.forEach(function (finding) {
      h +=
        '<div class="notice bad"><div><strong>Check:</strong> ' +
        esc(finding) +
        "</div></div>";
    });
    analysis.warnings.forEach(function (warning) {
      h +=
        '<div class="notice warn"><div><strong>Review:</strong> ' +
        esc(warning) +
        "</div></div>";
    });
    h += "</div>";
  } else {
    h +=
      '<div class="notice ok mt"><div>Core ' +
      esc(stdLabel) +
      " sections and extracted evidence look consistent.</div></div>";
  }
  return h + "</div></details>";
}

function pnuList(title, items) {
  if (!items || !items.length) return "";
  return (
    '<div class="pnu-data-block"><h4>' +
    esc(title) +
    "</h4><ul>" +
    items
      .map(function (item) {
        const value =
          typeof item === "string"
            ? item
            : item.label || item.title || item.topic || "";
        return value ? "<li>" + esc(value) + "</li>" : "";
      })
      .join("") +
    "</ul></div>"
  );
}

function pnuFeatureReview(pnu) {
  const course = pnu.course || {};
  const institutional = pnu.institutional || {};
  const themes = pnu.themes || {};
  const outcomes = pnu.outcomes || {};
  const resources = pnu.resources || {};
  const policies = pnu.policies || {};
  const approvals = pnu.approvals || {};
  const grading = pnu.grading || { items: [], total: 0 };
  const courseRequirements = pnu.courseRequirements || [];
  const document = pnu.document || {};
  let h =
    '<details class="acc mb"><summary>Extracted PNU syllabus features</summary><div class="mt-s">';
  h +=
    '<div class="pnu-meta-grid">' +
    '<div><span class="tiny muted">Course code</span><strong>' +
    esc(course.code || "Not detected") +
    "</strong></div>" +
    '<div><span class="tiny muted">Course title</span><strong>' +
    esc(course.title || "Not detected") +
    "</strong></div>" +
    '<div><span class="tiny muted">Prerequisite</span><strong>' +
    esc(course.prerequisite || "Not detected") +
    "</strong></div>" +
    '<div><span class="tiny muted">Consultation</span><strong>' +
    esc(policies.consultation || "Not detected") +
    "</strong></div>" +
    "</div>";
  h +=
    '<div class="pnu-meta-grid">' +
    '<div><span class="tiny muted">Reference number</span><strong>' +
    esc(document.referenceNo || "Not detected") +
    "</strong></div>" +
    '<div><span class="tiny muted">Issue / revision</span><strong>' +
    esc(
      [document.issueNo, document.revisionNo].filter(Boolean).join(" / ") ||
        "Not detected",
    ) +
    "</strong></div>" +
    '<div><span class="tiny muted">Document control</span><strong>' +
    esc(document.dcNo || "Not detected") +
    "</strong></div>" +
    '<div><span class="tiny muted">Pages / date</span><strong>' +
    esc(
      [document.pageCount, document.documentDate].filter(Boolean).join(" · ") ||
        "Not detected",
    ) +
    "</strong></div>" +
    "</div>";
  h +=
    '<div class="pnu-feature-grid">' +
    pnuList("Institutional outcomes", institutional.institutionalOutcomes) +
    pnuList("Program outcomes", institutional.programOutcomes) +
    pnuList("Course intended learning outcomes", outcomes.courseIntended) +
    pnuList("PPST alignment", institutional.ppst ? [institutional.ppst] : []) +
    pnuList("GEDI themes", themes.gedi) +
    pnuList("GCED themes", themes.gced) +
    pnuList("SDG indicators", themes.sdg) +
    pnuList("Performance evidence", outcomes.evidence) +
    pnuList("Performance standards", outcomes.standards) +
    pnuList("Independent study activities", resources.independentStudy) +
    pnuList("Required readings", resources.required) +
    pnuList("Course references", resources.references) +
    pnuList("Supplementary references", resources.supplementary) +
    pnuList("Course policies", policies.course) +
    pnuList("Class policies", policies.class) +
    pnuList("Course expectations", policies.expectations) +
    "</div>";
  h +=
    '<div class="pnu-data-block"><h4>Grading breakdown (' +
    (grading.total == null
      ? "not read reliably"
      : grading.total + "% detected") +
    ")</h4>" +
    (grading.items.length
      ? "<ul>" +
        grading.items
          .map(function (item) {
            return (
              "<li>" +
              esc(item.label) +
              " <strong>" +
              item.weight +
              "%</strong></li>"
            );
          })
          .join("") +
        "</ul>"
      : '<p class="small muted">No grading items detected.</p>') +
    (grading.valid === false
      ? '<div class="notice warn mt-s"><div>The grading table could not be read reliably, so no total is shown. Check the weights against the syllabus before relying on them.</div></div>'
      : "") +
    "</div>";
  h +=
    '<div class="pnu-data-block pnu-requirements"><h4>Course requirements</h4>' +
    (courseRequirements.length
      ? '<div class="tbl-wrap"><table aria-label="Course requirements"><thead><tr><th>Requirement</th><th>Weight</th></tr></thead><tbody>' +
        courseRequirements
          .map(function (item) {
            return (
              "<tr><td>" +
              esc(item.name) +
              "</td><td><strong>" +
              item.weight +
              "%</strong></td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : '<p class="small muted">No course requirements detected.</p>') +
    "</div>";
  h +=
    '<div class="pnu-data-block"><h4>Approvals</h4><div class="pnu-approval-row">' +
    ["preparedBy", "reviewedBy", "revisedBy", "approvedBy"]
      .map(function (key) {
        return approvals[key]
          ? "<span><b>" +
              esc(key.replace(/By$/, "")) +
              "</b> " +
              esc(approvals[key]) +
              "</span>"
          : "";
      })
      .join("") +
    "</div></div>";
  h += "</div></details>";
  return h;
}

export function importReviewBind(root) {
  const draft = UI.draft;
  qa("[data-draft]", root).forEach(function (el) {
    el.addEventListener("change", function () {
      const parts = el.dataset.key.split(".");
      const p = draft.payloads[+parts[0]];
      const i = +parts[1];
      const kind = el.dataset.draft;
      const item =
        kind === "lesson"
          ? p.result.lessons[i]
          : kind === "event"
            ? p.result.events[i]
            : p.result.readings[i];
      if (!item) return;
      item.include = el.checked;
    });
  });
  qa(".draft-due", root).forEach(function (el) {
    el.addEventListener("change", function () {
      const parts = el.dataset.key.split(".");
      const e = draft.payloads[+parts[0]].result.events[+parts[1]];
      e.due = el.value ? el.value + "T23:59" : null;
      e.dueFromWeek = false;
    });
  });
  qa(".draft-type", root).forEach(function (el) {
    el.addEventListener("change", function () {
      const parts = el.dataset.key.split(".");
      draft.payloads[+parts[0]].result.events[+parts[1]].type = el.value;
    });
  });
}

export const importViewDef = {
  fn: importView,
};
