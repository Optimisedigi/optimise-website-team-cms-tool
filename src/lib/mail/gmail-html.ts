/**
 * Makes the Mail editor's HTML render the same in Gmail as in the CMS.
 *
 * The compose window styles tables with CSS classes (borders, padding, header
 * shading). Classes are stripped before sending (and Gmail ignores them), so
 * without this a table that looks ruled and padded in the CMS arrives as bare,
 * borderless text. Here the same look is written as inline styles on each
 * table, th and td, filling in only what the HTML does not already set, so
 * pasted tables (Sheets, Excel) keep their own formatting.
 */

/** Matches the compose window's table look (ComposeWindow.module.css). */
const CELL_BORDER = "1px solid #9aa0a6";
const HEADER_BACKGROUND = "#f1f3f4";

const TAG_RE = /<(table|th|td)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const STYLE_ATTR_RE = /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/i;

/** Split CSS declarations on `;`, ignoring semicolons inside quotes or parentheses. */
export function splitDeclarations(style: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const char of style) {
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === ";" && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function declarationProperty(declaration: string): string {
  return declaration.slice(0, Math.max(declaration.indexOf(":"), 0)).trim().toLowerCase();
}

/** Gmail's default body font: Verdana at "Normal", which Gmail writes as the keyword `small`. */
export const EMAIL_FONT_FAMILY = "Verdana,sans-serif";
export const EMAIL_FONT_SIZE = "small";

function defaultsFor(tag: string): Array<[string, string]> {
  // Font on the table too: some mail clients do not inherit body fonts into tables.
  if (tag === "table") {
    return [
      ["border-collapse", "collapse"],
      ["font-family", EMAIL_FONT_FAMILY],
      ["font-size", EMAIL_FONT_SIZE],
    ];
  }
  const cell: Array<[string, string]> = [
    ["border", CELL_BORDER],
    ["padding", "4px 8px"],
    ["vertical-align", "top"],
  ];
  if (tag === "th") {
    return [...cell, ["background-color", HEADER_BACKGROUND], ["font-weight", "700"], ["text-align", "left"]];
  }
  return cell;
}

function withDefaults(tag: string, attrs: string): string {
  const match = attrs.match(STYLE_ATTR_RE);
  const existing = splitDeclarations(match?.[2] ?? match?.[3] ?? "");
  const props = existing.map(declarationProperty);
  // A side-specific border or padding means the author styled it; do not stack a shorthand on top.
  const has = (prop: string) => props.some((p) => p === prop || p.startsWith(`${prop}-`));
  const added = defaultsFor(tag)
    .filter(([prop]) => !has(prop))
    .map(([prop, value]) => `${prop}:${value}`);
  const style = [...existing, ...added].join(";");

  let next = attrs;
  if (match) {
    const quote = match[2] !== undefined ? '"' : "'";
    next = attrs.replace(STYLE_ATTR_RE, `${match[1]}${quote}${style}${quote}`);
  } else if (style) {
    next = `${attrs} style="${style}"`;
  }
  // Older mail clients read spacing from the attribute, not CSS.
  if (tag === "table" && !/\scellspacing\s*=/i.test(next)) next += ' cellspacing="0"';
  return next;
}

const OPEN_TAG_RE = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const FONT_PROPERTIES = new Set(["font", "font-family", "font-size"]);

/**
 * The compose body has one font: Verdana, Normal, set once on the wrapper by
 * formatGmailDraftHtml. Any font or size inside the body (pasted, or from an
 * older draft) is removed so nothing overrides it; colour, weight and the
 * rest are kept. CSS custom properties (Lexical's list-marker variables) are
 * dropped too, as mail clients ignore them.
 */
export function stripEmailFonts(html: string): string {
  return html.replace(OPEN_TAG_RE, (tag: string, name: string, attrs: string) => {
    let next = name.toLowerCase() === "font" ? attrs.replace(/\s(?:face|size)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "") : attrs;
    const match = next.match(STYLE_ATTR_RE);
    if (match) {
      const declarations = splitDeclarations(match[2] ?? match[3] ?? "");
      const kept = declarations.filter((declaration) => {
        const prop = declarationProperty(declaration);
        return !FONT_PROPERTIES.has(prop) && !prop.startsWith("--");
      });
      if (kept.length !== declarations.length) {
        const quote = match[2] !== undefined ? '"' : "'";
        next = kept.length > 0 ? next.replace(STYLE_ATTR_RE, () => `${match[1]}${quote}${kept.join(";")}${quote}`) : next.replace(STYLE_ATTR_RE, "");
      }
    }
    return next === attrs ? tag : `<${name}${next}>`;
  });
}

const LIST_TAG_RE = /<(\/?)(ul|ol|li)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

function addStyleDefaults(attrs: string, defaults: Array<[string, string]>): string {
  const match = attrs.match(STYLE_ATTR_RE);
  const existing = splitDeclarations(match?.[2] ?? match?.[3] ?? "");
  const props = existing.map(declarationProperty);
  const added = defaults.filter(([prop]) => !props.some((p) => p === prop)).map(([prop, value]) => `${prop}:${value}`);
  if (added.length === 0) return attrs;
  const style = [...existing, ...added].join(";");
  if (!match) return `${attrs} style="${style}"`;
  const quote = match[2] !== undefined ? '"' : "'";
  return attrs.replace(STYLE_ATTR_RE, () => `${match[1]}${quote}${style}${quote}`);
}

/**
 * Lists as the compose editor shows them (its CSS never reaches Gmail):
 * markers on, a small indent (22px list + 12px item, so the bullet sits just
 * inside the text edge, as in Gmail) and a slight gap above and below a
 * top-level list. Nested lists get no gap. Values the HTML already sets are kept.
 */
export function inlineEmailListStyles(html: string): string {
  if (!/<(ul|ol)\b/i.test(html)) return html;
  let depth = 0;
  return html.replace(LIST_TAG_RE, (tag: string, closing: string, name: string, attrs: string) => {
    const lower = name.toLowerCase();
    if (closing) {
      if (lower !== "li") depth = Math.max(0, depth - 1);
      return tag;
    }
    if (lower === "li") {
      return `<li${addStyleDefaults(attrs, [
        ["margin-left", "12px"],
        ["padding-left", "2px"],
      ])}>`;
    }
    const gap = depth === 0 ? "6px" : "0";
    depth++;
    return `<${lower}${addStyleDefaults(attrs, [
      ["margin-top", gap],
      ["margin-bottom", gap],
      ["padding-left", "22px"],
      ["list-style-type", lower === "ol" ? (depth > 1 ? "lower-alpha" : "decimal") : depth > 1 ? "circle" : "disc"],
    ])}>`;
  });
}

const PARAGRAPH_OR_TABLE_TAG_RE = /<(\/?)(p|table)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/**
 * Each paragraph in the compose editor is one line (Enter starts a new line,
 * with no gap; an empty paragraph is a blank line), like Gmail's own editor.
 * Gmail writes those lines as <div>s, so the editor's paragraphs are sent the
 * same way. Left as <p>, formatGmailDraftHtml would add a blank line after
 * each one, so every Enter showed up as a double line break.
 * Paragraphs inside table cells are left to formatGmailDraftHtml, which joins
 * them with single line breaks.
 */
export function editorParagraphsToGmailLines(html: string): string {
  if (!/<p\b/i.test(html)) return html;
  let tableDepth = 0;
  return html.replace(PARAGRAPH_OR_TABLE_TAG_RE, (tag: string, closing: string, name: string, attrs: string) => {
    if (name.toLowerCase() === "table") {
      tableDepth = closing ? Math.max(0, tableDepth - 1) : tableDepth + 1;
      return tag;
    }
    if (tableDepth > 0) return tag;
    return closing ? "</div>" : `<div${attrs}>`;
  });
}

export function inlineEmailTableStyles(html: string): string {
  if (!/<(table|th|td)\b/i.test(html)) return html;
  return html
    .replace(/<colgroup\b[\s\S]*?<\/colgroup\s*>/gi, "")
    .replace(TAG_RE, (_match, tag: string, attrs: string) => `<${tag.toLowerCase()}${withDefaults(tag.toLowerCase(), attrs)}>`);
}
