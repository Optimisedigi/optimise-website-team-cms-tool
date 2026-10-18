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

function defaultsFor(tag: string): Array<[string, string]> {
  if (tag === "table") return [["border-collapse", "collapse"]];
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

export function inlineEmailTableStyles(html: string): string {
  if (!/<(table|th|td)\b/i.test(html)) return html;
  return html
    .replace(/<colgroup\b[\s\S]*?<\/colgroup\s*>/gi, "")
    .replace(TAG_RE, (_match, tag: string, attrs: string) => `<${tag.toLowerCase()}${withDefaults(tag.toLowerCase(), attrs)}>`);
}
