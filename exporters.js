// Export a study set to Anki (tab-separated text) or Markdown, and download files.

const clean = (s) => String(s || "").replace(/\t/g, " ").replace(/\r/g, "");

export function slug(title) {
  return String(title || "study-set").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "study-set";
}

function escHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** One Anki field: HTML-escaped, $..$ maths turned into Anki's MathJax \( \) and \[ \], newlines as <br>. */
export function ankiField(text) {
  const maths = [];
  let s = clean(text).replace(/\$\$([\s\S]+?)\$\$|\$(?!\s)((?:\\\$|[^$\n])+?)\$/g, (m, d, i) => {
    maths.push(d !== undefined ? `\\[${d.trim()}\\]` : `\\(${i.trim()}\\)`);
    return `\u0000${maths.length - 1}\u0000`;
  });
  s = escHtml(s)
    .replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, k) => escHtml(maths[+k]));
}

/** Anki import file: headers tell Anki the separator, that fields are HTML, and the deck name. */
export function toAnki(set) {
  const deck = clean(set.title || "Study Buddy").replace(/\n/g, " ").replace(/::/g, " ");
  const lines = [
    "#separator:tab",
    "#html:true",
    "#notetype:Basic",
    `#deck:Study Buddy::${deck}`,
    "#tags column:3",
  ];
  const tag = "study-buddy " + slug(set.title);
  for (const c of set.cards || []) lines.push(`${ankiField(c.front)}\t${ankiField(c.back)}\t${tag}`);
  return lines.join("\n") + "\n";
}

export function toMarkdown(set) {
  const out = [`# ${set.title || "Study set"}`, ""];
  const created = set.createdAt ? new Date(set.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";
  if (created) out.push(`_Made with Study Buddy on ${created}_`, "");
  const sm = set.summary || { sections: [] };
  if (sm.overview || sm.sections.length) {
    out.push("## Summary", "");
    if (sm.overview) out.push(sm.overview, "");
    for (const sec of sm.sections) {
      out.push(`### ${sec.heading}`, "");
      for (const p of sec.points) out.push(`- ${p}`);
      out.push("");
    }
  }
  if (set.terms && set.terms.length) {
    out.push("## Key terms", "");
    for (const t of set.terms) out.push(`- **${t.term}:** ${t.definition}`);
    out.push("");
  }
  if (set.quiz && set.quiz.length) {
    out.push("## Quiz", "");
    set.quiz.forEach((q, i) => {
      out.push(`${i + 1}. ${q.question}`);
      q.options.forEach((o, j) => out.push(`   - ${String.fromCharCode(65 + j)}. ${o}${j === q.answer ? " ✓" : ""}`));
      if (q.explanation) out.push(`   - _${q.explanation}_`);
      out.push("");
    });
  }
  if (set.cards && set.cards.length) {
    out.push("## Flashcards", "", "| Front | Back |", "| --- | --- |");
    const cell = (s) => clean(s).replace(/\n/g, " ").replace(/\|/g, "\\|");
    for (const c of set.cards) out.push(`| ${cell(c.front)} | ${cell(c.back)} |`);
    out.push("");
  }
  return out.join("\n");
}

export function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
