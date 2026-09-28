/**
 * PNU Teacher Education Pathways — Term 2 AY 2025-2026 session maps.
 *
 * Source documents (both on the CMIMO syllabus template, Rev. 01-06-2025,
 * DC No. CC01062025-1888):
 *   - TEDPaths_TGED04_Ethics.pdf ............................... TGED 04 Ethics
 *   - TPROFED05 Syllabus - Managing Learning Environment,
 *     Term 2 AY 2025-2026_DDM.pdf ..................... TPROFED05 Managing the
 *                                                       Learning Environment
 *
 * Both syllabi number *sessions*, not weeks, and some sessions span several
 * weeks. They are normalised here to one session per week:
 *
 *   - Ethics sessions 2-4 ("Living Ethically"), 7-8 ("Media Integrity") and
 *     9-10 ("Diversity, Pluralism and Ethics") are split into single weeks,
 *     which is what turns the source's 8 session blocks into 12 weeks.
 *     Session 11 is capstone *preparation*; the implementation/execution of
 *     the capstone belongs to session 12 with the course synthesis and final
 *     exam. The source also carries a "Wellness Break" cell inside its 9-10
 *     block, but the university-wide break (February 16-21, 2026) is week 6,
 *     which this syllabus spends on "Ethics and Society" — so the Ethics map
 *     claims no break of its own.
 *   - TPROFED05 session 0 (course overview) is folded into week 1, and the
 *     content-management rows numbered 3-5 become weeks 3-5, so its sessions
 *     1-12 land on weeks 1-12 with session 6 (midterm / wellness break) on
 *     week 6.
 *
 * No dates are stored. `buildTermData(termStart)` anchors week 1 to the term
 * start configured in Settings, so the same session map serves any term: every
 * lesson carries a week number and lets the Roadmap and Planner derive its
 * dates, while assessment deadlines are materialised from that anchor because
 * tasks need concrete dates. Re-running the loader re-anchors them.
 *
 * Assessment weights are transcribed from each syllabus's grading system and
 * sum to 100% per course. Reading titles are taken from each syllabus's own
 * session assignments and reference lists; nothing here invents a source the
 * syllabus does not name.
 *
 * Known ceiling: TPROFED05 puts Final Examinations on April 13-17, 2026,
 * term week 14 of the official calendar, while the session map covers weeks
 * 1-12. Deadlines stay inside the week their session names — the invariant
 * `buildTermData`, the Roadmap and the Planner all rely on — rather than
 * borrowing a date that would not hold for any other term start.
 */

import { addDays, dateOnly, fromIso } from "../utils/date.js";

/** Sessions per course: one session per week, twelve weeks. */
export const SESSIONS_PER_TERM = 12;

const TERM_LABEL = "2nd Term AY 2025-2026";

/* ── TGED 04 Ethics ─────────────────────────────────────────────────────────
   Grading: Capstone 30 / LMS activities 20 / Final exam 20 / Individual
   outputs 10 / Class participation 20.                                    */

const ETHICS = {
  id: "crs-tged04-ethics",
  code: "TGED 04",
  title: "Ethics",
  color: "#5b4a7a",
  credits: 3,
  sessions: [
    {
      week: 1,
      topic: "Course Orientation and Introduction to Ethics",
      notes:
        "Orientation: requirements, policies and blended-learning arrangements. What ethics is; how ethics differs from morality and law; the three traditions (virtue ethics, duty/deontology, consequentialism) and their strengths and weaknesses.",
      readings: [
        {
          title: "Introduction to Ethics; The Major Ethical Approaches",
          source: "Course required reading",
          status: "required",
        },
        {
          title: "Virtue Ethics (Hursthouse & Pettigrove, 2016)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "required",
        },
        {
          title: "Kant's Moral Philosophy (Johnson & Cureton, 2018)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "required",
        },
        {
          title: "Confucius (Riegel, 2013)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "required",
        },
        {
          title: "Ethics and Contrastivism",
          source: "Internet Encyclopedia of Philosophy",
          status: "optional",
        },
      ],
    },
    {
      week: 2,
      topic: "Living Ethically: Four Ways to Practice Virtue Ethics",
      notes:
        "Four ways to practise virtue ethics, and what each asks of you in study, work and relationships.",
      readings: [
        {
          title: "Ethics: A Very Short Introduction (Blackburn, 2001)",
          source: "Oxford University Press",
          status: "required",
        },
        {
          title: "Fundamentals of Ethics (Cariño, 2018)",
          source: "C&E Publishing",
          status: "required",
        },
      ],
    },
    {
      week: 3,
      topic:
        "Challenges to Ethical Living: Attention, Conformity and Obedience",
      notes:
        "Why living ethically is a challenge: selective attention and its reversal, psychological distance, conformity, obedience, diffusion of responsibility, perceived power, situationism. The Asch, Milgram, Good Samaritan and Stanford Prison studies.",
      readings: [
        {
          title: "Obedience to Authority: An Experimental View (Milgram, 2004)",
          source: "Perennial Classics",
          status: "required",
        },
        {
          title: "Challenges to Ethical Living and Strategies for Action",
          source: "Course reading",
          status: "required",
        },
        {
          title: "The Stanford Prison Experiment (video)",
          source: "YouTube (course playlist)",
          status: "optional",
        },
      ],
    },
    {
      week: 4,
      topic: "Strategies for Action: Giving Voice to Values",
      notes:
        "Strategies for action: giving voice to values, rehearsing ethical action, and protecting yourself from situational pressure.",
      readings: [
        {
          title: "Giving Voice to Values",
          source: "UVA Darden (IBIS)",
          status: "required",
        },
        {
          title: "Just Babies: The Origins of Good and Evil (Bloom, 2013)",
          source: "Random House",
          status: "optional",
        },
      ],
    },
    {
      week: 5,
      topic: "Ethical Leadership",
      notes:
        "What ethical leadership is, why it matters, and ethical responsibility in practice. Leader review: personal history, significant contributions, issues addressed and how they were handled.",
      readings: [
        {
          title: "Ethical Leadership",
          source: "Course reading",
          status: "required",
        },
        {
          title: "Why Good Leaders Make You Feel Safe (Sinek)",
          source: "TED",
          status: "optional",
        },
        {
          title: "Are You a Giver or a Taker? (Grant)",
          source: "TED",
          status: "optional",
        },
        {
          title: "Everyday Leadership (Dudley)",
          source: "TED",
          status: "optional",
        },
      ],
    },
    {
      week: 6,
      topic: "Ethics and Society",
      notes:
        "Definition of society and the role of society; society and the state; theories on the justification of the state; embedding ethics in the social contract.",
      readings: [
        {
          title: "Jean Jacques Rousseau (Bertram, 2017)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "required",
        },
        {
          title:
            "Contemporary Approaches to the Social Contract (D'Agostino et al., 2017)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "required",
        },
        {
          title:
            "Hobbes's Moral and Political Philosophy (Lloyd & Sreedhar, 2014)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "optional",
        },
        {
          title: "Max Weber (Kim, 2017)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "optional",
        },
        {
          title:
            "The Significance of Ethics and Ethics Education in Daily Life (Burroughs)",
          source: "YouTube (course playlist)",
          status: "optional",
        },
        {
          title: "A Theory of Justice (Rawls, 1971)",
          source: "Harvard University Press",
          status: "optional",
        },
      ],
    },
    {
      week: 7,
      topic: "Media Integrity and Ethics I: Media, Society and Technology",
      notes:
        "Media and its types; the role of media in and for society; technology and ethics; thinking like a journalist.",
      readings: [
        {
          title: "Think Like a Journalist (Kelsey Samuels)",
          source: "YouTube (course playlist)",
          status: "required",
        },
        {
          title: "The Power of Digital Journalism (Anita Li, TEDx)",
          source: "TEDx",
          status: "optional",
        },
        {
          title: "The Future of Journalism (Rosenstiel, TEDxAtlanta)",
          source: "TEDx",
          status: "optional",
        },
      ],
    },
    {
      week: 8,
      topic:
        "Media Integrity and Ethics II: Journalists, Citizen-Journalists and Consumers",
      notes:
        "Ethical principles for journalists, for citizen-journalists and for media consumers; using technology ethically; how to combat disinformation. Case-study analysis using the SPJ code of ethics.",
      readings: [
        {
          title: "Code of Ethics Case Studies",
          source: "Society of Professional Journalists",
          status: "required",
        },
      ],
    },
    {
      week: 9,
      topic: "Diversity, Pluralism and Ethics",
      notes:
        "Diversity, tolerance and pluralism; religious belief and diversity; upholding ethics in a plural society; advocacy work in the community.",
      readings: [
        {
          title: "Chinese Ethics (Wong, 2017)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "optional",
        },
        {
          title:
            "Are We Comparing Yet? On Standards, Justice, and Incomparability (Saussy, 2019)",
          source: "Bielefeld University Press",
          status: "optional",
        },
        {
          title: "The DNA Journey (video)",
          source: "YouTube (course playlist)",
          status: "optional",
        },
        {
          title: "The Long Walk to Freedom (book summary)",
          source: "Medium",
          status: "optional",
        },
        {
          title:
            "Malala Yousafzai at the Transforming Education Summit (video)",
          source: "United Nations",
          status: "optional",
        },
      ],
    },
    {
      week: 10,
      topic: "Gender, Intersectionality and Ethics",
      notes:
        "Intersectionality; gender and diversity; gender-fair language and representation; the GEDI themes (gender-fair language, gender identity and roles, representation, diversity of learners); SDG 5.",
      readings: [
        {
          title:
            "Paano ba maging mabuti? Pagpapakahulugan sa pagiging mabuting tao at makataong pagtrato (Liao, 2016)",
          source: "Diwa E-journal",
          status: "required",
        },
        {
          title: "Sustainable Development Goal 5: Gender Equality",
          source: "United Nations",
          status: "optional",
        },
        {
          title: "The Strange Life and Death of Dr. Alan Turing (video)",
          source: "YouTube (course playlist)",
          status: "optional",
        },
      ],
    },
    {
      week: 11,
      topic: "Capstone Project: Preparation",
      notes:
        "Class preparation for the capstone project: communication with the course professor and classmates, and preparation of a technical, narrative or performance report of the capstone project showcasing the intersection of history, communication, ethics and cultural studies.",
      readings: [
        {
          title: "Integrity (Cox et al., 2017)",
          source: "Stanford Encyclopedia of Philosophy",
          status: "optional",
        },
      ],
    },
    {
      week: 12,
      topic:
        "Implementation of the Capstone Project, Course Synthesis and Final Examination",
      notes:
        "Independent study / flexible learning activity; implementation and execution of the capstone project; course synthesis and integration across the units; final examination; self-assessment, peer assessment and teacher evaluation rubrics.",
      readings: [],
    },
  ],
  assessments: [
    {
      id: "ev-eth-outputs",
      title:
        "Individual Outputs: Reflection Paper and Analyzing Ethics Case Studies",
      type: "assignment",
      week: 10,
      weight: 10,
      dayOffset: 4,
      time: "23:59",
    },
    {
      id: "ev-eth-capstone",
      title: "Capstone Project (submission and presentation)",
      type: "project",
      week: 11,
      weight: 30,
      dayOffset: 4,
      time: "23:59",
    },
    {
      id: "ev-eth-lms",
      title: "LMS Activities Completion (reflection questions)",
      type: "assignment",
      week: 12,
      weight: 20,
      dayOffset: 0,
      time: "23:59",
    },
    {
      id: "ev-eth-final",
      title: "Final Examination",
      type: "exam",
      week: 12,
      weight: 20,
      dayOffset: 1,
      time: "08:00",
    },
    {
      id: "ev-eth-participation",
      title: "Class Participation (synchronous meets and in-person)",
      type: "other",
      week: 12,
      weight: 20,
      dayOffset: 4,
      time: "23:59",
    },
  ],
};

/* ── TPROFED05 Managing the Learning Environment ────────────────────────────
   Grading: worksheets 15 / topic facilitation 15 / discussion responses and
   attendance 10 / final examinations 25 / presentation, critique and LEMP 25 /
   e-Portfolio 10. The midterm examination is a session requirement without a
   separate weight, so it is loaded unweighted.                             */

const LEMP = {
  id: "crs-tprofed05-lemp",
  code: "TPROFED05",
  title: "Managing the Learning Environment",
  color: "#2c6e4c",
  credits: 3,
  sessions: [
    {
      week: 1,
      topic:
        "Course Orientation and the Nature and Components of a Learning Environment",
      notes:
        "Course overview, objectives, outcomes and design; alignment with the PNU Quality Policy, the OBTEC 2.0 framework and PPST Domain 2 (Strands 1-6); requirements, performance criteria and flexible learning arrangements. Nature and components of a learning environment: physical, psychological and social. Major components of classroom management: content, conduct and covenant.",
      readings: [
        {
          title:
            "Classroom Management for Elementary Teachers, 11th ed. (Evertson & Emmer, 2020)",
          source: "Pearson",
          status: "required",
        },
        {
          title:
            "Strategies for Building a Productive and Positive Learning Environment (Loveless, 2020)",
          source: "Education Corner",
          status: "optional",
        },
        {
          title: "Course syllabus and preliminary course files",
          source: "ePNU course materials",
          status: "required",
        },
      ],
    },
    {
      week: 2,
      topic: "Emerging Concepts and Types of Learning Environment",
      notes:
        "Traditional classroom and in-person teaching; flexible, blended, hybrid and hyflex arrangements; situational and at-place learning; other emerging types of learning environment, and the guiding principles for managing each.",
      readings: [
        {
          title:
            "Comprehensive Classroom Management, 12th ed. (Jones & Jones, 2022)",
          source: "Pearson",
          status: "required",
        },
        {
          title:
            "Learning Spaces: Built, Natural and Digital Considerations (Gunasekara et al., 2022)",
          source: "Springer",
          status: "optional",
        },
      ],
    },
    {
      week: 3,
      topic: "Managing Classroom Layout, Structures and Activities",
      notes:
        "The classroom layout: physical arrangement and decorations; developmentally appropriate structures; designing an ideal learning environment; classroom observation and analysis.",
      readings: [
        {
          title:
            "Minimum Performance Standards and Specifications for DepEd School Buildings (DO 64, s. 2017)",
          source: "Department of Education",
          status: "required",
        },
        {
          title: "DepEd Educational Facilities Manual",
          source: "Department of Education",
          status: "required",
        },
        {
          title:
            "Basic Strategies for Providing Structure in the Classroom (Meador, 2020)",
          source: "ThoughtCo",
          status: "optional",
        },
        {
          title:
            "The Impact of Learning Space Design on Learner Experience and Collaboration (Penrod, 2021)",
          source: "EDUCAUSE Review",
          status: "optional",
        },
      ],
    },
    {
      week: 4,
      topic: "Rules, Routines and Transitions",
      notes:
        "School policies, classroom rules and regulations; classroom norms; routines and transitions; the classroom rules creation workshop and classroom management plan.",
      readings: [
        {
          title:
            "Classroom Management: Creating a Successful K-12 Learning Community, 7th ed. (Burden, 2020)",
          source: "John Wiley & Sons",
          status: "required",
        },
      ],
    },
    {
      week: 5,
      topic: "Self-Regulated Learning and Learner Engagement",
      notes:
        "Zimmerman's self-regulated learning: its aspects, importance and strategies to promote it; goal-setting, self-monitoring checklists and reflection logs. Supporting active participation and engagement: differentiating participation, choice boards and learning menus, think-pair-share, interactive notebooks.",
      readings: [
        {
          title:
            "Leading and Managing a Differentiated Classroom, 2nd ed. (Tomlinson & Imbeau, 2023)",
          source: "ASCD",
          status: "required",
        },
        {
          title:
            "Classroom Management That Works (Marzano, Marzano & Pickering, 2021)",
          source: "ASCD",
          status: "optional",
        },
      ],
    },
    {
      week: 6,
      topic: "Midterm Examination / Wellness Break",
      notes:
        "Midterm examination and the university wellness break as scheduled in the official academic calendar. No new topic this week.",
      readings: [],
    },
    {
      week: 7,
      topic: "Purposive Learning: Self-Determination and Feedback",
      notes:
        "Self-determined learning and self-directed learning pathways; Self-Determination Theory (Ryan & Deci) and the needs it names; using feedback to promote self-determined learning: feedback carousel, two stars and a wish, the feedback sandwich; passion projects, learning contracts and learning diaries.",
      readings: [
        {
          title:
            "Feedback: Unveiling Its Impact and Enhancing Its Effectiveness (Kutasi, 2023)",
          source: "Journal of Pedagogy",
          status: "required",
        },
        {
          title:
            "Essential Evidence-Based Teaching Strategies (Hornby & Greaves, 2022)",
          source: "Springer",
          status: "optional",
        },
      ],
    },
    {
      week: 8,
      topic: "Empowering and Nurturing Diverse Learners",
      notes:
        "Learner agency and metacognition; learner profiles, personalised goal-setting and metacognitive learning logs; gender equality and sensitivity; gender stereotypes and media bias; strategies to support diverse learners.",
      readings: [
        {
          title:
            "Start Where You Are, But Don't Stay There, 2nd ed. (Milner & Tenore, 2021)",
          source: "Harvard Education Press",
          status: "required",
        },
        {
          title:
            "Foundational Classroom Management Resources Handbook (Peddie et al., 2024)",
          source: "Australian Education Research Organisation",
          status: "optional",
        },
      ],
    },
    {
      week: 9,
      topic: "Managing Disruptive Behaviors",
      notes:
        "Minor and major misbehaviours and their causes; classroom management approaches; preventive strategies; positive reinforcement; restorative practice simulation; creating a classroom behaviour plan.",
      readings: [
        {
          title:
            "Positive Behavior Support in the Classroom, 3rd ed. (Simonsen et al., 2020)",
          source: "Pearson",
          status: "required",
        },
        {
          title:
            "Positive Behavioral Interventions and Supports: History and Defining Features (Sugai & Simonsen, 2020)",
          source: "Journal of Positive Behavior Interventions",
          status: "required",
        },
        {
          title:
            "Effective Classroom Management: Teacher Preparation and Professional Development (Oliver & Reschly, 2020)",
          source: "TQ Research & Policy Brief",
          status: "optional",
        },
      ],
    },
    {
      week: 10,
      topic: "Managing Interpersonal Relationships and Conflict",
      notes:
        "Conflict resolution strategies (CoRe); active listening practice and 'I' statements; collaborative problem solving; emotion identification and regulation; analysis of related laws: the Anti-Bullying Act (RA 10627), the Safe Spaces Act (RA 11313) and DepEd policies.",
      readings: [
        {
          title: "The Anti-Bullying Act of 2013 (RA 10627)",
          source: "Official Gazette",
          status: "required",
        },
        {
          title: "Safe Spaces Act / Bawal Bastos Law (RA 11313)",
          source: "Official Gazette",
          status: "required",
        },
      ],
    },
    {
      week: 11,
      topic: "Ensuring Safety, Security, Fairness, Respect and Care",
      notes:
        "Safe and secure learning environments; social-emotional learning, mindset and non-cognitive skills; a climate of respect; bullying prevention and personal safety workshops; relationship-building circles and mindful practices.",
      readings: [
        {
          title: "DepEd Child Protection Policy (DO 40, s. 2012)",
          source: "Department of Education",
          status: "required",
        },
        {
          title:
            "Special Protection of Children Against Abuse, Exploitation and Discrimination Act (RA 7610)",
          source: "Official Gazette",
          status: "optional",
        },
        {
          title:
            "Improving School Climate (Bear, 2020)",
          source: "Routledge",
          status: "optional",
        },
        {
          title:
            "Creating Positive Classroom Climate: 30 Practical Strategies for All School Contexts (Connolly & Davis, 2022)",
          source: "Course reference list",
          status: "optional",
        },
        {
          title:
            "PPST Resource Package Module 15: Establish Safe and Secure Learning Environments",
          source: "Department of Education",
          status: "optional",
        },
      ],
    },
    {
      week: 12,
      topic: "Finalization and Presentation of the Learning Environment Management Plan",
      notes:
        "Finalising and presenting the LEMP: rationale, objectives, approaches, strategies and techniques, and overall insights. Final examinations as scheduled in the official academic calendar.",
      readings: [
        {
          title:
            "Classroom Management: Authentic Experiences in Classroom Teaching (Schooneveld & Ryan, 2023)",
          source: "Springer",
          status: "optional",
        },
      ],
    },
  ],
  assessments: [
    {
      id: "ev-lemp-facilitation",
      title: "Topic Facilitation (group information presentation)",
      type: "presentation",
      week: 5,
      weight: 15,
      dayOffset: 3,
      time: "13:00",
    },
    {
      id: "ev-lemp-midterm",
      title: "Midterm Examination",
      type: "exam",
      week: 6,
      weight: null,
      dayOffset: 2,
      time: "08:00",
    },
    {
      id: "ev-lemp-lemp",
      title: "Presentation, Critique and Final LEMP",
      type: "project",
      week: 12,
      weight: 25,
      dayOffset: 2,
      time: "13:00",
    },
    {
      id: "ev-lemp-finals",
      title: "Final Examinations",
      type: "exam",
      week: 12,
      weight: 25,
      dayOffset: 3,
      time: "08:00",
    },
    {
      id: "ev-lemp-worksheets",
      title: "Formative Assessment: Accomplished Worksheets",
      type: "assignment",
      week: 12,
      weight: 15,
      dayOffset: 0,
      time: "23:59",
    },
    {
      id: "ev-lemp-discussion",
      title: "Discussion Responses, Small Group Activity and Attendance",
      type: "other",
      week: 12,
      weight: 10,
      dayOffset: 1,
      time: "23:59",
    },
    {
      id: "ev-lemp-eportfolio",
      title: "e-Portfolio",
      type: "other",
      week: 12,
      weight: 10,
      dayOffset: 4,
      time: "23:59",
    },
  ],
};

/** The two courses as authored, without generated ids or dates. */
export const TERM_COURSES = [ETHICS, LEMP];

/** Where the session maps came from — surfaced in the loader's confirmation. */
export const TERM_SOURCES = [
  "TEDPaths_TGED04_Ethics.pdf (TGED 04 Ethics)",
  "TPROFED05 Syllabus - Managing Learning Environment, Term 2 AY 2025-2026_DDM.pdf (TPROFED05)",
];

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

function weekAnchor(termStart, week) {
  return addDays(termStart, (Math.max(1, week) - 1) * 7);
}

/**
 * Materialise one term's worth of store-ready collections.
 *
 * Lessons carry a week number and no dates, so the Roadmap and Planner derive
 * each week's window from the configured term start (that is the whole point of
 * the week-per-session map). Assessment deadlines cannot be left undated —
 * tasks, the dashboard and the calendar all key off `due` — so they are
 * anchored to `weekAnchor(termStart) + dayOffset` and stay inside the week the
 * syllabus assigns them to.
 *
 * @param {string} termStartIso - YYYY-MM-DD, e.g. Settings -> term start
 * @returns {{label: string, termStart: string, courses: Array, lessons: Array,
 *   readings: Array, events: Array}}
 */
export function buildTermData(termStartIso) {
  const parsed = fromIso(termStartIso);
  const termStart = parsed ? dateOnly(parsed) : dateOnly(new Date());
  const anchor = fromIso(termStart);

  const courses = [];
  const lessons = [];
  const readings = [];
  const events = [];

  TERM_COURSES.forEach(function (course) {
    const slug = course.code.toLowerCase().replace(/[^a-z0-9]+/g, "");
    courses.push({
      id: course.id,
      code: course.code,
      title: course.title,
      color: course.color,
      instructor: "",
      term: TERM_LABEL,
      days: "",
      room: "",
      credits: course.credits,
      /* No startDate/endDate: the course modal falls back to the live term
         window in Settings, so the record cannot drift from the active term. */
      createdAt: new Date().toISOString(),
      source: "syllabus",
    });

    course.sessions.forEach(function (session) {
      const week = session.week;
      const lessonId = "lsn-" + slug + "-" + pad(week);
      lessons.push({
        id: lessonId,
        topic: session.topic,
        week: week,
        courseId: course.id,
        notes: session.notes || "",
        done: false,
        start: null,
        end: null,
        readings: [],
        eventIds: [],
        source: "syllabus",
      });

      (session.readings || []).forEach(function (reading, i) {
        readings.push({
          id: "rdg-" + slug + "-" + pad(week) + "-" + (i + 1),
          title: reading.title,
          courseId: course.id,
          week: week,
          source: reading.source || "",
          pages: "",
          status: reading.status === "optional" ? "optional" : "required",
          docId: null,
        });
      });
    });

    course.assessments.forEach(function (a) {
      const day = addDays(weekAnchor(anchor, a.week), a.dayOffset || 0);
      events.push({
        id: a.id,
        title: a.title,
        type: a.type,
        courseId: course.id,
        due: dateOnly(day) + "T" + (a.time || "23:59") + ":00",
        weight: a.weight,
        points: null,
        pointsEarned: null,
        notes: "Week " + a.week + " of " + SESSIONS_PER_TERM + " (syllabus)",
        status: "todo",
        createdAt: new Date().toISOString(),
        confidence: 1,
        sourceDocId: null,
        source: "syllabus",
        readingIds: [],
      });
    });
  });

  return {
    label: TERM_LABEL,
    termStart: termStart,
    courses: courses,
    lessons: lessons,
    readings: readings,
    events: events,
  };
}
