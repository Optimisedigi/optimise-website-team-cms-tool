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
        <div className="mt-3 rounded-xl bg-white border border-slate-200 shadow-sm p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">
            Conversions by action ({breakdown.length})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {breakdown.map(([action, count]) => (
              <div
                key={action}
                className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5"
                title={action}
              >
                <div className="text-[10px] text-slate-500 truncate" title={action}>
                  {action}
                </div>
                <div className="text-base font-semibold text-slate-900 leading-tight">
                  {Math.round(count).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
