// SM-2-lite spaced repetition. Days are whole local calendar days, so a card
// rated Good tonight comes back tomorrow, not in exactly 24 hours.
//
// Ratings: 1 Again, 2 Hard, 3 Good, 4 Easy.
//   Again  relearn: due again today, ease drops 0.2, streak resets.
//   Hard   short step: 1 day for a new card, otherwise interval x 1.2, ease drops 0.15.
//   Good   1 day, then 3 days, then interval x ease.
//   Easy   4 days for a new card, otherwise interval x ease x 1.3, ease rises 0.15.

export const MIN_EASE = 1.3;
export const START_EASE = 2.5;
export const KNOWN_DAYS = 7;
export const RATINGS = [
  { id: 1, key: "again", label: "Again" },
  { id: 2, key: "hard", label: "Hard" },
  { id: 3, key: "good", label: "Good" },
  { id: 4, key: "easy", label: "Easy" },
];

/** Today's local day number (days since 1970-01-01 in local time). */
export function today(now = Date.now()) {
  const d = new Date(now);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

export function newSrs(day = today()) {
  return { reps: 0, ease: START_EASE, interval: 0, due: day, lapses: 0, last: null };
}

function round2(x) { return Math.round(x * 100) / 100; }

/** Days until the card comes back for a rating, without changing anything. */
export function nextInterval(srs, rating) {
  const s = srs || newSrs();
  const r = Number(rating);
  if (r === 1) return 0;
  if (r === 2) return s.reps === 0 ? 1 : Math.max(s.interval + 1, Math.round(s.interval * 1.2));
  const good = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
  if (r === 3) return good;
  return s.reps === 0 ? 4 : Math.max(good + 1, Math.round(Math.max(s.interval, 1) * s.ease * 1.3));
}

/** Return the card's new schedule after a rating on a given day. */
export function schedule(srs, rating, day = today()) {
  const s = { ...newSrs(day), ...(srs || {}) };
  const r = Number(rating);
  if (![1, 2, 3, 4].includes(r)) throw new Error("Rating must be 1 to 4");
  const interval = nextInterval(s, r);
  if (r === 1) {
    return { ...s, reps: 0, interval: 0, due: day, lapses: s.lapses + (s.reps > 0 ? 1 : 0), ease: round2(Math.max(MIN_EASE, s.ease - 0.2)), last: day };
  }
  const ease = r === 2 ? Math.max(MIN_EASE, s.ease - 0.15) : r === 4 ? s.ease + 0.15 : s.ease;
  return { ...s, reps: s.reps + 1, interval, due: day + interval, ease: round2(ease), last: day };
}

export function isDue(card, day = today()) {
  const s = card && card.srs;
  return !s || s.due <= day;
}

/** "new" (never rated), "learning" (short interval) or "known" (a week or more). */
export function stage(card) {
  const s = card && card.srs;
  if (!s || s.last == null) return "new";
  return s.interval >= KNOWN_DAYS ? "known" : "learning";
}

export function counts(cards, day = today()) {
  const c = { total: 0, due: 0, new: 0, learning: 0, known: 0 };
  for (const card of cards || []) {
    c.total++;
    c[stage(card)]++;
    if (isDue(card, day)) c.due++;
  }
  return c;
}

/** The soonest future due day, or null when nothing is scheduled ahead. */
export function nextDue(cards, day = today()) {
  let best = null;
  for (const card of cards || []) {
    const d = card.srs ? card.srs.due : day;
    if (d > day && (best === null || d < best)) best = d;
  }
  return best;
}

/** Short label for a button: "Today", "1 day", "3 days", "2 wk", "1.5 mo". */
export function formatInterval(days) {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} wk`;
  if (days < 365) return `${Math.round(days / 3.04) / 10} mo`;
  return `${Math.round(days / 36.5) / 10} yr`;
}

/** "today", "tomorrow", "in 3 days", or a date. */
export function formatDue(due, day = today()) {
  const d = due - day;
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 14) return `in ${d} days`;
  const date = new Date(due * 86400000);
  return "on " + date.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}
