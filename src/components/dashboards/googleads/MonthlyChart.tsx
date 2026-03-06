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
  const bars: BarData[] = data.map((m) => ({
    label: monthLabel(m.month),
    segments: [
      { value: m.brandSpend, color: BRAND_COLOR, label: "Brand" },
      { value: m.genericSpend, color: GENERIC_COLOR, label: "Generic" },
    ],
    lineValue: Math.round(m.conversions),
  }));

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-4">
        Monthly Performance
      </h2>
      <StackedBarChart
        data={bars}
        lineLabel="Conversions"
        lineColor="#0f172a"
        height={220}
      />
    </div>
  );
}
