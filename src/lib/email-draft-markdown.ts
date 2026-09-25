const escapeHtml = (s: string): string => s
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const formatInline = (s: string): string => escapeHtml(s)
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-family:ui-monospace,Menlo,Consolas,monospace;">$1</code>');

/** Split only unescaped delimiters. A literal pipe in a cell is written as \\|. */
function cells(line: string): string[] {
  const value = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function renderTableAt(lines: string[], start: number): { html: string; end: number } | null {
  const line = (lines[start] ?? "").replace(/\r$/, "");
  if (!line.includes("|") || start + 1 >= lines.length) return null;
  const header = cells(line);
  const separator = cells(lines[start + 1] ?? "");
  if (header.length < 2 || separator.length !== header.length || !separator.every((part) => /^:?-{3,}:?$/.test(part))) return null;

  const rows: string[] = [];
  let end = start + 2;
  while (end < lines.length) {
    const next = (lines[end] ?? "").replace(/\r$/, "");
    if (!next.trim() || !next.includes("|")) break;
    const row = cells(next);
    if (row.length !== header.length) break;
    rows.push(`<tr>${row.map((cell) => `<td style="border:1px solid #000;padding:6px 10px;color:#000;">${formatInline(cell)}</td>`).join("")}</tr>`);
    end++;
  }
  return {
    html: '<table style="border-collapse:collapse;border:1px solid #000;font-family:Arial,Helvetica,sans-serif;font-size:14px;">'
      + `<thead><tr>${header.map((cell) => `<th scope="col" style="border:1px solid #000;background-color:#dbeafe;color:#000;font-weight:700;padding:6px 10px;text-align:left;">${formatInline(cell)}</th>`).join("")}</tr></thead>`
      + `<tbody>${rows.join("")}</tbody></table>`,
    end,
  };
}

/** Render the small, escaped markdown subset used by OptiMate Gmail drafts. */
export function markdownLiteToHtml(input: string): string {
  const lines = input.split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const closeList = (): void => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\r$/, "");
    const table = renderTableAt(lines, i);
    if (table) {
      closeList();
      out.push(table.html);
      i = table.end - 1;
      continue;
    }
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    const numberedMatch = line.match(/^\d+\.\s+(.+)/);
    if (bulletMatch) {
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${formatInline(bulletMatch[1] ?? "")}</li>`);
    } else if (numberedMatch) {
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${formatInline(numberedMatch[1] ?? "")}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${formatInline(line)}</p>`);
    }
  }
  closeList();
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">${out.join("")}</div>`;
}

/** Preserve existing report HTML while converting standalone markdown tables in drafts. */
export function renderDraftTableIfPresent(body: string): string {
  const lines = body.split("\n");
  let hasTable = false;
  const converted: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const table = renderTableAt(lines, i);
    if (table) {
      hasTable = true;
      converted.push(table.html);
      i = table.end - 1;
    } else {
      converted.push(lines[i] ?? "");
    }
  }
  if (!hasTable) return body;
  // Existing report markup already comes from a renderer. Keep it byte-for-byte;
  // only replace table blocks, rather than escaping or restyling the report.
  if (/<(?:div|table|p|section|html|body|br|span|h[1-6])\b/i.test(body)) return converted.join("\n");
  return markdownLiteToHtml(body);
}
