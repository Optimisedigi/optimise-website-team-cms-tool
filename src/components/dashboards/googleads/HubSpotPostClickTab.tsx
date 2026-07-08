"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GoogleAdsDashboardMonthlyWasteRelevancy, HubSpotPostClickDashboardData } from "@/lib/dashboard-types";

type MetricKey = "paidLeads" | "meetings" | "googleAdsConversions" | "meetingRate" | "disqualifiedRate";
type MonthlyPoint = HubSpotPostClickDashboardData["monthly"][number];
type MonthlySalesPoint = MonthlyPoint & { keywordRelevancy: number | null; mqls: number; sqls: number };
type AttributionRow = HubSpotPostClickDashboardData["attributionRows"][number];
type LeadDetail = HubSpotPostClickDashboardData["leadDetails"][number];
type MeetingFilter = "all" | "yes" | "no";

const METRICS: Array<{ key: MetricKey; label: string; shortLabel: string; tooltip: string; color: string; kind: "bar" | "line"; unit?: "rate" | "currency" }> = [
  { key: "googleAdsConversions", label: "Google Ads conversions", shortLabel: "Google Ads conversions", tooltip: "Actual Google Ads conversions for the selected conversion actions in the dashboard conversion selector. This is ad-platform conversion volume, not HubSpot contact count.", color: "#60a5fa", kind: "bar" },
  {
    key: "paidLeads",
    label: "Google Ads / HubSpot paid leads checked",
    shortLabel: "Paid leads",
    tooltip: "HubSpot contacts created in the period that have a Google Ads GCLID or paid-search source. This can be lower than Google Ads leads because Google Ads counts ad-platform conversions, while this report only counts contacts HubSpot captured and attributed to paid search.",
    color: "#2563eb",
    kind: "bar",
  },
  { key: "meetings", label: "HubSpot meetings", shortLabel: "Meetings", tooltip: "Associated HubSpot meeting records plus HubSpot meeting timestamp fields for the paid-search contacts in this report.", color: "#16a34a", kind: "bar" },
  { key: "meetingRate", label: "Lead → HubSpot meeting conversion rate", shortLabel: "Meeting rate", tooltip: "HubSpot meetings divided by paid leads. It can exceed 100% when one paid lead has more than one associated meeting.", color: "#7c3aed", kind: "line", unit: "rate" },
  { key: "disqualifiedRate", label: "Disqualified rate", shortLabel: "Disqualified rate", tooltip: "Paid leads marked unqualified, dead, junk, spam, or not model aligned divided by paid leads.", color: "#dc2626", kind: "line", unit: "rate" },
];

const CONFIDENCE_LABELS: Record<string, string> = {
  single_candidate: "Single candidate",
  multiple_candidates: "Multiple candidates",
  keyword_fallback: "Keyword fallback",
  hubspot_source_fallback: "HubSpot fallback",
};

const CONFIDENCE_DESCRIPTIONS: Record<string, string> = {
  single_candidate: "One possible Google Ads search term matched the lead date, campaign, ad group, and keyword.",
  multiple_candidates: "Multiple possible Google Ads search terms matched. Google Ads does not expose exact contact-level search term by GCLID.",
  keyword_fallback: "The GCLID/click matched Google Ads, but no search-term row matched, so this falls back to keyword evidence.",
  hubspot_source_fallback: "No usable Google Ads click/search-term match was available, so this uses HubSpot paid-search source fields.",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  single_candidate: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  multiple_candidates: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  keyword_fallback: "bg-red-50 text-red-600 ring-1 ring-red-100",
  hubspot_source_fallback: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

function buildMonthKeys(monthsBack: number): string[] {
  const today = new Date();
  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function monthShort(yyyymm: string): string {
  const [, mm] = yyyymm.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[Number(mm) - 1] || yyyymm;
}

function monthFull(yyyymm: string): string {
  const [yyyy, mm] = yyyymm.split("-");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[Number(mm) - 1] || mm} ${yyyy}`;
}

function formatRate(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function keywordRelevancyFromMonthlyWaste(row: GoogleAdsDashboardMonthlyWasteRelevancy | undefined): number | null {
  if (!row) return null;
  const nonBrandSpend = Math.max(0, row.totalSpend - row.brandSpend);
  const denominator = nonBrandSpend > 0 ? nonBrandSpend : row.totalSpend;
  if (denominator <= 0) return null;
  return Math.max(0, Math.min(100, 100 - (row.irrelevantSpend / denominator) * 100));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
}

function formatDurationFromDays(value: number | null | undefined): string {
  if (value == null) return "—";
  const totalMinutes = Math.ceil(value * 24 * 60);
  if (totalMinutes <= 0) return "0 minutes";
  if (totalMinutes < 60) return totalMinutes === 1 ? "1 minute" : `${totalMinutes} minutes`;
  const totalHours = Math.ceil(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const dayText = days === 1 ? "1 day" : `${days} days`;
  const hourText = hours === 1 ? "1 hour" : `${hours} hours`;
  if (days && hours) return `${dayText} ${hourText}`;
  if (days) return dayText;
  return hourText;
}

function daysBetween(start: string | undefined, end: string | undefined): number | null {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return null;
  return (endTime - startTime) / 86_400_000;
}

function averageDays(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value != null);
  if (!valid.length) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10000) / 10000;
}

function toggleMetricSelection(current: MetricKey[], key: MetricKey): MetricKey[] {
  if (current.includes(key)) {
    const next = current.filter((item) => item !== key);
    return next.length ? next : current;
  }
  return [...current, key];
}

function usePostClickMonthlyData(monthly: MonthlyPoint[], leadDetails?: HubSpotPostClickDashboardData["leadDetails"], monthlyWasteRelevancy?: GoogleAdsDashboardMonthlyWasteRelevancy[]): MonthlySalesPoint[] {
  return useMemo(() => {
    const byMonth = new Map(monthly.map((row) => [row.month, row]));
    const relevancyByMonth = new Map((monthlyWasteRelevancy || []).map((row) => [row.month, row]));
    const leadStatsByMonth = new Map<string, { paidLeads: number; disqualifiedLeads: number; mqls: number; sqls: number; daysToFirstOutreach: Array<number | null>; daysToMql: Array<number | null>; daysToSql: Array<number | null> }>();
    for (const lead of leadDetails || []) {
      const stats = leadStatsByMonth.get(lead.month) || { paidLeads: 0, disqualifiedLeads: 0, mqls: 0, sqls: 0, daysToFirstOutreach: [], daysToMql: [], daysToSql: [] };
      const baseline = lead.firstConversionAt || lead.createdAt;
      stats.paidLeads += 1;
      stats.disqualifiedLeads += lead.isQualifiedLead ? 0 : 1;
      stats.mqls += lead.mqlAt ? 1 : 0;
      stats.sqls += lead.sqlAt ? 1 : 0;
      stats.daysToFirstOutreach.push(daysBetween(baseline, lead.firstOutreachAt));
      if (lead.isQualifiedLead) {
        stats.daysToMql.push(daysBetween(baseline, lead.mqlAt));
        stats.daysToSql.push(daysBetween(baseline, lead.sqlAt));
      }
      leadStatsByMonth.set(lead.month, stats);
    }
    return buildMonthKeys(14).map((month) => {
      const row = byMonth.get(month) ?? {
        month,
        paidLeads: 0,
        meetings: 0,
        googleAdsConversions: 0,
        googleAdsSpend: 0,
        meetingRate: null,
        meetingOrCallRate: null,
        qualifiedLeads: 0,
        disqualifiedLeads: 0,
        qualifiedLeadRate: null,
        disqualifiedRate: null,
        calls: 0,
        avgDaysToFirstOutreach: null,
        avgDaysToMql: null,
        avgDaysToSql: null,
      };
      const leadStats = leadStatsByMonth.get(month);
      const disqualifiedLeads = row.disqualifiedLeads ?? leadStats?.disqualifiedLeads ?? 0;
      const disqualifiedRate = row.disqualifiedRate ?? (leadStats && leadStats.paidLeads > 0 ? (leadStats.disqualifiedLeads / leadStats.paidLeads) * 100 : null);
      return {
        ...row,
        disqualifiedLeads,
        disqualifiedRate,
        keywordRelevancy: keywordRelevancyFromMonthlyWaste(relevancyByMonth.get(month)),
        mqls: leadStats?.mqls || 0,
        sqls: leadStats?.sqls || 0,
        avgDaysToFirstOutreach: row.avgDaysToFirstOutreach ?? averageDays(leadStats?.daysToFirstOutreach || []),
        avgDaysToMql: row.avgDaysToMql ?? averageDays(leadStats?.daysToMql || []),
        avgDaysToSql: row.avgDaysToSql ?? averageDays(leadStats?.daysToSql || []),
      };
    });
  }, [monthly, leadDetails, monthlyWasteRelevancy]);
}

function PostClickMonthlyChart({ data, selectedMetrics, onToggleMetric }: { data: MonthlyPoint[]; selectedMetrics: MetricKey[]; onToggleMetric: (key: MetricKey) => void }) {
  const width = 980;
  const height = 290;
  const left = 34;
  const right = 48;
  const top = 26;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const barMax = Math.max(1, ...data.map((row) => Math.max(row.paidLeads, row.meetings, row.googleAdsConversions || 0)));
  const lineSeries = METRICS.filter((metric) => metric.kind === "line" && selectedMetrics.includes(metric.key)) as Array<(typeof METRICS)[number] & { kind: "line" }>;
  const rateSeries = lineSeries.filter((series) => series.unit === "rate");
  const showLine = lineSeries.length > 0;
  const rateMax = Math.max(100, Math.ceil(Math.max(...data.flatMap((row) => rateSeries.map((series) => Number(row[series.key] ?? 0)))) / 25) * 25);
  const disqualifiedRateMax = Math.max(10, Math.ceil(Math.max(...data.map((row) => row.disqualifiedRate ?? 0)) / 5) * 5);
  const slot = chartWidth / data.length;
  const barWidth = Math.max(8, Math.min(17, slot * 0.22));
  const yCount = (value: number) => top + chartHeight - (value / barMax) * chartHeight;
  const yRate = (value: number | null) => top + chartHeight - ((value ?? 0) / rateMax) * chartHeight;
  const yDisqualifiedRate = (value: number | null) => top + chartHeight - ((value ?? 0) / disqualifiedRateMax) * chartHeight;
  const linePaths = lineSeries.map((series) => {
    const points = data
      .map((row, index) => {
        const raw = Number(row[series.key] ?? 0);
        if (series.unit === "rate" && row[series.key] == null) return null;
        return {
          x: left + slot * index + slot / 2,
          y: series.key === "disqualifiedRate" ? yDisqualifiedRate(raw) : yRate(raw),
          value: raw,
        };
      })
      .filter((point): point is { x: number; y: number; value: number } => Boolean(point));
    return {
      ...series,
      points,
      path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
    };
  });

  const legend = (
    <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-500">
      {METRICS.map((metric) => {
        const active = selectedMetrics.includes(metric.key);
        return (
          <button
            key={metric.key}
            type="button"
            onClick={() => onToggleMetric(metric.key)}
            title={metric.tooltip}
            className="inline-flex items-center gap-1.5 transition-opacity"
            style={{ opacity: active ? 1 : 0.4 }}
          >
            <span
              className={metric.kind === "bar" ? "h-3 w-3 rounded-sm" : "h-0.5 w-5"}
              style={{ background: active ? metric.color : "#94a3b8" }}
            />
            {metric.shortLabel}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      {legend}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[920px] w-full" role="img" aria-label="Last 14 months lead quality chart">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = top + chartHeight - tick * chartHeight;
          return <line key={tick} x1={left} x2={width - right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />;
        })}

        {data.map((row, index) => {
          const center = left + slot * index + slot / 2;
          const leadHeight = chartHeight - (yCount(row.paidLeads) - top);
          const meetingHeight = chartHeight - (yCount(row.meetings) - top);
          const googleAdsConversions = row.googleAdsConversions || 0;
          const conversionHeight = googleAdsConversions > 0 ? Math.max(3, chartHeight - (yCount(googleAdsConversions) - top)) : 0;
          const conversionY = googleAdsConversions > 0 ? top + chartHeight - conversionHeight : yCount(0);
          return (
            <g key={row.month}>
              {selectedMetrics.includes("googleAdsConversions") && (
                <>
                  <rect x={center - barWidth * 1.5 - 3} y={conversionY} width={barWidth} height={conversionHeight} rx={3} fill="#60a5fa" />
                  {googleAdsConversions > 0 && <text x={center - barWidth - 3} y={conversionY - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#60a5fa">{Math.round(googleAdsConversions)}</text>}
                </>
              )}
              {selectedMetrics.includes("paidLeads") && (
                <>
                  <rect x={center - barWidth / 2} y={yCount(row.paidLeads)} width={barWidth} height={leadHeight} rx={3} fill="#2563eb" />
                  {row.paidLeads > 0 && <text x={center} y={yCount(row.paidLeads) - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#2563eb">{row.paidLeads}</text>}
                </>
              )}
              {selectedMetrics.includes("meetings") && (
                <>
                  <rect x={center + barWidth / 2 + 3} y={yCount(row.meetings)} width={barWidth} height={meetingHeight} rx={3} fill="#16a34a" />
                  {row.meetings > 0 && <text x={center + barWidth + 3} y={yCount(row.meetings) - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#16a34a">{row.meetings}</text>}
                </>
              )}
              <text x={center} y={height - 20} textAnchor="middle" fontSize="11" fill="#64748b">{monthShort(row.month)}</text>
            </g>
          );
        })}

        {showLine && linePaths.some((series) => series.points.length > 0) && (
          <>
            {linePaths.map((series) => (
              <g key={series.key}>
                <path d={series.path} fill="none" stroke={series.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                {series.points.map((point, index) => (
                  <g key={index} opacity={0.68}>
                    <circle cx={point.x} cy={point.y} r={4} fill={series.color} />
                    <text x={point.x} y={Math.max(11, point.y - 9)} textAnchor="middle" fontSize="10" fontWeight="600" fill={series.color}>
                      {formatRate(point.value)}
                    </text>
                  </g>
                ))}
              </g>
            ))}
          </>
        )}


        </svg>
      </div>
    </div>
  );
}

function HintIcon({ text }: { text: string }) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const [measured, setMeasured] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, arrowLeft: 120 });
  const tooltipWidth = 240;
  const arrowGap = 6;
  const safetyMargin = 8;

  useEffect(() => {
    if (!open) {
      setMeasured(false);
      return;
    }
    if (!wrapperRef.current || !tooltipRef.current) return;
    const iconRect = wrapperRef.current.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current.offsetHeight;
    const iconCenter = iconRect.left + iconRect.width / 2;
    const viewportRight = window.innerWidth - safetyMargin;
    const left = Math.min(Math.max(iconCenter - tooltipWidth / 2, safetyMargin), viewportRight - tooltipWidth);
    const nextPlacement: "top" | "bottom" = iconRect.top >= tooltipHeight + arrowGap + safetyMargin ? "top" : "bottom";
    setPlacement(nextPlacement);
    setPosition({
      left,
      top: nextPlacement === "top" ? iconRect.top - tooltipHeight - arrowGap : iconRect.bottom + arrowGap,
      arrowLeft: iconCenter - left,
    });
    setMeasured(true);
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className="relative ml-1 inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={text}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white p-0 text-[9px] leading-none text-slate-400 hover:border-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
        onClick={(e) => e.preventDefault()}
      >
        ?
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          className="pointer-events-none fixed z-[9999] normal-case tracking-normal"
          style={{
            top: position.top,
            left: position.left,
            width: tooltipWidth,
            background: "#0f172a",
            color: "#f1f5f9",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 400,
            lineHeight: 1.45,
            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.15)",
            textAlign: "left",
            whiteSpace: "normal",
            opacity: measured ? 1 : 0,
            transition: measured ? "opacity 80ms ease-out" : undefined,
          }}
        >
          {text}
          <span
            aria-hidden
            className="absolute"
            style={{
              ...(placement === "top"
                ? { top: "100%", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #0f172a" }
                : { bottom: "100%", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: "5px solid #0f172a" }),
              left: position.arrowLeft,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
            }}
          />
        </span>,
        document.body,
      )}
    </span>
  );
}

function InfoTooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {label}
      <HintIcon text={text} />
    </span>
  );
}

function MonthlySalesFollowUpMetrics({ data }: { data: MonthlySalesPoint[] }) {
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
      <table className="min-w-full divide-y divide-slate-100 text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Month</th>
            <th className="px-3 py-2 text-right font-medium">Google Ads spend</th>
            <th className="px-3 py-2 text-right font-medium">Google Ads conversions</th>
            <th className="px-3 py-2 text-right font-medium">
              <InfoTooltip label="Keyword relevancy" text="Share of non-brand Google Ads spend that reached relevant searches for that month, using the same source as the Progress tab relevancy line." />
            </th>
            <th className="px-3 py-2 text-right font-medium">Paid leads</th>
            <th className="px-3 py-2 text-right font-medium">Meetings</th>
            <th className="px-3 py-2 text-right font-medium">MQL</th>
            <th className="px-3 py-2 text-right font-medium">SQL</th>
            <th className="px-3 py-2 text-right font-medium">
              <InfoTooltip label="Speed to first outreach" text="Average time from first conversion date when available, otherwise contact create date, to HubSpot first outreach date." />
            </th>
            <th className="px-3 py-2 text-right font-medium">
              <InfoTooltip label="Time to MQL" text="Average time for qualified paid-search leads to be marked Marketing Qualified Lead in HubSpot. Disqualified leads are excluded." />
            </th>
            <th className="px-3 py-2 text-right font-medium">
              <InfoTooltip label="Time to SQL" text="Average time for qualified paid-search leads to be marked Sales Qualified Lead in HubSpot. Disqualified leads are excluded." />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
          {data.map((row) => {
            const isCurrentMonth = row.month === currentMonth;
            const valueClassName = `px-3 py-2 text-right ${isCurrentMonth ? "font-bold text-slate-800" : "text-slate-600"}`;
            return (
              <tr key={row.month}>
                <td className={`px-3 py-2 ${isCurrentMonth ? "font-bold text-slate-800" : "font-medium text-slate-700"}`}>{monthFull(row.month)}</td>
                <td className={valueClassName}>{formatCurrency(row.googleAdsSpend)}</td>
                <td className={valueClassName}>{Math.round(row.googleAdsConversions || 0)}</td>
                <td className={valueClassName}>{formatRate(row.keywordRelevancy)}</td>
                <td className={valueClassName}>{row.paidLeads}</td>
                <td className={valueClassName}>{row.meetings}</td>
                <td className={valueClassName}>{row.mqls}</td>
                <td className={valueClassName}>{row.sqls}</td>
                <td className={valueClassName}>{formatDurationFromDays(row.avgDaysToFirstOutreach)}</td>
                <td className={valueClassName}>{formatDurationFromDays(row.avgDaysToMql)}</td>
                <td className={valueClassName}>{formatDurationFromDays(row.avgDaysToSql)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AttributionSection({ month, rows }: { month: string; rows: AttributionRow[] }) {
  const confidenceSummary = Array.from(new Set(rows.map((row) => CONFIDENCE_LABELS[row.searchTermConfidence] || row.searchTermConfidence))).join("; ");
  return (
    <section className="border-t border-slate-100 first:border-t-0">
      <div className="bg-slate-50 px-5 pb-3 pt-[15px]">
        <h4 className="text-sm font-semibold text-slate-800">{monthFull(month)}</h4>
        <p className="text-xs text-slate-400">Recent search-term evidence, meetings first.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-[1700px] table-fixed divide-y divide-slate-100 text-sm">
          <colgroup>
            <col style={{ width: 520 }} />
            <col style={{ width: 430 }} />
            <col style={{ width: 300 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 170 }} />
          </colgroup>
          <thead className="bg-white text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                <InfoTooltip label="Search term evidence" text={`Best available evidence from Google Ads. Search terms are not contact-level exact because Google separates GCLID click data from search-term reporting. Confidence in this section: ${confidenceSummary || "No rows yet"}.`} />
              </th>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Keyword</th>
              <th className="px-3 py-2 text-right font-medium">Meetings</th>
              <th className="px-3 py-2 text-right font-medium">
                <InfoTooltip label="Meeting rate" text="HubSpot meetings divided by paid leads. Can exceed 100% if one lead has multiple meetings." />
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <InfoTooltip label="Lead quality" text="Qualified leads divided by paid leads. Unqualified means HubSpot status contains unqualified, dead, junk, spam, or not model aligned." />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <InfoTooltip label="Confidence" text="Single candidate = one possible matching search term. Multiple candidates = several possible search terms. Keyword fallback = keyword known, exact search term unavailable. HubSpot fallback = using HubSpot paid-search source fields only." />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? rows.map((row, index) => (
              <tr key={`${row.month}-${row.campaignName}-${row.keywordText}-${index}`} className="hover:bg-slate-50/70">
                <td
                  className={`truncate px-3 py-1.5 ${row.searchTermConfidence === "keyword_fallback" ? "text-red-400" : "text-slate-800"}`}
                  title={row.searchTermConfidence === "keyword_fallback" ? `Keyword fallback: ${row.keywordText}` : row.searchTermEvidence}
                >
                  {row.searchTermConfidence === "keyword_fallback" ? row.keywordText : row.searchTermEvidence}
                </td>
                <td className="truncate whitespace-nowrap px-3 py-1.5 text-slate-600" title={row.campaignName}>{row.campaignName}</td>
                <td className="truncate whitespace-nowrap px-3 py-1.5 text-slate-600" title={row.keywordText}>
                  {row.keywordText}
                  {row.keywordMatchType && <span className="ml-1 text-xs text-slate-400">({row.keywordMatchType})</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-medium text-slate-800">{row.meetings}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{formatRate(row.meetingRate)}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{formatRate(row.qualifiedLeadRate)}</td>
                <td className="px-3 py-1.5 text-left text-slate-500">
                  <span className={`inline-flex whitespace-nowrap cursor-help rounded-full px-2 py-0 text-[10px] font-medium ${CONFIDENCE_STYLES[row.searchTermConfidence] || "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`} title={CONFIDENCE_DESCRIPTIONS[row.searchTermConfidence] || row.searchTermConfidence}>
                    {CONFIDENCE_LABELS[row.searchTermConfidence] || row.searchTermConfidence}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-400">No attribution rows for {monthFull(month)} yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function leadDetailStatus(lead: LeadDetail): string {
  return lead.leadStatus || lead.lifecycleStage || (lead.isQualifiedLead ? "Qualified" : "Unqualified");
}

function leadDetailMatchesSearch(lead: LeadDetail, query: string): boolean {
  if (!query) return true;
  const haystack = [
    lead.contactName,
    lead.company,
    lead.email,
    lead.campaignName,
    lead.hubspotCampaign,
    lead.adGroupName,
    lead.keywordText,
    lead.hubspotKeyword,
    lead.searchTermEvidence.join(" "),
    leadDetailStatus(lead),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function exportLeadDetailsCsv(leads: LeadDetail[]): void {
  const headers = ["Created", "Company/contact", "Email", "Campaign", "Ad group", "Keyword", "Search term evidence", "Meeting count", "Meeting dates", "Calls", "Lead status"];
  const rows = leads.map((lead) => [
    formatDate(lead.createdAt),
    lead.company || lead.contactName,
    lead.email || "",
    lead.campaignName || lead.hubspotCampaign || "",
    lead.adGroupName || "",
    lead.keywordText || lead.hubspotKeyword || "",
    lead.searchTermEvidence.join(", "),
    lead.meetings,
    lead.meetingDates.map(formatDate).join(", "),
    lead.calls,
    leadDetailStatus(lead),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lead-details-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
export function HubSpotPostClickTab({ data, monthlyWasteRelevancy }: { data: HubSpotPostClickDashboardData; monthlyWasteRelevancy?: GoogleAdsDashboardMonthlyWasteRelevancy[] }) {
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(["googleAdsConversions", "paidLeads", "meetings", "meetingRate"]);
  const [showLeadDetails, setShowLeadDetails] = useState(false);
  const [leadMonthFilter, setLeadMonthFilter] = useState("all");
  const [leadMeetingFilter, setLeadMeetingFilter] = useState<MeetingFilter>("all");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [leadCampaignFilter, setLeadCampaignFilter] = useState("all");
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const monthlyChartData = usePostClickMonthlyData(data.monthly, data.leadDetails, monthlyWasteRelevancy);
  const recentMonths = useMemo(() => buildMonthKeys(6).reverse(), []);
  const rowsByMonth = useMemo(() => {
    const map = new Map<string, AttributionRow[]>();
    for (const month of recentMonths) map.set(month, []);
    for (const row of data.attributionRows) {
      if (!map.has(row.month)) continue;
      map.get(row.month)?.push(row);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => b.meetings - a.meetings || b.paidLeads - a.paidLeads || a.searchTermEvidence.localeCompare(b.searchTermEvidence));
    }
    return map;
  }, [data.attributionRows, recentMonths]);
  const leadFilterOptions = useMemo(() => {
    const months = Array.from(new Set(data.leadDetails.map((lead) => lead.month))).sort().reverse();
    const statuses = Array.from(new Set(data.leadDetails.map(leadDetailStatus))).filter(Boolean).sort();
    const campaigns = Array.from(new Set(data.leadDetails.map((lead) => lead.campaignName || lead.hubspotCampaign || "Unknown campaign"))).filter(Boolean).sort();
    return { months, statuses, campaigns };
  }, [data.leadDetails]);
  const filteredLeadDetails = useMemo(() => data.leadDetails.filter((lead) => {
    if (leadMonthFilter !== "all" && lead.month !== leadMonthFilter) return false;
    if (leadMeetingFilter === "yes" && lead.meetings <= 0) return false;
    if (leadMeetingFilter === "no" && lead.meetings > 0) return false;
    if (leadStatusFilter !== "all" && leadDetailStatus(lead) !== leadStatusFilter) return false;
    if (leadCampaignFilter !== "all" && (lead.campaignName || lead.hubspotCampaign || "Unknown campaign") !== leadCampaignFilter) return false;
    return leadDetailMatchesSearch(lead, leadSearchQuery.trim());
  }), [data.leadDetails, leadCampaignFilter, leadMeetingFilter, leadMonthFilter, leadSearchQuery, leadStatusFilter]);

  return (
    <div className="space-y-6">
      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Lead Quality</h2>
            <p className="mt-1 text-sm text-slate-500">
              Last 14 months of selected Google Ads conversions, paid leads, HubSpot meetings, meeting rate, and disqualified rate.
            </p>
          </div>
          <span className="text-xs text-slate-400">Updated {formatDate(data.lastUpdated)}</span>
        </div>

        <div className="mt-5">
          <PostClickMonthlyChart
            data={monthlyChartData}
            selectedMetrics={selectedMetrics}
            onToggleMetric={(key) => setSelectedMetrics((current) => toggleMetricSelection(current, key))}
          />
        </div>

        <div className="mt-5 grid gap-3 text-xs text-slate-600 md:grid-cols-5">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-semibold text-slate-800">Google Ads conversions</p>
            <p className="mt-1">Selected Google Ads conversion actions. One person can trigger multiple conversions, and some actions are not HubSpot contacts.</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-semibold text-slate-800">Paid leads</p>
            <p className="mt-1">HubSpot contacts attributed to paid search. This is lower when HubSpot misses attribution or the Google Ads conversion was not a contact.</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-semibold text-slate-800">HubSpot meetings</p>
            <p className="mt-1">Meetings booked or recorded on the paid-search contact in HubSpot, including associated meeting records and meeting activity fields.</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-semibold text-slate-800">Meeting rate</p>
            <p className="mt-1">HubSpot meetings divided by paid leads. It can go above 100% if one paid lead has multiple meetings.</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-semibold text-slate-800">Disqualified rate</p>
            <p className="mt-1">Paid leads marked unqualified, dead, junk, spam, or not model aligned divided by paid leads.</p>
          </div>
          </div>

        </div>
      </div>

      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Sales follow-up timing</h3>
            <p className="mt-1 text-xs text-slate-400">Average time from paid-search lead creation/conversion to HubSpot sales milestones.</p>
          </div>
          <MonthlySalesFollowUpMetrics data={monthlyChartData} />
        </div>
      </div>

      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Recent attribution by search evidence</h3>
          <p className="mt-1 text-xs text-slate-400">Fresh HubSpot and Google Ads pull each time this tab loads or the dashboard range refreshes. Latest six months shown newest first.</p>
        </div>
          {recentMonths.map((month) => (
            <AttributionSection key={month} month={month} rows={rowsByMonth.get(month) || []} />
          ))}
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-xs leading-relaxed text-slate-500">
            <p className="font-semibold text-slate-700">Confidence guide</p>
            <p className="mt-1">
              <span className="font-medium text-slate-600">Single candidate</span> = one possible matching search term. {" "}
              <span className="font-medium text-slate-600">Multiple candidates</span> = several possible search terms. {" "}
              <span className="font-medium text-slate-600">Keyword fallback</span> = matched Google Ads click/keyword but no search-term row. {" "}
              <span className="font-medium text-slate-600">HubSpot fallback</span> = using HubSpot paid-search source fields only.
            </p>
          </div>
        </div>
      </div>

      <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setShowLeadDetails((open) => !open)}
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-700"
          >
            <span>Lead details</span>
            <span className="text-xs text-slate-400">{showLeadDetails ? "Hide" : "Show"}</span>
          </button>
          {showLeadDetails && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 md:grid-cols-6">
                <label className="space-y-1">
                  <span className="font-medium text-slate-700">Month</span>
                  <select value={leadMonthFilter} onChange={(event) => setLeadMonthFilter(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5">
                    <option value="all">All months</option>
                    {leadFilterOptions.months.map((month) => <option key={month} value={month}>{monthFull(month)}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="font-medium text-slate-700">Meeting?</span>
                  <select value={leadMeetingFilter} onChange={(event) => setLeadMeetingFilter(event.target.value as MeetingFilter)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5">
                    <option value="all">All</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="font-medium text-slate-700">Lead status</span>
                  <select value={leadStatusFilter} onChange={(event) => setLeadStatusFilter(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5">
                    <option value="all">All statuses</option>
                    {leadFilterOptions.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="font-medium text-slate-700">Campaign</span>
                  <select value={leadCampaignFilter} onChange={(event) => setLeadCampaignFilter(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5">
                    <option value="all">All campaigns</option>
                    {leadFilterOptions.campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}
                  </select>
                </label>
                <div className="flex items-end">
                  <button type="button" onClick={() => exportLeadDetailsCsv(filteredLeadDetails)} className="w-full rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700">
                    Export CSV ({filteredLeadDetails.length})
                  </button>
                </div>
                <label className="space-y-1 md:col-span-6">
                  <span className="font-medium text-slate-700">Search lead details</span>
                  <input value={leadSearchQuery} onChange={(event) => setLeadSearchQuery(event.target.value)} placeholder="Company, contact, keyword, search term..." className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5" />
                </label>
              </div>
              <p className="text-xs text-slate-400">Showing {filteredLeadDetails.length} of {data.leadDetails.length} leads. CSV export uses these filters.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Created</th>
                      <th className="px-4 py-3 text-left font-medium">Company/contact</th>
                      <th className="px-4 py-3 text-left font-medium">Campaign</th>
                      <th className="px-4 py-3 text-left font-medium">Ad group</th>
                      <th className="px-4 py-3 text-left font-medium">Keyword</th>
                      <th className="px-4 py-3 text-left font-medium">Search term evidence</th>
                      <th className="px-4 py-3 text-left font-medium">Meeting?</th>
                      <th className="px-4 py-3 text-left font-medium">Lead status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeadDetails.length ? filteredLeadDetails.map((lead) => (
                      <tr key={lead.contactId}>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(lead.createdAt)}</td>
                        <td className="min-w-[180px] px-4 py-3 text-slate-800">{lead.company || lead.contactName}</td>
                        <td className="min-w-[180px] px-4 py-3 text-slate-600">{lead.campaignName || lead.hubspotCampaign || "—"}</td>
                        <td className="min-w-[160px] px-4 py-3 text-slate-600">{lead.adGroupName || "—"}</td>
                        <td className="min-w-[160px] px-4 py-3 text-slate-600">{lead.keywordText || lead.hubspotKeyword || "—"}</td>
                        <td className="min-w-[220px] px-4 py-3 text-slate-600">{lead.searchTermEvidence.join(", ")}</td>
                        <td className="px-4 py-3 text-slate-600">{lead.meetings > 0 ? `Yes (${lead.meetings})` : "No"}</td>
                        <td className="min-w-[160px] px-4 py-3 text-slate-600">{leadDetailStatus(lead)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-400">No lead details match these filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900">
        <p className="font-semibold">Confidence note</p>
        <p className="mt-1">
          Search terms are evidence-based: click_view can match GCLID to campaign/ad group/keyword, while search_term_view supplies possible search terms without contact-level GCLID.
        </p>
        <p className="mt-2 text-blue-800">
          Checked {data.diagnostics.paidGoogleLeadsChecked} paid leads; {data.diagnostics.gclidsMatchedToClickView} matched to click_view; {data.diagnostics.searchTermRows} search-term rows found.
          {data.diagnostics.clickViewLookbackLimited ? " Older dates may use keyword or HubSpot source fallback because click_view is limited." : ""}
        </p>
        {data.diagnostics.notes.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-blue-800">
            {data.diagnostics.notes.slice(0, 3).map((note) => <li key={note}>{note}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
