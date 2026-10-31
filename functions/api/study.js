// Cloudflare Pages Function: POST /api/study
// Turns notes into study material with Claude and streams Anthropic's SSE body
// straight back to the browser. The system prompt and JSON schema live here, so
// the endpoint only ever accepts notes and a mode, never an arbitrary prompt.
//
// Environment:
//   ANTHROPIC_API_KEY  (secret, required)  the key used for every request
//   ANTHROPIC_MODEL    (optional)          defaults to claude-haiku-5-5
//   RATE_KV            (optional KV)       enables the 40-per-day limit per IP

export const API_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_MODEL = "claude-haiku-5-5";
export const MAX_NOTES = 30000;
export const MAX_TOKENS = 4096;
export const MODES = ["summary", "terms", "quiz", "cards", "all"];
export const PER_MINUTE = 6;
export const PER_DAY = 40;

/* ------------------------------------------------------------ prompt */
// Keep in sync with /prompt.js (used when a visitor brings their own key).
// The Node test suite checks the two produce identical text.

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

/* ------------------------------------------------------------ origin + responses */

export function isAllowedOrigin(origin, requestUrl) {
  let u;
  try { u = new URL(origin); } catch { return false; }
  const host = u.hostname;
  if (u.protocol === "https:" && (host === "lz-study-buddy.pages.dev" || host.endsWith(".lz-study-buddy.pages.dev"))) return true;
  if (u.protocol === "https:" && host === "lazarzec18.github.io") return true;
  if ((u.protocol === "http:" || u.protocol === "https:") && (host === "localhost" || host === "127.0.0.1" || host === "[::1]")) return true;
  try { if (requestUrl && new URL(requestUrl).origin === u.origin) return true; } catch { /* ignore */ }
  return false;
}

function corsHeaders(origin) {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

/* ------------------------------------------------------------ rate limits */

const minuteHits = new Map(); // ip -> [timestamps]

export function _resetRateLimit() { minuteHits.clear(); }

function checkMinute(ip, now) {
  const recent = (minuteHits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= PER_MINUTE) {
    minuteHits.set(ip, recent);
    return Math.max(1, Math.ceil((60000 - (now - recent[0])) / 1000));
  }
  recent.push(now);
  minuteHits.set(ip, recent);
  if (minuteHits.size > 5000) {
    for (const [k, v] of minuteHits) if (!v.length || now - v[v.length - 1] > 60000) minuteHits.delete(k);
  }
  return 0;
}

async function checkDay(kv, ip, now) {
  if (!kv) return 0;
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `day:${day}:${ip}`;
  let count = 0;
  try { count = parseInt((await kv.get(key)) || "0", 10) || 0; } catch { return 0; }
  if (count >= PER_DAY) {
    const midnight = Date.parse(day + "T00:00:00Z") + 86400000;
    return Math.max(60, Math.ceil((midnight - now) / 1000));
  }
  try { await kv.put(key, String(count + 1), { expirationTtl: 60 * 60 * 26 }); } catch { /* KV hiccup: don't block */ }
  return 0;
}

/* ------------------------------------------------------------ handler */

export async function onRequest(context) {
  const { request, env = {} } = context;
  const origin = request.headers.get("Origin") || "";
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return json(403, { error: "origin_not_allowed", message: "This site isn't allowed to use the Study Buddy API." }, { Vary: "Origin" });
  }
  const cors = corsHeaders(origin);
  const configured = Boolean(env.ANTHROPIC_API_KEY);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method === "GET" || request.method === "HEAD") {
    return json(200, { ok: true, configured, maxNotes: MAX_NOTES, modes: MODES }, cors);
  }
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { ...cors, Allow: "GET, POST, OPTIONS" });
  if (!configured) return json(503, { error: "not_configured", message: "The hosted AI isn't set up yet." }, cors);

  let raw;
  try { raw = await request.text(); } catch { raw = ""; }
  if (raw.length > MAX_NOTES * 4 + 2000) {
    return json(413, { error: "too_large", message: `Notes can be up to ${MAX_NOTES.toLocaleString("en-AU")} characters.`, limit: MAX_NOTES }, cors);
  }
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "bad_json", message: "Send a JSON body like {\"notes\": \"...\", \"mode\": \"all\"}." }, cors); }
  const notes = typeof body?.notes === "string" ? body.notes : "";
  const mode = typeof body?.mode === "string" ? body.mode : "all";
  if (!MODES.includes(mode)) return json(400, { error: "bad_mode", message: `mode must be one of ${MODES.join(", ")}.` }, cors);
  if (!notes.trim()) return json(400, { error: "empty_notes", message: "Add some notes first." }, cors);
  if (notes.length > MAX_NOTES) {
    return json(400, { error: "too_long", message: `Notes can be up to ${MAX_NOTES.toLocaleString("en-AU")} characters. These are ${notes.length.toLocaleString("en-AU")}.`, limit: MAX_NOTES, length: notes.length }, cors);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const waitMin = checkMinute(ip, now);
  if (waitMin) {
    return json(429, { error: "rate_limited", scope: "minute", retryAfter: waitMin, message: `That's ${PER_MINUTE} sets in a minute. Try again in ${waitMin} seconds.` }, { ...cors, "Retry-After": String(waitMin) });
  }
  const waitDay = await checkDay(env.RATE_KV, ip, now);
  if (waitDay) {
    return json(429, { error: "rate_limited", scope: "day", retryAfter: waitDay, message: `That's today's limit of ${PER_DAY} sets. It resets at midnight UTC, or add your own key in Settings.` }, { ...cors, "Retry-After": String(waitDay) });
  }

  let upstream;
  try {
    upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: buildSystem(mode, body.questions),
        messages: [{ role: "user", content: userMessage(notes, body.title, body.retry === true) }],
      }),
    });
  } catch {
    return json(502, { error: "upstream_unreachable", message: "Couldn't reach the AI service. Try again in a moment." }, cors);
  }

  if (!upstream.ok) {
    let detail = "";
    try { detail = (await upstream.json())?.error?.message || ""; } catch { /* not JSON */ }
    const s = upstream.status;
    if (s === 429 || s === 529 || s >= 500) {
      return json(503, { error: "upstream_busy", message: "The AI service is busy right now. Try again in a few seconds." }, { ...cors, "Retry-After": "10" });
    }
    if (s === 401 || s === 403) {
      return json(502, { error: "upstream_auth", message: "The hosted AI key was rejected. Add your own key in Settings for now." }, cors);
    }
    return json(502, { error: "upstream_rejected", message: detail ? `The AI service said: ${detail.slice(0, 300)}` : "The AI service couldn't accept this request." }, cors);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
