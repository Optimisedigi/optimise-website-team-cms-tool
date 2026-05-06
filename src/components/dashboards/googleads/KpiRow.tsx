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
        <div className="relative mt-2 flex justify-center group">
          <div className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full bg-white border border-slate-200 px-4 py-1.5 shadow-sm text-xs cursor-default">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              By action ({breakdown.length})
            </span>
            {breakdown.map(([action, count], idx) => (
              <span key={action} className="flex items-baseline gap-1">
                {idx > 0 && <span className="text-slate-200">·</span>}
                <span className="text-slate-500 truncate max-w-[160px]">{action}</span>
                <span className="font-semibold text-slate-700 tabular-nums">
                  {Math.round(count).toLocaleString()}
                </span>
              </span>
            ))}
            <span
              className="text-[10px] text-slate-400 ml-1"
              aria-hidden="true"
              title="Hover for full action names"
            >
              ▾
            </span>
          </div>

          {/* Hover popover — full action names without truncation */}
          <div
            role="tooltip"
            className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute top-full mt-2 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[300px] max-w-[480px] pointer-events-none"
          >
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-2">
              Conversions by action ({breakdown.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {breakdown.map(([action, count]) => (
                <div
                  key={action}
                  className="flex justify-between items-start gap-3 text-xs border-b border-slate-50 last:border-0 pb-1 last:pb-0"
                >
                  <span
                    className="text-slate-600 break-words leading-snug"
                    style={{ wordBreak: "break-word" }}
                  >
                    {action}
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                    {Math.round(count).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
