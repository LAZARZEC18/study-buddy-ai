// Study Buddy: page logic.
import { MAX_NOTES } from "./prompt.js";
import { parseStudy, streamProgress } from "./parse.js";
import { renderRich, esc } from "./render.js";
import * as srs from "./srs.js";
import { toAnki, toMarkdown, download, slug } from "./exporters.js";
import { readNotesFile, FileError } from "./files.js";
import { makeExample, EXAMPLE_ID, EXAMPLE_NOTES } from "./example.js";
import * as api from "./api.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n) => Number(n).toLocaleString("en-AU");
const plural = (n, one, many = one + "s") => `${fmt(n)} ${n === 1 ? one : many}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const rich = (t) => renderRich(t, false);
const MIN_NOTES = 80;

/* ============================================================ state + storage */

const state = {
  sets: [],
  activeId: null,
  tab: "summary",
  view: "set",            // set | empty | progress | error
  running: null,          // { controller, mode, setId }
  ai: { checking: true, hosted: false },
  quiz: null,             // live attempt for the active set (mirrors set.quizRun)
  cards: null,            // { mode, queue, pos, flipped, reviewed }
  termQuery: "",
  draft: { title: "", notes: "", file: null, questions: 8 },
};

function loadState() {
  const saved = ZL.store.get("sets", null);
  if (Array.isArray(saved)) state.sets = saved.filter((s) => s && s.id && Array.isArray(s.cards));
  else state.sets = [makeExample()];
  const firstVisit = !Array.isArray(saved);
  state.activeId = ZL.store.get("activeId", state.sets[0] ? state.sets[0].id : null);
  if (!state.sets.some((s) => s.id === state.activeId)) state.activeId = state.sets[0] ? state.sets[0].id : null;
  state.tab = ZL.store.get("tab", "summary");
  if (!["summary", "terms", "quiz", "cards"].includes(state.tab)) state.tab = "summary";
  const d = ZL.store.get("draft", null);
  if (d && typeof d === "object") state.draft = { ...state.draft, ...d };
  else if (firstVisit) state.draft = { ...state.draft, title: "Ohm's law and Kirchhoff's laws", notes: EXAMPLE_NOTES };
  if (![5, 8, 10].includes(state.draft.questions)) state.draft.questions = 8;
  if (firstVisit) saveSets(true);
}

let statusTimer = 0;
function saveSets(quiet = false) {
  const ok = ZL.store.set("sets", state.sets);
  ZL.store.set("activeId", state.activeId);
  if (!ok) {
    ZL.toast("This browser's storage is full, so changes weren't saved. Delete an old set to make room.", { type: "bad" });
  } else if (!quiet) {
    flashStatus("Saved");
  }
  return ok;
}

let draftTimer = 0;
function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => ZL.store.set("draft", state.draft), 300);
}

const activeSet = () => state.sets.find((s) => s.id === state.activeId) || null;

/* ============================================================ AI mode */

function route() {
  const key = api.getKey();
  if (state.ai.hosted && !(key && ZL.store.get("preferKey", false))) return "hosted";
  if (key) return "key";
  return "demo";
}

const MODE_COPY = {
  checking: { label: "Checking AI", title: "Checking", body: "Seeing whether the hosted AI is available." },
  hosted: { label: "AI ready", title: "AI ready", body: "Study Buddy's hosted AI is on, so you don't need a key. Fair use is 6 sets a minute and 40 a day." },
  key: { label: "Your key", title: "Using your key", body: "Sets are generated with your own Anthropic key, straight from this browser." },
  demo: { label: "Demo mode", title: "Demo mode", body: "No AI is available here. The example set works fully. Add your Anthropic key below to generate sets from your own notes." },
};

function renderMode() {
  const m = state.ai.checking ? "checking" : route();
  const c = MODE_COPY[m];
  $("#modeBtn").dataset.mode = m;
  $("#modeText").textContent = c.label;
  $("#modeBtn").setAttribute("aria-label", `${c.label}. Open AI settings`);
  $("#modeDot").dataset.mode = m;
  const card = $("#modeCard");
  card.dataset.mode = m;
  $("#modeCardTitle").textContent = c.title;
  $("#modeCardBody").textContent = c.body;
  const hint = $("#goHint");
  if (m === "checking") hint.textContent = "Checking whether the AI is available.";
  else if (m === "hosted") hint.textContent = "Your notes are sent to Anthropic's Claude to write the set. Press Ctrl or ⌘ + Enter from the notes box.";
  else if (m === "key") hint.textContent = "Uses your own Anthropic key from Settings. Press Ctrl or ⌘ + Enter from the notes box.";
  else hint.innerHTML = 'Demo mode: <button type="button" class="sb-link" data-action="settings">add your API key</button> to generate from your own notes, or explore the example set.';
  $("#preferRow").hidden = !(state.ai.hosted && api.getKey());
  $("#preferKey").checked = Boolean(ZL.store.get("preferKey", false));
  renderToolsVisibility();
}

async function initAi() {
  const r = await api.checkHosted();
  state.ai = { checking: false, hosted: r.configured };
  renderMode();
}

/* ============================================================ app bar status */

function dueTotal() {
  const day = srs.today();
  return state.sets.reduce((n, s) => n + srs.counts(s.cards, day).due, 0);
}

function renderStatus() {
  const el = $("#appStatus");
  if (state.running) { el.textContent = "Generating"; el.dataset.state = "busy"; return; }
  el.dataset.state = "";
  const due = dueTotal();
  el.textContent = state.sets.length ? `${plural(state.sets.length, "set")}, ${fmt(due)} due today` : "No sets yet";
}

function flashStatus(text) {
  const el = $("#appStatus");
  if (state.running) return;
  clearTimeout(statusTimer);
  el.textContent = text;
  el.dataset.state = "saved";
  statusTimer = setTimeout(renderStatus, 1400);
}

/* ============================================================ compose */

const el = {
  title: $("#titleInput"),
  notes: $("#notesInput"),
  count: $("#charCount"),
  notesHint: $("#notesHint"),
  notesError: $("#notesError"),
  notesErrorText: $("#notesErrorText"),
  trim: $("#trimBtn"),
  file: $("#fileInput"),
  drop: $("#dropZone"),
};

function renderCompose() {
  el.title.value = state.draft.title || "";
  el.notes.value = state.draft.notes || "";
  $$("#qSeg button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.q) === state.draft.questions)));
  renderCount();
  renderFileChip();
}

function renderCount() {
  const n = el.notes.value.length;
  el.count.textContent = `${fmt(n)} / ${fmt(MAX_NOTES)}`;
  el.count.dataset.state = n > MAX_NOTES ? "over" : n > MAX_NOTES * 0.9 ? "near" : "";
  if (n > MAX_NOTES) showNotesError(`That's ${fmt(n - MAX_NOTES)} characters over the limit. Split the notes into two sets, or trim them.`, true);
  else if (!el.notesError.dataset.sticky) hideNotesError();
}

function showNotesError(msg, offerTrim = false, sticky = false) {
  el.notesErrorText.textContent = msg;
  el.notesError.hidden = false;
  el.trim.hidden = !offerTrim;
  el.notes.setAttribute("aria-invalid", "true");
  if (sticky) el.notesError.dataset.sticky = "1";
}
function hideNotesError() {
  el.notesError.hidden = true;
  delete el.notesError.dataset.sticky;
  el.notes.removeAttribute("aria-invalid");
}

function renderFileChip() {
  const f = state.draft.file;
  $("#fileChip").hidden = !f;
  if (!f) return;
  $("#fileIcon").textContent = f.kind === "pdf" ? "PDF" : f.name.toLowerCase().endsWith(".md") ? "MD" : "TXT";
  $("#fileName").textContent = f.name;
  $("#fileMeta").textContent = f.kind === "pdf" ? `${plural(f.pages, "page")}, ${plural(f.chars, "character")}` : plural(f.chars, "character");
}

el.title.addEventListener("input", () => { state.draft.title = el.title.value; saveDraftSoon(); });
el.notes.addEventListener("input", () => {
  state.draft.notes = el.notes.value;
  delete el.notesError.dataset.sticky;
  renderCount();
  saveDraftSoon();
});
el.notes.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("#composeForm").requestSubmit(); }
});
el.trim.addEventListener("click", () => {
  const before = el.notes.value;
  el.notes.value = before.slice(0, MAX_NOTES);
  state.draft.notes = el.notes.value;
  saveDraftSoon();
  hideNotesError();
  renderCount();
  ZL.toast(`Trimmed to ${fmt(MAX_NOTES)} characters`, { action: { label: "Undo", fn: () => { el.notes.value = before; state.draft.notes = before; saveDraftSoon(); renderCount(); } } });
});
$("#qSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-q]");
  if (!b) return;
  state.draft.questions = Number(b.dataset.q);
  $$("#qSeg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  saveDraftSoon();
});

$("#fileBtn").addEventListener("click", () => el.file.click());
el.file.addEventListener("change", () => {
  const f = el.file.files && el.file.files[0];
  if (f) addFile(f);
  el.file.value = "";
});
$("#fileClear").addEventListener("click", () => { state.draft.file = null; renderFileChip(); saveDraftSoon(); $("#fileBtn").focus(); });

let dragDepth = 0;
el.drop.addEventListener("dragenter", (e) => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; el.drop.dataset.over = "1"; } });
el.drop.addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
el.drop.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) delete el.drop.dataset.over; });
el.drop.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  delete el.drop.dataset.over;
  const f = e.dataTransfer.files[0];
  if (f) addFile(f);
});
function hasFiles(e) { return e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files"); }

let fileBusy = false;
async function addFile(file) {
  if (fileBusy) return;
  fileBusy = true;
  const btn = $("#fileBtn");
  btn.disabled = true;
  el.notesHint.textContent = `Reading ${file.name}`;
  el.notesHint.dataset.state = "busy";
  hideNotesError();
  try {
    const res = await readNotesFile(file, (i, n) => { el.notesHint.textContent = `Reading page ${i} of ${n}`; });
    const before = el.notes.value;
    const replaced = !before.trim() || before.trim() === EXAMPLE_NOTES.trim();
    el.notes.value = replaced ? res.text : `${before.replace(/\s+$/, "")}\n\n${res.text}`;
    state.draft.notes = el.notes.value;
    const base = res.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (!el.title.value.trim() || replaced) { el.title.value = base.slice(0, 80); state.draft.title = el.title.value; }
    state.draft.file = { name: res.name, kind: res.kind, pages: res.pages || 0, chars: res.text.length };
    saveDraftSoon();
    renderCount();
    renderFileChip();
    const what = res.kind === "pdf" ? `${plural(res.pages, "page")}, ${plural(res.text.length, "character")}` : plural(res.text.length, "character");
    ZL.toast(replaced ? `Added ${what} from ${res.name}` : `Added ${what} to the end of your notes`, replaced ? {} : {
      action: { label: "Undo", fn: () => { el.notes.value = before; state.draft.notes = before; state.draft.file = null; saveDraftSoon(); renderCount(); renderFileChip(); } },
    });
  } catch (err) {
    const msg = err instanceof FileError ? err.message : "That file couldn't be read. Try another file, or paste the text in.";
    showNotesError(msg, false, true);
    ZL.toast("Couldn't read that file", { type: "bad" });
  } finally {
    fileBusy = false;
    btn.disabled = false;
    el.notesHint.textContent = "Or drop in a PDF, .txt or .md file.";
    delete el.notesHint.dataset.state;
  }
}

function validateNotes() {
  const t = el.notes.value;
  if (!t.trim()) { showNotesError("Add some notes first. Paste text, or add a PDF, .txt or .md file.", false, true); el.notes.focus(); return false; }
  if (t.trim().length < MIN_NOTES) { showNotesError(`That's a little short. Add at least ${MIN_NOTES} characters, about a paragraph, so there's enough to quiz you on.`, false, true); el.notes.focus(); return false; }
  if (t.length > MAX_NOTES) { showNotesError(`Notes can be up to ${fmt(MAX_NOTES)} characters. These are ${fmt(t.length)}.`, true, true); el.notes.focus(); return false; }
  hideNotesError();
  return true;
}

$("#newBtn").addEventListener("click", () => {
  const prev = { ...state.draft };
  const had = (state.draft.notes || "").trim() || (state.draft.title || "").trim();
  state.draft = { ...state.draft, title: "", notes: "", file: null };
  ZL.store.set("draft", state.draft);
  renderCompose();
  hideNotesError();
  $("#composeForm").scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  el.notes.focus({ preventScroll: true });
  if (had) {
    ZL.toast("Ready for new notes", { action: { label: "Undo", fn: () => { state.draft = prev; ZL.store.set("draft", prev); renderCompose(); } } });
  } else {
    ZL.toast("Ready for new notes", { type: "info" });
  }
});

/* ============================================================ study pane views */

function showView(view) {
  state.view = view;
  $("#studyEmpty").hidden = view !== "empty";
  $("#studyProgress").hidden = view !== "progress";
  $("#studyError").hidden = view !== "error";
  $("#studySet").hidden = view !== "set";
}

function showError(err, { retry, back } = {}) {
  showView("error");
  $("#errTitle").textContent = err.title || "Something went wrong.";
  $("#errHint").textContent = err.hint || "Try again in a moment.";
  const acts = $("#errActions");
  acts.innerHTML = "";
  const add = (label, cls, fn) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = `zl-btn ${cls}`; b.textContent = label; b.onclick = fn;
    acts.appendChild(b);
    return b;
  };
  let first;
  if (retry && err.kind !== "demo" && err.kind !== "too-long") first = add("Try again", "zl-btn-primary", retry);
  if (["demo", "not-configured", "auth", "rate", "no-key", "server"].includes(err.kind)) {
    const b = add(api.getKey() ? "Open settings" : "Add your key", first ? "zl-btn-secondary" : "zl-btn-primary", openSettings);
    first = first || b;
  }
  if (err.kind === "demo" && !state.sets.some((s) => s.id === EXAMPLE_ID)) add("Open the example", "zl-btn-secondary", openExample);
  if (back) add("Back to set", "zl-btn-ghost", back);
  else if (err.kind === "demo" && state.sets.some((s) => s.id === EXAMPLE_ID)) add("Open the example", "zl-btn-secondary", openExample);
}

/* ============================================================ generating */

const STAGES = [
  { id: "reading", label: "Reading notes" },
  { id: "summary", label: "Writing summary" },
  { id: "terms", label: "Listing key terms" },
  { id: "quiz", label: "Building quiz" },
  { id: "cards", label: "Making flashcards" },
];
const MODE_STAGES = { all: ["reading", "summary", "terms", "quiz", "cards"], summary: ["reading", "summary"], terms: ["reading", "terms"], quiz: ["reading", "quiz"], cards: ["reading", "cards"] };

function expectedChars(mode, q) {
  const parts = { summary: 1500, terms: 1100, quiz: q * 430, cards: 1300 };
  return mode === "all" ? 120 + parts.summary + parts.terms + parts.quiz + parts.cards : 80 + parts[mode];
}

function renderProgress(p) {
  const ids = MODE_STAGES[p.mode];
  const cur = ids.indexOf(p.stage);
  $("#progSteps").innerHTML = ids.map((id, i) => {
    const s = STAGES.find((x) => x.id === id);
    let label = s.label;
    if (id === "quiz" && i === cur && p.questions) label += `, ${Math.min(p.questions, p.q)} of ${p.q}`;
    if (id === "cards" && i === cur && p.cards) label += `, ${p.cards} so far`;
    if (id === "terms" && i === cur && p.terms) label += `, ${p.terms} so far`;
    const st = i < cur ? "done" : i === cur ? "now" : "todo";
    return `<li data-state="${st}"><span class="sb-st" aria-hidden="true"></span><span>${esc(label)}</span><span class="sr-only">${st === "done" ? "done" : st === "now" ? "in progress" : "waiting"}</span></li>`;
  }).join("");
  const title = p.tidy ? "Tidying up the answer" : STAGES.find((x) => x.id === p.stage).label;
  if ($("#progTitle").textContent !== title) $("#progTitle").textContent = title;
  const pct = Math.round(Math.min(0.97, p.ratio) * 100);
  $("#progBar").style.width = pct + "%";
  $("#progMeter").setAttribute("aria-valuenow", String(pct));
  $("#progSub").textContent = p.sub;
}

function setBusy(on) {
  const go = $("#goBtn");
  go.disabled = on;
  go.setAttribute("aria-busy", String(on));
  $("#goText").textContent = on ? "Generating" : "Generate study set";
  $$("[data-regen]").forEach((b) => { b.disabled = on; });
  renderStatus();
}

function requireAi() {
  if (state.ai.checking) { ZL.toast("Still checking whether the AI is available. Try again in a second.", { type: "info" }); return null; }
  const r = route();
  if (r === "demo") {
    showError({ kind: "demo", title: "Generating needs the AI", hint: "There's no hosted AI on this copy of the site. Add your own Anthropic key in Settings to make sets from your notes, or try every feature with the example set." });
    return null;
  }
  return r;
}

/** Stream one request and parse it, retrying once if the reply can't be read. */
async function runAi({ r, mode, notes, title, q, onProgress, signal }) {
  const expect = expectedChars(mode, q);
  const started = Date.now();
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await api.requestStudy({
      route: r, notes, mode, title, questions: q, retry: attempt > 0, signal,
      onText: (full) => {
        const sp = streamProgress(full);
        onProgress({ ...sp, stage: mode === "all" ? sp.stage === "reading" ? "summary" : sp.stage : MODE_STAGES[mode][1], ratio: full.length / expect, tidy: false, attempt });
      },
    });
    try {
      return parseStudy(res.text, mode);
    } catch (e) {
      lastErr = e;
      if (attempt === 0) onProgress({ stage: MODE_STAGES[mode][MODE_STAGES[mode].length - 1], ratio: 0.3, tidy: true, attempt: 1, questions: 0, cards: 0, terms: 0 });
    }
  }
  const err = new api.ApiError("parse", "The answer came back in a format Study Buddy couldn't read.", "Press Try again. Shorter notes, or splitting them into two sets, usually helps.");
  err.detail = lastErr && lastErr.message;
  err.elapsed = Date.now() - started;
  throw err;
}

async function generate(mode = "all", setId = null) {
  if (state.running) return;
  let notes, title, q = state.draft.questions;
  const target = setId ? state.sets.find((s) => s.id === setId) : null;
  if (mode === "all") {
    if (!validateNotes()) return;
    notes = el.notes.value.trim();
    title = el.title.value.trim();
  } else {
    if (!target) return;
    notes = target.notes;
    title = target.title;
  }
  const r = requireAi();
  if (!r) return;

  const controller = new AbortController();
  state.running = { controller, mode, setId };
  setBusy(true);
  showView("progress");
  const charsLabel = `${plural(notes.length, "character")} of notes`;
  const base = { mode, q, sub: charsLabel, questions: 0, cards: 0, terms: 0 };
  renderProgress({ ...base, stage: "reading", ratio: 0.02 });
  if (matchMedia("(max-width: 980px)").matches) $("#study").scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });

  try {
    const out = await runAi({
      r, mode, notes, title, q, signal: controller.signal,
      onProgress: (p) => renderProgress({ ...base, ...p, sub: p.tidy ? "The first answer wasn't valid JSON, so Study Buddy asked again." : charsLabel }),
    });
    finishGeneration(mode, out, { notes, title, target });
  } catch (err) {
    const retry = () => generate(mode, setId);
    const back = activeSet() ? () => { showView("set"); renderSet(); } : null;
    if (err.kind === "aborted") {
      if (activeSet()) { showView("set"); renderSet(); } else showView("empty");
      ZL.toast("Stopped. Nothing was changed.", { type: "info" });
    } else {
      showError(err, { retry, back });
      ZL.toast(err.title || "Something went wrong", { type: "bad" });
    }
  } finally {
    state.running = null;
    setBusy(false);
  }
}

function finishGeneration(mode, out, { notes, title, target }) {
  state.running = null;
  setBusy(false);
  showView("set");
  const day = srs.today();
  const mkCards = (cards) => cards.map((c) => ({ id: uid(), front: c.front, back: c.back, srs: srs.newSrs(day) }));
  if (mode === "all") {
    const firstLine = notes.split("\n").find((l) => l.trim()) || "Untitled notes";
    const f = state.draft.file;
    const set = {
      id: uid(),
      title: (title || out.title || firstLine.replace(/^#+\s*/, "")).slice(0, 80),
      createdAt: new Date().toISOString(),
      source: f ? { kind: f.kind, name: f.name, pages: f.pages || 0 } : { kind: "paste", name: "", pages: 0 },
      notes,
      summary: out.summary,
      terms: out.terms,
      quiz: out.quiz,
      cards: mkCards(out.cards),
      quizBest: null,
      quizAttempts: 0,
    };
    state.sets.unshift(set);
    state.activeId = set.id;
    state.tab = "summary";
    resetSession();
    saveSets();
    renderAll();
    ZL.toast(`Study set ready: ${plural(set.quiz.length, "question")}, ${plural(set.cards.length, "card")}`);
    return;
  }
  const set = target;
  if (mode === "summary") { set.summary = out.summary; ZL.toast("Summary rewritten"); state.tab = "summary"; }
  if (mode === "terms") { set.terms = out.terms; ZL.toast(`Key terms updated: ${plural(set.terms.length, "term")}`); state.tab = "terms"; }
  if (mode === "quiz") { set.quiz = out.quiz; set.quizRun = null; ZL.toast(`New quiz ready: ${plural(set.quiz.length, "question")}`); state.tab = "quiz"; }
  if (mode === "cards") {
    const seen = new Set(set.cards.map((c) => c.front.toLowerCase().replace(/\W+/g, "")));
    const fresh = mkCards(out.cards.filter((c) => !seen.has(c.front.toLowerCase().replace(/\W+/g, ""))));
    set.cards.push(...fresh);
    ZL.toast(fresh.length ? `Added ${plural(fresh.length, "new card")}` : "No new cards: they were all already in this set", fresh.length ? {} : { type: "info" });
    state.tab = "cards";
  }
  state.activeId = set.id;
  resetSession();
  saveSets();
  renderAll();
}

$("#composeForm").addEventListener("submit", (e) => { e.preventDefault(); generate("all"); });
$("#stopBtn").addEventListener("click", () => { if (state.running) state.running.controller.abort(); });

/* ============================================================ set view */

const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>',
};

function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function renderAll() {
  renderSet();
  renderLibrary();
  renderStatus();
  renderMode();
}

function renderSet() {
  const set = activeSet();
  if (state.running) return;
  if (!set) { if (state.view !== "error") showView("empty"); return; }
  if (state.view !== "error") showView("set");
  $("#setTitle").textContent = set.title;
  const src = set.source && set.source.name
    ? ` from ${set.source.name}${set.source.kind === "pdf" && set.source.pages ? ` (${plural(set.source.pages, "page")})` : ""}`
    : "";
  $("#setMeta").innerHTML = (set.isExample ? '<span class="zl-badge">Example</span> ' : "") + esc(`Made ${fmtDate(set.createdAt)}${src}`);
  const c = srs.counts(set.cards);
  $("#nTerms").textContent = set.terms.length || "";
  $("#nQuiz").textContent = set.quiz.length || "";
  $("#nCards").innerHTML = c.due ? `<span class="sb-due-dot" aria-hidden="true"></span>${fmt(c.due)}<span class="sr-only"> due</span>` : fmt(c.total);
  $("#nCards").dataset.due = c.due ? "1" : "";
  selectTab(state.tab, false, true);
}

function selectTab(name, focus = false, force = false) {
  if (!force && name === state.tab && !$(`#panel-${name}`).hidden) { if (focus) $(`#tab-${name}`).focus(); return; }
  state.tab = name;
  ZL.store.set("tab", name);
  $$("#tabs [role=tab]").forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $$(".sb-panel").forEach((p) => { p.hidden = p.id !== `panel-${name}`; });
  if (name === "summary") renderSummary();
  if (name === "terms") renderTerms();
  if (name === "quiz") renderQuiz();
  if (name === "cards") renderCards();
  renderToolsVisibility();
  if (focus) $(`#tab-${name}`).focus();
}

$("#tabs").addEventListener("click", (e) => {
  const t = e.target.closest("[role=tab]");
  if (t) selectTab(t.dataset.tab);
});
$("#tabs").addEventListener("keydown", (e) => {
  const tabs = $$("#tabs [role=tab]");
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  let n = -1;
  if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
  if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
  if (e.key === "Home") n = 0;
  if (e.key === "End") n = tabs.length - 1;
  if (n >= 0) { e.preventDefault(); e.stopPropagation(); selectTab(tabs[n].dataset.tab, true); }
});

function renderToolsVisibility() {
  const can = !state.ai.checking && route() !== "demo";
  $$("[data-regen]").forEach((b) => { b.hidden = !can; b.disabled = Boolean(state.running); });
}

/* ------------------------------------------------------------ summary */

function renderSummary() {
  const set = activeSet();
  const p = $("#panel-summary");
  if (!set) return;
  const sm = set.summary || { overview: "", sections: [] };
  p.innerHTML = `
    <div class="sb-toolbar">
      <span class="sb-muted">${plural(sm.sections.length, "section")}, ${plural(sm.sections.reduce((n, s) => n + s.points.length, 0), "key point")}</span>
      <span class="sb-grow"></span>
      <button class="zl-btn zl-btn-ghost zl-btn-sm" type="button" data-act="copy-summary">${ICON.copy}Copy</button>
      <button class="zl-btn zl-btn-ghost zl-btn-sm" type="button" data-regen="summary">${ICON.spark}Rewrite</button>
    </div>
    ${sm.overview ? `<p class="sb-overview">${rich(sm.overview)}</p>` : ""}
    <div class="sb-sections">
      ${sm.sections.map((s, i) => `
        <section class="sb-sec">
          <h3><span class="sb-sec-n num" aria-hidden="true">${i + 1}</span>${rich(s.heading)}</h3>
          <ul>${s.points.map((pt) => `<li>${rich(pt)}</li>`).join("")}</ul>
        </section>`).join("")}
    </div>`;
}

function summaryMarkdown(set) {
  const sm = set.summary;
  return [`# ${set.title}`, "", sm.overview, "", ...sm.sections.flatMap((s) => [`## ${s.heading}`, ...s.points.map((x) => `- ${x}`), ""])].join("\n").trim() + "\n";
}

/* ------------------------------------------------------------ key terms */

function renderTerms() {
  const set = activeSet();
  const p = $("#panel-terms");
  if (!set) return;
  if (!set.terms.length) {
    p.innerHTML = `<div class="zl-empty"><h3>No key terms in this set</h3><p>Regenerate them from the notes to get a searchable list.</p><button class="zl-btn zl-btn-secondary" type="button" data-regen="terms">${ICON.spark}Generate key terms</button></div>`;
    renderToolsVisibility();
    return;
  }
  p.innerHTML = `
    <div class="sb-toolbar">
      <div class="sb-search">
        ${ICON.search}
        <label class="sr-only" for="termSearch">Search key terms</label>
        <input id="termSearch" class="zl-input" type="search" placeholder="Search terms" autocomplete="off" value="${esc(state.termQuery)}">
      </div>
      <span class="sb-muted num" id="termCount" aria-live="polite"></span>
      <span class="sb-grow"></span>
      <button class="zl-btn zl-btn-ghost zl-btn-sm" type="button" data-regen="terms">${ICON.spark}Regenerate</button>
    </div>
    <dl class="sb-terms" id="termList"></dl>
    <div class="zl-empty sb-term-empty" id="termEmpty" hidden></div>`;
  $("#termSearch").addEventListener("input", (e) => { state.termQuery = e.target.value; renderTermList(); });
  renderTermList();
}

const norm = (s) => String(s).toLowerCase().replace(/[’']/g, "'").replace(/\\[a-z]+/gi, " ");

function renderTermList() {
  const set = activeSet();
  const q = norm(state.termQuery.trim());
  const list = set.terms.filter((t) => !q || norm(t.term).includes(q) || norm(t.definition).includes(q));
  $("#termCount").textContent = q ? `${fmt(list.length)} of ${plural(set.terms.length, "term")}` : plural(set.terms.length, "term");
  $("#termList").innerHTML = list.map((t) => `<div class="sb-term"><dt>${rich(t.term)}</dt><dd>${rich(t.definition)}</dd></div>`).join("");
  const empty = $("#termEmpty");
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.innerHTML = `${ICON.search}<h3>No terms match “${esc(state.termQuery.trim())}”</h3><p>Try a shorter word, or search part of a definition.</p><button class="zl-btn zl-btn-secondary" type="button" data-act="clear-search">Clear search</button>`;
  }
}

/* ------------------------------------------------------------ quiz */

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

function ensureRun(set) {
  const n = set.quiz.length;
  const r = set.quizRun;
  const valid = r && Array.isArray(r.order) && r.order.length && r.order.every((i) => Number.isInteger(i) && i >= 0 && i < n) && r.picks && typeof r.picks === "object";
  if (!valid) set.quizRun = { order: set.quiz.map((_, i) => i), picks: {}, pos: 0, kind: "all", done: false };
  return set.quizRun;
}

function runScore(set, run) {
  const right = run.order.filter((qi) => run.picks[qi] === set.quiz[qi].answer).length;
  return { right, total: run.order.length, wrong: run.order.filter((qi) => run.picks[qi] !== undefined && run.picks[qi] !== set.quiz[qi].answer) };
}

let quizReviewOpen = false;

function renderQuiz() {
  const set = activeSet();
  const p = $("#panel-quiz");
  if (!set) return;
  if (!set.quiz.length) {
    p.innerHTML = `<div class="zl-empty"><h3>No quiz in this set</h3><p>Generate one from the notes.</p><button class="zl-btn zl-btn-primary" type="button" data-regen="quiz">${ICON.spark}Generate a quiz</button></div>`;
    renderToolsVisibility();
    return;
  }
  const run = ensureRun(set);
  if (run.done) { renderQuizResult(set, run); return; }
  const qi = run.order[run.pos];
  const q = set.quiz[qi];
  const picked = run.picks[qi];
  const answered = picked !== undefined;
  const sc = runScore(set, run);
  const last = run.pos === run.order.length - 1;
  const segs = run.order.map((i, k) => {
    const st = run.picks[i] === undefined ? (k === run.pos ? "now" : "") : run.picks[i] === set.quiz[i].answer ? "good" : "bad";
    return `<span data-state="${st}"></span>`;
  }).join("");
  p.innerHTML = `
    <div class="sb-quiz">
      <div class="sb-quiz-top">
        <span class="sb-muted">${run.kind === "wrong" ? "Retrying mistakes. " : ""}Question <b class="num">${run.pos + 1}</b> of ${run.order.length}</span>
        <span class="sb-grow"></span>
        <span class="sb-muted num" id="quizRunning">${plural(sc.right, "correct", "correct")}</span>
      </div>
      <div class="sb-qbar" aria-hidden="true">${segs}</div>
      <h3 class="sb-q" id="qText">${rich(q.question)}</h3>
      <div class="sb-opts" role="group" aria-labelledby="qText">
        ${q.options.map((o, i) => {
          const cls = !answered ? "" : i === q.answer ? "is-correct" : i === picked ? "is-wrong" : "is-dim";
          const mark = !answered ? "" : i === q.answer ? ICON.check : i === picked ? ICON.x : "";
          return `<button class="sb-opt ${cls}" type="button" data-opt="${i}" ${answered ? "disabled" : ""} aria-label="${String.fromCharCode(65 + i)}: ${esc(o.replace(/\$/g, ""))}${answered && i === q.answer ? ", correct answer" : ""}${answered && i === picked && i !== q.answer ? ", your answer" : ""}">
            <span class="sb-key" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span class="sb-opt-t">${rich(o)}</span><span class="sb-opt-mark" aria-hidden="true">${mark}</span></button>`;
        }).join("")}
      </div>
      <div class="sb-feedback" id="quizFeedback" aria-live="polite">${answered ? `
        <div class="sb-verdict ${picked === q.answer ? "good" : "bad"}">${picked === q.answer ? "Correct." : `Not quite. The answer is ${String.fromCharCode(65 + q.answer)}.`}</div>
        ${q.explanation ? `<p>${rich(q.explanation)}</p>` : ""}` : ""}
      </div>
      <div class="sb-quiz-foot">
        <span class="sb-kbd-hint">${answered ? "Press Enter to continue" : `Press 1 to ${q.options.length}, or click an answer`}</span>
        <span class="sb-grow"></span>
        ${answered ? `<button class="zl-btn zl-btn-primary" type="button" id="quizNext">${last ? "See results" : "Next question"}</button>` : ""}
      </div>
    </div>`;
  if (answered) $("#quizNext").focus({ preventScroll: true });
}

function pickAnswer(i) {
  const set = activeSet();
  const run = ensureRun(set);
  if (run.done) return;
  const qi = run.order[run.pos];
  if (run.picks[qi] !== undefined || i < 0 || i >= set.quiz[qi].options.length) return;
  run.picks[qi] = i;
  saveSets(true);
  renderQuiz();
  const fb = $("#panel-quiz .sb-opt.is-correct, #panel-quiz .sb-opt.is-wrong");
  if (fb && !reduced()) $$("#panel-quiz .sb-opt.is-correct, #panel-quiz .sb-opt.is-wrong").forEach((b) => b.classList.add("pop"));
}

function nextQuestion() {
  const set = activeSet();
  const run = ensureRun(set);
  if (run.picks[run.order[run.pos]] === undefined) return;
  if (run.pos < run.order.length - 1) { run.pos++; saveSets(true); renderQuiz(); $("#panel-quiz").focus({ preventScroll: true }); return; }
  run.done = true;
  const sc = runScore(set, run);
  if (run.kind === "all") {
    const pct = Math.round((sc.right / sc.total) * 100);
    set.quizBest = Math.max(set.quizBest ?? 0, pct);
    set.quizAttempts = (set.quizAttempts || 0) + 1;
  }
  quizReviewOpen = false;
  saveSets();
  renderQuiz();
  renderLibrary();
}

function renderQuizResult(set, run) {
  const p = $("#panel-quiz");
  const sc = runScore(set, run);
  const pct = Math.round((sc.right / sc.total) * 100);
  const head = pct === 100 ? "Perfect score." : pct >= 80 ? "Great work." : pct >= 60 ? "Solid. Review the ones you missed." : pct >= 40 ? "Getting there." : "Worth another pass.";
  const sub = run.kind === "wrong"
    ? `You got ${fmt(sc.right)} of the ${plural(sc.total, "question")} you missed last time.`
    : `You got ${fmt(sc.right)} of ${fmt(sc.total)} right.${set.quizBest != null ? ` Best so far: ${set.quizBest}%.` : ""}`;
  const C = 2 * Math.PI * 52;
  p.innerHTML = `
    <div class="sb-result">
      <div class="sb-ring-wrap" role="img" aria-label="Score ${sc.right} of ${sc.total}, ${pct} percent">
        <svg viewBox="0 0 120 120" class="sb-ring" data-tone="${pct >= 80 ? "good" : pct >= 50 ? "mid" : "low"}">
          <circle class="trk" cx="60" cy="60" r="52"/>
          <circle class="val" cx="60" cy="60" r="52" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - sc.right / sc.total)}"/>
        </svg>
        <div class="sb-ring-label"><b class="num">${fmt(sc.right)}<small>/${fmt(sc.total)}</small></b><span class="num">${pct}%</span></div>
      </div>
      <div class="sb-result-text">
        <h3 aria-live="polite">${head}</h3>
        <p>${sub}</p>
        <div class="sb-result-actions">
          ${sc.wrong.length ? `<button class="zl-btn zl-btn-secondary" type="button" data-act="review" aria-expanded="${quizReviewOpen}" aria-controls="quizReview">${quizReviewOpen ? "Hide mistakes" : "Review mistakes"}</button>
          <button class="zl-btn zl-btn-primary" type="button" data-act="retry-wrong">Retry wrong ones</button>` : ""}
          <button class="zl-btn ${sc.wrong.length ? "zl-btn-secondary" : "zl-btn-primary"}" type="button" data-act="new-attempt">New attempt</button>
          <button class="zl-btn zl-btn-ghost" type="button" data-regen="quiz">${ICON.spark}New questions</button>
        </div>
      </div>
    </div>
    <div class="sb-review" id="quizReview" ${quizReviewOpen ? "" : "hidden"}>
      <h4>${plural(sc.wrong.length, "mistake")} to review</h4>
      ${sc.wrong.map((qi) => {
        const q = set.quiz[qi];
        return `<article class="sb-review-item">
          <h5>${rich(q.question)}</h5>
          <p class="sb-ans bad">${ICON.x}<span><span class="sr-only">Your answer: </span>${rich(q.options[run.picks[qi]])}</span></p>
          <p class="sb-ans good">${ICON.check}<span><span class="sr-only">Correct answer: </span>${rich(q.options[q.answer])}</span></p>
          ${q.explanation ? `<p class="sb-review-why">${rich(q.explanation)}</p>` : ""}
        </article>`;
      }).join("")}
    </div>`;
  renderToolsVisibility();
  const val = $(".sb-ring .val", p);
  const go = () => { val.style.strokeDashoffset = val.dataset.off; };
  if (reduced()) go(); else requestAnimationFrame(() => requestAnimationFrame(go));
}

function newAttempt(kind) {
  const set = activeSet();
  const prev = ensureRun(set);
  if (kind === "wrong") {
    const wrong = runScore(set, prev).wrong;
    if (!wrong.length) return;
    set.quizRun = { order: wrong, picks: {}, pos: 0, kind: "wrong", done: false };
    ZL.toast(`Retrying ${plural(wrong.length, "question")} you missed`, { type: "info" });
  } else {
    set.quizRun = { order: shuffle(set.quiz.map((_, i) => i)), picks: {}, pos: 0, kind: "all", done: false };
    ZL.toast("New attempt started, questions shuffled", { type: "info" });
  }
  quizReviewOpen = false;
  saveSets(true);
  renderQuiz();
  const first = $("#panel-quiz .sb-opt");
  if (first) first.focus({ preventScroll: true });
}

$("#panel-quiz").addEventListener("click", (e) => {
  const opt = e.target.closest(".sb-opt");
  if (opt && !opt.disabled) { pickAnswer(Number(opt.dataset.opt)); return; }
  if (e.target.closest("#quizNext")) { nextQuestion(); return; }
  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "review") {
    quizReviewOpen = !quizReviewOpen;
    $("#quizReview").hidden = !quizReviewOpen;
    act.textContent = quizReviewOpen ? "Hide mistakes" : "Review mistakes";
    act.setAttribute("aria-expanded", String(quizReviewOpen));
    if (quizReviewOpen) $("#quizReview").scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  }
  if (act.dataset.act === "retry-wrong") newAttempt("wrong");
  if (act.dataset.act === "new-attempt") newAttempt("all");
});

/* ------------------------------------------------------------ flashcards */

function resetSession() { state.cards = null; quizReviewOpen = false; state.termQuery = ""; }

function session(set, mode) {
  const s = state.cards;
  if (s && s.setId === set.id && (!mode || s.mode === mode)) {
    s.queue = s.queue.filter((id) => set.cards.some((c) => c.id === id));
    if (s.pos >= s.queue.length) s.pos = Math.max(0, s.queue.length - 1);
    return s;
  }
  const m = mode || (s && s.setId === set.id ? s.mode : "due");
  const day = srs.today();
  const queue = (m === "due" ? set.cards.filter((c) => srs.isDue(c, day)) : set.cards).map((c) => c.id);
  state.cards = { setId: set.id, mode: m, queue, pos: 0, flipped: false, reviewed: 0, finished: !queue.length, last: "" };
  return state.cards;
}

function renderCards() {
  const set = activeSet();
  const p = $("#panel-cards");
  if (!set) return;
  if (!set.cards.length) {
    p.innerHTML = `<div class="zl-empty"><h3>No flashcards in this set</h3><p>Generate some from the notes.</p><button class="zl-btn zl-btn-primary" type="button" data-regen="cards">${ICON.spark}Generate flashcards</button></div>`;
    renderToolsVisibility();
    return;
  }
  const s = session(set);
  const c = srs.counts(set.cards);
  const pct = (n) => (c.total ? (n / c.total) * 100 : 0);
  p.innerHTML = `
    <div class="sb-cards-top">
      <div class="zl-seg" role="group" aria-label="Which cards to study">
        <button type="button" data-cmode="due" aria-pressed="${s.mode === "due"}">Due today <span class="sb-seg-n num">${fmt(c.due)}</span></button>
        <button type="button" data-cmode="all" aria-pressed="${s.mode === "all"}">All cards <span class="sb-seg-n num">${fmt(c.total)}</span></button>
      </div>
      <span class="sb-grow"></span>
      <button class="zl-btn zl-btn-ghost zl-btn-sm" type="button" data-regen="cards">${ICON.spark}More cards</button>
    </div>
    <div class="sb-deck">
      <div class="sb-stack" role="img" aria-label="${fmt(c.new)} new, ${fmt(c.learning)} learning, ${fmt(c.known)} known">
        <span class="new" style="width:${pct(c.new)}%"></span><span class="learning" style="width:${pct(c.learning)}%"></span><span class="known" style="width:${pct(c.known)}%"></span>
      </div>
      <div class="sb-legend">
        <span><i class="new"></i>New <b class="num">${fmt(c.new)}</b></span>
        <span><i class="learning"></i>Learning <b class="num">${fmt(c.learning)}</b></span>
        <span><i class="known"></i>Known <b class="num">${fmt(c.known)}</b></span>
      </div>
    </div>
    <div id="cardArea"></div>
    <p class="sb-rated" id="cardsLive" aria-live="polite">${esc(s.last)}</p>`;
  renderCardArea();
  renderToolsVisibility();
}

function currentCard() {
  const set = activeSet();
  const s = state.cards;
  if (!set || !s || s.finished || !s.queue.length) return null;
  return set.cards.find((c) => c.id === s.queue[s.pos]) || null;
}

function renderCardArea() {
  const set = activeSet();
  const s = state.cards;
  const area = $("#cardArea");
  if (!area) return;
  const card = currentCard();
  if (!card) {
    const day = srs.today();
    const nd = srs.nextDue(set.cards, day);
    const nCount = nd == null ? 0 : set.cards.filter((x) => x.srs && x.srs.due === nd).length;
    const next = nd == null ? "" : ` Next up: ${plural(nCount, "card")} ${srs.formatDue(nd, day)}.`;
    if (s.mode === "due") {
      area.innerHTML = `<div class="sb-done">
        <div class="sb-done-icon" aria-hidden="true">${ICON.check}</div>
        <h3>${s.reviewed ? "All caught up" : "Nothing due today"}</h3>
        <p>${s.reviewed ? `You reviewed ${plural(s.reviewed, "card")}.` : "Every card in this set is scheduled for later."}${next}</p>
        <div class="sb-done-actions"><button class="zl-btn zl-btn-primary" type="button" data-cmode="all">Review all cards</button><button class="zl-btn zl-btn-secondary" type="button" data-goto="quiz">Take the quiz</button></div>
      </div>`;
    } else {
      area.innerHTML = `<div class="sb-done">
        <div class="sb-done-icon" aria-hidden="true">${ICON.check}</div>
        <h3>That's the whole deck</h3>
        <p>You went through ${plural(set.cards.length, "card")}.${next}</p>
        <div class="sb-done-actions"><button class="zl-btn zl-btn-primary" type="button" data-act="restart-cards">Start again</button><button class="zl-btn zl-btn-secondary" type="button" data-goto="quiz">Take the quiz</button></div>
      </div>`;
    }
    return;
  }
  const st = srs.stage(card);
  const stLabel = st === "new" ? "New" : st === "known" ? "Known" : "Learning";
  area.innerHTML = `
    <div class="sb-card-stage">
      <div class="sb-flip ${s.flipped ? "is-flipped" : ""}" id="flipCard" role="button" tabindex="0" aria-pressed="${s.flipped}" aria-label="${s.flipped ? "Answer shown. Press Space to see the question" : "Flashcard question. Press Space to show the answer"}">
        <div class="sb-flip-inner">
          <div class="sb-face sb-front" aria-hidden="${s.flipped}">
            <div class="sb-face-top"><span class="sb-face-label">Question</span><span class="sb-chip-stage" data-stage="${st}">${stLabel}</span></div>
            <div class="sb-face-body"><div>${rich(card.front)}</div></div>
            <span class="sb-face-foot">${ICON.flip}Tap or press Space to flip</span>
          </div>
          <div class="sb-face sb-back" aria-hidden="${!s.flipped}">
            <div class="sb-face-top"><span class="sb-face-label">Answer</span></div>
            <div class="sb-face-body"><div>${rich(card.back)}</div></div>
            <span class="sb-face-foot">How well did you know it?</span>
          </div>
        </div>
      </div>
    </div>
    <div class="sb-card-controls" id="cardControls"></div>
    <div class="sb-card-nav">
      <button class="zl-iconbtn sb-nav-btn" type="button" data-move="-1" aria-label="Previous card" ${s.pos === 0 ? "disabled" : ""}>${ICON.left}</button>
      <span class="sb-muted num" id="cardPos">Card ${fmt(s.pos + 1)} of ${fmt(s.queue.length)}</span>
      <button class="zl-iconbtn sb-nav-btn" type="button" data-move="1" aria-label="Next card" ${s.pos >= s.queue.length - 1 ? "disabled" : ""}>${ICON.right}</button>
    </div>
    <p class="sb-kbd-hint sb-center"><kbd>Space</kbd> flips, <kbd>1</kbd>–<kbd>4</kbd> rate, <kbd>←</kbd> <kbd>→</kbd> move between cards</p>`;
  renderCardControls(card);
}

function renderCardControls(card) {
  const s = state.cards;
  const box = $("#cardControls");
  if (!box) return;
  if (!s.flipped) {
    box.innerHTML = `<button class="zl-btn zl-btn-primary zl-btn-lg sb-show" type="button" id="showAnswer">Show answer</button>`;
    return;
  }
  box.innerHTML = `<div class="sb-rate" role="group" aria-label="Rate how well you knew it">${srs.RATINGS.map((r) => {
    const days = srs.nextInterval(card.srs, r.id);
    return `<button class="sb-rate-btn" type="button" data-rate="${r.id}" data-k="${r.key}" aria-label="${r.label}, next review ${days ? srs.formatInterval(days) : "today"}"><kbd aria-hidden="true">${r.id}</kbd><b>${r.label}</b><span class="num">${srs.formatInterval(days)}</span></button>`;
  }).join("")}</div>`;
}

function flipCard() {
  const s = state.cards;
  const card = currentCard();
  if (!card) return;
  s.flipped = !s.flipped;
  const fc = $("#flipCard");
  fc.classList.toggle("is-flipped", s.flipped);
  fc.setAttribute("aria-pressed", String(s.flipped));
  fc.setAttribute("aria-label", s.flipped ? "Answer shown. Press Space to see the question" : "Flashcard question. Press Space to show the answer");
  $(".sb-front", fc).setAttribute("aria-hidden", String(s.flipped));
  $(".sb-back", fc).setAttribute("aria-hidden", String(!s.flipped));
  renderCardControls(card);
}

function moveCard(d) {
  const s = state.cards;
  if (!s || s.finished || !s.queue.length) return;
  const n = s.pos + d;
  if (n < 0 || n >= s.queue.length) return;
  s.pos = n;
  s.flipped = false;
  renderCardArea();
  const fc = $("#flipCard");
  if (fc && !reduced()) fc.classList.add(d > 0 ? "in-right" : "in-left");
}

function rateCard(r) {
  const set = activeSet();
  const s = state.cards;
  const card = currentCard();
  if (!card || !s.flipped) return false;
  const day = srs.today();
  card.srs = srs.schedule(card.srs, r, day);
  s.reviewed++;
  const label = srs.RATINGS[r - 1].label;
  s.last = r === 1 ? "Again. You'll see it once more in this session." : `${label}. Back ${srs.formatDue(card.srs.due, day)}.`;
  if (s.mode === "due") {
    s.queue.splice(s.pos, 1);
    if (r === 1) s.queue.push(card.id);
    if (s.pos >= s.queue.length) s.pos = 0;
    if (!s.queue.length) s.finished = true;
  } else {
    s.pos++;
    if (s.pos >= s.queue.length) { s.finished = true; s.pos = s.queue.length - 1; }
  }
  s.flipped = false;
  saveSets(true);
  flashStatus("Saved");
  renderCards();
  renderSetCounts();
  renderLibrary();
  const fc = $("#flipCard");
  if (fc && !reduced()) fc.classList.add("in-right");
  return true;
}

function renderSetCounts() {
  const set = activeSet();
  if (!set) return;
  const c = srs.counts(set.cards);
  $("#nCards").innerHTML = c.due ? `<span class="sb-due-dot" aria-hidden="true"></span>${fmt(c.due)}<span class="sr-only"> due</span>` : fmt(c.total);
  $("#nCards").dataset.due = c.due ? "1" : "";
}

$("#panel-cards").addEventListener("click", (e) => {
  const set = activeSet();
  if (e.target.closest("#flipCard") || e.target.closest("#showAnswer")) { flipCard(); if (e.target.closest("#showAnswer")) { const b = $(".sb-rate-btn[data-rate='3']"); if (b) b.focus({ preventScroll: true }); } return; }
  const rb = e.target.closest("[data-rate]");
  if (rb) { rateCard(Number(rb.dataset.rate)); return; }
  const nb = e.target.closest("[data-move]");
  if (nb && !nb.disabled) { moveCard(Number(nb.dataset.move)); return; }
  const cm = e.target.closest("[data-cmode]");
  if (cm) { state.cards = null; session(set, cm.dataset.cmode); renderCards(); return; }
  if (e.target.closest("[data-act='restart-cards']")) { state.cards = null; session(set, "all"); renderCards(); return; }
  const g = e.target.closest("[data-goto]");
  if (g) selectTab(g.dataset.goto, true);
});
$("#panel-cards").addEventListener("animationend", (e) => { e.target.classList && e.target.classList.remove("in-right", "in-left"); });

/* ============================================================ library */

function renderLibrary() {
  const list = $("#libList");
  const day = srs.today();
  const due = dueTotal();
  $("#libCount").textContent = state.sets.length ? `${plural(state.sets.length, "set")}, ${fmt(due)} ${due === 1 ? "card" : "cards"} due today` : "";
  $("#libEmpty").hidden = state.sets.length > 0;
  list.hidden = !state.sets.length;
  list.innerHTML = state.sets.map((s) => {
    const c = srs.counts(s.cards, day);
    const pct = (n) => (c.total ? (n / c.total) * 100 : 0);
    const active = s.id === state.activeId;
    return `<li class="sb-lib-item" data-id="${esc(s.id)}" ${active ? 'data-active="1"' : ""}>
      <button class="sb-lib-open" type="button" data-open="${esc(s.id)}" ${active ? 'aria-current="true"' : ""}>
        <span class="sb-lib-top"><span class="sb-lib-date">${esc(fmtDate(s.createdAt))}</span>${s.isExample ? '<span class="zl-badge">Example</span>' : ""}${active ? '<span class="sb-lib-open-tag">Open</span>' : ""}</span>
        <span class="sb-lib-title">${esc(s.title)}</span>
        <span class="sb-lib-stats">
          <span><b class="num">${fmt(c.total)}</b> ${c.total === 1 ? "card" : "cards"}</span>
          <span class="${c.due ? "is-due" : ""}"><b class="num">${fmt(c.due)}</b> due</span>
          <span><b class="num">${s.quizBest != null ? s.quizBest + "%" : "–"}</b> best quiz</span>
        </span>
        <span class="sb-stack sm" aria-hidden="true"><span class="new" style="width:${pct(c.new)}%"></span><span class="learning" style="width:${pct(c.learning)}%"></span><span class="known" style="width:${pct(c.known)}%"></span></span>
      </button>
      <div class="sb-lib-actions">
        <button class="zl-btn zl-btn-ghost zl-btn-sm" type="button" data-lib="rename" aria-label="Rename ${esc(s.title)}">Rename</button>
        <button class="zl-btn zl-btn-ghost zl-btn-sm" type="button" data-lib="export" aria-haspopup="menu" aria-expanded="false" aria-label="Export ${esc(s.title)}">Export</button>
        <span class="sb-grow"></span>
        <button class="zl-btn zl-btn-ghost zl-btn-sm sb-del" type="button" data-lib="delete" aria-label="Delete ${esc(s.title)}">Delete</button>
      </div>
    </li>`;
  }).join("");
}

function openSet(id, { scroll = true } = {}) {
  if (state.running) { ZL.toast("Wait for the current set to finish, or press Stop.", { type: "info" }); return; }
  state.activeId = id;
  resetSession();
  ZL.store.set("activeId", id);
  showView("set");
  renderAll();
  if (scroll) $("#study").scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
}

function openExample() {
  if (!state.sets.some((s) => s.id === EXAMPLE_ID)) {
    state.sets.unshift(makeExample());
    saveSets(true);
    ZL.toast("Example set added to your library");
  }
  state.tab = "summary";
  openSet(EXAMPLE_ID);
}

$("#libList").addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) { openSet(open.dataset.open); return; }
  const b = e.target.closest("[data-lib]");
  if (!b) return;
  const id = b.closest(".sb-lib-item").dataset.id;
  if (b.dataset.lib === "rename") openRename(id);
  if (b.dataset.lib === "export") toggleMenu(b, id);
  if (b.dataset.lib === "delete") deleteSet(id);
});

function deleteSet(id) {
  const idx = state.sets.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const [removed] = state.sets.splice(idx, 1);
  const wasActive = state.activeId === id;
  const prevActive = state.activeId;
  if (wasActive) { state.activeId = state.sets[0] ? state.sets[0].id : null; resetSession(); }
  saveSets(true);
  if (!state.activeId) showView("empty");
  renderAll();
  ZL.toast(`Deleted “${removed.title}”`, {
    action: {
      label: "Undo",
      fn: () => {
        state.sets.splice(Math.min(idx, state.sets.length), 0, removed);
        state.activeId = prevActive;
        if (wasActive) resetSession();
        saveSets(true);
        renderAll();
        ZL.toast("Set restored");
      },
    },
  });
}

/* ------------------------------------------------------------ rename */

let renameId = null;
function openRename(id) {
  const set = state.sets.find((s) => s.id === id);
  if (!set) return;
  renameId = id;
  $("#renameInput").value = set.title;
  $("#renameError").hidden = true;
  $("#renameInput").removeAttribute("aria-invalid");
  $("#renameDialog").showModal();
  $("#renameInput").select();
}
$("#renameCancel").addEventListener("click", () => $("#renameDialog").close());
$("#renameForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#renameInput").value.replace(/\s+/g, " ").trim();
  if (!v) {
    $("#renameError").textContent = "Give the set a name, like \"Week 4: capacitors\".";
    $("#renameError").hidden = false;
    $("#renameInput").setAttribute("aria-invalid", "true");
    $("#renameInput").focus();
    return;
  }
  const set = state.sets.find((s) => s.id === renameId);
  if (set) { set.title = v.slice(0, 80); saveSets(true); renderAll(); ZL.toast(`Renamed to “${set.title}”`); }
  $("#renameDialog").close();
});

/* ------------------------------------------------------------ export menu */

const menu = $("#exportMenu");
let menuFor = null;
let menuAnchor = null;

function toggleMenu(anchor, setId) {
  if (!menu.hidden && menuAnchor === anchor) { closeMenu(true); return; }
  closeMenu(false);
  menuFor = setId;
  menuAnchor = anchor;
  menu.hidden = false;
  anchor.setAttribute("aria-expanded", "true");
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  let top = r.bottom + 6 + scrollY;
  if (r.bottom + h + 12 > innerHeight && r.top - h - 6 > 0) top = r.top - h - 6 + scrollY;
  const left = Math.min(Math.max(16, r.right - w), innerWidth - w - 16) + scrollX;
  menu.style.top = top + "px";
  menu.style.left = left + "px";
  $("button", menu).focus();
}
function closeMenu(refocus) {
  if (menu.hidden) return;
  menu.hidden = true;
  if (menuAnchor) { menuAnchor.setAttribute("aria-expanded", "false"); if (refocus) menuAnchor.focus(); }
  menuAnchor = null;
}
menu.addEventListener("click", (e) => {
  const b = e.target.closest("[data-export]");
  if (!b) return;
  const set = state.sets.find((s) => s.id === menuFor);
  closeMenu(true);
  if (set) exportSet(set, b.dataset.export);
});
menu.addEventListener("keydown", (e) => {
  const items = $$("button", menu);
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
  if (e.key === "Tab") closeMenu(false);
});
document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest("[aria-haspopup=menu]")) closeMenu(false); });
addEventListener("resize", () => closeMenu(false));
$("#setExport").addEventListener("click", (e) => { const s = activeSet(); if (s) toggleMenu(e.currentTarget, s.id); });

function exportSet(set, kind) {
  if (kind === "anki") {
    if (!set.cards.length) { ZL.toast("This set has no flashcards to export", { type: "bad" }); return; }
    download(`${slug(set.title)}-anki.txt`, toAnki(set), "text/plain");
    ZL.toast(`Exported ${plural(set.cards.length, "card")} for Anki`);
  } else {
    download(`${slug(set.title)}.md`, toMarkdown(set), "text/markdown");
    ZL.toast("Markdown file downloaded");
  }
}

/* ============================================================ settings */

const dlg = $("#settingsDialog");
function openSettings() {
  closeMenu(false);
  $("#keyInput").value = api.getKey();
  $("#keyInput").type = "password";
  $("#showKey").textContent = "Show";
  $("#showKey").setAttribute("aria-pressed", "false");
  $("#keyError").hidden = true;
  $("#keyInput").removeAttribute("aria-invalid");
  $("#modelSelect").innerHTML = api.MODELS.map((m) => `<option value="${m.id}" ${m.id === api.getModel() ? "selected" : ""}>${esc(m.label)}</option>`).join("");
  $("#forgetKey").disabled = !api.getKey();
  renderMode();
  dlg.showModal();
  if (route() !== "hosted") $("#keyInput").focus();
}
function keyError(msg) {
  $("#keyError").textContent = msg;
  $("#keyError").hidden = false;
  $("#keyInput").setAttribute("aria-invalid", "true");
  $("#keyInput").focus();
}
$("#modeBtn").addEventListener("click", openSettings);
$("#settingsBtn").addEventListener("click", openSettings);
$("#showKey").addEventListener("click", () => {
  const i = $("#keyInput");
  const show = i.type === "password";
  i.type = show ? "text" : "password";
  $("#showKey").textContent = show ? "Hide" : "Show";
  $("#showKey").setAttribute("aria-pressed", String(show));
});
$("#saveKey").addEventListener("click", () => {
  const v = $("#keyInput").value.trim();
  const had = api.getKey();
  const modelChanged = $("#modelSelect").value !== api.getModel();
  api.setModel($("#modelSelect").value);
  if (!v) {
    if (state.ai.hosted || had) { dlg.close(); ZL.toast(modelChanged ? "Settings saved" : "Nothing changed", { type: modelChanged ? "good" : "info" }); return; }
    keyError("Paste your Anthropic API key, or press Cancel to keep using the example.");
    return;
  }
  if (!api.looksLikeKey(v)) { keyError("That doesn't look like an Anthropic key. Keys start with sk-ant- and are about 100 characters long."); return; }
  api.setKey(v);
  dlg.close();
  renderMode();
  ZL.toast(v === had ? "Settings saved" : state.ai.hosted && !ZL.store.get("preferKey", false) ? "Key saved. The hosted AI is used first." : "Key saved. You can generate sets now.");
});
$("#keyInput").addEventListener("input", () => { $("#keyError").hidden = true; $("#keyInput").removeAttribute("aria-invalid"); });
$("#keyInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#saveKey").click(); } });
$("#forgetKey").addEventListener("click", () => {
  const old = api.getKey();
  if (!old) return;
  api.forgetKey();
  $("#keyInput").value = "";
  $("#forgetKey").disabled = true;
  renderMode();
  dlg.close();
  ZL.toast("Key forgotten on this device", { action: { label: "Undo", fn: () => { api.setKey(old); renderMode(); } } });
});
$("#preferKey").addEventListener("change", (e) => {
  ZL.store.set("preferKey", e.target.checked);
  renderMode();
  ZL.toast(e.target.checked ? "Using your key from now on" : "Using the hosted AI from now on");
});

/* ============================================================ global actions */

document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-action]");
  if (a) {
    if (a.dataset.action === "example") openExample();
    if (a.dataset.action === "settings") openSettings();
    return;
  }
  const rg = e.target.closest("[data-regen]");
  if (rg && !rg.disabled) { regenerate(rg.dataset.regen); return; }
  const act = e.target.closest("#study [data-act]");
  if (!act) return;
  const set = activeSet();
  if (act.dataset.act === "copy-summary" && set) {
    ZL.copy(summaryMarkdown(set)).then((ok) => ZL.toast(ok ? "Summary copied to clipboard" : "Couldn't copy. Select the text and copy it instead.", { type: ok ? "good" : "bad" }));
  }
  if (act.dataset.act === "clear-search") { state.termQuery = ""; renderTerms(); $("#termSearch").focus(); }
});

const REGEN_COPY = {
  summary: { title: "Rewrite the summary?", body: "Study Buddy will write a new summary from the same notes and replace this one.", ok: "Rewrite summary" },
  terms: { title: "Regenerate key terms?", body: "The current list of key terms will be replaced with a new one from the same notes.", ok: "Regenerate" },
  quiz: { title: "Write new questions?", body: "The quiz will be replaced with new questions from the same notes. Your best score is kept.", ok: "Write new questions" },
};
async function regenerate(part) {
  const set = activeSet();
  if (!set || state.running) return;
  const has = part === "summary" ? set.summary.sections.length : part === "terms" ? set.terms.length : part === "quiz" ? set.quiz.length : 0;
  if (has && REGEN_COPY[part]) {
    const c = REGEN_COPY[part];
    if (!(await ZL.confirm({ title: c.title, body: c.body, confirmLabel: c.ok }))) return;
  }
  generate(part, set.id);
}

/* ------------------------------------------------------------ keyboard */

function inView(node) {
  if (!node) return false;
  const r = node.getBoundingClientRect();
  return r.height > 0 && r.top < innerHeight && r.bottom > 0;
}

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector("dialog[open]") || document.querySelector(".zl-tour-card") || !menu.hidden) return;
  const t = e.target;
  if (t && t.closest && t.closest("input, textarea, select, [contenteditable=true]")) return;
  if (state.view !== "set" || state.running) return;
  if (!inView($("#studySet"))) return;
  const onOtherButton = t && t.closest && t.closest("button, a") && !t.closest("#flipCard, [role=tab]");
  if (state.tab === "cards") {
    const card = currentCard();
    // After a keyboard action, keep focus on the card so arrows move cards rather than tabs.
    const keepFocus = () => { const fc = $("#flipCard"); if (fc) fc.focus({ preventScroll: true }); };
    if (e.key === " " || e.code === "Space") {
      if (!card || onOtherButton) return;
      e.preventDefault();
      flipCard();
      keepFocus();
    } else if (/^[1-4]$/.test(e.key)) {
      if (!card) return;
      e.preventDefault();
      if (!state.cards.flipped) { $("#cardsLive").textContent = "Flip the card first: press Space."; return; }
      rateCard(Number(e.key));
      keepFocus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (!card) return;
      e.preventDefault();
      moveCard(e.key === "ArrowRight" ? 1 : -1);
      keepFocus();
    }
  } else if (state.tab === "quiz") {
    const set = activeSet();
    const run = set && set.quiz.length ? ensureRun(set) : null;
    if (!run || run.done) return;
    const answered = run.picks[run.order[run.pos]] !== undefined;
    const k = e.key.toLowerCase();
    if (!answered && /^[1-6]$/.test(k)) { e.preventDefault(); pickAnswer(Number(k) - 1); }
    else if (!answered && /^[a-f]$/.test(k)) { e.preventDefault(); pickAnswer(k.charCodeAt(0) - 97); }
    else if (answered && e.key === "Enter" && !onOtherButton) { e.preventDefault(); nextQuestion(); }
  }
});

/* ============================================================ tour + init */

const TOUR = [
  { el: "#composeForm", title: "Add your notes", body: "Paste lecture notes, or drop a PDF, .txt or .md file onto the box. Up to 30,000 characters per set." },
  { el: "#goBtn", title: "Generate a set", body: "Study Buddy writes a summary, key terms, a quiz and flashcards. The pill in the top bar shows whether the AI is ready, using your key, or in demo mode." },
  { el: "#tabs", title: "Four ways to study", body: "Switch between the summary, a searchable list of key terms, the quiz and your flashcards.", before: () => ensureTourSet("summary") },
  // Getters run when the tour reaches the step, so the tab is switched before the target is looked up.
  { get el() { ensureTourSet("quiz"); return $("#panel-quiz .sb-opts") || $("#panel-quiz .sb-ring-wrap") || $("#panel-quiz"); }, title: "Quiz yourself", body: "Answer with a click or the 1 to 4 keys. Each answer is explained, and at the end you can review or retry only the ones you missed." },
  { get el() { ensureTourSet("cards"); return $("#panel-cards .sb-card-stage") || $("#panel-cards"); }, title: "Spaced repetition", body: "Flip a card with Space, then rate it from Again to Easy with 1 to 4. Each card comes back right before you'd forget it." },
  { el: "#library", title: "Your library", body: "Every set is saved on this device with its due cards and best score. Rename it, export to Anki or Markdown, or delete it." },
];
function ensureTourSet(tab) {
  if (!activeSet()) {
    if (!state.sets.some((s) => s.id === EXAMPLE_ID)) { state.sets.unshift(makeExample()); saveSets(true); }
    state.activeId = state.sets[0].id;
    resetSession();
    renderAll();
  }
  if (state.view !== "set" && !state.running) showView("set");
  selectTab(tab);
}

function renderBentoTex() {
  const k = window.katex;
  $$("[data-tex]").forEach((n) => {
    if (!k) return;
    try { n.innerHTML = k.renderToString(n.dataset.tex, { displayMode: true, throwOnError: false, output: "htmlAndMathml" }); } catch { /* keep the plain fallback */ }
  });
}

loadState();
renderCompose();
showView(activeSet() ? "set" : "empty");
renderAll();
renderBentoTex();
initAi();
ZL.tour(TOUR);

// A small surface for the test suite and for curious people in the console.
window.SB = { state, srs, parseStudy, streamProgress, toAnki, toMarkdown, activeSet, route, api, openSet, rateCard, flipCard };
