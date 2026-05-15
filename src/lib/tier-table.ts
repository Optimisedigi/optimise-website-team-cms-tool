/**
 * Tier-table parser for the Annual Review & Tier Adjustment section.
 *
 * Accepts a multi-line string copy-pasted from Excel / Google Sheets and
 * parses it into a structured table (headers + body rows). The format is
 * intentionally permissive:
 *
 *   - Lines separated by \r?\n.
 *   - Cells within a line separated by tabs (\t) OR two-or-more whitespace
 *     characters (handles the common case of pasting from a PDF or a sheet
 *     that uses spaces).
 *   - Leading/trailing whitespace on each line and each cell is trimmed.
 *   - Empty lines are skipped.
 *   - The first non-empty line becomes the header row. Subsequent lines
 *     become body rows.
 *   - All rows are padded with empty strings to the column count of the
 *     header (so jagged input still renders as a clean grid).
 *
 * Returns `null` when input is empty/whitespace only, or has no body rows.
 */
export type TierTable = {
  headers: string[];
  rows: string[][];
};

const CELL_SEPARATOR = /\t+|[ \u00a0]{2,}/;

export function parseTierTable(input: string | null | undefined): TierTable | null {
  if (!input || typeof input !== "string") return null;

  const lines = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, "").trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return null;

  const splitLine = (line: string): string[] =>
    line
      .split(CELL_SEPARATOR)
      .map((cell) => cell.trim())
      .filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ""));

  const headers = splitLine(lines[0]!);
  if (headers.length === 0) return null;

  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitLine(lines[i]!);
    if (cells.length === 0) continue;
    // Pad short rows with empty cells; truncate over-long rows.
    if (cells.length < headers.length) {
      while (cells.length < headers.length) cells.push("");
    } else if (cells.length > headers.length) {
      cells.length = headers.length;
    }
    rows.push(cells);
  }

  if (rows.length === 0) return null;

  return { headers, rows };
}

/**
 * Default boilerplate copy for the Annual Review & Tier Adjustment section.
 * These are seeded as defaults on new contracts when the toggle is enabled.
 * Stored as plain text — rich-text fields accept this on read but render as
 * paragraphs; the user can format inside the Lexical editor afterwards.
 */
export const ANNUAL_REVIEW_DEFAULTS = {
  intro:
    "As account scale grows, so does the operational complexity required to manage it — including campaign architecture, reporting cadence, stakeholder management, and strategic input. The tier structure below reflects this scope, using trailing three (3) month average monthly media spend as the agreed proxy for account scale.\n\nFrom the first anniversary of the commencement date and at each subsequent anniversary, the retainer will be reviewed and may be adjusted in accordance with the following tiers:",
  tierTable: [
    "Trailing 3-month avg. monthly spend (AUD)\tMonthly retainer (AUD)",
    "Up to $60,000\t$4,800 (base)",
    "$60,001 – $80,000\t$5,520",
    "$80,001 – $100,000\t$6,240",
    "$100,001 – $125,000\t$6,960",
    "$125,001 and above\tBy written agreement, minimum $7,680",
  ].join("\n"),
  // The h4 heading ("Good Faith Review" / "Acceptance of Adjustment") is
  // emitted by the section renderers — default copy is body-only.
  goodFaithReview:
    "At each annual review, both parties will discuss overall account performance, strategic direction, and any material changes in circumstances in good faith. Where exceptional circumstances exist, the parties may agree in writing to defer, modify, or waive a scheduled tier adjustment. Any such agreement does not affect the application of future scheduled reviews.",
  acceptanceOfAdjustment:
    "Either party may terminate this Agreement by giving sixty (60) days' written notice following receipt of an adjustment notice, should the revised retainer not be accepted.",
  noticeParagraph:
    "The Agency will provide the Client with no less than sixty (60) days' written notice before any adjustment takes effect. Adjustments apply prospectively only and remain in force until the next annual review, regardless of spend fluctuations between reviews.",
} as const;
