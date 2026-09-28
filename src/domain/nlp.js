/**
 * Natural Language Processing for syllabus/document analysis
 * Rule-based extraction of lessons, events, and readings from text.
 *
 * Implementation lives under `src/domain/nlp/`; this module exposes the
 * `NLP` object API that callers import.
 */

import { analyse } from "./nlp/analyse.js";
import { summary, extractKeywords } from "./nlp/summary.js";

export const NLP = {
  analyse,
  summary,
  extractKeywords,
};

export default NLP;
