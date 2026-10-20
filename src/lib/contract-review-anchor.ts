/**
 * Anchors draft-review comments to contract text without changing the DOM.
 *
 * A comment stores the exact quoted text plus which occurrence of that text
 * it refers to (0 = first) within the review root. On reload we search the
 * root's text again and rebuild a Range, which the page paints with the CSS
 * Custom Highlight API. If the draft wording has since changed and the quote
 * is gone, the comment simply isn't highlighted; it still shows in the list.
 */

export type ReviewAnchor = { quote: string; occurrence: number; section: string };

type TextIndex = { text: string; nodes: Array<{ node: Text; start: number }> };

function indexText(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextIndex["nodes"] = [];
  let text = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    nodes.push({ node: t, start: text.length });
    text += t.data;
  }
  return { text, nodes };
}

/** Character offset of a DOM boundary point within the root's text. */
function offsetWithin(root: Node, container: Node, offset: number): number {
  const doc = root.ownerDocument ?? (root as Document);
  const range = doc.createRange();
  range.setStart(root, 0);
  range.setEnd(container, offset);
  return range.toString().length;
}

function nthIndexOf(haystack: string, needle: string, n: number): number {
  let idx = -1;
  for (let i = 0; i <= n; i++) {
    idx = haystack.indexOf(needle, idx + 1);
    if (idx === -1) return -1;
  }
  return idx;
}

/** Nearest heading before the selection, for context in the email and CMS. */
function sectionFor(root: Element, node: Node): string {
  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4"));
  let section = "";
  for (const h of headings) {
    if (h === node || h.contains(node)) return (h.textContent ?? "").trim().replace(/:$/, "");
    if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) {
      section = (h.textContent ?? "").trim().replace(/:$/, "");
    }
  }
  return section;
}

/**
 * Turn a user selection into a storable anchor. Returns null when the
 * selection is empty, whitespace only, or outside the root.
 */
export function anchorFromRange(root: Element, range: Range): ReviewAnchor | null {
  if (range.collapsed) return null;
  if (!root.contains(range.commonAncestorContainer)) return null;
  const raw = range.toString();
  const quote = raw.trim();
  if (!quote) return null;

  const { text } = indexText(root);
  const start = offsetWithin(root, range.startContainer, range.startOffset) + (raw.length - raw.trimStart().length);

  let occurrence = 0;
  for (let idx = text.indexOf(quote); idx !== -1 && idx < start; idx = text.indexOf(quote, idx + 1)) {
    occurrence++;
  }
  // The selection itself is a match at `start`; anything earlier was counted.
  if (text.indexOf(quote, start) !== start) occurrence = 0;

  return { quote, occurrence, section: sectionFor(root, range.startContainer) };
}

/** Rebuild a Range for a stored anchor, or null if the text is no longer there. */
export function rangeFromAnchor(root: Element, quote: string, occurrence: number): Range | null {
  if (!quote) return null;
  const { text, nodes } = indexText(root);
  let start = nthIndexOf(text, quote, Math.max(0, occurrence));
  if (start === -1) start = text.indexOf(quote);
  if (start === -1) return null;
  const end = start + quote.length;

  const locate = (pos: number, preferNext: boolean): { node: Text; offset: number } | null => {
    for (let i = 0; i < nodes.length; i++) {
      const entry = nodes[i];
      if (!entry) continue;
      const nodeEnd = entry.start + entry.node.data.length;
      const inside = preferNext ? pos >= entry.start && pos < nodeEnd : pos > entry.start && pos <= nodeEnd;
      if (inside) return { node: entry.node, offset: pos - entry.start };
    }
    return null;
  };

  const s = locate(start, true);
  const e = locate(end, false);
  if (!s || !e) return null;
  const doc = root.ownerDocument;
  const range = doc.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  return range;
}
