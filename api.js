// AI transport for Study Buddy. Three routes, picked in this order:
//   1. "hosted": the site's own /api/study function (a Cloudflare Pages Function that
//      holds the API key server-side). On the GitHub Pages mirror it calls the
//      Cloudflare deployment cross-origin.
//   2. "key": the visitor's own Anthropic key, stored only in this browser and sent
//      only to api.anthropic.com.
//   3. "demo": no AI; the example set stays fully interactive.
import { buildSystem, userMessage } from "./prompt.js";

const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const HOSTED_ORIGIN = "https://lz-study-buddy.pages.dev";

export const MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fast)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (more thorough)" },
];
export const DEFAULT_MODEL = MODELS[0].id;

export function getKey() { return (window.ZL && ZL.store.get("apiKey", "")) || ""; }
export function setKey(k) { return ZL.store.set("apiKey", String(k || "").trim()); }
export function forgetKey() { ZL.store.del("apiKey"); }
export function getModel() { const m = ZL.store.get("model", DEFAULT_MODEL); return MODELS.some((x) => x.id === m) ? m : DEFAULT_MODEL; }
export function setModel(id) { ZL.store.set("model", id); }
export function looksLikeKey(key) { return /^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(String(key || "").trim()); }

/** Where the hosted API lives for this page, or null when there isn't one. */
export function hostedEndpoint(loc = location) {
  if (loc.protocol === "file:") return null;
  if (/\.github\.io$/.test(loc.hostname)) return `${HOSTED_ORIGIN}/api/study`;
  return "/api/study";
}

export class ApiError extends Error {
  constructor(kind, title, hint, extra = {}) {
    super(title);
    this.kind = kind;   // auth | rate | busy | network | bad-request | server | aborted | not-configured | too-long | parse
    this.title = title;
    this.hint = hint;
    Object.assign(this, extra);
  }
}

/** Ask the hosted API whether it has a key. Never throws. */
export async function checkHosted({ timeout = 5000 } = {}) {
  const url = hostedEndpoint();
  if (!url) return { configured: false, reachable: false };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { configured: false, reachable: false };
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return { configured: false, reachable: false };
    const j = await res.json();
    return { configured: Boolean(j && j.ok && j.configured), reachable: true };
  } catch {
    return { configured: false, reachable: false };
  } finally {
    clearTimeout(t);
  }
}

function hostedError(status, body) {
  const code = body && body.error;
  const msg = (body && body.message) || "";
  if (code === "not_configured") return new ApiError("not-configured", "The hosted AI isn't set up on this site yet.", "Add your own Anthropic key in Settings, or explore the example set.");
  if (code === "rate_limited") {
    return new ApiError("rate", body.scope === "day" ? "You've reached today's limit on the free AI." : "That's a lot of sets in one minute.",
      body.scope === "day" ? "It resets at midnight UTC. You can keep going now with your own key in Settings." : `Try again in ${body.retryAfter || 60} seconds.`,
      { retryAfter: body.retryAfter, scope: body.scope });
  }
  if (code === "too_long" || code === "too_large") return new ApiError("too-long", "Those notes are too long.", msg || "Trim them to 30,000 characters or fewer.");
  if (code === "upstream_busy") return new ApiError("busy", "The AI is busy right now.", "Try again in a few seconds.");
  if (code === "upstream_auth") return new ApiError("server", "The hosted AI couldn't sign in.", "Add your own key in Settings for now.");
  if (code === "origin_not_allowed") return new ApiError("server", "This copy of the site can't use the hosted AI.", "Open lz-study-buddy.pages.dev, or add your own key in Settings.");
  if (status === 400) return new ApiError("bad-request", "The request wasn't accepted.", msg || "Check your notes and try again.");
  return new ApiError("server", `The AI service returned an error${status ? ` (${status})` : ""}.`, msg || "Try again in a moment.");
}

function anthropicError(status, type, detail) {
  if (status === 401 || type === "authentication_error") return new ApiError("auth", "Your API key was rejected.", "Open Settings and paste a valid key from console.anthropic.com. Keys start with sk-ant-.");
  if (status === 403 || type === "permission_error") return new ApiError("auth", "This key can't use that model.", "Check the key's permissions in the Anthropic Console, or pick the other model in Settings.");
  if (status === 429 || type === "rate_limit_error") return new ApiError("rate", "Your key hit its rate limit.", "Wait a minute and try again.");
  if (status === 529 || type === "overloaded_error") return new ApiError("busy", "Anthropic's servers are busy.", "Try again in a few seconds.");
  if (/credit balance/i.test(detail || "")) return new ApiError("bad-request", "Your Anthropic account is out of credit.", "Add credit in the Anthropic Console, then try again.");
  if (status === 400 || type === "invalid_request_error") return new ApiError("bad-request", "The API couldn't accept this request.", detail ? `It said: "${detail}"` : "Try shorter notes.");
  return new ApiError("server", `The API returned an error${status ? ` (${status})` : ""}.`, "Try again in a moment. If it keeps happening, check status.anthropic.com.");
}

/** Read an Anthropic SSE stream. Calls onText(fullTextSoFar). Resolves { text, stopReason }. */
export async function readSse(res, onText) {
  if (!res.body) throw new ApiError("server", "The reply had no body.", "Try again.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "", stopReason = "";
  const handle = (raw) => {
    let data = "";
    for (const line of raw.split(/\r?\n/)) if (line.startsWith("data:")) data += line.slice(5).trimStart();
    if (!data || data === "[DONE]") return;
    let evt;
    try { evt = JSON.parse(data); } catch { return; }
    if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
      full += evt.delta.text;
      if (onText) onText(full);
    } else if (evt.type === "message_delta" && evt.delta && evt.delta.stop_reason) {
      stopReason = evt.delta.stop_reason;
    } else if (evt.type === "error") {
      throw anthropicError(0, evt.error && evt.error.type, evt.error && evt.error.message);
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, "");
        handle(raw);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handle(buffer);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err && err.name === "AbortError") throw new ApiError("aborted", "Stopped.", "Nothing was saved.");
    throw new ApiError("network", "The connection dropped while the set was being written.", "Check your connection and try again.");
  }
  return { text: full, stopReason };
}

/**
 * Generate study material. route is "hosted" or "key".
 * Resolves { text, stopReason }. Rejects with ApiError.
 */
export async function requestStudy({ route, notes, mode = "all", title = "", questions = 8, retry = false, signal, onText }) {
  let res;
  try {
    if (route === "hosted") {
      res = await fetch(hostedEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, mode, title, questions, retry }),
        signal,
      });
    } else {
      const apiKey = getKey();
      if (!apiKey) throw new ApiError("no-key", "No API key saved.", "Add your Anthropic key in Settings.");
      res = await fetch(ANTHROPIC, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: getModel(),
          max_tokens: 4096,
          stream: true,
          system: buildSystem(mode, questions),
          messages: [{ role: "user", content: userMessage(notes, title, retry) }],
        }),
        signal,
      });
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err && err.name === "AbortError") throw new ApiError("aborted", "Stopped.", "Nothing was saved.");
    throw new ApiError("network", "Couldn't reach the AI.", route === "hosted" ? "Check your internet connection and try again." : "Check your connection. Some school or work networks block api.anthropic.com.");
  }
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (route === "hosted") throw hostedError(res.status, body);
    throw anthropicError(res.status, body && body.error && body.error.type, body && body.error && body.error.message);
  }
  return readSse(res, onText);
}
