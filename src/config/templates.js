/**
 * Course Banner Cover Generator for Journey A.I
 * Dynamically generates bespoke, resolution-independent vector banners
 * based on course titles, codes, and subject matter.
 */

function svgUri(xml) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml.trim());
}

/**
 * Escape XML special characters to guarantee 100% valid SVG documents
 */
function xmlEsc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Subject classifier based on course title keywords
 */
function detectSubject(text = "") {
  const s = text.toLowerCase();
  if (/entrep|busin|market|financ|econ|manage|leader|trade|ventur|commerc|account/.test(s)) return "business";
  if (/anim|art|design|illustrat|media|film|music|draw|graphic|creativ|paint|visual/.test(s)) return "arts";
  if (/ict|comput|code|tech|program|software|cyber|web|data|system|network|algor|ai|cloud|python|java|logic/.test(s)) return "tech";
  if (/teach|educ|learn|pedagog|profed|psych|child|curricul|school|instruct|assess|classroom/.test(s)) return "education";
  if (/math|calc|physic|chem|biolog|scienc|algeb|geometr|statist|engin|circuit|mechanic|botany/.test(s)) return "science";
  if (/literat|read|writ|englis|histor|languag|philo|humanit|communi|journal|linguist|speech/.test(s)) return "humanities";
  if (/health|nurs|medic|sport|pe|phys|fitness|wellness|athlet|gym|anatomy/.test(s)) return "health";
  return "general";
}

const PALETTES = {
  business: {
    bg1: "#064e3b", bg2: "#14532d", bg3: "#ca8a04", accent: "#fde047", text: "#fef08a", tag: "BUSINESS & INNOVATION",
    shapes: ["#166534", "#854d0e", "#eab308"]
  },
  arts: {
    bg1: "#0369a1", bg2: "#0284c7", bg3: "#f43f5e", accent: "#38bdf8", text: "#ffffff", tag: "DIGITAL ARTS & DESIGN",
    shapes: ["#0284c7", "#f43f5e", "#fb923c"]
  },
  tech: {
    bg1: "#090d16", bg2: "#1e1b4b", bg3: "#4c1d95", accent: "#06b6d4", text: "#c084fc", tag: "TECHNOLOGY & COMPUTING",
    shapes: ["#06b6d4", "#8b5cf6", "#3b82f6"]
  },
  education: {
    bg1: "#431407", bg2: "#78350f", bg3: "#c2410c", accent: "#fb923c", text: "#ffedd5", tag: "EDUCATION & PEDAGOGY",
    shapes: ["#9a3412", "#ea580c", "#f97316"]
  },
  science: {
    bg1: "#0f172a", bg2: "#1e3a8a", bg3: "#0284c7", accent: "#38bdf8", text: "#eff6ff", tag: "SCIENCE & MATHEMATICS",
    shapes: ["#1e40af", "#0284c7", "#10b981"]
  },
  humanities: {
    bg1: "#450a0a", bg2: "#701a75", bg3: "#881337", accent: "#f472b6", text: "#fdf2f8", tag: "HUMANITIES & LETTERS",
    shapes: ["#9f1239", "#be185d", "#d97706"]
  },
  health: {
    bg1: "#022c22", bg2: "#065f46", bg3: "#0d9488", accent: "#2dd4bf", text: "#f0fdf4", tag: "HEALTH & WELLNESS",
    shapes: ["#059669", "#0d9488", "#38bdf8"]
  },
  general: {
    bg1: "#18181b", bg2: "#27272a", bg3: "#3f3f46", accent: "#38bdf8", text: "#ffffff", tag: "ACADEMIC STUDY",
    shapes: ["#3b82f6", "#6366f1", "#8b5cf6"]
  },
  // User-selected mood presets
  ocean: {
    bg1: "#082f49", bg2: "#0369a1", bg3: "#0d9488", accent: "#38bdf8", text: "#e0f2fe", tag: "OCEAN BREEZE",
    shapes: ["#0284c7", "#06b6d4", "#10b981"]
  },
  sunset: {
    bg1: "#4c0519", bg2: "#9f1239", bg3: "#ea580c", accent: "#fb923c", text: "#fff1f2", tag: "SUNSET GLOW",
    shapes: ["#e11d48", "#f97316", "#fbbf24"]
  },
  emerald: {
    bg1: "#022c22", bg2: "#065f46", bg3: "#059669", accent: "#34d399", text: "#ecfdf5", tag: "EMERALD MESH",
    shapes: ["#047857", "#10b981", "#6ee7b7"]
  },
  cyber: {
    bg1: "#030712", bg2: "#1e1b4b", bg3: "#581c87", accent: "#a855f7", text: "#f3e8ff", tag: "CYBER NEON",
    shapes: ["#6366f1", "#a855f7", "#ec4899"]
  },
  slate: {
    bg1: "#09090b", bg2: "#18181b", bg3: "#27272a", accent: "#a1a1aa", text: "#f4f4f5", tag: "MINIMALIST SLATE",
    shapes: ["#3f3f46", "#52525b", "#71717a"]
  }
};

/**
 * Smart wrap course titles into 1 to 3 balanced lines that fit safely in SVG canvas
 * @param {string} text
 * @param {number} maxCharsPerLine
 * @returns {string[]}
 */
export function wrapTitleLines(text, maxCharsPerLine = 20) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["COURSE"];

  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if ((currentLine + " " + word).length <= maxCharsPerLine) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= 3) break;
    }
  }
  if (currentLine && lines.length < 3) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Generate a complete, high-resolution SVG course banner data URI based on course title
 * @param {Object} options
 * @param {string} options.title - Course title
 * @param {string} options.code - Course code
 * @param {string} [options.style] - 'modern' | 'gradient' | 'blueprint' | 'editorial'
 * @param {string} [options.palette] - 'auto' | 'ocean' | 'sunset' | 'emerald' | 'cyber' | 'slate'
 * @param {number} [options.seed] - Seed for pseudorandom variation
 * @returns {string} Data URI (data:image/svg+xml;charset=utf-8,...)
 */
export function generateCourseCover(options = {}) {
  const title = (options.title || "Course").trim();
  const code = (options.code || "").trim();
  const style = options.style || "modern";
  const paletteChoice = options.palette || "auto";
  const seed = typeof options.seed === "number" ? Math.abs(options.seed) : 42;

  // Determine palette
  let palKey = paletteChoice;
  if (!palKey || palKey === "auto") {
    palKey = detectSubject(title + " " + code);
  }
  const pal = PALETTES[palKey] || PALETTES.general;

  const displayCode = code ? (code.length > 14 ? code.substring(0, 12).toUpperCase() : code.toUpperCase()) : pal.tag;

  // Pseudo-random values based on seed
  const r1 = (seed * 9301 + 49297) % 233280 / 233280;
  const r2 = (seed * 49297 + 9301) % 233280 / 233280;
  const r3 = (seed * 12345 + 67890) % 233280 / 233280;

  let defs = `
    <linearGradient id="mainBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${pal.bg1}"/>
      <stop offset="55%" stop-color="${pal.bg2}"/>
      <stop offset="100%" stop-color="${pal.bg3}"/>
    </linearGradient>
    <linearGradient id="shade" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </linearGradient>
  `;

  let artwork = "";

  if (style === "gradient") {
    // Atmospheric, glowing blurred mesh circles (Canvas 700 x 350)
    const cx1 = 160 + Math.round(r1 * 160);
    const cy1 = 80 + Math.round(r2 * 60);
    const cx2 = 480 + Math.round(r2 * 140);
    const cy2 = 140 + Math.round(r3 * 80);

    defs += `
      <filter id="meshBlur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="55"/>
      </filter>
    `;

    artwork = `
      <rect width="700" height="350" fill="url(#mainBg)"/>
      <circle cx="${cx1}" cy="${cy1}" r="150" fill="${pal.shapes[0]}" filter="url(#meshBlur)" opacity="0.6"/>
      <circle cx="${cx2}" cy="${cy2}" r="140" fill="${pal.shapes[1] || pal.accent}" filter="url(#meshBlur)" opacity="0.55"/>
      <circle cx="360" cy="230" r="130" fill="${pal.shapes[2] || pal.bg3}" filter="url(#meshBlur)" opacity="0.5"/>
      <rect width="700" height="350" fill="url(#shade)"/>
    `;
  } else if (style === "blueprint") {
    // Technical CAD / blueprint drafting grid with lines and marks
    defs += `
      <pattern id="bpGrid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      </pattern>
    `;

    const circleR = 80 + Math.round(r1 * 35);
    const lineY = 175 + Math.round(r2 * 35);

    artwork = `
      <rect width="700" height="350" fill="url(#mainBg)"/>
      <rect width="700" height="350" fill="url(#bpGrid)"/>
      <circle cx="540" cy="175" r="${circleR}" fill="none" stroke="${pal.accent}" stroke-width="1.5" opacity="0.3"/>
      <circle cx="540" cy="175" r="${circleR + 30}" fill="none" stroke="${pal.accent}" stroke-width="1" stroke-dasharray="4,6" opacity="0.2"/>
      <line x1="40" y1="${lineY}" x2="660" y2="${lineY}" stroke="rgba(255,255,255,0.12)" stroke-dasharray="8,8"/>
      <line x1="180" y1="40" x2="180" y2="310" stroke="rgba(255,255,255,0.08)"/>
      <rect x="50" y="45" width="10" height="10" fill="none" stroke="${pal.accent}" opacity="0.4"/>
      <rect x="640" y="45" width="10" height="10" fill="none" stroke="${pal.accent}" opacity="0.4"/>
      <rect width="700" height="350" fill="url(#shade)"/>
    `;
  } else if (style === "editorial") {
    // Minimalist Swiss editorial with clean dividers and giant typographic monogram
    const monogram = (code || title || "A").substring(0, 2).toUpperCase();

    artwork = `
      <rect width="700" height="350" fill="url(#mainBg)"/>
      <text x="560" y="260" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="200" fill="white" opacity="0.06" text-anchor="middle">${xmlEsc(monogram)}</text>
      <line x1="50" y1="45" x2="650" y2="45" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
      <line x1="50" y1="305" x2="650" y2="305" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
      <circle cx="50" cy="45" r="4" fill="${pal.accent}"/>
      <circle cx="650" cy="45" r="4" fill="${pal.accent}"/>
      <circle cx="50" cy="305" r="4" fill="${pal.accent}"/>
      <circle cx="650" cy="305" r="4" fill="${pal.accent}"/>
      <rect width="700" height="350" fill="url(#shade)"/>
    `;
  } else {
    // Default: Modern Vector with dynamic curves, badges and geometry
    const polyX = 460 + Math.round(r1 * 70);
    const polyY = 170 + Math.round(r2 * 35);

    defs += `
      <pattern id="dotMatrix" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.08)"/>
      </pattern>
    `;

    artwork = `
      <rect width="700" height="350" fill="url(#mainBg)"/>
      <rect width="700" height="350" fill="url(#dotMatrix)"/>
      <circle cx="580" cy="70" r="115" fill="${pal.accent}" opacity="0.15"/>
      <polygon points="${polyX},${polyY - 90} ${polyX + 130},${polyY + 90} ${polyX - 90},${polyY + 90}" fill="${pal.shapes[0]}" opacity="0.25"/>
      <path d="M 0 250 Q 180 190 360 240 T 700 210 L 700 350 L 0 350 Z" fill="rgba(0,0,0,0.3)"/>
      <path d="M 0 280 Q 220 240 440 280 T 700 270 L 700 350 L 0 350 Z" fill="rgba(0,0,0,0.35)"/>
      <circle cx="100" cy="315" r="5" fill="${pal.accent}" opacity="0.7"/>
      <circle cx="120" cy="315" r="3.5" fill="rgba(255,255,255,0.4)"/>
      <circle cx="135" cy="315" r="2" fill="rgba(255,255,255,0.3)"/>
      <rect width="700" height="350" fill="url(#shade)"/>
    `;
  }

  // Multi-line Title Word Wrapping with Adaptive Font Size
  const titleLines = wrapTitleLines(title, 20);
  const lineCount = titleLines.length;

  let titleFontSize = 26;
  let lineHeight = 32;
  let startY = 145;

  if (lineCount === 2) {
    titleFontSize = 22;
    lineHeight = 28;
    startY = 130;
  } else if (lineCount >= 3) {
    titleFontSize = 18;
    lineHeight = 24;
    startY = 120;
  }

  const pillWidth = Math.min(Math.max(xmlEsc(displayCode).length * 8.5 + 22, 60), 190);
  const subY = startY + (lineCount * lineHeight) + 14;

  let titleXml = "";
  titleLines.forEach((lineText, idx) => {
    const yPos = startY + idx * lineHeight;
    titleXml += `
      <text x="66" y="${yPos + 2}" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="${titleFontSize}" letter-spacing="1" fill="#000000" fill-opacity="0.6">
        ${xmlEsc(lineText.toUpperCase())}
      </text>
      <text x="65" y="${yPos}" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="${titleFontSize}" letter-spacing="1" fill="#ffffff">
        ${xmlEsc(lineText.toUpperCase())}
      </text>
    `;
  });

  const textLayer = `
    <!-- Top Meta Tag / Course Code -->
    <rect x="65" y="60" width="${pillWidth}" height="24" rx="6" fill="#000000" fill-opacity="0.45" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
    <text x="76" y="76" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="11" letter-spacing="1.5" fill="${pal.accent}">
      ${xmlEsc(displayCode)}
    </text>

    <!-- Main Course Title Lines -->
    ${titleXml}

    <!-- Subject Discipline Subtitle -->
    <text x="66" y="${subY + 1}" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" letter-spacing="2.5" fill="#000000" fill-opacity="0.6">
      ${xmlEsc(pal.tag)}
    </text>
    <text x="65" y="${subY}" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" letter-spacing="2.5" fill="${pal.text}">
      ${xmlEsc(pal.tag)}
    </text>
  `;

  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 350" width="100%" height="100%">
    <defs>${defs}</defs>
    ${artwork}
    ${textLayer}
  </svg>`;

  return svgUri(fullSvg);
}

/**
 * Returns a suitable background style (URL or generated SVG) for a course
 * @param {Object} course - Course object from Store
 * @returns {string} CSS background property value
 */
export function getCourseBanner(course) {
  if (!course) {
    return generateCourseCover({ title: "Course", code: "ACAD", seed: 1 });
  }

  // 1. Direct custom image URL or uploaded data URL
  if (course.image) {
    if (
      course.image.startsWith("data:") ||
      course.image.startsWith("http://") ||
      course.image.startsWith("https://") ||
      course.image.startsWith("/")
    ) {
      return course.image;
    }
  }

  // 2. Deterministic generator fallback based on course title, code, and ID
  const hash = String(course.id || course.code || course.title || "course")
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return generateCourseCover({
    title: course.title || "Course",
    code: course.code || "",
    seed: hash,
  });
}
