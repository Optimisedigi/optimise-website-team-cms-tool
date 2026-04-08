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
    label: "Waste Rate",
    color: "#ef4444",
    format: (v) => `${v.toFixed(1)}%`,
    description: "Budget wasted on non-converting terms (estimated)",
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

// SVG trend line chart
interface TrendChartProps {
  points: Array<{ label: string; value: number }>;
  metric: ProgressMetric;
}

function TrendChart({ points, metric }: TrendChartProps) {
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

  const config = METRIC_CONFIG[metric];
  const height = 260;
  const padTop = 30;
  const padBottom = 40;
  const padLeft = 55;
  const padRight = 20;
  const chartH = height - padTop - padBottom;
  const chartW = width - padLeft - padRight;

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const yMin = Math.max(minVal - range * 0.1, 0);
  const yMax = maxVal + range * 0.1;
  const yRange = yMax - yMin || 1;

  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;

  function toX(i: number) { return padLeft + i * xStep; }
  function toY(v: number) { return padTop + chartH - ((v - yMin) / yRange) * chartH; }

  // Build line path
  const linePath = points
    .map((p, i) => `${toX(i)},${toY(p.value)}`)
    .join(" ");

  // Gradient area
  const areaPath = points.length > 1
    ? `M${toX(0)},${toY(points[0].value)} ` +
      points.slice(1).map((p, i) => `L${toX(i + 1)},${toY(p.value)}`).join(" ") +
      ` L${toX(points.length - 1)},${padTop + chartH} L${toX(0)},${padTop + chartH} Z`
    : "";

  // Y axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = yMin + (yRange * i) / 4;
    return { val, y: toY(val) };
  });

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={height}>
          <defs>
            <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={config.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Grid lines */}
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
                {config.format(tick.val)}
              </text>
            </g>
          ))}

          {/* Area fill */}
          {areaPath && (
            <path d={areaPath} fill={`url(#grad-${metric})`} />
          )}

          {/* Line */}
          {linePath && (
            <polyline
              points={linePath}
              fill="none"
              stroke={config.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Data points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={toX(i)}
                cy={toY(p.value)}
                r={3.5}
                fill="white"
                stroke={config.color}
                strokeWidth={2}
              />
              {/* Value label on hover-like dots every 3rd point or first/last */}
              {(i === 0 || i === points.length - 1 || i % 3 === 0) && (
                <text
                  x={toX(i)}
                  y={toY(p.value) - 10}
                  fontSize={10}
                  fill={config.color}
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {config.format(p.value)}
                </text>
              )}
            </g>
          ))}

          {/* X axis labels */}
          {points.map((p, i) => {
            // Show every label if <= 8 points, otherwise every other
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

// Summary stat card
function StatCard({
  label,
  value,
  subLabel,
  change,
  invertChange,
}: {
  label: string;
  value: string;
  subLabel: string;
  change: { text: string; positive: boolean } | null;
  invertChange?: boolean;
}) {
  const isGood = change
    ? invertChange
      ? !change.positive
      : change.positive
    : null;

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-xs text-slate-400">{subLabel}</p>
        {change && (
          <span
            className={`text-xs font-medium ${
              isGood ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {change.text}
          </span>
        )}
      </div>
    </div>
  );
}

export function ProgressTab({
  monthlyTrend,
  budgetWasters,
  kpis,
}: ProgressTabProps) {
  const [selectedMetric, setSelectedMetric] = useState<ProgressMetric>("conversions");

  // Compute waste rate per month (estimated: budgetWasters total / monthly spend)
  const totalWaste = budgetWasters.reduce((s, t) => s + t.spend, 0);

  // Build chart data with computed CPA and estimated waste
  const chartData = useMemo(() => {
    return monthlyTrend.map((m) => {
      const cpa = m.conversions > 0 ? m.spend / m.conversions : 0;
      // Waste rate: estimate from latest waste proportion
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

  const points = chartData.map((d) => ({
    label: d.label,
    value: d[selectedMetric],
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
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Conversions"
          value={String(Math.round(currentConversions))}
          subLabel="Latest month"
          change={prevConversions > 0 ? changeLabel(currentConversions, prevConversions) : null}
        />
        <StatCard
          label="Cost per Conversion"
          value={currentCpa > 0 ? `$${Math.round(currentCpa)}` : "\u2014"}
          subLabel="Latest month"
          change={prevCpa > 0 ? changeLabel(currentCpa, prevCpa) : null}
          invertChange
        />
        <StatCard
          label="Efficiency"
          value={`${currentEfficiency.toFixed(1)} conv/$1k`}
          subLabel="Conversions per $1,000 spent"
          change={prevEfficiency > 0 ? changeLabel(currentEfficiency, prevEfficiency) : null}
        />
        <StatCard
          label="Budget Waste"
          value={`$${Math.round(totalWaste)}`}
          subLabel={`${budgetWasters.length} non-converting terms`}
          change={null}
        />
      </div>

      {/* Trend chart */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
            {METRIC_CONFIG[selectedMetric].label} Trend
          </h2>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {(Object.keys(METRIC_CONFIG) as ProgressMetric[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedMetric(key)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  selectedMetric === key
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {METRIC_CONFIG[key].label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {METRIC_CONFIG[selectedMetric].description}
        </p>
        {points.length > 0 ? (
          <TrendChart points={points} metric={selectedMetric} />
        ) : (
          <p className="text-sm text-slate-400 py-8 text-center">No data available</p>
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
        text: `CPA increased by ${Math.abs(cpaDrop).toFixed(0)}% vs previous month ($${Math.round(prevCpa)} to $${Math.round(currentCpa)}). Check for budget waste.`,
        type: "negative",
      });
    }
  }

  // Budget waste
  const totalWaste = budgetWasters.reduce((s, t) => s + t.spend, 0);
  if (totalWaste > 50) {
    insights.push({
      icon: "\uD83D\uDCB8",
      text: `$${Math.round(totalWaste)} was spent on ${budgetWasters.length} search terms with zero conversions. Adding negative keywords could reclaim this budget.`,
      type: "negative",
    });
  } else if (budgetWasters.length === 0) {
    insights.push({
      icon: "\uD83C\uDF1F",
      text: "No significant budget waste detected. Negative keyword management is on point.",
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
