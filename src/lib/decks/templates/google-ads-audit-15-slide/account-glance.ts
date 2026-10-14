/**
 * Evidence → "Account at a glance" slide data.
 *
 * Built only from the snapshot's own monthly trend and audit window, so every
 * client and every milestone sees its own numbers. Pure and deterministic.
 */
import type { AccountGlanceCallout, AccountGlanceData, AccountGlanceMonth } from "./payload";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Most months the chart shows; older months are dropped from the chart (not the totals). */
export const ACCOUNT_GLANCE_MAX_MONTHS = 18;
/** A month's CPL is called out when it is at least this multiple of the period CPL. */
const CPL_SPIKE_RATIO = 1.5;
/** CPL trend smaller than this (either way) reads as "steady". */
const TREND_THRESHOLD = 0.15;

interface TrendRow {
  month?: unknown;
  cost?: unknown;
  clicks?: unknown;
  conversions?: unknown;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function monthLabel(ym: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(ym);
  if (!match) return ym;
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]}-${match[1].slice(2)}`;
}

function longMonth(ym: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(ym);
  if (!match) return ym;
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

function lastDayOfMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString("en-AU")}`;
  }
}

function cplOf(spend: number, conversions: number): number | null {
  return conversions > 0 ? spend / conversions : null;
}

/** Average CPL over a set of months (total spend / total conversions). */
function pooledCpl(months: AccountGlanceMonth[]): number | null {
  const spend = months.reduce((sum, m) => sum + m.spend, 0);
  const conversions = months.reduce((sum, m) => sum + m.conversions, 0);
  return cplOf(spend, conversions);
}

function headlineFor(full: AccountGlanceMonth[], totals: AccountGlanceData["totals"]): string {
  if (totals.conversions <= 0) return "Spend and clicks at a glance";
  if (full.length < 4) return "Account at a glance";
  const half = Math.floor(full.length / 2);
  const early = pooledCpl(full.slice(0, half));
  const late = pooledCpl(full.slice(full.length - half));
  if (early == null || late == null) return "Account at a glance";
  const change = (late - early) / early;
  const pct = Math.round(Math.abs(change) * 100);
  const sym = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
  const earlyConv = full.slice(0, half).reduce((s, m) => s + m.conversions, 0);
  const lateConv = full.slice(full.length - half).reduce((s, m) => s + m.conversions, 0);
  const convPct = earlyConv > 0 ? Math.round(((lateConv - earlyConv) / earlyConv) * 100) : null;
  if (change >= TREND_THRESHOLD) {
    return `Cost per lead has risen ${pct}% (${sym(early)} to ${sym(late)}): here's what's driving it`;
  }
  if (change <= -TREND_THRESHOLD) {
    const more = convPct != null && convPct > 0 ? `, with ${convPct}% more leads` : "";
    return `Cost per lead is down ${pct}% (${sym(early)} to ${sym(late)})${more}`;
  }
  return `Cost per lead has held steady at around ${sym(late)}`;
}

export function buildAccountGlance(input: {
  monthlyTrend: TrendRow[] | null | undefined;
  periodStart: string;
  periodEnd: string;
  currencyCode?: string | null;
}): AccountGlanceData | null {
  const currency = input.currencyCode || "AUD";
  const periodStart = String(input.periodStart).slice(0, 10);
  const periodEnd = String(input.periodEnd).slice(0, 10);
  const rows = (input.monthlyTrend ?? [])
    .filter((row) => row && /^\d{4}-\d{2}/.test(String(row.month ?? "")))
    .map((row) => ({ ...row, month: String(row.month).slice(0, 7) }))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length === 0) return null;

  const allMonths: AccountGlanceMonth[] = rows.map((row) => {
    const spend = num(row.cost);
    const conversions = num(row.conversions);
    const startsMidMonth = row.month === periodStart.slice(0, 7) && Number(periodStart.slice(8, 10)) > 1;
    const endsMidMonth = row.month === periodEnd.slice(0, 7) && Number(periodEnd.slice(8, 10)) < lastDayOfMonth(row.month);
    return {
      month: row.month,
      label: monthLabel(row.month),
      spend,
      clicks: num(row.clicks),
      conversions,
      cpl: cplOf(spend, conversions),
      partial: startsMidMonth || endsMidMonth,
    };
  });

  const spend = allMonths.reduce((sum, m) => sum + m.spend, 0);
  const clicks = allMonths.reduce((sum, m) => sum + m.clicks, 0);
  const conversions = allMonths.reduce((sum, m) => sum + m.conversions, 0);
  const totals = { spend, clicks, conversions, cpl: cplOf(spend, conversions) };

  const months = allMonths.slice(-ACCOUNT_GLANCE_MAX_MONTHS);
  const full = allMonths.filter((m) => !m.partial);

  // Callouts: complete months whose CPL is well above the period, and complete
  // months that spent meaningfully with no conversions at all.
  const callouts: AccountGlanceCallout[] = [];
  const meaningfulSpend = spend * 0.05;
  for (const m of full) {
    if (m.cpl != null && totals.cpl != null && m.cpl >= totals.cpl * CPL_SPIKE_RATIO) {
      callouts.push({
        label: longMonth(m.month),
        spend: m.spend,
        conversions: m.conversions,
        cpl: m.cpl,
        reason: `Cost per lead was ${(m.cpl / totals.cpl).toFixed(1)}× the period average of ${money(totals.cpl, currency)}.`,
      });
    } else if (m.conversions === 0 && m.spend >= meaningfulSpend && meaningfulSpend > 0) {
      callouts.push({
        label: longMonth(m.month),
        spend: m.spend,
        conversions: 0,
        cpl: null,
        reason: `${money(m.spend, currency)} spent with no recorded conversions.`,
      });
    }
  }
  callouts.sort((a, b) => (b.cpl ?? Number.POSITIVE_INFINITY) - (a.cpl ?? Number.POSITIVE_INFINITY));

  const notes: string[] = [];
  const partialLabels = allMonths.filter((m) => m.partial).map((m) => longMonth(m.month));
  if (partialLabels.length) {
    notes.push(`${partialLabels.join(" and ")} ${partialLabels.length === 1 ? "is a part month" : "are part months"} in this audit window, so ${partialLabels.length === 1 ? "it is" : "they are"} shaded and left out of the trend headline and call-outs.`);
  }
  if (allMonths.length > months.length) {
    notes.push(`The chart shows the latest ${months.length} months; totals cover the full window.`);
  }
  notes.push("Conversions are the account's primary conversion actions as reported by Google Ads.");

  return {
    headline: headlineFor(full, totals),
    currencyCode: currency,
    periodLabel: `${longMonth(allMonths[0].month)} – ${longMonth(allMonths[allMonths.length - 1].month)}`,
    months,
    totals,
    callouts: callouts.slice(0, 3),
    notes,
  };
}
