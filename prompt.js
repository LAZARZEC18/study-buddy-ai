// The study prompt, used in the browser when a visitor brings their own Anthropic key.
// The hosted API builds the same prompt server-side in functions/api/study.js; the Node
// tests check both produce identical text, so keep them in sync.

export const MAX_NOTES = 30000;
export const MODES = ["summary", "terms", "quiz", "cards", "all"];

const SCHEMA_PARTS = {
  title: { type: "string", description: "Short topic title, at most 8 words, sentence case" },
  summary: {
    type: "object",
    required: ["overview", "sections"],
    additionalProperties: false,
    properties: {
      overview: { type: "string", description: "One or two sentences on what the notes cover" },
      sections: {
        type: "array", minItems: 2, maxItems: 6,
        items: {
          type: "object", required: ["heading", "points"], additionalProperties: false,
          properties: {
            heading: { type: "string", description: "Two to five words" },
            points: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
          },
        },
      },
    },
  },
  terms: {
    type: "array", minItems: 4, maxItems: 14,
    items: {
      type: "object", required: ["term", "definition"], additionalProperties: false,
      properties: { term: { type: "string" }, definition: { type: "string", description: "One or two sentences" } },
    },
  },
  quiz: (n) => ({
    type: "array", minItems: n, maxItems: n,
    items: {
      type: "object", required: ["question", "options", "answer", "explanation"], additionalProperties: false,
      properties: {
        question: { type: "string" },
        options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" }, description: "Four options without letter prefixes" },
        answer: { type: "integer", minimum: 0, maximum: 3, description: "0-based index of the correct option" },
        explanation: { type: "string", description: "One to three sentences on why the answer is right, with working for calculations" },
      },
    },
  }),
  flashcards: {
    type: "array", minItems: 5, maxItems: 14,
    items: {
      type: "object", required: ["front", "back"], additionalProperties: false,
      properties: { front: { type: "string", description: "A question or prompt" }, back: { type: "string", description: "A short answer" } },
    },
  },
};

const MODE_KEYS = {
  summary: ["title", "summary"],
  terms: ["terms"],
  quiz: ["quiz"],
  cards: ["flashcards"],
  all: ["title", "summary", "terms", "quiz", "flashcards"],
};

export function clampQuestions(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(10, Math.max(5, v)) : 8;
}

export function buildSystem(mode, questions) {
  const keys = MODE_KEYS[mode] || MODE_KEYS.all;
  const n = clampQuestions(questions);
  const properties = {};
  for (const k of keys) properties[k] = k === "quiz" ? SCHEMA_PARTS.quiz(n) : SCHEMA_PARTS[k];
  const schema = { type: "object", required: keys, additionalProperties: false, properties };
  const rules = ["- Base everything on the notes only. Do not add outside facts. Keep the notes' notation and units."];
  if (keys.includes("summary")) rules.push("- Summary: a short overview, then 2 to 6 sections in the order the notes cover them. Each point is one sentence that starts with the key idea.");
  if (keys.includes("terms")) rules.push("- Key terms: the 6 to 14 most important terms or formulas, each with a one or two sentence definition.");
  if (keys.includes("quiz")) rules.push(`- Quiz: exactly ${n} multiple-choice questions with four options each. Mix recall, understanding and, where the notes allow, short calculations. Wrong options should be plausible mistakes. Vary the position of the correct option.`);
  if (keys.includes("flashcards")) rules.push("- Flashcards: 6 to 14 cards. The front asks one thing; the back answers it in a sentence or a formula.");
  rules.push(
    "- Write maths in LaTeX between single dollar signs, like $V = IR$. Inside JSON strings every backslash must be escaped, so write \"$\\\\frac{V}{R}$\" for \\frac{V}{R}.",
    "- Use Australian English and sentence case.",
  );
  return [
    "You help a university student revise. You turn their notes into study material and reply with strict JSON.",
    "",
    "Reply with ONE JSON object and nothing else: no code fences, no text before or after it.",
    "It must match this JSON schema, with the keys in this order:",
    JSON.stringify(schema),
    "",
    "Rules:",
    ...rules,
  ].join("\n");
}

export function userMessage(notes, title, retry) {
  const t = String(title || "").replace(/\s+/g, " ").trim().slice(0, 120);
  let msg = `Here are my notes${t ? ` on "${t}"` : ""}:\n<notes>\n${String(notes).trim()}\n</notes>`;
  if (retry) msg += "\n\nYour last reply could not be read as JSON. Reply with only the JSON object, keep every string short, and escape every backslash.";
  return msg;
}

