"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type {
  GoogleAdsDashboardMonthly,
  GoogleAdsDashboardSearchTerm,
  GoogleAdsDashboardKpis,
  GoogleAdsDashboardAvoidedSpend,
} from "@/lib/dashboard-types";

interface ProgressTabProps {
  monthlyTrend: GoogleAdsDashboardMonthly[];
  budgetWasters: GoogleAdsDashboardSearchTerm[];
  /** Terms the team or client flagged as irrelevant (deep-dive submits, NKL
   *  members surfaced as having recent spend). Used by the Keyword Relevancy
   *  metric — spend on these terms counts against the relevancy rate. */
  irrelevantTerms: GoogleAdsDashboardSearchTerm[];
  kpis: GoogleAdsDashboardKpis;
  /** "Estimated Avoided Spend" data for the negative keyword value section.
   *  Null until the dashboard fetch resolves; gated on clientId + customerId
   *  being present. */
  avoidedSpend?: GoogleAdsDashboardAvoidedSpend | null;
}

type ProgressMetric = "spend" | "conversions" | "cpa" | "wasteRate" | "relevancy";

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
  relevancy: {
    label: "Keyword Relevancy %",
    color: "#8b5cf6",
    format: (v) => `${v.toFixed(1)}%`,
    description:
      "Estimated share of monthly spend going to search terms that are either converting or haven't been flagged as irrelevant. Higher is better. Per-month figure projects the latest period's flagged-irrelevant total against each month's spend \u2014 trends with monthly spend volume.",
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
  // Extra top padding when multiple metrics are overlaid — each additional
  // line gets a 12px vertical offset on its labels so they don't overlap
  // at the same x position. Reserve space for that.
  const padTop = 30 + Math.max(0, metrics.length - 1) * 12;
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

          {/* Lines + dots + value labels, one set per selected metric.
              Label cadence depends on how many metrics + points are visible —
              dense charts only label every 2nd or 3rd point so adjacent labels
              don't overlap. Single-metric mode always labels every point. */}
          {metrics.map((m, metricIndex) => {
            const config = METRIC_CONFIG[m];
            const linePath = points
              .map((p, i) => `${toX(i)},${toY(m, p[m])}`)
              .join(" ");

            // Figure out the labelling cadence (1 = every point, 2 = every
            // other, etc). With wider charts we can fit more labels; with
            // multiple metrics overlaid we need more space per label.
            const approxLabelWidth = 40; // px — enough for "$12.4k" / "100%"
            const slotsPerLabel = Math.max(
              1,
              Math.ceil((approxLabelWidth * metrics.length) / Math.max(xStep, 1)),
            );
            // In multi-metric mode, stagger labels so different metrics don't
            // sit on top of each other vertically at the same x.
            const labelOffset = -10 - metricIndex * 12;

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
                {points.map((p, i) => {
                  const isLastPoint = i === points.length - 1;
                  const showLabel =
                    i === 0 || isLastPoint || i % slotsPerLabel === 0;
                  return (
                    <g key={`${m}-${i}`}>
                      <circle
                        cx={toX(i)}
                        cy={toY(m, p[m])}
                        r={3}
                        fill="white"
                        stroke={config.color}
                        strokeWidth={2}
                      />
                      {showLabel && (
                        <text
                          x={toX(i)}
                          y={toY(m, p[m]) + labelOffset}
                          fontSize={10}
                          fill={config.color}
                          textAnchor="middle"
                          fontWeight="600"
                        >
                          {config.format(p[m])}
                        </text>
                      )}
                    </g>
                  );
                })}
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

// Hint icon — small (?) badge with a CSS tooltip that appears on hover
// or focus. Uses inline styles + a `peer` pattern so it works without a
// global style change. The native `title` attribute is unreliable (long
// delay, varying browser styling, hidden on mobile), so we render our
// own tooltip element styled to match the dashboard.
function HintIcon({ text }: { text: string }) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  // Tooltip positioning: by default centered above the (?) icon. When the
  // icon is too close to the right edge of the viewport, the 240px-wide
  // tooltip overflows and gets clipped. We measure on open and shift the
  // tooltip horizontally so it always stays inside the viewport with an 8px
  // safety margin. The arrow stays anchored to the icon's center.
  const TOOLTIP_WIDTH = 240;
  const SAFETY_MARGIN = 8;
  const [shift, setShift] = useState(0); // px to add to the centered position

  useEffect(() => {
    if (!open || !wrapperRef.current) return;
    const iconRect = wrapperRef.current.getBoundingClientRect();
    const iconCenter = iconRect.left + iconRect.width / 2;
    const idealLeft = iconCenter - TOOLTIP_WIDTH / 2;
    const idealRight = iconCenter + TOOLTIP_WIDTH / 2;
    const viewportRight = window.innerWidth - SAFETY_MARGIN;
    let nextShift = 0;
    if (idealRight > viewportRight) {
      nextShift = viewportRight - idealRight; // negative, push left
    } else if (idealLeft < SAFETY_MARGIN) {
      nextShift = SAFETY_MARGIN - idealLeft; // positive, push right
    }
    setShift(nextShift);
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex items-center"
      style={{ marginLeft: 2 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={text}
        tabIndex={0}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-300 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-help"
        style={{ fontSize: 9, lineHeight: 1, padding: 0 }}
        onClick={(e) => e.preventDefault()}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute z-30 normal-case tracking-normal"
          style={{
            bottom: "calc(100% + 6px)",
            // Center on the icon, then apply the viewport-aware shift so the
            // tooltip can never get clipped at either edge.
            left: "50%",
            transform: `translateX(calc(-50% + ${shift}px))`,
            width: TOOLTIP_WIDTH,
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
          }}
        >
          {text}
          {/* Arrow stays anchored to the icon's center, regardless of the
              tooltip's horizontal shift — we counter-shift it by -shift. */}
          <span
            aria-hidden
            className="absolute top-full"
            style={{
              left: "50%",
              transform: `translateX(calc(-50% - ${shift}px))`,
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid #0f172a",
            }}
          />
        </span>
      )}
    </span>
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
        {hint && <HintIcon text={hint} />}
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
const METRIC_ORDER: ProgressMetric[] = ["spend", "conversions", "cpa", "wasteRate", "relevancy"];

export function ProgressTab({
  monthlyTrend,
  budgetWasters,
  irrelevantTerms,
  kpis,
  avoidedSpend,
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

  // Keyword Relevancy: % of spend on terms that either converted or have not
  // been flagged as irrelevant by the team. Math:
  //   relevancy = (totalSpend − sumSpendOf(irrelevantTerms)) / totalSpend
  // Innocent until proven irrelevant — a non-converting term is NOT counted
  // against relevancy until someone reviews and flags it.
  const totalSpend = kpis.spend ?? 0;
  const irrelevantSpend = irrelevantTerms.reduce((s, t) => s + t.spend, 0);
  const relevancyRate =
    totalSpend > 0
      ? Math.max(0, Math.min(100, ((totalSpend - irrelevantSpend) / totalSpend) * 100))
      : null;

  // Build chart data with computed CPA, estimated waste, and per-month
  // relevancy. Per-month relevancy uses the same modelling trick as the
  // existing wasteRate: project the *latest period's* irrelevant-flagged
  // total against each month's spend. Months with higher spend pull the
  // % up; lower-spend months sit lower. Honest because the irrelevant
  // signal we have today is period-aggregate — we surface that as a
  // best-effort trend rather than pretending we have full historical
  // per-month data.
  const chartData = useMemo(() => {
    return monthlyTrend.map((m) => {
      const cpa = m.conversions > 0 ? m.spend / m.conversions : 0;
      const wasteRate =
        m.spend > 0 && totalWaste > 0
          ? Math.min((totalWaste / m.spend) * 100, 100)
          : 0;
      const relevancy =
        m.spend > 0 && irrelevantSpend > 0
          ? Math.max(0, Math.min(100, 100 - (irrelevantSpend / m.spend) * 100))
          : m.spend > 0
            ? 100
            : 0;
      return {
        month: m.month,
        label: monthLabel(m.month),
        spend: m.spend,
        conversions: m.conversions,
        cpa,
        wasteRate,
        relevancy,
      };
    });
  }, [monthlyTrend, totalWaste, irrelevantSpend]);

  // The chart now consumes ALL metric values per point (it picks the ones
  // listed in `metrics`). One row per month with every metric pre-computed.
  const chartPoints = chartData.map((d) => ({
    label: d.label,
    spend: d.spend,
    conversions: d.conversions,
    cpa: d.cpa,
    wasteRate: d.wasteRate,
    relevancy: d.relevancy,
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

  // Avoided spend — only render the section when there are negative keywords
  // tracked for this client. If every month is $0 we still render but in a
  // "tracking starts soon" state so the client knows the section exists and
  // numbers will populate as Growth Tools accumulates spend signal.
  const hasAvoidedSpendKeywords = !!avoidedSpend && avoidedSpend.keywordCount > 0;
  const avoidedSpendAllZero = !!avoidedSpend && avoidedSpend.cumulativeAvoided === 0;

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
          label="Keyword Relevancy"
          value={relevancyRate != null ? `${relevancyRate.toFixed(0)}%` : "\u2014"}
          change={null}
          hint={
            relevancyRate == null
              ? "Share of ad spend on search terms that are either converting or haven't been flagged as irrelevant. We'll start tracking this once spend data is available."
              : irrelevantTerms.length === 0
                ? "Share of ad spend on search terms that are either converting or haven't been flagged as irrelevant. No terms have been marked irrelevant yet \u2014 review the Keyword Deep Dive tab regularly to keep this rate honest."
                : `Share of ad spend on search terms that are either converting or haven't been flagged as irrelevant. Currently $${Math.round(irrelevantSpend).toLocaleString()} across ${irrelevantTerms.length} term${irrelevantTerms.length !== 1 ? "s" : ""} is flagged irrelevant \u2014 ${(100 - relevancyRate).toFixed(0)}% of spend. To improve this: open the Keyword Deep Dive tab, flag irrelevant search terms for review, and the team will add them as negative keywords. Once excluded, those terms stop triggering ads and the rate rises in the next reporting period.`
          }
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
      {/* (Avoided-spend section is rendered just below this chart — see below.) */}
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

      {/* Estimated Avoided Spend — negative keyword value tracking. Renders
          below the multi-metric chart, above the 3-Month Progress section. */}
      {hasAvoidedSpendKeywords && avoidedSpend && (
        <AvoidedSpendSection data={avoidedSpend} allZero={avoidedSpendAllZero} />
      )}

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
          {generateInsights(monthlyTrend, budgetWasters, kpis, currentCpa, prevCpa, currentEfficiency, yoyConvChange, relevancyRate, irrelevantSpend, irrelevantTerms.length, avoidedSpend ?? null).map(
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

// ---------------------------------------------------------------------------
// Estimated Avoided Spend section
//
// Renders the headline card + smooth cumulative area chart of monthly totals.
// Hidden by parent when keywordCount = 0; when all months are $0 the chart
// is replaced by a friendly "tracking starts soon" message so the section
// still appears (so clients know it exists and what's coming).
// ---------------------------------------------------------------------------

const AVOIDED_SPEND_HINT =
  "Calculated by looking at each keyword in your Negative Keyword List and asking Google Ads how much spend that exact term (or matching phrases, for phrase/broad negatives) would have triggered each month. We only count months where the keyword was actively blocked \u2014 no retroactive credit for months before it was added.";

function formatDollars(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}

function AvoidedSpendSection({
  data,
  allZero,
}: {
  data: GoogleAdsDashboardAvoidedSpend;
  allZero: boolean;
}) {
  const cumulative = formatDollars(data.cumulativeAvoided);
  const kwCount = data.keywordCount;

  // Build cumulative running totals month-by-month for the area chart.
  const cumulativePoints = useMemo(() => {
    let running = 0;
    return data.months.map((m) => {
      running += data.totals[m] || 0;
      return { month: m, label: monthLabel(m), value: running };
    });
  }, [data.months, data.totals]);

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 inline-flex items-center gap-1">
          <span>Estimated Avoided Spend</span>
          <HintIcon text={AVOIDED_SPEND_HINT} />
        </h2>
      </div>

      {/* Headline card: dollar figure + keyword count + methodology copy. */}
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 mb-4">
        <p className="text-2xl font-bold text-emerald-700" style={{ lineHeight: 1.2 }}>
          {allZero ? "\u2014" : cumulative}
          <span className="ml-2 text-sm font-medium text-emerald-700/80">
            across {kwCount} negative keyword{kwCount !== 1 ? "s" : ""}
          </span>
        </p>
        <p className="text-xs text-emerald-700/70 mt-1" style={{ lineHeight: 1.45 }}>
          Estimated spend our negative keywords have prevented over the last {data.monthsBack} months.
          Based on Google Ads search term reports — how much each blocked term would have spent if
          it weren&apos;t negated.
        </p>
      </div>

      {allZero ? (
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-6 text-center">
          <p className="text-sm text-slate-500">
            Tracking starts soon. As your negative keywords accumulate spend signal in Google Ads, this
            chart will fill in month-by-month showing how much budget they&apos;ve protected.
          </p>
        </div>
      ) : (
        <AvoidedSpendChart points={cumulativePoints} />
      )}
    </div>
  );
}

// Smooth cumulative area chart, hand-rolled SVG so we don't pull in a chart
// lib for one curve. Uses a Catmull-Rom → cubic-Bezier conversion for a
// gentle, monotone-ish curve through the cumulative totals.
function AvoidedSpendChart({
  points,
}: {
  points: Array<{ month: string; label: string; value: number }>;
}) {
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

  const height = 220;
  const padTop = 24;
  const padBottom = 36;
  const padLeft = 56;
  const padRight = 16;
  const chartH = height - padTop - padBottom;
  const chartW = Math.max(0, width - padLeft - padRight);

  if (points.length === 0) return null;

  const yMax = Math.max(1, points[points.length - 1].value); // cumulative is monotonic non-decreasing
  const yRange = yMax * 1.05; // 5% headroom so the curve doesn't kiss the top

  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;
  const toX = (i: number) => padLeft + i * xStep;
  const toY = (v: number) => padTop + chartH - (v / yRange) * chartH;

  // Build a smooth path through the cumulative points using Catmull-Rom → cubic
  // Bezier conversion. Tension = 0.5 gives the standard CR curve.
  function buildSmoothPath(): string {
    if (points.length === 1) {
      return `M${toX(0)},${toY(points[0].value)}`;
    }
    const segments: string[] = [`M${toX(0)},${toY(points[0].value)}`];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = toX(i) + (toX(i + 1) - toX(Math.max(0, i - 1))) / 6;
      const cp1y = toY(p1.value) + (toY(p2.value) - toY(p0.value)) / 6;
      const cp2x = toX(i + 1) - (toX(Math.min(points.length - 1, i + 2)) - toX(i)) / 6;
      const cp2y = toY(p2.value) - (toY(p3.value) - toY(p1.value)) / 6;
      segments.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${toX(i + 1)},${toY(p2.value)}`);
    }
    return segments.join(" ");
  }

  const linePath = buildSmoothPath();
  // Close the area path back to the baseline so we get a filled curve.
  const areaPath = `${linePath} L${toX(points.length - 1)},${padTop + chartH} L${toX(0)},${padTop + chartH} Z`;

  // 4 ticks across the y axis.
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = (yRange * i) / 4;
    return { val, y: toY(val) };
  });

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={height}>
          <defs>
            <linearGradient id="avoided-spend-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Gridlines + Y labels */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={tick.y}
                y2={tick.y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={padLeft - 8}
                y={tick.y + 4}
                fontSize={10}
                fill="#94a3b8"
                textAnchor="end"
              >
                {formatDollars(tick.val)}
              </text>
            </g>
          ))}

          {/* Area fill */}
          <path d={areaPath} fill="url(#avoided-spend-grad)" />
          {/* Line on top */}
          <path
            d={linePath}
            fill="none"
            stroke="#10b981"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* End-point dot + label so the running total reads at a glance. */}
          <circle
            cx={toX(points.length - 1)}
            cy={toY(points[points.length - 1].value)}
            r={3.5}
            fill="white"
            stroke="#10b981"
            strokeWidth={2}
          />
          <text
            x={toX(points.length - 1)}
            y={toY(points[points.length - 1].value) - 10}
            fontSize={11}
            fontWeight={600}
            fill="#10b981"
            textAnchor={points.length > 1 ? "end" : "middle"}
          >
            {formatDollars(points[points.length - 1].value)}
          </text>

          {/* X axis labels (every other when crowded). */}
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
  relevancyRate: number | null,
  irrelevantSpend: number,
  irrelevantTermCount: number,
  avoidedSpend: GoogleAdsDashboardAvoidedSpend | null,
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

  // Keyword Relevancy — surface a concrete next-step when the rate is
  // dragging, or a positive signal when it's healthy. Defines what "good"
  // looks like and tells the client exactly how to move the number.
  if (relevancyRate != null && irrelevantTermCount > 0) {
    if (relevancyRate < 75) {
      insights.push({
        icon: "\uD83C\uDFAF",
        text: `Keyword relevancy is at ${relevancyRate.toFixed(0)}% \u2014 $${Math.round(irrelevantSpend).toLocaleString()} of spend across ${irrelevantTermCount} term${irrelevantTermCount !== 1 ? "s" : ""} is currently flagged irrelevant. Open the Keyword Deep Dive tab and submit these for review so the team can add them as negative keywords. Once excluded, the rate climbs in the next reporting period.`,
        type: "negative",
      });
    } else if (relevancyRate < 90) {
      insights.push({
        icon: "\uD83C\uDFAF",
        text: `Keyword relevancy is at ${relevancyRate.toFixed(0)}%. ${irrelevantTermCount} term${irrelevantTermCount !== 1 ? "s" : ""} flagged irrelevant ($${Math.round(irrelevantSpend).toLocaleString()} of spend) \u2014 review and submit them in the Keyword Deep Dive tab to push this above 90%.`,
        type: "neutral",
      });
    } else {
      insights.push({
        icon: "\u2728",
        text: `Keyword relevancy is strong at ${relevancyRate.toFixed(0)}%. Most of the budget is going to terms that are converting or haven't been flagged as irrelevant.`,
        type: "positive",
      });
    }
  }

  // Avoided spend — surface a green positive insight once the cumulative
  // figure is meaningful ($100+). Below that threshold the number isn't
  // worth the screen real estate and could come across as performative.
  if (avoidedSpend && avoidedSpend.cumulativeAvoided > 100) {
    const dollars = Math.round(avoidedSpend.cumulativeAvoided).toLocaleString();
    insights.push({
      icon: "\uD83D\uDEE1\uFE0F",
      text: `Negative keywords have avoided ~$${dollars} of irrelevant spend over the last ${avoidedSpend.monthsBack} months. That's budget redirected to converting search terms.`,
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
