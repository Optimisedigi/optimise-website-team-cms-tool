"use client";

import type { GoogleAdsDashboardActivityStats } from "@/lib/dashboard-types";

interface ActivityStatsProps {
  stats: GoogleAdsDashboardActivityStats;
}

function StatCard({ value, label }: { value: number; label: string }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      <span className="text-sm text-slate-500 leading-tight">{label}</span>
    </div>
  );
}

export function ActivityStats({ stats }: ActivityStatsProps) {
  const breakdown = [
    stats.negativesAdded > 0 && {
      value: stats.negativesAdded,
      label: "negative keywords added",
    },
    stats.budgetChanges > 0 && {
      value: stats.budgetChanges,
      label: "budget adjustments made",
    },
    stats.bidAdjustments > 0 && {
      value: stats.bidAdjustments,
      label: "bid changes applied",
    },
    ...stats.customStats.map((s) => ({
      value: s.value,
      label: s.label,
    })),
  ].filter(Boolean) as Array<{ value: number; label: string }>;

  const total = breakdown.reduce((sum, c) => sum + c.value, 0);

  if (total === 0) return null;

  return (
    <div className="rounded-xl bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 shadow-sm p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3">
        What We&apos;ve Been Working On
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-2xl font-bold text-blue-700">{total}</span>
          <span className="text-sm text-blue-600 leading-tight font-medium">total account changes</span>
        </div>
        {breakdown.map((card, i) => (
          <StatCard key={i} value={card.value} label={card.label} />
        ))}
      </div>
    </div>
  );
}
