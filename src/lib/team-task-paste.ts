import { escapeHtml } from "@/lib/html-escape";
import { safeLinkHref } from "@/lib/rich-text-links";

/** Colour every pasted word gets in team task notes and instructions. */
export const TEAM_TASK_PASTE_COLOR = "#000000";

const LINK_STYLE = "color:#2563eb;text-decoration:underline;";
const BLOCK_TAGS = new Set(["P", "DIV", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TR"]);
const SIMPLE_TAGS: Record<string, string> = {
  B: "b",
  STRONG: "strong",
  I: "i",
  EM: "em",
  U: "u",
  S: "s",
  STRIKE: "s",
  DEL: "s",
};
// Whole subtrees that never become note content.
const DROPPED_TAGS = new Set(["SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "SVG", "IMG", "VIDEO", "AUDIO", "CANVAS", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);

function blackText(text: string): string {
  return text ? `<span style="color:${TEAM_TASK_PASTE_COLOR}">${escapeHtml(text)}</span>` : "";
}

/** Bold / italic / underline set by inline style (Google Docs pastes them on spans). */
function styleFormats(el: HTMLElement): { bold: boolean; italic: boolean; underline: boolean; notBold: boolean } {
  const weight = el.style.fontWeight;
  const numeric = Number(weight);
  return {
    bold: weight === "bold" || weight === "bolder" || (Number.isFinite(numeric) && numeric >= 600),
    // Docs wraps the whole paste in <b style="font-weight:normal">; that must not bold everything.
    notBold: weight === "normal" || (Number.isFinite(numeric) && numeric > 0 && numeric < 600),
    italic: el.style.fontStyle === "italic",
    underline: /underline/.test(el.style.textDecoration || el.style.textDecorationLine || ""),
  };
}

function convertChildren(node: Node, insideLink: boolean): string {
  let out = "";
  node.childNodes.forEach((child) => {
    out += convertNode(child, insideLink);
  });
  return out;
}

function convertNode(node: Node, insideLink: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    // Links keep their own blue; everything else is forced black.
    return insideLink ? escapeHtml(text) : blackText(text);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (DROPPED_TAGS.has(tag)) return "";
  if (tag === "BR") return "<br />";

  if (tag === "A") {
    const href = safeLinkHref(el.getAttribute("href") ?? "");
    const inner = convertChildren(el, href !== null);
    return href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener" style="${LINK_STYLE}">${inner}</a>`
      : inner;
  }

  const formats = styleFormats(el);
  let inner = convertChildren(el, insideLink);
  if (formats.underline) inner = `<u>${inner}</u>`;
  if (formats.italic) inner = `<i>${inner}</i>`;
  if (formats.bold) inner = `<b>${inner}</b>`;

  const simple = SIMPLE_TAGS[tag];
  if (simple) {
    if ((tag === "B" || tag === "STRONG") && formats.notBold) return inner;
    return `<${simple}>${inner}</${simple}>`;
  }
  if (tag === "UL" || tag === "OL" || tag === "LI" || tag === "P") {
    const name = tag.toLowerCase();
    return `<${name}>${inner}</${name}>`;
  }
  if (BLOCK_TAGS.has(tag)) return `<div>${inner}</div>`;
  if (tag === "TD" || tag === "TH") return `${inner} `;
  // Spans, fonts, and anything unknown: keep the content, drop the element and its styles.
  return inner;
}

/**
 * Clipboard content as note HTML: bold, italic, underline, lists, line breaks
 * and safe links are kept; every word is set in black, whatever colour it was
 * copied in (white text from a dark app stayed invisible otherwise). Fonts,
 * sizes, highlights, images and any other markup are dropped, so nothing
 * unsafe reaches the stored HTML.
 */
export function pastedHtmlInBlack(data: { html: string; text: string }): string {
  if (data.html.trim()) {
    const doc = new DOMParser().parseFromString(data.html, "text/html");
    return convertChildren(doc.body, false);
  }
  const lines = data.text.replace(/\r\n?/g, "\n").split("\n");
  return lines.map(blackText).join("<br />");
}

/** Insert HTML at the caret (execCommand keeps undo; falls back to a range insert). */
function insertHtmlAtCursor(html: string): void {
  if (typeof document.execCommand === "function" && document.execCommand("insertHTML", false, html)) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/**
 * onPaste for the team task rich text boxes: pasted text always lands in black.
 * Pastes with no text (e.g. only an image file) are left to the browser.
 */
export function handleTeamTaskPaste(event: {
  clipboardData: Pick<DataTransfer, "getData"> | null;
  preventDefault: () => void;
}): void {
  const data = event.clipboardData;
  if (!data) return;
  const html = data.getData("text/html");
  const text = data.getData("text/plain");
  if (!html.trim() && !text) return;
  event.preventDefault();
  insertHtmlAtCursor(pastedHtmlInBlack({ html, text }));
}
