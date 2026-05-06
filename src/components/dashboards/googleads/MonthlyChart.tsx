"use client";

import { StackedBarChart, type BarData } from "@/components/dashboards/shared/StackedBarChart";
import type { GoogleAdsDashboardMonthly } from "@/lib/dashboard-types";

const BRAND_COLOR = "#3b82f6";   // blue-500
const GENERIC_COLOR = "#8b5cf6"; // violet-500

function monthLabel(yyyymm: string): string {
  const [, mm] = yyyymm.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(mm, 10) - 1] || mm;
}

interface MonthlyChartProps {
  data: GoogleAdsDashboardMonthly[];
}

export function MonthlyChart({ data }: MonthlyChartProps) {
  // Detect whether brand vs generic was actually classified — when brand
  // keywords aren't configured (or none of the campaigns matched), every
  // month would only have genericSpend > 0. In that case we collapse to a
  // single "Spend" bar segment so the chart isn't misleadingly all-violet
  // with a "Generic" legend.
  const totalBrand = data.reduce((s, m) => s + (m.brandSpend || 0), 0);
  const totalGeneric = data.reduce((s, m) => s + (m.genericSpend || 0), 0);
  const splitVisible = totalBrand > 0;

  const bars: BarData[] = data.map((m) => ({
    label: monthLabel(m.month),
    segments: splitVisible
      ? [
          { value: m.brandSpend, color: BRAND_COLOR, label: "Brand spend ($)" },
          { value: m.genericSpend, color: GENERIC_COLOR, label: "Generic spend ($)" },
        ]
      : [
          { value: m.genericSpend || m.spend || 0, color: GENERIC_COLOR, label: "Spend ($)" },
        ],
    lineValue: Math.round(m.conversions),
  }));

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Monthly Performance
        </h2>
        {!splitVisible && totalGeneric > 0 && (
          <span
            className="text-[11px] text-slate-400"
            title="Brand vs Generic split needs Brand Keywords configured on the client (CMS → Clients → Google Ads → Brand Keywords) AND campaign names that contain those terms. Campaigns named &quot;Brand_Product&quot; / &quot;Branded — Search&quot; etc. are auto-tagged."
          >
            ⓘ Brand split not configured — showing total spend
          </span>
        )}
      </div>
      <StackedBarChart
        data={bars}
        lineLabel="Conversions"
        lineColor="#0f172a"
        height={220}
      />
    </div>
  );
}
