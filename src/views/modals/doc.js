/**
 * Document modal — view and manage uploaded documents
 */

import { Store } from "../../core/store.js";
import { KIND_LABEL } from "../../config/constants.js";
import { esc } from "../../utils/helpers.js";
import { fmtDate } from "../../utils/date.js";
import { q } from "../../utils/dom.js";
import { modal } from "../../utils/feedback.js";

export function docModal(docId) {
  const d = Store.doc(docId);
  if (!d) return;
  const body =
    '<div class="row tiny muted mb"><span>' +
    esc(KIND_LABEL[d.kind] || d.kind) +
    '</span><i class="msep"></i>' +
    "<span>" +
    esc(Store.courseName(d.courseId)) +
    '</span><i class="msep"></i>' +
    "<span>" +
    (d.chars || (d.text || "").length).toLocaleString() +
    ' characters</span><i class="msep"></i>' +
    "<span>" +
    (d.chunkCount || 0) +
    ' passages</span><i class="msep"></i><span>added ' +
    fmtDate(d.importedAt) +
    "</span></div>" +
    '<div class="row mb"><input id="docFind" placeholder="Find in document…" class="u-maxw-240">' +
    '<button class="btn sm" data-act="doc-reanalyse" data-id="' +
    esc(d.id) +
    '">Re-analyse as course material</button>' +
    '<button class="btn sm" data-act="doc-ask" data-id="' +
    esc(d.id) +
    '">Ask about this</button></div>' +
    (d.tables && d.tables.length
      ? "<h4>Extracted tables (" +
        d.tables.length +
        ")</h4>" +
        d.tables
          .map(function (t, i) {
            return (
              '<div class="table-note">Table ' +
              (i + 1) +
              (t.page ? ' <i class="msep"></i> page ' + t.page : "") +
              "</div>" +
              '<div class="tbl-wrap mb scroll-sm"><table aria-label="Document table data"><tbody>' +
              (t.header
                ? "<tr>" +
                  t.header
                    .map(function (c) {
                      return "<th>" + esc(c) + "</th>";
                    })
                    .join("") +
                  "</tr>"
                : "") +
              t.rows
                .map(function (r) {
                  return (
                    "<tr>" +
                    r
                      .map(function (c) {
                        return "<td>" + esc(c) + "</td>";
                      })
                      .join("") +
                    "</tr>"
                  );
                })
                .join("") +
              "</tbody></table></div>"
            );
          })
          .join("")
      : "") +
    '<h4>Extracted text</h4><div class="snippet scroll-lg" id="docText">' +
    esc((d.text || "").slice(0, 20000)) +
    "</div>";

  modal({
    title: d.name,
    wide: true,
    body: body,
    footer:
      '<button class="btn danger" data-act="del-doc" data-id="' +
      esc(d.id) +
      '">Delete document</button>' +
      '<span class="spacer"></span><button class="btn" data-close="1">Close</button>',
    onMount: function (m) {
      const find = q("#docFind", m);
      find.addEventListener("input", function () {
        const query = find.value.trim();
        const host = q("#docText", m);
        if (!query) {
          host.textContent = (d.text || "").slice(0, 20000);
          return;
        }
        const low = (d.text || "").toLowerCase(),
          idx = low.indexOf(query.toLowerCase());
        if (idx === -1) {
          host.textContent = 'No match for "' + query + '".';
          return;
        }
        const from = Math.max(0, idx - 600);
        host.textContent =
          (from ? "…" : "") + (d.text || "").slice(from, idx + 1400);
      });
    },
  });
}
