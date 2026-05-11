"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type {
  GoogleAdsDashboardData,
  GoogleAdsDashboardMonthly,
  GoogleAdsDashboardKeyword,
} from "@/lib/dashboard-types";
import { DASHBOARD_MONTHLY_WINDOW, padMonthlySeries } from "@/lib/dashboard-types";
import { StackedBarChart, type BarData } from "@/components/dashboards/shared/StackedBarChart";
import { KpiCard } from "@/components/dashboards/shared/KpiCard";

/* ── Stakeholder view ───────────────────────────────────────────────
 * A one-page Google Ads summary stripped to what the business cares
 * about: month-over-month spend, clicks, CPA, conversions, plus a
 * 14-month stacked bar of conversions by type and the GA4 channel
 * split. No deep marketing context. No tabs.
 *
 * Powered by the same Growth Tools payload the full dashboard uses —
 * this is a purely visual reduction.
 * ─────────────────────────────────────────────────────────────────── */

interface SimpleDashboardProps {
  data: GoogleAdsDashboardData;
  conversionActionCategories?: string;
  clientId?: string;
  /** Where the "Detailed view" link points. */
  detailedHref?: string;
}

const RANGE_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
] as const;

/* ── Colour palette for the conversion-type stacked bar.
 * Loops through these in order as categories are encountered. Matches
 * the conversion-action category colours from ConversionSplit.tsx for
 * consistency. */
const CATEGORY_COLORS = [
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#ec4899", // pink
];

interface CategoryDef {
  label: string;
  color: string;
}

function monthLabel(yyyymm: string): string {
  const [, mm] = yyyymm.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(mm, 10) - 1] || mm;
}

function parseCategories(json?: string): CategoryDef[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ label?: string; color?: string }>;
    return parsed
      .filter((c) => c && typeof c.label === "string" && c.label.trim().length > 0)
      .map((c, i) => ({
        label: String(c.label).trim(),
        // The full dashboard uses semantic names (sky/violet/emerald…);
        // here we already have the hex set so we just round-robin if no
        // explicit hex was provided. Falls back to palette index.
        color: resolveColor(c.color, i),
      }));
  } catch {
    return [];
  }
}

const COLOR_MAP: Record<string, string> = {
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#94a3b8",
  indigo: "#6366f1",
  teal: "#14b8a6",
  pink: "#ec4899",
};

function resolveColor(name: string | undefined, fallbackIndex: number): string {
  if (name && COLOR_MAP[name]) return COLOR_MAP[name];
  if (name && /^#[0-9a-f]{6}$/i.test(name)) return name;
  return CATEGORY_COLORS[fallbackIndex % CATEGORY_COLORS.length];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Ga4Channel {
  channel: string;
  conversions: number;
}

export function SimpleDashboard({
  data: initialData,
  conversionActionCategories,
  clientId,
  detailedHref,
}: SimpleDashboardProps) {
  const [data, setData] = useState(initialData);
  const [compareMode, setCompareMode] = useState<"month" | "year">("year");
  const [range, setRange] = useState(initialData.range || "this_month");
  const [loading, setLoading] = useState(false);
  const [ga4Channels, setGa4Channels] = useState<Ga4Channel[] | null>(null);
  const [ga4Loading, setGa4Loading] = useState(false);

  /* ── Reload Google Ads data on range change ── */
  const changeRange = useCallback(
    (next: string) => {
      if (next === range) return;
      setRange(next);
      setLoading(true);
      const params = new URLSearchParams({ slug: data.slug || "", range: next });
      if (data.customerId) params.set("customerId", data.customerId);
      if (data.clientName) params.set("clientName", data.clientName);
      if (conversionActionCategories) {
        params.set("conversionActionCategories", conversionActionCategories);
      }
      fetch(`/api/dashboard/data?${params}`, { credentials: "include", cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((next) => {
          if (next) {
            setData((prev) => ({
              ...prev,
              ...next,
              slug: prev.slug,
              customerId: prev.customerId,
              clientName: prev.clientName,
            }));
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [range, data.slug, data.customerId, data.clientName, conversionActionCategories],
  );

  /* ── Load GA4 channel conversions once on mount.
   *    Independent of the Ads range (GA4 has its own period mapping). */
  useEffect(() => {
    if (!clientId || !data.slug) return;
    setGa4Loading(true);
    const params = new URLSearchParams({ slug: data.slug, period: ga4PeriodFor(range) });
    fetch(`/api/dashboard/ga4-channels?${params}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.channels) setGa4Channels(payload.channels);
      })
      .catch(() => {})
      .finally(() => setGa4Loading(false));
  }, [clientId, data.slug, range]);

  /* ── Resolve categories. Falls back to discovering them from the
   *    monthly trend's `conversionsByAction` so the chart still
   *    renders even when categories aren't configured. */
  const categories = useMemo<CategoryDef[]>(() => {
    const configured = parseCategories(conversionActionCategories);
    if (configured.length > 0) return configured;
    // Discover from trend data
    const seen = new Set<string>();
    for (const m of data.monthlyTrend ?? []) {
      const byAction = m.conversionsByAction;
      if (byAction) {
        for (const k of Object.keys(byAction)) seen.add(k);
      }
    }
    return Array.from(seen).map((label, i) => ({
      label,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  }, [conversionActionCategories, data.monthlyTrend]);

  /* ── 14-month conversion-type stacked bar.
   *    For each month, build segments per category. If no categories
   *    exist, fall back to one "Conversions" bar so the user still
   *    sees a trend. */
  const conversionBars = useMemo<BarData[]>(() => {
    const padded = padMonthlySeries<GoogleAdsDashboardMonthly>(
      data.monthlyTrend,
      DASHBOARD_MONTHLY_WINDOW,
      (month) => ({ month, spend: 0, conversions: 0, brandSpend: 0, genericSpend: 0 }),
    );
    return padded.map((m) => {
      const label = monthLabel(m.month);
      if (categories.length === 0) {
        // No category breakdown — single grey bar of total conversions
        return {
          label,
          segments: [
            {
              value: Math.round(m.conversions || 0),
              color: "#94a3b8",
              label: "Conversions",
            },
          ],
        };
      }
      // Try to use per-action breakdown for this month; if missing,
      // proportionally split the month's conversions across categories
      // using the rolled-up category totals as a heuristic.
      const byAction = m.conversionsByAction || {};
      const segments = categories.map((c, i) => ({
        value: Math.max(0, Math.round(byAction[c.label] ?? 0)),
        color: c.color || CATEGORY_COLORS[i % CATEGORY_COLORS.length],
        label: c.label,
      }));
      const sum = segments.reduce((s, x) => s + x.value, 0);
      // If the per-month breakdown is empty but total conversions > 0,
      // fall back to a single grey segment so the user still sees the
      // bar (rather than a confusing flat zero).
      if (sum === 0 && (m.conversions ?? 0) > 0) {
        return {
          label,
          segments: [
            { value: Math.round(m.conversions), color: "#94a3b8", label: "Conversions" },
          ],
        };
      }
      return { label, segments };
    });
  }, [data.monthlyTrend, categories]);

  /* ── Top 10 keywords by conversion + by spend ── */
  const topByConversion = useMemo<GoogleAdsDashboardKeyword[]>(() => {
    return [...(data.topKeywords ?? [])]
      .sort((a, b) => (b.conversions ?? 0) - (a.conversions ?? 0))
      .slice(0, 10);
  }, [data.topKeywords]);

  const topBySpend = useMemo<GoogleAdsDashboardKeyword[]>(() => {
    return [...(data.topKeywords ?? [])]
      .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
      .slice(0, 10);
  }, [data.topKeywords]);

  const rangeLabel =
    RANGE_OPTIONS.find((r) => r.value === range)?.label || data.dateRangeLabel || "Selected period";

  return (
    <div className="od-dashboard-root min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-[11px] pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt={data.clientName}
                className="w-auto object-contain"
                style={{ height: "28px" }}
              />
            ) : (
              <h1
                className="font-bold tracking-tight text-slate-900 leading-tight my-0"
                style={{ fontSize: "26px", transform: "translateY(-1px)" }}
              >
                {data.clientName}
              </h1>
            )}
            <span className="text-slate-400 font-normal" style={{ fontSize: "18px" }}>
              Performance Overview
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Date range */}
            <select
              value={range}
              onChange={(e) => changeRange(e.target.value)}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Comparison mode */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setCompareMode("month")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  compareMode === "month"
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                vs Last Month
              </button>
              <button
                type="button"
                onClick={() => setCompareMode("year")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  compareMode === "year"
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                vs Last Year
              </button>
            </div>

            {detailedHref && (
              <a
                href={detailedHref}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                Detailed view →
              </a>
            )}
          </div>
        </div>

        {/* Subline: range + last updated */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-slate-500">
            {rangeLabel} · {compareMode === "year" ? "vs same period last year" : "vs previous month"}
          </p>
          <p className="text-xs text-slate-400">
            Updated {timeAgo(data.lastUpdated)}
          </p>
        </div>

        {/* KPI row — exactly the 4 numbers stakeholders care about. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="Conversions"
            value={data.kpis.conversions}
            previousValue={
              compareMode === "year" ? data.kpis.yoyConversions : data.kpis.prevConversions
            }
            format="number"
            comparisonLabel={compareMode === "year" ? "vs last year" : "vs prev month"}
          />
          <KpiCard
            label="Cost per Acquisition"
            value={data.kpis.cpa}
            previousValue={compareMode === "year" ? data.kpis.yoyCpa : data.kpis.prevCpa}
            format="dollars"
            invertColors
            comparisonLabel={compareMode === "year" ? "vs last year" : "vs prev month"}
          />
          <KpiCard
            label="Clicks"
            value={data.kpis.clicks}
            previousValue={
              compareMode === "year" ? data.kpis.yoyClicks : data.kpis.prevClicks
            }
            format="number"
            comparisonLabel={compareMode === "year" ? "vs last year" : "vs prev month"}
          />
          <KpiCard
            label="Spend"
            value={data.kpis.spend}
            previousValue={compareMode === "year" ? data.kpis.yoySpend : data.kpis.prevSpend}
            format="dollars"
            comparisonLabel={compareMode === "year" ? "vs last year" : "vs prev month"}
          />
        </div>

        {/* 14-month stacked bar of conversion types */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
              Conversions by Type — Last 14 Months
            </h2>
            {categories.length === 0 && (
              <span className="text-[11px] text-slate-400">
                Conversion categories not configured — showing totals
              </span>
            )}
          </div>
          <StackedBarChart data={conversionBars} lineColor="#0f172a" height={240} />
        </div>

        {/* Top 10 keywords — two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <SimpleKeywordTable
            title="Top 10 Keywords by Conversion"
            keywords={topByConversion}
            sortField="conversions"
          />
          <SimpleKeywordTable
            title="Top 10 Keywords by Spend"
            keywords={topBySpend}
            sortField="spend"
          />
        </div>

        {/* GA4 conversions by channel */}
        <GA4ChannelCard channels={ga4Channels} loading={ga4Loading} />

        <div className="mt-6 text-center text-xs text-slate-400">
          Optimise Digital · Google Ads + GA4 performance summary
        </div>
      </div>
    </div>
  );
}

/* ── GA4 period mapping.
 * The Ads dashboard uses range presets; GA4 takes simple day/month windows.
 * Map between them so the channel data roughly matches the Ads period. */
function ga4PeriodFor(adsRange: string): string {
  switch (adsRange) {
    case "this_month":
    case "last_month":
      return "30d";
    case "last_3_months":
      return "90d";
    case "this_year":
    case "last_year":
      return "12m";
    default:
      return "30d";
  }
}

/* ── Top-keywords table ── */

interface SimpleKeywordTableProps {
  title: string;
  keywords: GoogleAdsDashboardKeyword[];
  sortField: "conversions" | "spend";
}

function SimpleKeywordTable({ title, keywords, sortField }: SimpleKeywordTableProps) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </h2>
      {keywords.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No keyword data for this period</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-2">Keyword</th>
              <th className="py-2 px-2 text-right">Conv</th>
              <th className="py-2 pl-2 text-right">Spend</th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((k) => (
              <tr
                key={k.term}
                className={`border-b border-slate-50 last:border-0 ${
                  sortField === "conversions" ? "" : ""
                }`}
              >
                <td className="py-2 pr-2 text-slate-800 truncate max-w-[260px]" title={k.term}>
                  {k.term}
                </td>
                <td className="py-2 px-2 text-right text-slate-700 tabular-nums">
                  {Math.round(k.conversions ?? 0).toLocaleString()}
                </td>
                <td className="py-2 pl-2 text-right text-slate-700 tabular-nums">
                  {formatDollars(k.spend ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── GA4 channel card.
 * Horizontal bar list — each channel as a row with bar + count, sorted
 * by conversions desc. Familiar pattern from finance dashboards; reads
 * fast even for non-marketers. */

function GA4ChannelCard({
  channels,
  loading,
}: {
  channels: Ga4Channel[] | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Website Conversions by Channel (GA4)
        </h2>
        <span className="text-[11px] text-slate-400">
          Where conversions came from across all traffic, not just Google Ads
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Loading GA4…</p>
      ) : !channels ? (
        <p className="text-sm text-slate-400 py-6 text-center">
          GA4 not connected for this client.
        </p>
      ) : channels.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No GA4 conversions in this period.</p>
      ) : (
        <ChannelBarList channels={channels} />
      )}
    </div>
  );
}

function ChannelBarList({ channels }: { channels: Ga4Channel[] }) {
  const sorted = [...channels].sort((a, b) => b.conversions - a.conversions);
  const max = Math.max(...sorted.map((c) => c.conversions), 1);
  const grand = sorted.reduce((s, c) => s + c.conversions, 0);

  return (
    <div className="space-y-2.5">
      {sorted.map((c) => {
        const pct = max > 0 ? (c.conversions / max) * 100 : 0;
        const sharePct = grand > 0 ? (c.conversions / grand) * 100 : 0;
        return (
          <div key={c.channel} className="grid grid-cols-[140px_1fr_80px] items-center gap-3">
            <span className="text-sm text-slate-700 truncate" title={c.channel}>
              {c.channel}
            </span>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: channelColor(c.channel),
                  transition: "width 200ms ease-out",
                }}
              />
            </div>
            <span className="text-sm text-slate-700 tabular-nums text-right">
              {Math.round(c.conversions).toLocaleString()}{" "}
              <span className="text-[11px] text-slate-400">({sharePct.toFixed(0)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Channel colour mapping.
 * GA4's default channel grouping has stable names — paint them
 * consistently so stakeholders learn the colours. Unknown channels
 * fall back to slate. */
const CHANNEL_COLORS: Record<string, string> = {
  "Paid Search": "#3b82f6",
  "Organic Search": "#10b981",
  Direct: "#6366f1",
  Referral: "#8b5cf6",
  "Organic Social": "#ec4899",
  "Paid Social": "#f43f5e",
  Email: "#f59e0b",
  Display: "#14b8a6",
  Affiliates: "#a855f7",
  "Cross-network": "#0ea5e9",
  Unassigned: "#94a3b8",
};

function channelColor(name: string): string {
  return CHANNEL_COLORS[name] || "#94a3b8";
}

function formatDollars(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
