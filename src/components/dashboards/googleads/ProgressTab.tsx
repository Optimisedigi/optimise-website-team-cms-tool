"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type {
  GoogleAdsDashboardMonthly,
  GoogleAdsDashboardSearchTerm,
  GoogleAdsDashboardKpis,
} from "@/lib/dashboard-types";

interface ProgressTabProps {
  monthlyTrend: GoogleAdsDashboardMonthly[];
  budgetWasters: GoogleAdsDashboardSearchTerm[];
  kpis: GoogleAdsDashboardKpis;
}

type ProgressMetric = "spend" | "conversions" | "cpa" | "wasteRate";

const METRIC_CONFIG: Record<
  ProgressMetric,
  { label: string; color: string; format: (v: number) => string; description: string }
> = {
  spend: {
    label: "Monthly Spend",
    color: "#3b82f6",
    format: (v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`),
    description: "Total ad spend per month",
  },
  conversions: {
    label: "Conversions",
    color: "#10b981",
    format: (v) => String(Math.round(v)),
    description: "Total conversions per month",
  },
  cpa: {
    label: "CPA",
    color: "#f59e0b",
    format: (v) => (v > 0 ? `$${Math.round(v)}` : "\u2014"),
    description: "Average cost to acquire one conversion",
  },
  wasteRate: {
    label: "Non-Converting Spend %",
    color: "#ef4444",
    format: (v) => `${v.toFixed(1)}%`,
    description:
      "Estimated share of spend going to search terms that didn't convert in the selected period. Some of this is normal \u2014 the goal is to keep it trending down.",
  },
};

function monthLabel(yyyymm: string): string {
  const parts = yyyymm.split("-");
  const mm = parts[1] || "01";
  const yy = (parts[0] || "").slice(2);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(mm, 10) - 1] || mm} '${yy}`;
}

function changeLabel(current: number, previous: number): { text: string; positive: boolean } | null {
  if (previous === 0) return null;
  const pctChange = ((current - previous) / previous) * 100;
  const sign = pctChange >= 0 ? "+" : "";
  return {
    text: `${sign}${pctChange.toFixed(1)}%`,
    positive: pctChange >= 0,
  };
}

// SVG trend line chart — supports 1–3 metrics overlayed on the same x-axis.
// Each metric is normalised to its own value range (rendered as 0–100% of
// the plotting area) so they can share an axis without one dwarfing another.
// Y-axis tick labels are shown only when a single metric is selected;
// multi-metric mode hides them since each line uses its own scale and the
// legend below the chart shows the latest actual values per metric.
interface TrendChartProps {
  points: Array<{ label: string } & Record<ProgressMetric, number>>;
  metrics: ProgressMetric[];
}

function TrendChart({ points, metrics }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isSingle = metrics.length === 1;
  const soloMetric = isSingle ? metrics[0] : null;
  const soloConfig = soloMetric ? METRIC_CONFIG[soloMetric] : null;

  const height = 260;
  const padTop = 30;
  const padBottom = 40;
  const padLeft = isSingle ? 55 : 20; // no Y labels when overlaying multiple
  const padRight = 20;
  const chartH = height - padTop - padBottom;
  const chartW = width - padLeft - padRight;

  // Per-metric Y range (each metric scaled to its own min/max with a 10%
  // headroom and the floor clamped at 0 so lines don't sit on the bottom).
  const metricRange: Record<ProgressMetric, { yMin: number; yMax: number; yRange: number }> = {} as any;
  for (const m of metrics) {
    const vals = points.map((p) => p[m]);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const range = maxVal - minVal || 1;
    const yMin = Math.max(minVal - range * 0.1, 0);
    const yMax = maxVal + range * 0.1;
    metricRange[m] = { yMin, yMax, yRange: yMax - yMin || 1 };
  }

  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;

  function toX(i: number) {
    return padLeft + i * xStep;
  }
  function toY(metric: ProgressMetric, v: number) {
    const { yMin, yRange } = metricRange[metric];
    return padTop + chartH - ((v - yMin) / yRange) * chartH;
  }

  // Solo-metric Y-axis ticks (only meaningful for single-metric mode).
  const yTicks =
    isSingle && soloMetric
      ? Array.from({ length: 5 }, (_, i) => {
          const { yMin, yRange } = metricRange[soloMetric];
          const val = yMin + (yRange * i) / 4;
          return { val, y: toY(soloMetric, val) };
        })
      : [];

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={height}>
          <defs>
            {metrics.map((m) => (
              <linearGradient key={m} id={`grad-${m}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={METRIC_CONFIG[m].color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={METRIC_CONFIG[m].color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          {/* Grid lines + Y labels (single-metric mode) or just gridlines
              spaced 1/4 of the chart in multi-metric mode. */}
          {(isSingle ? yTicks : Array.from({ length: 5 }, (_, i) => ({ y: padTop + (chartH * i) / 4, val: 0 }))).map((tick, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={tick.y}
                y2={tick.y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              {isSingle && soloConfig && (
                <text
                  x={padLeft - 8}
                  y={tick.y + 4}
                  fontSize={10}
                  fill="#94a3b8"
                  textAnchor="end"
                >
                  {soloConfig.format(tick.val)}
                </text>
              )}
            </g>
          ))}

          {/* Per-metric area fill (only in single-metric mode — stacking
              translucent areas on each other gets muddy fast). */}
          {isSingle && soloMetric && points.length > 1 && (
            <path
              d={
                `M${toX(0)},${toY(soloMetric, points[0][soloMetric])} ` +
                points.slice(1).map((p, i) => `L${toX(i + 1)},${toY(soloMetric, p[soloMetric])}`).join(" ") +
                ` L${toX(points.length - 1)},${padTop + chartH} L${toX(0)},${padTop + chartH} Z`
              }
              fill={`url(#grad-${soloMetric})`}
            />
          )}

          {/* Lines + dots, one per selected metric */}
          {metrics.map((m) => {
            const config = METRIC_CONFIG[m];
            const linePath = points
              .map((p, i) => `${toX(i)},${toY(m, p[m])}`)
              .join(" ");
            return (
              <g key={m}>
                <polyline
                  points={linePath}
                  fill="none"
                  stroke={config.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map((p, i) => (
                  <g key={`${m}-${i}`}>
                    <circle
                      cx={toX(i)}
                      cy={toY(m, p[m])}
                      r={3}
                      fill="white"
                      stroke={config.color}
                      strokeWidth={2}
                    />
                    {/* Value labels: only in single-metric mode (multi gets crowded fast) */}
                    {isSingle &&
                      (i === 0 || i === points.length - 1 || i % 3 === 0) && (
                        <text
                          x={toX(i)}
                          y={toY(m, p[m]) - 10}
                          fontSize={10}
                          fill={config.color}
                          textAnchor="middle"
                          fontWeight="600"
                        >
                          {config.format(p[m])}
                        </text>
                      )}
                  </g>
                ))}
              </g>
            );
          })}

          {/* X axis labels */}
          {points.map((p, i) => {
            if (points.length > 8 && i % 2 !== 0 && i !== points.length - 1) return null;
            return (
              <text
                key={`x-${i}`}
                x={toX(i)}
                y={height - 10}
                fontSize={10}
                fill="#94a3b8"
                textAnchor="middle"
              >
                {p.label}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// Summary stat card — dimensions, padding, and font sizes match the Overview
// tab's KpiCard so rows under tabs are visually consistent across the
// dashboard. Value 20px / label 10px uppercase / change 10px.
function StatCard({
  label,
  value,
  change,
  invertChange,
  comparisonLabel,
  hint,
}: {
  label: string;
  value: string;
  change: { text: string; positive: boolean } | null;
  invertChange?: boolean;
  comparisonLabel?: string;
  /** Tooltip text shown on hover of a small (?) next to the label. */
  hint?: string;
}) {
  const isGood = change
    ? invertChange
      ? !change.positive
      : change.positive
    : null;

  return (
    <div
      className="rounded-xl bg-white border border-slate-200 shadow-sm px-4 text-center"
      style={{ paddingTop: 3, paddingBottom: 3 }}
    >
      <p
        className="text-xs font-medium uppercase tracking-wider text-slate-500 inline-flex items-center justify-center gap-1"
        style={{ lineHeight: 1.4 }}
      >
        <span>{label}</span>
        {hint && (
          <span
            title={hint}
            aria-label={hint}
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-300 text-slate-400 cursor-help"
            style={{ fontSize: 9, lineHeight: 1 }}
          >
            ?
          </span>
        )}
      </p>
      <p
        className="font-bold text-slate-900"
        style={{ fontSize: 20, lineHeight: 1, paddingTop: 4 }}
      >
        {value}
      </p>
      {change ? (
        <p
          className={`text-[10px] font-medium ${isGood ? "text-emerald-600" : "text-red-500"}`}
          style={{ lineHeight: 1.4 }}
        >
          {change.text} {comparisonLabel ?? "vs prev month"}
        </p>
      ) : (
        <p className="text-[10px] text-slate-400" style={{ lineHeight: 1.4 }}>
           
        </p>
      )}
    </div>
  );
}

const MAX_SELECTED_METRICS = 3;
const METRIC_ORDER: ProgressMetric[] = ["spend", "conversions", "cpa", "wasteRate"];

export function ProgressTab({
  monthlyTrend,
  budgetWasters,
  kpis,
}: ProgressTabProps) {
  // Multi-select: 1–3 metrics. Default to conversions only (matches the
  // previous single-metric default). Clicking a chip toggles — unless that
  // would either drop to zero metrics (no-op) or exceed MAX_SELECTED_METRICS.
  const [selectedMetrics, setSelectedMetrics] = useState<ProgressMetric[]>([
    "conversions",
  ]);

  function toggleMetric(metric: ProgressMetric) {
    setSelectedMetrics((prev) => {
      const isSelected = prev.includes(metric);
      if (isSelected) {
        if (prev.length === 1) return prev; // keep at least one selected
        return prev.filter((m) => m !== metric);
      }
      if (prev.length >= MAX_SELECTED_METRICS) return prev; // cap at 3
      // Preserve canonical order so the legend reads consistently
      return METRIC_ORDER.filter((m) => prev.includes(m) || m === metric);
    });
  }

  // Compute non-converting spend share per month (estimated using the latest
  // budget-wasters total ÷ that month's spend; capped at 100%).
  const totalWaste = budgetWasters.reduce((s, t) => s + t.spend, 0);

  // Build chart data with computed CPA and estimated waste
  const chartData = useMemo(() => {
    return monthlyTrend.map((m) => {
      const cpa = m.conversions > 0 ? m.spend / m.conversions : 0;
      const wasteRate =
        m.spend > 0 && totalWaste > 0
          ? Math.min((totalWaste / m.spend) * 100, 100)
          : 0;
      return {
        month: m.month,
        label: monthLabel(m.month),
        spend: m.spend,
        conversions: m.conversions,
        cpa,
        wasteRate,
      };
    });
  }, [monthlyTrend, totalWaste]);

  // The chart now consumes ALL metric values per point (it picks the ones
  // listed in `metrics`). One row per month with every metric pre-computed.
  const chartPoints = chartData.map((d) => ({
    label: d.label,
    spend: d.spend,
    conversions: d.conversions,
    cpa: d.cpa,
    wasteRate: d.wasteRate,
  }));

  // Summary stats
  const latestMonth = monthlyTrend[monthlyTrend.length - 1];
  const prevMonth = monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 2] : null;
  const threeMonthsAgo = monthlyTrend.length > 3 ? monthlyTrend[monthlyTrend.length - 4] : null;

  const currentConversions = latestMonth?.conversions ?? 0;
  const currentSpend = latestMonth?.spend ?? 0;
  const currentCpa = currentConversions > 0 ? currentSpend / currentConversions : 0;

  const prevConversions = prevMonth?.conversions ?? 0;
  const prevSpend = prevMonth?.spend ?? 0;
  const prevCpa = prevConversions > 0 ? prevSpend / prevConversions : 0;

  const q3Conversions = threeMonthsAgo?.conversions ?? 0;
  const q3Spend = threeMonthsAgo?.spend ?? 0;
  const q3Cpa = q3Conversions > 0 ? q3Spend / q3Conversions : 0;

  // Efficiency score: conversions per $1000 spent
  const currentEfficiency = currentSpend > 0 ? (currentConversions / currentSpend) * 1000 : 0;
  const prevEfficiency = prevSpend > 0 ? (prevConversions / prevSpend) * 1000 : 0;

  // YoY from kpis
  const yoyConvChange = kpis.yoyConversions > 0
    ? changeLabel(kpis.conversions, kpis.yoyConversions)
    : null;

  return (
    <div className="space-y-6">
      {/* Summary Cards — sizing matches the Overview tab's KPI row. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label="Conversions"
          value={String(Math.round(currentConversions))}
          change={prevConversions > 0 ? changeLabel(currentConversions, prevConversions) : null}
        />
        <StatCard
          label="Cost per Conversion"
          value={currentCpa > 0 ? `$${Math.round(currentCpa)}` : "\u2014"}
          change={prevCpa > 0 ? changeLabel(currentCpa, prevCpa) : null}
          invertChange
        />
        <StatCard
          label="Efficiency"
          value={`${currentEfficiency.toFixed(1)} conv/$1k`}
          change={prevEfficiency > 0 ? changeLabel(currentEfficiency, prevEfficiency) : null}
          hint="Conversions generated per $1,000 spent. Higher is better. This is the inverse of CPA \u2014 it's not a waste rate."
        />
        <StatCard
          label="Non-Converting Spend"
          value={`$${Math.round(totalWaste)}`}
          change={null}
          hint={`Spend on ${budgetWasters.length} search term${budgetWasters.length !== 1 ? "s" : ""} that didn't convert in this period. Some of this is expected \u2014 review the list to spot terms worth excluding as negatives.`}
        />
      </div>

      {/* Trend chart — multi-metric overlay (1–3). Each metric uses its own
          y-scale; legend below the chart shows the latest value per metric. */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
            Monthly Trend
          </h2>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {METRIC_ORDER.map((key) => {
              const isSelected = selectedMetrics.includes(key);
              const isDisabled =
                !isSelected && selectedMetrics.length >= MAX_SELECTED_METRICS;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => !isDisabled && toggleMetric(key)}
                  disabled={isDisabled}
                  title={
                    isDisabled
                      ? `Up to ${MAX_SELECTED_METRICS} metrics can be shown at once \u2014 deselect one first.`
                      : METRIC_CONFIG[key].description
                  }
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    isSelected
                      ? "bg-white text-slate-800 shadow-sm"
                      : isDisabled
                        ? "text-slate-300 cursor-not-allowed"
                        : "text-slate-500 hover:text-slate-700"
                  }`}
                  style={
                    isSelected
                      ? {
                          boxShadow: `inset 0 -2px 0 ${METRIC_CONFIG[key].color}`,
                        }
                      : undefined
                  }
                >
                  {METRIC_CONFIG[key].label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Description: show only the single selected metric's description in
            single-metric mode — multi-metric mode uses the legend instead. */}
        {selectedMetrics.length === 1 && (
          <p className="text-xs text-slate-400 mb-4">
            {METRIC_CONFIG[selectedMetrics[0]].description}
          </p>
        )}
        {chartPoints.length > 0 ? (
          <TrendChart points={chartPoints} metrics={selectedMetrics} />
        ) : (
          <p className="text-sm text-slate-400 py-8 text-center">No data available</p>
        )}
        {/* Legend — only when 2+ metrics are selected, since one is obvious
            from the chart heading + tab styling. Latest-month value shown
            inline so users can read the chart without hovering. */}
        {selectedMetrics.length > 1 && chartPoints.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            {selectedMetrics.map((m) => {
              const config = METRIC_CONFIG[m];
              const latest = chartPoints[chartPoints.length - 1]?.[m] ?? 0;
              return (
                <div key={m} className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-[2px] rounded"
                    style={{ background: config.color }}
                  />
                  <span className="font-medium text-slate-700">{config.label}</span>
                  <span className="text-slate-400">
                    latest {config.format(latest)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3-Month Progress Comparison */}
      {threeMonthsAgo && latestMonth && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-4">
            3-Month Progress
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ComparisonRow
              label="Conversions"
              before={Math.round(q3Conversions)}
              after={Math.round(currentConversions)}
              format={(v) => String(v)}
              higherIsBetter
            />
            <ComparisonRow
              label="CPA"
              before={Math.round(q3Cpa)}
              after={Math.round(currentCpa)}
              format={(v) => `$${v}`}
              higherIsBetter={false}
            />
            <ComparisonRow
              label="Monthly Spend"
              before={Math.round(q3Spend)}
              after={Math.round(currentSpend)}
              format={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`)}
              higherIsBetter={false}
            />
          </div>
        </div>
      )}

      {/* Year-over-Year */}
      {kpis.yoyConversions > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-4">
            Year-over-Year
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <YoyCard
              label="Conversions"
              current={kpis.conversions}
              yoy={kpis.yoyConversions}
              format={(v) => String(v)}
              higherIsBetter
            />
            <YoyCard
              label="CPA"
              current={kpis.cpa ?? 0}
              yoy={kpis.yoyCpa ?? 0}
              format={(v) => `$${Math.round(v)}`}
              higherIsBetter={false}
            />
            <YoyCard
              label="Clicks"
              current={kpis.clicks}
              yoy={kpis.yoyClicks}
              format={(v) => v.toLocaleString()}
              higherIsBetter
            />
            <YoyCard
              label="Avg CPC"
              current={kpis.avgCpc}
              yoy={kpis.yoyAvgCpc}
              format={(v) => `$${v.toFixed(2)}`}
              higherIsBetter={false}
            />
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3">
          Key Insights
        </h2>
        <div className="space-y-2">
          {generateInsights(monthlyTrend, budgetWasters, kpis, currentCpa, prevCpa, currentEfficiency, yoyConvChange).map(
            (insight, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm ${
                  insight.type === "positive"
                    ? "bg-emerald-50 text-emerald-800"
                    : insight.type === "negative"
                      ? "bg-red-50 text-red-800"
                      : "bg-blue-50 text-blue-800"
                }`}
              >
                <span className="text-lg mt-[-2px]">{insight.icon}</span>
                <span>{insight.text}</span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

// Helper components

function ComparisonRow({
  label,
  before,
  after,
  format,
  higherIsBetter,
}: {
  label: string;
  before: number;
  after: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}) {
  const change = before > 0 ? ((after - before) / before) * 100 : 0;
  const isGood = higherIsBetter ? change >= 0 : change <= 0;

  return (
    <div className="text-center">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">
        {label}
      </p>
      <div className="flex items-center justify-center gap-3">
        <div>
          <p className="text-slate-400 text-xs mb-0.5">3 months ago</p>
          <p className="text-lg font-semibold text-slate-500">{format(before)}</p>
        </div>
        <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
        <div>
          <p className="text-slate-400 text-xs mb-0.5">Now</p>
          <p className="text-lg font-bold text-slate-800">{format(after)}</p>
        </div>
      </div>
      {before > 0 && (
        <p className={`text-xs font-medium mt-1 ${isGood ? "text-emerald-600" : "text-red-500"}`}>
          {change >= 0 ? "+" : ""}{change.toFixed(1)}%
        </p>
      )}
    </div>
  );
}

function YoyCard({
  label,
  current,
  yoy,
  format,
  higherIsBetter,
}: {
  label: string;
  current: number;
  yoy: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}) {
  const change = yoy > 0 ? ((current - yoy) / yoy) * 100 : 0;
  const isGood = higherIsBetter ? change >= 0 : change <= 0;

  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-800">{format(current)}</p>
      <p className="text-xs text-slate-400">vs {format(yoy)} last year</p>
      {yoy > 0 && (
        <p className={`text-xs font-medium mt-1 ${isGood ? "text-emerald-600" : "text-red-500"}`}>
          {change >= 0 ? "+" : ""}{change.toFixed(1)}%
        </p>
      )}
    </div>
  );
}

interface Insight {
  icon: string;
  text: string;
  type: "positive" | "negative" | "neutral";
}

function generateInsights(
  monthlyTrend: GoogleAdsDashboardMonthly[],
  budgetWasters: GoogleAdsDashboardSearchTerm[],
  kpis: GoogleAdsDashboardKpis,
  currentCpa: number,
  prevCpa: number,
  currentEfficiency: number,
  yoyConvChange: { text: string; positive: boolean } | null,
): Insight[] {
  const insights: Insight[] = [];

  // Conversion trend (3 months)
  if (monthlyTrend.length >= 3) {
    const recent3 = monthlyTrend.slice(-3);
    const isUpward = recent3[2].conversions > recent3[0].conversions;
    if (isUpward) {
      insights.push({
        icon: "\uD83D\uDCC8",
        text: `Conversions are trending upward over the last 3 months (${Math.round(recent3[0].conversions)} to ${Math.round(recent3[2].conversions)}).`,
        type: "positive",
      });
    } else if (recent3[2].conversions < recent3[0].conversions * 0.85) {
      insights.push({
        icon: "\uD83D\uDCC9",
        text: `Conversions have dropped over the last 3 months (${Math.round(recent3[0].conversions)} to ${Math.round(recent3[2].conversions)}). Review campaign targeting and bids.`,
        type: "negative",
      });
    }
  }

  // CPA improvement
  if (currentCpa > 0 && prevCpa > 0) {
    const cpaDrop = ((prevCpa - currentCpa) / prevCpa) * 100;
    if (cpaDrop >= 10) {
      insights.push({
        icon: "\u2705",
        text: `CPA improved by ${cpaDrop.toFixed(0)}% vs previous month ($${Math.round(prevCpa)} to $${Math.round(currentCpa)}).`,
        type: "positive",
      });
    } else if (cpaDrop <= -15) {
      insights.push({
        icon: "\u26A0\uFE0F",
        text: `CPA increased by ${Math.abs(cpaDrop).toFixed(0)}% vs previous month ($${Math.round(prevCpa)} to $${Math.round(currentCpa)}). Worth reviewing search terms and recent campaign changes.`,
        type: "negative",
      });
    }
  }

  // Non-converting spend
  const totalWaste = budgetWasters.reduce((s, t) => s + t.spend, 0);
  if (totalWaste > 50) {
    insights.push({
      icon: "\uD83D\uDCB8",
      // Framed as opportunity, not waste — some non-converting spend is normal
      // (top-of-funnel discovery, brand-adjacent terms). The action item is to
      // identify the irrelevant subset and exclude those, not to cut all of it.
      text: `$${Math.round(totalWaste)} of spend across ${budgetWasters.length} search term${budgetWasters.length !== 1 ? "s" : ""} didn't convert in this period. Reviewing these and adding the irrelevant ones as negative keywords helps direct more budget toward terms that do convert.`,
      type: "neutral",
    });
  } else if (budgetWasters.length === 0) {
    insights.push({
      icon: "\uD83C\uDF1F",
      text: "All recent ad spend produced conversions. Negative keyword management is on point.",
      type: "positive",
    });
  }

  // YoY
  if (yoyConvChange) {
    insights.push({
      icon: yoyConvChange.positive ? "\uD83D\uDE80" : "\u23EC",
      text: `Year-over-year conversions ${yoyConvChange.positive ? "up" : "down"} ${yoyConvChange.text}.`,
      type: yoyConvChange.positive ? "positive" : "negative",
    });
  }

  // Efficiency
  if (currentEfficiency >= 5) {
    insights.push({
      icon: "\u26A1",
      text: `Strong efficiency at ${currentEfficiency.toFixed(1)} conversions per $1,000 spent.`,
      type: "positive",
    });
  }

  // If no insights, add a neutral one
  if (insights.length === 0) {
    insights.push({
      icon: "\uD83D\uDCCA",
      text: "Not enough data to generate insights yet. Trends will appear as more months of data are collected.",
      type: "neutral",
    });
  }

  return insights;
}
