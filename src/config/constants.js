/**
 * Configuration constants for Journey A.I
 * Centralizes all magic numbers and app settings.
 */

const MAX_CHAT_CHARS = 20000;

/** Canonical document-kind labels (import picker, library badges, doc modal). */
export const KIND_LABEL = {
  syllabus: "Syllabus",
  notes: "Lecture notes",
  textbook: "Textbook",
  brief: "Assignment brief",
  other: "Other document",
};

export const CFG = {
  storageKey: "journeyai.db.v1",
  schemaVersion: 5,
  maxDocChars: 300000,
  chunkSize: 900,
  chunkOverlap: 150,
  maxChatChars: MAX_CHAT_CHARS,
  maxHistoryChars: 8000,
  // Retrieved passages get their own budget (40% of the chat budget), so
  // context and conversation history cannot starve each other.
  maxContextChars: Math.floor(MAX_CHAT_CHARS * 0.4),

  openrouter: {
    model: "openrouter/free",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    defaultKey: "",
    /* The AI layer speaks to exactly one endpoint: OpenRouter. Its provider
       metadata lives here rather than in a separate registry because there
       is no second provider to register — one adapter is no seam. */
    label: "OpenRouter",
    keyHint: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    freeModels: [
      {
        id: "openrouter/free",
        label: "Free auto-router (picks best free model)",
      },
      {
        id: "deepseek/deepseek-v4-flash-0731:free",
        label: "DeepSeek V4 Flash (1M ctx)",
      },
      {
        id: "google/gemma-4-26b-a4b-it:free",
        label: "Gemma 4 26B (multimodal)",
      },
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B" },
      { id: "qwen/qwen3.8-27b:free", label: "Qwen 3.8 27B" },
      {
        id: "nvidia/nemotron-3.5-lightning:free",
        label: "Nemotron 3.5 Lightning (1M ctx)",
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        label: "Nemotron 3 Ultra 550B",
      },
      {
        id: "thinkingmachines/inkling:free",
        label: "Inkling (1M ctx, multimodal)",
      },
    ],
  },

  maxChatHistory: 20,
  maxChatMessages: 100,

  palette: [
    "#2f5d8c",
    "#2c6e4c",
    "#8a6410",
    "#5b4a7a",
    "#a8331f",
    "#2a6280",
    "#6b5a3e",
  ],

  taskTypes: {
    exam: { label: "Exam", icon: "", base: 300, color: "#a8331f" },
    quiz: { label: "Quiz", icon: "", base: 90, color: "#8a6410" },
    assignment: { label: "Assignment", icon: "", base: 180, color: "#2a6280" },
    project: { label: "Project", icon: "", base: 600, color: "#5b4a7a" },
    presentation: {
      label: "Presentation",
      icon: "",
      base: 240,
      color: "#2c6e4c",
    },
    lab: { label: "Lab", icon: "", base: 180, color: "#6b5a3e" },
    reading: { label: "Reading", icon: "", base: 60, color: "#545f6a" },
    other: { label: "Other", icon: "", base: 120, color: "#67717a" },
  },

  subtaskTemplates: {
    assignment: [
      "Select topic / scope",
      "Gather references",
      "Create outline",
      "Write draft",
      "Revise content",
      "Submit final work",
    ],
    project: [
      "Review requirements",
      "Write proposal / plan",
      "Design solution",
      "Build / implement",
      "Test and refine",
      "Prepare deliverables",
      "Present and submit",
    ],
    exam: [
      "Review lecture notes",
      "Rework problem sets",
      "Practice under time limit",
      "Build summary sheet",
      "Sit the exam",
    ],
    quiz: [
      "Skim assigned readings",
      "Make flash cards",
      "Self-quiz",
      "Take quiz",
    ],
    presentation: [
      "Research key points",
      "Draft slide outline",
      "Design slides",
      "Rehearse talk",
      "Deliver presentation",
    ],
    lab: [
      "Read lab brief",
      "Prepare materials",
      "Run the experiment",
      "Write lab report",
      "Submit report",
    ],
    reading: [
      "Skim structure and headings",
      "Close read assigned pages",
      "Take notes",
      "Summarise key ideas",
    ],
    other: ["Clarify requirements", "Do the work", "Review and submit"],
  },

  priorityWeights: { urgency: 0.5, weight: 0.3, effort: 0.2 },

  // Timeouts (in milliseconds)
  timeouts: {
    apiDefault: 75000,
    apiRetryDelay: 1200,
    apiRefine: 110000,
    apiAnswer: 90000,
    apiTest: 30000,
    minUsefulWindow: 4000,
    maxRetryAfterMs: 5000,
    pdfParse: 30000,
    fileParse: 20000,
    toastDefault: 4200,
    toastError: 6500,
    debounceDefault: 200,
    debounceSave: 250,
  },

  // Storage
  storage: {
    maxBytes: 5242880, // ~5 MB browser storage cap
  },

  // Study-plan agent (tool loop)
  agent: {
    maxIters: 5,
    maxToolResultChars: 4000,
    maxWallClockMs: 120000, // hard ceiling on a whole agent run (6 calls x 110s worst case)
    maxRepeats: 2, // identical consecutive tool calls before the loop gives up
  },

  // RAG tuning
  rag: {
    bm25k1: 1.5,
    bm25b: 0.75,
    phraseBonus: 2.5,
    snippetLength: 420,
    // Paragraphs are merged into one chunk until they reach chunkSize ×
    // mergeCeil; past it the segment is split on sentence boundaries.
    mergeCeil: 1.7,
    // Relevance floor, as a fraction of the best hit: anything under 10% of it
    // is tail noise, not a source. Relative rather than absolute so a
    // one-document library is never zeroed out (its only hit *is* the best
    // hit). Pass `minRelative: 0` to switch the floor off.
    minRelative: 0.1,
    // Synonym-expanded query terms score at this weight (multi-query
    // recall), so the student's own words still dominate the ranking.
    synWeight: 0.5,
    // A candidate whose character range overlaps an already-kept chunk of
    // the same document by this fraction (of the shorter chunk) is a
    // near-duplicate — an overlap window or sweep remainder — and is
    // dropped rather than spending the context budget twice.
    dedupOverlap: 0.6,
    hybrid: {
      blend: 0.35, // weight of cosine vs BM25 after normalisation (0 = pure BM25)
      candidateFactor: 3, // BM25 candidates to re-rank = k * factor
      maxCache: 256, // content-hash LRU size for embedding vectors
      dim: 384, // expected embedding dimension (all-MiniLM-L6-v2)
      model: "Xenova/all-MiniLM-L6-v2",
      cdn: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js",
    },
  },

  // Planner
  planner: {
    minBlock: 15, // minimum study block in minutes
    maxBlock: 120, // maximum single block in minutes
    blockGap: 10, // gap between blocks in minutes
    weekendStart: 10, // study start hour on weekends
    weekdayStart: 18, // study start hour on weekdays
  },

  // Letter grade thresholds
  grades: [
    { min: 92, letter: "A" },
    { min: 88, letter: "A-" },
    { min: 84, letter: "B+" },
    { min: 80, letter: "B" },
    { min: 76, letter: "B-" },
    { min: 72, letter: "C+" },
    { min: 68, letter: "C" },
    { min: 60, letter: "D" },
    { min: 0, letter: "F" },
  ],
};

export default CFG;
