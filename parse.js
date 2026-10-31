// Robust parsing for the model's JSON study set.
// Models sometimes wrap JSON in ```json fences, add a sentence before it,
// leave trailing commas, or forget to escape the backslashes in LaTeX
// ("\frac" inside a JSON string is a form feed followed by "rac").
// parseStudy() copes with all of these, then validates and tidies the shape.

const LATEX_BFNRT = new Set([
  "beta", "bar", "binom", "bf", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "boldsymbol", "bmatrix", "begin", "bullet", "bot", "backslash", "bmod",
  "frac", "forall", "flat", "frown", "fbox",
  "nabla", "neq", "ne", "nu", "newline", "not", "ni", "notin", "nmid", "neg", "nearrow", "nleq", "ngeq",
  "rho", "right", "rangle", "rm", "rceil", "rfloor", "rightarrow", "Rightarrow", "rbrace", "rvert", "Re",
  "times", "theta", "Theta", "tau", "text", "textbf", "textit", "textrm", "to", "top", "tan", "tanh", "tfrac", "therefore", "triangle", "tilde", "tag", "tbinom",
]);

/** Pull the JSON object out of a reply: strip ``` fences and any text around it. */
export function extractJsonText(text) {
  let t = String(text || "").trim();
  const fence = t.match(/```(?:json|JSON|javascript)?\s*\n?([\s\S]*?)(?:```|$)/);
  if (fence && fence[1].includes("{")) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1) return "";
  return end > start ? t.slice(start, end + 1) : t.slice(start);
}

/**
 * Fix common JSON mistakes without touching valid JSON:
 * - single backslashes before LaTeX commands are doubled
 * - raw newlines / tabs inside strings are escaped
 * - trailing commas before } or ] are removed
 */
export function repairJson(src) {
  let out = "";
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (!inStr) {
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === ",") {
        const rest = src.slice(i + 1).match(/^\s*([}\]])/);
        if (rest) continue; // drop trailing comma
      }
      out += c;
      continue;
    }
    // inside a string
    if (c === '"') { inStr = false; out += c; continue; }
    if (c === "\n") { out += "\\n"; continue; }
    if (c === "\r") { continue; }
    if (c === "\t") { out += "\\t"; continue; }
    if (c !== "\\") { out += c; continue; }

    const n = src[i + 1];
    if (n === undefined) { out += "\\\\"; continue; }
    if (n === "\\" || n === '"' || n === "/") { out += c + n; i++; continue; }
    if (n === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) { out += c + n; i++; continue; }
    if ("bfnrt".includes(n)) {
      const word = (src.slice(i + 1).match(/^[A-Za-z]+/) || [""])[0];
      if (LATEX_BFNRT.has(word)) { out += "\\\\"; continue; } // LaTeX: escape the backslash
      out += c + n; i++; continue;                           // a real \n, \t, ...
    }
    // Any other character after a backslash is invalid JSON, so it must be LaTeX
    // (\Omega, \sum, \alpha, \(, \[, \, ...). Escape the backslash.
    out += "\\\\";
  }
  return out;
}


const str = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const arr = (v) => (Array.isArray(v) ? v : []);

/** Work out which option is correct when the model gives an index, a letter or the text. */
export function answerIndex(raw, options) {
  if (typeof raw === "number" && Number.isInteger(raw)) {
    if (raw >= 0 && raw < options.length) return raw;
    if (raw === options.length) return raw - 1; // 1-based slip on the last option
    return -1;
  }
  const s = str(raw);
  if (/^\d+$/.test(s)) return answerIndex(Number(s), options);
  if (/^[A-Fa-f]$/.test(s)) {
    const k = s.toUpperCase().charCodeAt(0) - 65;
    return k < options.length ? k : -1;
  }
  return options.findIndex((o) => o.toLowerCase() === s.toLowerCase());
}

/** Accept the structured summary, or fall back to Markdown text with bullets and headings. */
function normSummary(s) {
  if (typeof s === "string") {
    const sections = [];
    let overview = "";
    let cur = null;
    for (const raw of s.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.match(/^#{1,6}\s+(.*)$/) || line.match(/^\*\*([^*]+)\*\*:?$/);
      const b = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (h) { cur = { heading: h[1].replace(/:$/, ""), points: [] }; sections.push(cur); }
      else if (b) { if (!cur) { cur = { heading: "Key points", points: [] }; sections.push(cur); } cur.points.push(b[1]); }
      else if (!sections.length) overview += (overview ? " " : "") + line;
      else if (cur) cur.points.push(line);
    }
    return { overview, sections: sections.filter((x) => x.points.length) };
  }
  if (!s || typeof s !== "object") return { overview: "", sections: [] };
  const sections = arr(s.sections ?? s.headings ?? s.parts)
    .map((x) => ({
      heading: str(x && (x.heading ?? x.title ?? x.name)),
      points: arr(x && (x.points ?? x.bullets ?? x.items)).map((p) => str(typeof p === "object" && p ? p.text : p)).filter(Boolean),
    }))
    .filter((x) => x.heading && x.points.length);
  return { overview: str(s.overview ?? s.intro ?? s.text), sections };
}

function normTerms(v) {
  return arr(v)
    .map((t) => ({ term: str(t && (t.term ?? t.name)), definition: str(t && (t.definition ?? t.meaning)) }))
    .filter((t) => t.term && t.definition);
}

function normQuiz(v) {
  return arr(v)
    .map((q) => {
      if (!q || typeof q !== "object") return null;
      const options = arr(q.options ?? q.choices)
        .map((o) => str(typeof o === "object" && o ? o.text : o).replace(/^[A-F][).:]\s+/, ""))
        .filter(Boolean);
      const answer = answerIndex(q.answer ?? q.answer_index ?? q.correct ?? q.correct_index, options);
      const question = str(q.question ?? q.prompt);
      if (!question || options.length < 2 || options.length > 6 || answer < 0) return null;
      return { question, options, answer, explanation: str(q.explanation) };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function normCards(v) {
  return arr(v)
    .map((f) => ({ front: str(f && (f.front ?? f.question)), back: str(f && (f.back ?? f.answer)) }))
    .filter((f) => f.front && f.back);
}

const NEEDS = {
  summary: ["summary"],
  terms: ["terms"],
  quiz: ["quiz"],
  cards: ["cards"],
  all: ["summary", "quiz", "cards"],
};

/** Check and tidy a parsed object for a mode. Throws an Error with a plain reason if it's unusable. */
export function normaliseStudy(obj, mode = "all") {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("The reply wasn't a JSON object.");
  const out = {
    title: str(obj.title).replace(/^["']|["']$/g, "").slice(0, 80),
    summary: normSummary(obj.summary),
    terms: normTerms(obj.terms ?? obj.key_terms),
    quiz: normQuiz(obj.quiz ?? obj.questions),
    cards: normCards(obj.flashcards ?? obj.cards),
  };
  for (const need of NEEDS[mode] || NEEDS.all) {
    if (need === "summary" && !out.summary.sections.length && !out.summary.overview) throw new Error("The reply had no usable summary.");
    if (need === "terms" && !out.terms.length) throw new Error("The reply had no usable key terms.");
    if (need === "quiz" && !out.quiz.length) throw new Error("The reply had no usable quiz questions.");
    if (need === "cards" && !out.cards.length) throw new Error("The reply had no usable flashcards.");
  }
  return out;
}

/** Parse a model reply into { title, summary, terms, quiz, cards }. Throws Error on failure. */
export function parseStudy(text, mode = "all") {
  const raw = extractJsonText(text);
  if (!raw) throw new Error("The reply didn't contain any JSON.");
  let obj;
  try {
    obj = JSON.parse(repairJson(raw));
  } catch (e1) {
    try { obj = JSON.parse(raw); } catch {
      throw new Error(`The JSON couldn't be read (${e1.message}).`);
    }
  }
  return normaliseStudy(obj, mode);
}

/** Which part of the set the stream has reached, for the progress UI. */
export function streamProgress(text) {
  const order = [["summary", '"summary"'], ["terms", '"terms"'], ["quiz", '"quiz"'], ["cards", '"flashcards"']];
  let stage = "reading";
  let at = -1;
  for (const [name, key] of order) {
    const i = text.indexOf(key);
    if (i > at) { stage = name; at = i; }
  }
  const count = (re) => (text.match(re) || []).length;
  return { stage, questions: count(/"question"\s*:/g), cards: count(/"front"\s*:/g), terms: count(/"term"\s*:/g) };
}
