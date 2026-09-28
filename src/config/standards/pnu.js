/**
 * PNU CMI teacher-education syllabus reference standard.
 * Data-driven so the extraction pipeline stays standard-agnostic.
 */

/**
 * Vocabulary that marks a table row as a PNU course-requirement row.
 *
 * The PDF/Word table reader (`utils/extract.js`) and the two views that show
 * the rows it kept (`views/import.js`, `views/roadmap.js`) all need the same
 * judgement about which rows are requirements; keeping one definition here
 * stops the three from drifting. Never add the `g` flag: the shared object is
 * reused across calls and `.test()` is only stateless without `lastIndex`.
 */
export const PNU_REQUIREMENT_ROW =
  /course requirements|formative assessment|summative assessment|accomplished worksheets|topic facilitation|discussion responses|final examinations?|presentation\s*\/\s*critique|learning environment management plan|e-?portfolio|total\s+100%/i;

export const pnuStandard = {
  id: "pnu-cmi-teacher-education-2025",
  label: "PNU CMI Teacher Education Pathways",
  builtin: true,
  requiredSections: [
    {
      id: "institutional",
      label: "Institutional identity",
      patterns: [
        /pnu philosophy/i,
        /pnu vision/i,
        /pnu mission/i,
        /quality policy/i,
      ],
    },
    {
      id: "course",
      label: "Course information",
      patterns: [
        /course number/i,
        /course title/i,
        /course description/i,
        /pre-requisite|prerequisite/i,
      ],
    },
    {
      id: "outcomes",
      label: "Outcomes and alignment",
      patterns: [
        /program outcomes/i,
        /institutional outcomes/i,
        /ppst domain/i,
        /course intended learning outcomes|cilo/i,
      ],
    },
    {
      id: "inclusivity",
      label: "GEDI and GCED themes",
      patterns: [
        /gedi themes/i,
        /gced themes/i,
        /gender (?:equality|sensitivity|literacy)/i,
        /culture and intercultural/i,
      ],
    },
    {
      id: "schedule",
      label: "Session plan",
      patterns: [
        /session\s+no\.?/i,
        /instructional delivery design/i,
        /face-to-face activities/i,
        /online modality/i,
        /session\s+course\s+intended/i,
        /no\.?\/\s*duration/i,
      ],
    },
    {
      id: "assessment",
      label: "Assessment and evidence",
      patterns: [
        /assessment/i,
        /evidence of performance/i,
        /performance standard/i,
        /rubric/i,
      ],
    },
    {
      id: "grading",
      label: "Grading system",
      patterns: [
        /grading system/i,
        /formative assessment/i,
        /summative assessment/i,
        /total\s+100%/i,
      ],
    },
    {
      id: "resources",
      label: "Readings and resources",
      patterns: [
        /required readings/i,
        /course references/i,
        /learning resources/i,
        /supplementary references/i,
      ],
    },
    {
      id: "policies",
      label: "Policies and expectations",
      patterns: [
        /course policies/i,
        /class policies/i,
        /course expectations/i,
        /attendance and class participation/i,
      ],
    },
    {
      id: "approvals",
      label: "Review and approval",
      patterns: [/prepared by/i, /reviewed by/i, /approved by/i],
    },
  ],
  gradingTarget: 100,
  minimumSessionCount: 5,
};

export default pnuStandard;
