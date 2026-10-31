// Small, safe renderer for model output: a little Markdown (paragraphs, lists,
// bold, italics, inline code, headings as plain bold lines) plus LaTeX maths
// through KaTeX. Everything is HTML-escaped first, so model output can never
// inject markup.

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const MATH_RE = new RegExp([
  String.raw`\$\$([\s\S]+?)\$\$`,          // $$ display $$
  String.raw`\\\[([\s\S]+?)\\\]`,           // \[ display \]
  String.raw`\\\(([\s\S]+?)\\\)`,           // \( inline \)
  String.raw`\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)`, // $inline$ (not "$5 and $10")
].join("|"), "g");

function renderTex(tex, display) {
  const k = typeof window !== "undefined" ? window.katex : undefined;
  if (k && typeof k.renderToString === "function") {
    try {
      return k.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", output: "htmlAndMathml" });
    } catch { /* fall through to plain text */ }
  }
  return `<span class="tex">${esc(display ? tex : tex)}</span>`;
}

function inlineMd(html) {
  return html
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\w)/g, "$1<em>$2</em>");
}

/**
 * Render text to HTML. With block = true, blank lines make paragraphs and
 * lines starting with "-", "*", "•" or "1." make lists.
 */
export function renderRich(text, block = false) {
  const maths = [];
  const src = String(text || "").replace(MATH_RE, (m, d1, d2, i1, i2) => {
    const display = d1 !== undefined || d2 !== undefined;
    const tex = (d1 ?? d2 ?? i1 ?? i2 ?? "").trim();
    maths.push({ tex, display });
    return `\u0000${maths.length - 1}\u0000`;
  });

  let html;
  if (!block) {
    html = inlineMd(esc(src));
  } else {
    const out = [];
    let list = null; // { tag, items }
    let para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${inlineMd(esc(para.join(" ")))}</p>`); para = []; } };
    const flushList = () => {
      if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineMd(esc(i))}</li>`).join("")}</${list.tag}>`); list = null; }
    };
    for (const rawLine of src.split(/\r?\n/)) {
      const line = rawLine.trim();
      const ul = line.match(/^[-*•]\s+(.*)$/);
      const ol = line.match(/^\d+[.)]\s+(.*)$/);
      const h = line.match(/^#{1,6}\s+(.*)$/);
      if (!line) { flushPara(); flushList(); continue; }
      if (ul || ol) {
        flushPara();
        const tag = ul ? "ul" : "ol";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push((ul || ol)[1]);
        continue;
      }
      if (h) { flushPara(); flushList(); out.push(`<p class="md-h">${inlineMd(esc(h[1]))}</p>`); continue; }
      if (list && /^\s{2,}/.test(rawLine)) { list.items[list.items.length - 1] += " " + line; continue; }
      flushList();
      para.push(line);
    }
    flushPara(); flushList();
    html = out.join("");
  }

  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => renderTex(maths[+i].tex, maths[+i].display));
}
