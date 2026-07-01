/**
 * Gmail-safe Google Ads dashboard component renderers for OptiMate emails.
 *
 * Pure TS, no React, no browser globals. These blocks intentionally mirror the
 * data shown in dashboard/reporting UI without embedding UI components in Gmail.
 */

export type GoogleAdsEmailComponentKey =
  | "keyword_relevancy"
  | "cpa_trend"
  | "quality_score"
  | "top_converters";

export interface GoogleAdsEmailComponentMeta {
  key: GoogleAdsEmailComponentKey;
  label: string;
  description: string;
}

export const GOOGLE_ADS_EMAIL_COMPONENTS: readonly GoogleAdsEmailComponentMeta[] = [
  {
    key: "keyword_relevancy",
    label: "Keyword relevancy",
    description: "Monthly keyword relevancy trend graph.",
  },
  {
    key: "cpa_trend",
    label: "CPA trend",
    description: "Monthly cost-per-acquisition trend graph.",
  },
  {
    key: "quality_score",
    label: "Quality Score",
    description: "Quality Score trend and component summary.",
  },
  {
    key: "top_converters",
    label: "Top converters",
    description: "Top converting search terms or keywords.",
  },
] as const;

export const GOOGLE_ADS_EMAIL_COMPONENT_KEYS = GOOGLE_ADS_EMAIL_COMPONENTS.map((component) => component.key) as GoogleAdsEmailComponentKey[];

export interface GoogleAdsEmailMetricTotals {
  spend?: number | null;
  clicks?: number | null;
  impressions?: number | null;
  conversions?: number | null;
  ctr?: number | null;
  cpc?: number | null;
  cpa?: number | null;
}

export interface GoogleAdsEmailMonthlyRow extends GoogleAdsEmailMetricTotals {
  label: string;
}

export interface GoogleAdsEmailTermRow extends GoogleAdsEmailMetricTotals {
  term: string;
  campaignName?: string | null;
}

export interface GoogleAdsEmailCampaignRow extends GoogleAdsEmailMetricTotals {
  campaignName: string;
}

export interface GoogleAdsEmailLeadQuality {
  paidLeads?: number | null;
  meetings?: number | null;
  googleAdsConversions?: number | null;
  meetingRate?: number | null;
  qualifiedLeadRate?: number | null;
  periodLabel?: string | null;
}

export interface GoogleAdsEmailCompetitorSnapshot {
  searchImpressionShare?: number | null;
  searchBudgetLostIS?: number | null;
  periodLabel?: string | null;
}

export interface GoogleAdsEmailTrendPoint {
  label: string;
  value: number | null;
}

export interface GoogleAdsEmailQualityScoreSummary {
  latestQualityScore?: number | null;
  latestMonth?: string | null;
  creativeQuality?: number | null;
  searchPredictedCtr?: number | null;
  landingPageQuality?: number | null;
  trend?: GoogleAdsEmailTrendPoint[];
}

export interface GoogleAdsEmailComponentsData {
  periodLabel?: string | null;
  keywordRelevancyTrend?: GoogleAdsEmailTrendPoint[];
  cpaTrend?: GoogleAdsEmailTrendPoint[];
  qualityScore?: GoogleAdsEmailQualityScoreSummary | null;
  topConverters?: GoogleAdsEmailTermRow[];
  unavailable?: Partial<Record<GoogleAdsEmailComponentKey, string>>;
}

const outerStyle = "font-family:Verdana,sans-serif;color:#222;font-size:13px;margin:0 0 20px";
const headingStyle = "margin:0 0 8px;font-family:Verdana,sans-serif;font-size:14px;color:#222";
const tableStyle = "border-collapse:collapse;width:auto;max-width:760px;table-layout:auto;font-family:Verdana,sans-serif;color:#222";
const headStyle = "padding:8px 12px;background:#f1f5f9;border-bottom:2px solid #e5e7eb;font-size:12px;font-family:Arial,sans-serif;color:#64748b;font-weight:600;white-space:nowrap";
const cellStyle = "padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-family:Verdana,sans-serif;color:#222;white-space:nowrap";

export function renderGoogleAdsEmailComponentHtml(key: GoogleAdsEmailComponentKey, data: GoogleAdsEmailComponentsData): string {
  const unavailable = data.unavailable?.[key];
  if (unavailable) return renderUnavailable(componentLabel(key), unavailable);

  switch (key) {
    case "keyword_relevancy":
      return renderTrendGraph(
        "Keyword Relevancy",
        data.keywordRelevancyTrend ?? [],
        "#8b5cf6",
        "%",
        "Keyword relevancy data is unavailable for this account.",
        undefined,
        "Keyword Relevancy shows the share of non-brand search spend going to relevant searches, with a higher score meaning budget is reaching better-fit searches.",
        {
          gradientId: "email-keyword-relevancy-grad",
          ariaLabel: "Keyword Relevancy percentage",
          axisColor: "#94a3b8",
        },
      );
    case "cpa_trend":
      return renderTrendGraph("Cost Per Acquisition", data.cpaTrend ?? [], "#f59e0b", "", "CPA trend data is unavailable for this account.", moneyOrDash, undefined, {
        gradientId: "email-cpa-trend-grad",
        ariaLabel: "Cost per acquisition",
        axisColor: "#f59e0b",
      });
    case "quality_score":
      return renderQualityScore(data.qualityScore ?? null);
    case "top_converters":
      return renderTermTable("Top Converters", data.topConverters ?? [], "No converting search terms were available for this period.", { sort: "conversions" });
    default:
      return "";
  }
}

export function renderGoogleAdsEmailComponentsHtml(keys: GoogleAdsEmailComponentKey[], data: GoogleAdsEmailComponentsData): string {
  const seen = new Set<GoogleAdsEmailComponentKey>();
  return keys
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((key) => renderGoogleAdsEmailComponentHtml(key, data))
    .filter(Boolean)
    .join("\n");
}

function renderTrendGraph(
  title: string,
  rows: GoogleAdsEmailTrendPoint[],
  color: string,
  suffix: string,
  empty: string,
  formatValue?: (value: number) => string,
  note?: string,
  options: { gradientId?: string; ariaLabel?: string; axisColor?: string; min?: number; max?: number } = {},
): string {
  const usable = rows.filter((row) => Number.isFinite(Number(row.value)));
  if (usable.length === 0) return renderUnavailable(title, empty);

  const chart = buildSvgTrendChart(usable, {
    color,
    suffix,
    formatValue,
    gradientId: options.gradientId ?? `email-${slugify(title)}-grad`,
    ariaLabel: options.ariaLabel ?? title,
    axisColor: options.axisColor ?? "#94a3b8",
    min: options.min,
    max: options.max,
  });
  const noteHtml = note ? `<p style=\"margin:0 0 8px;color:#64748b;font-size:12px;line-height:1.35\">${escapeHtml(note)}</p>` : "";
  return `<div style=\"font-family:Inter,Arial,sans-serif;color:#0f172a;font-size:13px;margin:0 0 24px;padding:18px 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 24px rgba(15,23,42,0.08)\">
  <div style=\"display:flex;align-items:center;justify-content:space-between;margin:0 0 18px\">
    <div style=\"font-size:17px;letter-spacing:0.10em;text-transform:uppercase;font-weight:700;color:#64748b\">${escapeHtml(title)}</div>
    <div style=\"font-size:12px;color:#94a3b8\">${usable.length} month trend</div>
  </div>
  ${noteHtml}
  ${chart}
</div>`;
}

function buildSvgTrendChart(
  rows: GoogleAdsEmailTrendPoint[],
  options: {
    color: string;
    suffix: string;
    gradientId: string;
    ariaLabel: string;
    axisColor: string;
    formatValue?: (value: number) => string;
    min?: number;
    max?: number;
  },
): string {
  const width = 1040;
  const height = 300;
  const left = 55;
  const right = 1010;
  const top = 36;
  const bottom = 204;
  const values = rows.map((row) => Number(row.value));
  const rawMin = options.min ?? Math.min(...values);
  const rawMax = options.max ?? Math.max(...values);
  const padding = rawMax === rawMin ? Math.max(1, Math.abs(rawMax) * 0.1) : (rawMax - rawMin) * 0.08;
  const min = options.min ?? Math.max(0, rawMin - padding);
  const max = options.max ?? rawMax + padding;
  const range = max - min || 1;
  const xFor = (index: number) => rows.length === 1 ? left : left + ((right - left) * index) / (rows.length - 1);
  const yFor = (value: number) => bottom - ((value - min) / range) * (bottom - top);
  const points = rows.map((row, index) => ({
    label: row.label,
    value: Number(row.value),
    x: xFor(index),
    y: yFor(Number(row.value)),
  }));
  const pointList = points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = first && last ? `M${round(first.x)},${round(first.y)} ${points.slice(1).map((point) => `L${round(point.x)},${round(point.y)}`).join(" ")} L${round(last.x)},${bottom} L${round(first.x)},${bottom} Z` : "";
  const ticks = buildAxisTicks(min, max);
  const gridHtml = ticks.map((tick) => {
    const y = yFor(tick);
    return `<line x1=\"${left}\" x2=\"${right}\" y1=\"${round(y)}\" y2=\"${round(y)}\" stroke=\"#e2e8f0\"/>`;
  }).join("");
  const axisHtml = ticks.map((tick) => `<text x=\"49\" y=\"${round(yFor(tick) + 4)}\" font-size=\"10\" fill=\"${options.axisColor}\" text-anchor=\"end\">${escapeHtml(formatTrendValue(tick, options.suffix, options.formatValue))}</text>`).join("");
  const circleHtml = points.map((point) => `<circle cx=\"${round(point.x)}\" cy=\"${round(point.y)}\" r=\"3\"/>`).join("");
  const valueHtml = points.map((point) => `<text x=\"${round(point.x)}\" y=\"${round(point.y - 10)}\">${escapeHtml(formatTrendValue(point.value, options.suffix, options.formatValue))}</text>`).join("");
  const monthHtml = points.map((point) => `<text x=\"${round(point.x)}\" y=\"270\" transform=\"rotate(-35 ${round(point.x)} 270)\">${escapeHtml(point.label)}</text>`).join("");

  return `<svg width=\"100%\" viewBox=\"0 0 ${width} ${height}\" role=\"img\" aria-label=\"${escapeHtml(options.ariaLabel)} over ${rows.length} months\" style=\"display:block;max-width:1040px;height:auto\">
  <defs><linearGradient id=\"${escapeHtml(options.gradientId)}\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"${options.color}\" stop-opacity=\"0.15\"/><stop offset=\"100%\" stop-color=\"${options.color}\" stop-opacity=\"0.02\"/></linearGradient></defs>
  ${gridHtml}
  ${axisHtml}
  <path d=\"${areaPath}\" fill=\"url(#${escapeHtml(options.gradientId)})\"/>
  <polyline points=\"${pointList}\" fill=\"none\" stroke=\"${options.color}\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>
  <g fill=\"white\" stroke=\"${options.color}\" stroke-width=\"2\">${circleHtml}</g>
  <g font-size=\"10\" fill=\"${options.color}\" font-weight=\"600\" text-anchor=\"middle\">${valueHtml}</g>
  <g font-size=\"10\" fill=\"#94a3b8\" text-anchor=\"end\">${monthHtml}</g>
</svg>`;
}

function buildAxisTicks(min: number, max: number): number[] {
  const range = max - min || 1;
  return [max, max - range * 0.25, max - range * 0.5, max - range * 0.75, min];
}

function formatTrendValue(value: number, suffix: string, formatValue?: (value: number) => string): string {
  if (formatValue) return formatValue(value);
  return `${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}${suffix}`;
}

function round(value: number): string {
  return String(Math.round(value));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderQualityScore(data: GoogleAdsEmailQualityScoreSummary | null): string {
  if (!data) return renderUnavailable("Quality Score", "Quality Score data is unavailable for this account.");
  const trend = data.trend && data.trend.length > 0
    ? renderTrendGraph("Quality Score", data.trend, "#3b82f6", "", "Quality Score trend data is unavailable for this account.", score, undefined, {
      gradientId: "email-quality-score-grad",
      ariaLabel: "Quality Score",
      axisColor: "#3b82f6",
      min: 0,
      max: 10,
    })
    : "";
  const summary = renderTable(
    data.latestMonth ? `Quality Score - ${escapeHtml(data.latestMonth)}` : "Quality Score",
    ["Quality Score", "Ad relevance", "Expected CTR", "Landing page"],
    [[score(data.latestQualityScore), score(data.creativeQuality), score(data.searchPredictedCtr), score(data.landingPageQuality)]],
    ["right", "right", "right", "right"],
  );
  return `${summary}\n${trend}`;
}

function renderTermTable(title: string, rows: GoogleAdsEmailTermRow[], empty: string, options: { sort: "spend" | "conversions" }): string {
  if (rows.length === 0) return renderUnavailable(title, empty);
  const sorted = [...rows]
    .sort((a, b) => Number(b[options.sort] ?? 0) - Number(a[options.sort] ?? 0))
    .slice(0, 8);
  return renderTable(
    title,
    ["Search term", "Campaign", "Spend", "Conversions", "CPA"],
    sorted.map((row) => [row.term, row.campaignName || "-", money(row.spend), number(row.conversions), moneyOrDash(row.cpa)]),
    ["left", "left", "right", "right", "right"],
  );
}

function renderTable(title: string, headers: string[], rows: string[][], alignments: Array<"left" | "right">): string {
  const headerHtml = headers.map((header, index) => `<th style=\"${headStyle};text-align:${alignments[index] ?? "left"}\">${escapeHtml(header)}</th>`).join("");
  const rowsHtml = rows.map((row) => `<tr>${row.map((cell, index) => `<td style=\"${cellStyle};text-align:${alignments[index] ?? "left"}\">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<div style=\"${outerStyle}\">
  <p style=\"${headingStyle}\"><strong>${escapeHtml(title)}</strong></p>
  <table style=\"${tableStyle}\">
    <tr>${headerHtml}</tr>
    ${rowsHtml}
  </table>
</div>`;
}

function renderUnavailable(title: string, message: string): string {
  return `<div style=\"${outerStyle}\">
  <p style=\"${headingStyle}\"><strong>${escapeHtml(title)}</strong></p>
  <p style=\"margin:0;color:#64748b;font-family:Verdana,sans-serif;font-size:13px\">${escapeHtml(message)}</p>
</div>`;
}

function componentLabel(key: GoogleAdsEmailComponentKey): string {
  return GOOGLE_ADS_EMAIL_COMPONENTS.find((component) => component.key === key)?.label ?? key;
}

function money(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function moneyOrDash(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return n < 100 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString("en-AU")}`;
}

function number(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

function percent(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

function score(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-AU", { maximumFractionDigits: 1 });
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
