/**
 * Canonical Gmail-ready renderer for the weekly metric table.
 *
 * Generalises the legacy "Weekly Performance Trend" block (spend / conversions
 * / CPA only) into a multi-metric table covering every account-level Google
 * Ads metric the user might ask for week-by-week. Used by the
 * `get_weekly_metric_table` OptiMate tool (and re-exported as the legacy
 * `get_weekly_trend_note` shim).
 *
 * Hard rules (do NOT drift from these):
 *
 *   - Font: Verdana, sans-serif. Body 13px (Gmail "Normal"); heading 14px bold.
 *   - Colour: #222 (Gmail body black). No blue body text, no card chrome.
 *   - Heading: bold "Weekly Performance Trend" row above the table (or a
 *     caller-supplied `title`).
 *   - Table: plain row borders, no header background, no border-radius,
 *     no `background:#f1f5f9` header bar, no coloured callout cards.
 *   - CPA cell coloured on EVERY row by absolute threshold:
 *       <  $100 -> #059669 (green)
 *       <= $300 -> #d97706 (amber)   (the $100 and $300 boundaries are amber)
 *       >  $300 -> #dc2626 (red)
 *     null (no conversions) renders as a dash, no colour.
 *     No other metric gets absolute-threshold colouring; the agency does not
 *     have canonical bands for CPC / CTR / conv_rate / etc. across clients.
 *   - With `compare: "wow"` each metric column is followed by a "delta vs
 *     prev" column. Direction-aware colouring per metric: for cost-shaped
 *     metrics (spend / cpa / cpc) a *decrease* is green and *increase* is
 *     red; for volume-shaped metrics (clicks / impressions / conversions /
 *     ctr / conv_rate) it's the reverse. First row renders "-" (no prev).
 *     prev === 0 also renders "-" (no well-defined percent change from zero).
 *   - Highlight row: ONLY the latest row, and ONLY when it is a partial
 *     in-progress week. Light green background #f0fdf4 + bold cells. The
 *     CPA cell keeps its threshold colour and stays bold; delta cells keep
 *     their direction-aware colour on top of the highlight bg.
 *   - Labels use ASCII hyphen "-" (no em / en dashes anywhere - soul rule).
 *
 * Practical Gmail width sweet spot: 4 metrics with `compare: "wow"` (9
 * columns including Week). The tool layer caps `metrics` at 6 and surfaces
 * a soft warning when total columns exceed 10.
 *
 * NO React, NO Payload, NO browser-only globals. Pure TS. Date math is UTC
 * to avoid timezone drift; the module never reads `Date.now()` - `endDate`
 * is the only time anchor a caller has to supply.
 */

/** All metrics the weekly table supports. */
export type WeeklyMetricKey =
  | "spend"
  | "clicks"
  | "impressions"
  | "conversions"
  | "cpa"
  | "cpc"
  | "ctr"
  | "conv_rate";

/** All valid keys in declaration order, used by the tool layer for validation. */
export const WEEKLY_METRIC_KEYS: readonly WeeklyMetricKey[] = [
  "spend",
  "clicks",
  "impressions",
  "conversions",
  "cpa",
  "cpc",
  "ctr",
  "conv_rate",
] as const;

/** Account-level totals summed across all campaigns within a week bucket. */
export interface WeeklyBucketTotals {
  /** Sum of cost across all campaigns for the week. */
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface WeeklyBucketRow {
  /** ISO YYYY-MM-DD, Monday of the ISO week this row belongs to. */
  weekStart: string;
  /** ISO YYYY-MM-DD, min(Sunday of that week, endDate). */
  weekEnd: string;
  /** Display label, e.g. "May 11 - May 17" or "May 18 - 21 (Mon-Wed)". */
  label: string;
  /** True when weekEnd < Sunday of that week (i.e. an in-progress week). */
  partial: boolean;
  /** Account-level sums across all campaigns inside [weekStart, weekEnd]. */
  totals: WeeklyBucketTotals;
}

export interface BuildWeeklyBucketsArgs {
  perDay: Array<{
    date: string;
    spend: number;
    clicks: number;
    impressions: number;
    conversions: number;
  }>;
  /** Number of Monday-anchored weeks ending at `endDate`. Clamped to [1, 12]. */
  weeks: number;
  /** ISO YYYY-MM-DD inclusive end anchor. */
  endDate: string;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseIsoUtc(iso: string): Date {
  // Anchor to UTC midnight so day-of-week math is timezone-stable.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return d;
}

function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Monday of the ISO week that contains `d` (UTC). Sun=0..Sat=6 -> days since
 * Monday is 6 when Sun, day-1 otherwise.
 */
function mondayOfWeekUtc(d: Date): Date {
  const dow = d.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return addDaysUtc(d, -daysSinceMonday);
}

/** Format "May 11" - no year, no day-of-week. */
function fmtMonthDay(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Day-of-week label for partial-week suffix, e.g. "Wed". */
function fmtDow(d: Date): string {
  return DOW_NAMES[d.getUTCDay()];
}

function buildLabel(weekStartIso: string, weekEndIso: string, partial: boolean): string {
  const start = parseIsoUtc(weekStartIso);
  const end = parseIsoUtc(weekEndIso);
  if (!partial) {
    // Full Monday-Sunday week.
    return `${fmtMonthDay(start)} - ${fmtMonthDay(end)}`;
  }
  // Partial week. Two shapes:
  //   - "May 18 - 21 (Mon-Wed)" when the partial spans more than one day.
  //   - "May 18 (Mon)" when the partial is the Monday only.
  if (weekStartIso === weekEndIso) {
    return `${fmtMonthDay(start)} (${fmtDow(start)})`;
  }
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const endLabel = sameMonth ? String(end.getUTCDate()) : fmtMonthDay(end);
  return `${fmtMonthDay(start)} - ${endLabel} (${fmtDow(start)}-${fmtDow(end)})`;
}

/**
 * Build Monday-anchored weekly buckets ending at `endDate` (inclusive) from
 * per-day rows. Latest row is `partial: true` iff `endDate` falls strictly
 * before that week's Sunday.
 */
export function buildWeeklyBuckets(args: BuildWeeklyBucketsArgs): WeeklyBucketRow[] {
  const weeks = Math.max(1, Math.min(12, Math.floor(args.weeks)));
  const endDate = parseIsoUtc(args.endDate);

  // Anchor week = the ISO week that contains endDate.
  const lastMonday = mondayOfWeekUtc(endDate);

  // Index per-day totals for O(1) lookup. Sum within the same day in case
  // upstream returns multiple rows (e.g. one per campaign aggregated upstream).
  const perDayTotals = new Map<string, WeeklyBucketTotals>();
  for (const row of args.perDay) {
    if (!row || typeof row.date !== "string") continue;
    // Normalise the date key - trim, take leading YYYY-MM-DD if upstream
    // returns a full timestamp.
    const key = row.date.slice(0, 10);
    const cur =
      perDayTotals.get(key) ??
      ({ spend: 0, clicks: 0, impressions: 0, conversions: 0 } as WeeklyBucketTotals);
    cur.spend += Number(row.spend) || 0;
    cur.clicks += Number(row.clicks) || 0;
    cur.impressions += Number(row.impressions) || 0;
    cur.conversions += Number(row.conversions) || 0;
    perDayTotals.set(key, cur);
  }

  const out: WeeklyBucketRow[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDaysUtc(lastMonday, -7 * i);
    const sunday = addDaysUtc(weekStart, 6);
    // Clamp the latest week's end to endDate so we don't claim numbers for
    // days that haven't happened yet.
    const weekEnd = sunday > endDate ? endDate : sunday;
    const weekStartIso = toIso(weekStart);
    const weekEndIso = toIso(weekEnd);
    const partial = weekEnd < sunday;

    const totals: WeeklyBucketTotals = {
      spend: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
    };
    for (
      let cursor = new Date(weekStart);
      cursor <= weekEnd;
      cursor = addDaysUtc(cursor, 1)
    ) {
      const day = perDayTotals.get(toIso(cursor));
      if (!day) continue;
      totals.spend += day.spend;
      totals.clicks += day.clicks;
      totals.impressions += day.impressions;
      totals.conversions += day.conversions;
    }

    out.push({
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
      label: buildLabel(weekStartIso, weekEndIso, partial),
      partial,
      totals,
    });
  }
  return out;
}

/**
 * Compute a metric from a bucket's totals. Returns `null` when the
 * denominator is zero (derived ratios only). Account-level derived metrics
 * are computed from summed numerator / summed denominator across campaigns,
 * never as an average-of-averages - that's why we ignore the per-campaign
 * `avgCpc` field Growth Tools returns and compute `cpc` ourselves.
 */
export function computeMetric(
  key: WeeklyMetricKey,
  t: WeeklyBucketTotals,
): number | null {
  switch (key) {
    case "spend":
      return t.spend;
    case "clicks":
      return t.clicks;
    case "impressions":
      return t.impressions;
    case "conversions":
      return t.conversions;
    case "cpa":
      return t.conversions > 0 ? t.spend / t.conversions : null;
    case "cpc":
      // Account-level CPC = sum(cost) / sum(clicks). NOT the passthrough
      // `avgCpc` from Growth Tools, which is per-campaign and would be
      // averaging averages.
      return t.clicks > 0 ? t.spend / t.clicks : null;
    case "ctr":
      return t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null;
    case "conv_rate":
      return t.clicks > 0 ? (t.conversions / t.clicks) * 100 : null;
  }
}

/** Format a metric value for display. `null` renders as "-". */
export function formatMetric(key: WeeklyMetricKey, value: number | null): string {
  if (value === null) return "-";
  switch (key) {
    case "spend":
      return `$${Math.round(value).toLocaleString("en-US")}`;
    case "clicks":
    case "impressions":
    case "conversions":
      return Math.round(value).toLocaleString("en-US");
    case "cpa":
      return `$${Math.round(value).toLocaleString("en-US")}`;
    case "cpc":
      return `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "ctr":
    case "conv_rate":
      return `${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}%`;
  }
}

/** Column header for each metric. */
export function metricHeader(key: WeeklyMetricKey): string {
  switch (key) {
    case "spend":
      return "Spend";
    case "clicks":
      return "Clicks";
    case "impressions":
      return "Impressions";
    case "conversions":
      return "Conversions";
    case "cpa":
      return "CPA";
    case "cpc":
      return "CPC";
    case "ctr":
      return "CTR";
    case "conv_rate":
      return "Conv. Rate";
  }
}

/** CPA threshold colour. Bounds $100 / $300 inclusive land on amber. */
function cpaColor(cpa: number | null): string | null {
  if (cpa === null) return null;
  if (cpa < 100) return "#059669";
  if (cpa <= 300) return "#d97706";
  return "#dc2626";
}

/**
 * For each metric, is an *increase* an improvement?
 *   - spend / cpa / cpc: NO  (lower is better - decrease shows green)
 *   - clicks / impressions / conversions / ctr / conv_rate: YES (higher is
 *     better - increase shows green)
 */
function increaseIsGood(metric: WeeklyMetricKey): boolean {
  switch (metric) {
    case "spend":
    case "cpa":
    case "cpc":
      return false;
    case "clicks":
    case "impressions":
    case "conversions":
    case "ctr":
    case "conv_rate":
      return true;
  }
}

/**
 * Direction-aware delta colour. Returns null when no delta exists (first
 * row, either value null, prev === 0).
 */
function deltaColor(
  metric: WeeklyMetricKey,
  current: number | null,
  prev: number | null,
): string | null {
  if (current === null || prev === null) return null;
  // prev === 0 yields no well-defined percent change; renders as "-" with
  // no colour. Matches the formatDelta contract.
  if (prev === 0) return null;
  if (current === prev) return null;
  const improving =
    current > prev ? increaseIsGood(metric) : !increaseIsGood(metric);
  return improving ? "#059669" : "#dc2626";
}

/**
 * Format the delta cell text. Returns "-" when there's no defined change
 * (first row, either value null, prev === 0).
 */
function formatDelta(current: number | null, prev: number | null): string {
  if (current === null || prev === null) return "-";
  if (prev === 0) return "-";
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  if (pct === 0) return "0.0%";
  const sign = pct > 0 ? "+" : "-";
  return `${sign}${Math.abs(pct).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export interface GenerateTableArgs {
  rows: WeeklyBucketRow[];
  /** Non-empty, ordered, deduped at the tool layer. */
  metrics: WeeklyMetricKey[];
  /** Omitted = no delta columns. Only "wow" is supported today. */
  compare?: "wow";
  /** Override "Weekly Performance Trend". */
  title?: string;
  /** Plain-text summary paragraph rendered under the table. */
  summary?: string;
}

/**
 * Renders the heading + table + optional summary as Gmail-ready HTML.
 *
 * Container sets `font-family:Verdana,sans-serif` once. Every cell carries
 * `color:#222` and `font-family:Verdana,sans-serif` so Gmail's reply / quote
 * stripping doesn't drop the styling on copy-paste.
 */
export function generateWeeklyMetricTableHtml(args: GenerateTableArgs): string {
  const rows = args.rows;
  const metrics = args.metrics;
  const compare = args.compare;
  const summary = (args.summary ?? "").trim();
  const title = (args.title ?? "").trim() || "Weekly Performance Trend";

  // Highlight: only the latest row, and only when it's partial.
  const lastIndex = rows.length - 1;
  const highlightIndex = lastIndex >= 0 && rows[lastIndex].partial ? lastIndex : -1;

  const cellBase =
    "padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-family:Verdana,sans-serif;color:#222";
  const headBase =
    "padding:6px 10px;border-bottom:2px solid #cbd5e1;font-size:13px;font-family:Verdana,sans-serif;color:#222;font-weight:600";

  // Precompute per-row per-metric values so delta cells can reach back one row.
  const computed: Array<Array<number | null>> = rows.map((row) =>
    metrics.map((m) => computeMetric(m, row.totals)),
  );

  // Header row.
  const headerCells: string[] = [];
  headerCells.push(`<th style="${headBase};text-align:left">Week</th>`);
  for (const m of metrics) {
    headerCells.push(`<th style="${headBase};text-align:right">${metricHeader(m)}</th>`);
    if (compare === "wow") {
      headerCells.push(`<th style="${headBase};text-align:right">${"\u0394"} vs prev</th>`);
    }
  }

  const bodyRowsHtml = rows
    .map((row, i) => {
      const isHighlight = i === highlightIndex;
      const rowBg = isHighlight ? ";background:#f0fdf4" : "";
      const boldHighlight = isHighlight ? ";font-weight:700" : "";

      const cells: string[] = [];
      cells.push(
        `<td style="${cellBase}${rowBg}${boldHighlight};text-align:left">${row.label}</td>`,
      );

      for (let mi = 0; mi < metrics.length; mi++) {
        const m = metrics[mi];
        const value = computed[i][mi];

        // Absolute-threshold colouring fires only for CPA, on every row,
        // independent of the delta direction.
        let absColor: string | null = null;
        if (m === "cpa") absColor = cpaColor(value);

        const valueColorStyle = absColor
          ? `;color:${absColor};font-weight:700`
          : boldHighlight;
        cells.push(
          `<td style="${cellBase}${rowBg}${valueColorStyle};text-align:right">${formatMetric(m, value)}</td>`,
        );

        if (compare === "wow") {
          const prev = i > 0 ? computed[i - 1][mi] : null;
          const dColor = deltaColor(m, value, prev);
          const deltaStyle = dColor
            ? `;color:${dColor};font-weight:700`
            : boldHighlight;
          cells.push(
            `<td style="${cellBase}${rowBg}${deltaStyle};text-align:right">${formatDelta(value, prev)}</td>`,
          );
        }
      }

      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  const summaryHtml = summary
    ? `<p style="margin:12px 0 0;font-family:Verdana,sans-serif;font-size:13px;color:#222;line-height:1.5;text-align:left">${escapeHtml(summary)}</p>`
    : "";

  return `<div style="font-family:Verdana,sans-serif;color:#222;font-size:13px">
  <p style="margin:0 0 8px;font-family:Verdana,sans-serif;font-size:14px;color:#222"><strong>${escapeHtml(title)}</strong></p>
  <table style="border-collapse:collapse;width:100%;font-family:Verdana,sans-serif;color:#222">
    <tr>
      ${headerCells.join("\n      ")}
    </tr>
    ${bodyRowsHtml}
  </table>${summaryHtml}
</div>`;
}

/** Minimal HTML-escape for the summary paragraph. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Back-compat shim for the legacy `get_weekly_trend_note` tool. Keeps the
// old exported names working while the new module is the single source of
// truth. Wrappers translate the new types back to the old shape so existing
// imports compile unchanged.
// ---------------------------------------------------------------------------

/** Legacy row shape: spend / conversions / cpa only. */
export interface WeeklyTrendRow {
  weekStart: string;
  weekEnd: string;
  label: string;
  partial: boolean;
  spend: number;
  conversions: number;
  cpa: number | null;
}

/** Legacy entry point: builds buckets and projects to the old row shape. */
export function buildWeeklyTrendRows(args: {
  perDay: Array<{ date: string; spend: number; conversions: number }>;
  weeks: number;
  endDate: string;
}): WeeklyTrendRow[] {
  const buckets = buildWeeklyBuckets({
    perDay: args.perDay.map((r) => ({
      date: r.date,
      spend: r.spend,
      clicks: 0,
      impressions: 0,
      conversions: r.conversions,
    })),
    weeks: args.weeks,
    endDate: args.endDate,
  });
  return buckets.map((b) => ({
    weekStart: b.weekStart,
    weekEnd: b.weekEnd,
    label: b.label,
    partial: b.partial,
    spend: b.totals.spend,
    conversions: b.totals.conversions,
    cpa: computeMetric("cpa", b.totals),
  }));
}

/** Legacy entry point: renders the trend table with fixed metric set. */
export function generateWeeklyTrendNoteHtml(args: {
  rows: WeeklyTrendRow[];
  summary?: string;
}): string {
  // Promote legacy rows to the new bucket shape (zero-fill clicks/impressions
  // since the legacy renderer only ever needed spend/conversions/CPA).
  const rows: WeeklyBucketRow[] = args.rows.map((r) => ({
    weekStart: r.weekStart,
    weekEnd: r.weekEnd,
    label: r.label,
    partial: r.partial,
    totals: {
      spend: r.spend,
      clicks: 0,
      impressions: 0,
      conversions: r.conversions,
    },
  }));
  return generateWeeklyMetricTableHtml({
    rows,
    metrics: ["spend", "conversions", "cpa"],
    summary: args.summary,
  });
}
