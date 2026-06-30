/**
 * Gmail-safe Google Ads dashboard component renderers for OptiMate emails.
 *
 * Pure TS, no React, no browser globals. These blocks intentionally mirror the
 * data shown in dashboard/reporting UI without embedding UI components in Gmail.
 */

export type GoogleAdsEmailComponentKey =
  | "monthly_performance"
  | "kpi_summary"
  | "top_converters"
  | "budget_wasters"
  | "campaign_breakdown"
  | "lead_quality"
  | "competitor_snapshot";

export interface GoogleAdsEmailComponentMeta {
  key: GoogleAdsEmailComponentKey;
  label: string;
  description: string;
}

export const GOOGLE_ADS_EMAIL_COMPONENTS: readonly GoogleAdsEmailComponentMeta[] = [
  {
    key: "monthly_performance",
    label: "Monthly performance",
    description: "Monthly spend, conversions, and CPA trend table.",
  },
  {
    key: "kpi_summary",
    label: "KPI summary",
    description: "Spend, conversions, CPA, CTR, and CPC summary.",
  },
  {
    key: "top_converters",
    label: "Top converters",
    description: "Top converting search terms or keywords.",
  },
  {
    key: "budget_wasters",
    label: "Budget wasters",
    description: "Wasted spend and no-conversion search terms.",
  },
  {
    key: "campaign_breakdown",
    label: "Campaign breakdown",
    description: "Compact campaign/category performance table when available.",
  },
  {
    key: "lead_quality",
    label: "Lead quality",
    description: "Paid leads, meetings, conversion, and quality rates when available.",
  },
  {
    key: "competitor_snapshot",
    label: "Competitor snapshot",
    description: "Impression share and missed-budget snapshot when available.",
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

export interface GoogleAdsEmailComponentsData {
  periodLabel?: string | null;
  monthlyPerformanceRows?: GoogleAdsEmailMonthlyRow[];
  kpiSummary?: GoogleAdsEmailMetricTotals | null;
  topConverters?: GoogleAdsEmailTermRow[];
  budgetWasters?: GoogleAdsEmailTermRow[];
  campaignBreakdown?: GoogleAdsEmailCampaignRow[];
  leadQuality?: GoogleAdsEmailLeadQuality | null;
  competitorSnapshot?: GoogleAdsEmailCompetitorSnapshot | null;
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
    case "monthly_performance":
      return renderMonthlyPerformance(data.monthlyPerformanceRows ?? []);
    case "kpi_summary":
      return renderKpiSummary(data.kpiSummary ?? null, data.periodLabel);
    case "top_converters":
      return renderTermTable("Top Converters", data.topConverters ?? [], "No converting search terms were available for this period.", { sort: "conversions" });
    case "budget_wasters":
      return renderTermTable("Budget Wasters", data.budgetWasters ?? [], "No no-conversion wasted-spend search terms were available for this period.", { sort: "spend" });
    case "campaign_breakdown":
      return renderCampaignBreakdown(data.campaignBreakdown ?? [], data.periodLabel);
    case "lead_quality":
      return renderLeadQuality(data.leadQuality ?? null);
    case "competitor_snapshot":
      return renderCompetitorSnapshot(data.competitorSnapshot ?? null);
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

function renderMonthlyPerformance(rows: GoogleAdsEmailMonthlyRow[]): string {
  if (rows.length === 0) return renderUnavailable("Monthly Performance Trend", "Monthly performance data is unavailable for this account and period.");
  return renderTable(
    "Monthly Performance Trend",
    ["Month", "Spend", "Conversions", "CPA"],
    rows.map((row) => [row.label, money(row.spend), number(row.conversions), moneyOrDash(row.cpa)]),
    ["left", "right", "right", "right"],
  );
}

function renderKpiSummary(totals: GoogleAdsEmailMetricTotals | null, periodLabel?: string | null): string {
  if (!totals) return renderUnavailable("KPI Summary", "KPI summary data is unavailable for this period.");
  const label = periodLabel ? `KPI Summary - ${escapeHtml(periodLabel)}` : "KPI Summary";
  return renderTable(
    label,
    ["Spend", "Conversions", "CPA", "CTR", "CPC"],
    [[money(totals.spend), number(totals.conversions), moneyOrDash(totals.cpa), percent(totals.ctr), moneyOrDash(totals.cpc)]],
    ["right", "right", "right", "right", "right"],
  );
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

function renderCampaignBreakdown(rows: GoogleAdsEmailCampaignRow[], periodLabel?: string | null): string {
  if (rows.length === 0) return renderUnavailable("Campaign Breakdown", "Campaign breakdown data is unavailable for this period.");
  const title = periodLabel ? `Campaign Breakdown - ${escapeHtml(periodLabel)}` : "Campaign Breakdown";
  return renderTable(
    title,
    ["Campaign", "Spend", "Conversions", "CPA", "CTR"],
    rows.slice(0, 10).map((row) => [row.campaignName, money(row.spend), number(row.conversions), moneyOrDash(row.cpa), percent(row.ctr)]),
    ["left", "right", "right", "right", "right"],
  );
}

function renderLeadQuality(data: GoogleAdsEmailLeadQuality | null): string {
  if (!data) return renderUnavailable("Lead Quality", "Lead quality data is not available for this account.");
  const title = data.periodLabel ? `Lead Quality - ${escapeHtml(data.periodLabel)}` : "Lead Quality";
  return renderTable(
    title,
    ["Paid leads", "Meetings", "Google Ads conversions", "Meeting rate", "Qualified lead rate"],
    [[number(data.paidLeads), number(data.meetings), number(data.googleAdsConversions), percent(data.meetingRate), percent(data.qualifiedLeadRate)]],
    ["right", "right", "right", "right", "right"],
  );
}

function renderCompetitorSnapshot(data: GoogleAdsEmailCompetitorSnapshot | null): string {
  if (!data) return renderUnavailable("Competitor Snapshot", "Competitor/impression-share data is not available for this account.");
  const title = data.periodLabel ? `Competitor Snapshot - ${escapeHtml(data.periodLabel)}` : "Competitor Snapshot";
  return renderTable(
    title,
    ["Search impression share", "Search budget lost IS"],
    [[percent(data.searchImpressionShare), percent(data.searchBudgetLostIS)]],
    ["right", "right"],
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

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
