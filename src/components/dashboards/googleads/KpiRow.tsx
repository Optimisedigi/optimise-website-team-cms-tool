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

  return (
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
        label="Cost/Conv"
        value={kpis.cpa}
        previousValue={isYear ? kpis.yoyCpa : kpis.prevCpa}
        format="dollars"
        invertColors
        comparisonLabel={label}
      />
    </div>
  );
}
