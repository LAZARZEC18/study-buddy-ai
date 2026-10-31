// Read notes from .txt, .md and .pdf files, entirely in the browser.
// PDFs use pdf.js from cdnjs, loaded only the first time someone opens one.

export const PDFJS_VERSION = "3.11.174";
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
export const ACCEPT = ".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf";
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

export class FileError extends Error {}

let pdfjsPromise = null;
export function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${PDFJS_BASE}/pdf.min.js`;
    s.crossOrigin = "anonymous";
    s.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) { reject(new FileError("The PDF reader didn't load. Check your connection and try again.")); return; }
      // The worker lives on the CDN too; pdf.js wraps a cross-origin worker URL itself.
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      resolve(lib);
    };
    s.onerror = () => { pdfjsPromise = null; s.remove(); reject(new FileError("The PDF reader couldn't be downloaded. Check your connection and try again.")); };
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

function kindOf(file) {
  const name = (file.name || "").toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/\.(txt|md|markdown|text)$/.test(name) || /^text\//.test(file.type)) return "text";
  return "";
}

/** Join pdf.js text items into readable lines. */
export function joinTextItems(items) {
  let out = "";
  for (const it of items) {
    if (typeof it.str !== "string") continue;
    out += it.str;
    out += it.hasEOL ? "\n" : (it.str && !/\s$/.test(it.str) ? " " : "");
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractPdfText(data, onProgress) {
  const lib = await loadPdfJs();
  let doc;
  try {
    doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
  } catch (e) {
    if (e && e.name === "PasswordException") throw new FileError("This PDF is password protected. Remove the password, or copy the text out and paste it.");
    throw new FileError("This file couldn't be read as a PDF. It may be damaged; try exporting it again.");
  }
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    if (onProgress) onProgress(i, doc.numPages);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(joinTextItems(tc.items));
    page.cleanup();
  }
  const text = pages.filter(Boolean).join("\n\n").trim();
  const numPages = doc.numPages;
  doc.destroy();
  if (!text) throw new FileError("This PDF has no selectable text, so it's probably a scan. Use a PDF with real text, or paste the notes in.");
  return { text, pages: numPages };
}

/** Read a dropped or chosen file. Resolves { name, kind, text, pages? }. */
export async function readNotesFile(file, onProgress) {
  const kind = kindOf(file);
  if (!kind) throw new FileError(`"${file.name}" isn't a supported file. Use a PDF, .txt or .md file.`);
  if (kind === "pdf") {
    if (file.size > MAX_PDF_BYTES) throw new FileError("That PDF is over 30 MB. Split it, or export just the lecture you need.");
    const { text, pages } = await extractPdfText(new Uint8Array(await file.arrayBuffer()), onProgress);
    return { name: file.name, kind, text, pages };
  }
  if (file.size > MAX_TEXT_BYTES) throw new FileError("That file is over 2 MB. Paste one lecture at a time.");
  const text = (await file.text()).replace(/\r\n?/g, "\n").replace(/^﻿/, "").trim();
  if (!text) throw new FileError(`"${file.name}" is empty.`);
  return { name: file.name, kind, text };
}
