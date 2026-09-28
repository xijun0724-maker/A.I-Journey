/**
 * Syllabus-standard scoring and PNU section extraction.
 */

import { Store } from "../../core/store.js";
import { Standards } from "../../config/standards/index.js";
import { clean, uniqueCleanLines } from "./text.js";

/** Longest a course requirement's name can plausibly be. */
const REQUIREMENT_MAX = 90;

/**
 * Prose and rubric text that merely happens to end in a percentage.
 *
 * Passing thresholds ("At least ... 75%"), rubric criteria ("Content --
 * Unity, consistency of ...") and policy paragraphs ("Use of Generative
 * Artificial Intelligence (AI) Policy Given ...") were all being listed as
 * course requirements, because each one happens to end in "%".
 */
const NOT_A_REQUIREMENT =
  /\b(?:at least|or higher|or more|or better|no more than|minimum|at most|passing|failing|below|above)\b|\.\s|\s--\s/i;

function isRequirementLabel(label) {
  if (!/[A-Za-z]/.test(label)) return false; // "10%", "20% 20%" - a leftover cell
  if (label.length > REQUIREMENT_MAX) return false;
  return !NOT_A_REQUIREMENT.test(label);
}

/**
 * Analyse text against a registered syllabus standard.
 * @param {string} text - Source document text.
 * @param {object} result - NLP analysis result (lessons/events/readings/pnu).
 * @param {string|object} [standard] - Standard id, settings object, or standard itself.
 *   Defaults to the configured `settings.syllabusStandard`, else PNU.
 */
export function analyseAgainstStandard(text, result, standard) {
  const source = String(text || "");
  const resolved =
    standard && typeof standard === "object" && standard.requiredSections
      ? standard
      : Standards.resolve(
          standard ||
            (Store.db && Store.db.settings
              ? Store.db.settings.syllabusStandard
              : null),
        );
  const sections = resolved.requiredSections.map(function (section) {
    const matched = section.patterns.some(function (pattern) {
      return pattern.test(source);
    });
    return {
      id: section.id,
      label: section.label,
      status: matched ? "present" : "missing",
    };
  });
  const present = sections.filter(function (section) {
    return section.status === "present";
  }).length;
  const score = Math.round((present / sections.length) * 100);
  const findings = [];
  const warnings = [];
  sections.forEach(function (section) {
    if (section.status === "missing")
      warnings.push("Missing or unrecognized section: " + section.label + ".");
  });

  /*
   * The grading breakdown is read once, from the normalised lines, by
   * `extractPnuSections`. This used to rescan the raw text with its own rules
   * and its own section window, so the two panels could report different
   * totals for one document - and it could print 200% for a table whose weights
   * column is 30/20/20/10/20, because it had no letterless-values rule and no
   * declared-total to check against. One document, one reading.
   */
  const gradingRead = (result.pnu && result.pnu.grading) || null;
  const weights = gradingRead ? gradingRead.weights.slice() : [];
  const gradingReadable = !!(gradingRead && gradingRead.valid);
  const weightTotal = weights.reduce(function (sum, value) {
    return sum + value;
  }, 0);
  const hasGradingBreakdown =
    /grading system|course requirements|formative assessment|summative assessment/i.test(
      source,
    );
  if (hasGradingBreakdown && !weights.length) {
    warnings.push(
      "A grading section was found, but no percentage weights were detected.",
    );
  } else if (hasGradingBreakdown && !gradingReadable) {
    /* Never assert a total we could not read: saying "totals 200%, not 100%"
       for a table we failed to parse is a wrong number dressed as a finding. */
    warnings.push(
      "The grading breakdown could not be read reliably, so it has not been totalled.",
    );
  } else if (
    hasGradingBreakdown &&
    Math.abs(weightTotal - resolved.gradingTarget) > 0.01
  ) {
    findings.push("Grading percentages total " + weightTotal + "%, not 100%.");
  }
  const codeMentions =
    result.pnu && result.pnu.document
      ? result.pnu.document.courseCodeMentions || []
      : [];
  if (
    result.pnu &&
    result.pnu.course &&
    result.pnu.course.code &&
    codeMentions.length &&
    codeMentions.indexOf(result.pnu.course.code) < 0
  ) {
    findings.push(
      "Course code differs between the title header and Course Number field.",
    );
  }
  if ((result.lessons || []).length < resolved.minimumSessionCount) {
    findings.push(
      "Only " +
        (result.lessons || []).length +
        " session topics were detected; verify the session table.",
    );
  }
  if (!(result.events || []).length)
    warnings.push(
      "No assessments or deadlines were detected from the extracted text.",
    );
  if (!(result.readings || []).length)
    warnings.push("No required readings or learning resources were detected.");

  const scoreLabel =
    score >= 90
      ? "Strong match"
      : score >= 70
        ? "Partial match"
        : "Needs review";
  return {
    standard: resolved.id,
    standardLabel: resolved.label,
    score: score,
    scoreLabel: scoreLabel,
    sections: sections,
    findings: findings,
    warnings: warnings,
    grading: {
      detected: hasGradingBreakdown,
      weights: weights,
      total: gradingReadable ? weightTotal : null,
      target: resolved.gradingTarget,
      valid:
        gradingReadable &&
        Math.abs(weightTotal - resolved.gradingTarget) <= 0.01,
    },
    checks: {
      sessions: (result.lessons || []).length,
      assessments: (result.events || []).length,
      readings: (result.readings || []).length,
    },
  };
}

export function extractPnuSections(source, lines, result) {
  const text = String(source || "");
  const section = function (heading, stops) {
    const start = lines.findIndex(function (line) {
      return heading.test(line);
    });
    if (start < 0) return [];
    const end = lines.findIndex(function (line, index) {
      return (
        index > start &&
        stops.some(function (stop) {
          return stop.test(line);
        })
      );
    });
    return lines.slice(start + 1, end < 0 ? lines.length : end);
  };
  const allHeadings = [
    /^(?:pnu philosophy|pnu vision|pnu mission|pnu quality policy|institutional outcomes|college\/institute goals|program outcomes|ppst domain)/i,
    /^(?:course number|course title|course pre-requisite|course prerequisite|course description|gedi themes|gced themes)/i,
    /^(?:sdg indicator|session no\.?\s*\/?\s*duration|unit\s*\d|independent study|required readings|course references)/i,
    /^(?:performance indicator|summary of|evidence of performance|performance standard|grading system|course requirements|course policies|class policies|course expectations|consultation period|prepared by|reviewed by|revised by|approved by)/i,
  ];
  const stops = allHeadings;
  const valuesAfter = function (pattern) {
    const found = lines.findIndex(function (line) {
      return pattern.test(line);
    });
    return found < 0 ? "" : clean(lines[found].replace(pattern, ""));
  };
  const listSection = function (heading) {
    const start = lines.findIndex(function (line) {
      return heading.test(line);
    });
    const inline = start < 0 ? "" : clean(lines[start].replace(heading, ""));
    const values = section(heading, stops);
    if (inline) values.unshift(inline);
    return uniqueCleanLines(values, 80).filter(function (line) {
      return !/^(?:focus on|essential question|content|assessment|whole class discussion|small group activity)$/i.test(
        line,
      );
    });
  };

  const institutional = {
    institutionalOutcomes: listSection(/^institutional outcomes\s*/i),
    programOutcomes: listSection(/^program outcomes\s*/i),
    ppst: valuesAfter(/^ppst\s*/i),
  };
  const course = {
    code: valuesAfter(/^course number\s*/i) || result.courseMeta.code || null,
    title: valuesAfter(/^course title\s*/i) || result.courseMeta.title || null,
    prerequisite: valuesAfter(/^course pre-?requisite\s*/i) || null,
  };
  const themes = {
    gedi: listSection(/^gedi themes\s*/i),
    gced: listSection(/^gced themes\s*/i),
    sdg: listSection(/^sdg indicator(?:\/s)?\s*addressed\s*/i),
  };
  const outcomes = {
    courseIntended: listSection(
      /^(?:course intended learning outcomes|cilos?)\s*/i,
    ),
    evidence: listSection(/^evidence of performance\s*/i),
    standards: listSection(/^performance standard\s*/i),
  };
  const resources = {
    required: listSection(/^required readings\s*/i),
    references: listSection(
      /^course references\s*(?:and learning resources)?\s*/i,
    ),
    supplementary: listSection(/^supplementary references\s*/i),
    independentStudy: listSection(
      /^independent study\s*\/\s*flexible learning activity/i,
    ),
  };
  const policies = {
    course: listSection(/^course policies\s*/i),
    class: listSection(/^class policies\s*/i),
    expectations: listSection(/^course expectations\s*/i),
    consultation: valuesAfter(/^consultation period\s*/i),
  };
  const approvals = {
    preparedBy: valuesAfter(/^prepared by\s*/i),
    reviewedBy: valuesAfter(/^reviewed by\s*/i),
    revisedBy: valuesAfter(/^revised by\s*/i),
    approvedBy: valuesAfter(/^approved by\s*/i),
  };
  const firstMatch = function (pattern) {
    const match = pattern.exec(text);
    return match ? clean(match[1]) : null;
  };
  const headerCodeMatches = [];
  lines.forEach(function (line) {
    const match = /\b([A-Z]{2,}[A-Z0-9]*\d{2,})\b\s*[–—-]\s*[^\d]/.exec(line);
    if (match && headerCodeMatches.indexOf(match[1]) < 0)
      headerCodeMatches.push(match[1]);
  });
  const document = {
    referenceNo: firstMatch(/reference\s+no\.?\s*([^\n]+)/i),
    issueNo: firstMatch(/issue\s+no\.?\s*([^\n]+)/i),
    revisionNo: firstMatch(/rev(?:ision)?\.?\s+no\.?\s*([^\n]+)/i),
    documentDate: firstMatch(/(?:^|\n)date\s*:\s*([^\n]+)/i),
    dcNo: firstMatch(/dc\s+no\.?\s*([^\n]+)/i),
    pageCount: firstMatch(/page\s+\d+\s*\/\s*(\d+)/i),
    courseCodeMentions: headerCodeMatches,
  };

  /*
   * Grading weights.
   *
   * A PDF text extractor flattens a grading table into label rows followed by
   * value rows, so "Weight 30% 20% 20% 10%" and "20% 100%" are one column of
   * weights, not two items. Reading only the last number on a line treated the
   * document's own TOTAL cell as an assessment and produced totals of 110% and
   * 230% - numbers no grading column can sum to.
   *
   * So: take every percentage on the line, treat a trailing 100% as the
   * document's declared total rather than another weight, and keep an item only
   * when the line names it.
   */
  const gradingItems = [];
  const gradingWeights = [];
  let declaredTotal = null;
  lines.forEach(function (line) {
    if (/total|highest mark|passing mark/i.test(line)) return;
    const matches = line.match(/\b\d{1,3}(?:\.\d+)?\s*%/g) || [];
    if (!matches.length) return;
    const values = matches.map(function (value) {
      return parseFloat(value);
    });
    /* Only a letterless values row can carry the TOTAL cell. A named row that
       happens to read "Final Exam 100%" is a real requirement, not the total. */
    const valuesOnly = !/[A-Za-z]/.test(line);
    if (valuesOnly && values[values.length - 1] === 100) {
      declaredTotal = 100;
      values.pop();
    }
    if (!values.length) return;
    if (values.length === 1) {
      const label = clean(line.replace(matches[0], ""));
      if (isRequirementLabel(label))
        gradingItems.push({ label: label, weight: values[0] });
    }
    values.forEach(function (value) {
      gradingWeights.push(value);
    });
  });
  const courseRequirements = gradingItems
    .filter(function (item) {
      return !/^(?:grade in percent|grade point scale|adjectival description|total)$/i.test(
        item.label,
      );
    })
    .map(function (item) {
      return {
        name: item.label
          .replace(
            /^(?:course requirements\s*)?(?:formative assessment|summative assessment)\s*/i,
            "",
          )
          .trim(),
        weight: item.weight,
      };
    });

  const gradingWeightTotal = gradingWeights.reduce(function (sum, value) {
    return sum + value;
  }, 0);
  /* Report a total only when the document's own TOTAL corroborates it, or when
     it is at least arithmetically possible. A breakdown that cannot be read is
     worth less than no breakdown, and costs the student a wrong plan. */
  const gradingValid =
    declaredTotal != null
      ? Math.abs(gradingWeightTotal - declaredTotal) <= 0.5
      : gradingWeightTotal > 0 && gradingWeightTotal <= 100;
  const grading = {
    items: gradingItems,
    weights: gradingWeights,
    total: gradingValid ? gradingWeightTotal : null,
    declaredTotal: declaredTotal,
    valid: gradingValid,
  };

  return {
    institutional: institutional,
    course: course,
    themes: themes,
    outcomes: outcomes,
    grading: grading,
    courseRequirements: courseRequirements,
    resources: resources,
    policies: policies,
    approvals: approvals,
    document: document,
  };
}
