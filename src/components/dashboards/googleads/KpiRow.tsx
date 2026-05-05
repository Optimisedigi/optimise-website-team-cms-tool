"use client";

import { KpiCard } from "@/components/dashboards/shared/KpiCard";
import type { GoogleAdsDashboardKpis } from "@/lib/dashboard-types";

interface KpiRowProps {
  kpis: GoogleAdsDashboardKpis;
  compareMode: "month" | "year";
}

export function KpiRow({ kpis, compareMode }: KpiRowProps) {
  const isYear = compareMode === "year";
  const label = isYear ? "vs last year" : "vs prev month";

  // Per-action breakdown for the conversions tile. Sorted by count desc so
  // the most-fired action surfaces first. Only renders when the filter is
  // active and at least one selected action contributed conversions.
  const breakdown = kpis.conversionsByAction
    ? Object.entries(kpis.conversionsByAction)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Spend"
          value={kpis.spend}
          previousValue={isYear ? kpis.yoySpend : kpis.prevSpend}
          format="dollars"
          comparisonLabel={label}
        />
        <KpiCard
          label="Clicks"
          value={kpis.clicks}
          previousValue={isYear ? kpis.yoyClicks : kpis.prevClicks}
          format="number"
          comparisonLabel={label}
        />
        <KpiCard
          label="Avg CPC"
          value={kpis.avgCpc}
          previousValue={isYear ? kpis.yoyAvgCpc : kpis.prevAvgCpc}
          format="dollars"
          invertColors
          comparisonLabel={label}
        />
        <KpiCard
          label="Conversions"
          value={kpis.conversions}
          previousValue={isYear ? kpis.yoyConversions : kpis.prevConversions}
          format="number"
          comparisonLabel={label}
        />
        <KpiCard
          label="CPA"
          value={kpis.cpa}
          previousValue={isYear ? kpis.yoyCpa : kpis.prevCpa}
          format="dollars"
          invertColors
          comparisonLabel={label}
        />
      </div>
      {breakdown.length > 0 && (
        <div className="mt-2 flex justify-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full bg-white border border-slate-200 px-4 py-1.5 shadow-sm text-xs">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              By action
            </span>
            {breakdown.map(([action, count], idx) => (
              <span
                key={action}
                className="flex items-baseline gap-1"
                title={action}
              >
                {idx > 0 && <span className="text-slate-200">·</span>}
                <span className="text-slate-500 truncate max-w-[160px]">{action}</span>
                <span className="font-semibold text-slate-700 tabular-nums">
                  {Math.round(count).toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
