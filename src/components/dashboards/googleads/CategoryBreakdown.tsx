"use client";

import { useMemo } from "react";
import type { GoogleAdsDashboardCampaign } from "@/lib/dashboard-types";

function formatDollars(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

interface CategoryBreakdownProps {
  campaigns: GoogleAdsDashboardCampaign[];
}

export function CategoryBreakdown({ campaigns }: CategoryBreakdownProps) {
  // Discover the distinct conversion-action names that contributed to any
  // campaign. Sorted by total contribution; truncated to top 4 so the
  // table stays readable.
  const actionColumns = useMemo(() => {
    const totals = new Map<string, number>();
    for (const c of campaigns) {
      if (!c.conversionsByAction) continue;
      for (const [action, n] of Object.entries(c.conversionsByAction)) {
        if (!Number.isFinite(n) || n <= 0) continue;
        totals.set(action, (totals.get(action) || 0) + n);
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([action]) => action);
  }, [campaigns]);

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Category Breakdown
        </h2>
        {actionColumns.length > 0 && (
          <span
            className="text-[10px] text-slate-400"
            title={actionColumns.join(", ")}
          >
            Showing top {actionColumns.length} action{actionColumns.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No campaign data</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-medium">
                <th className="py-2 px-3 text-left">Campaign</th>
                <th className="py-2 px-3 text-right">Spend</th>
                <th className="py-2 px-3 text-center">Clicks</th>
                <th className="py-2 px-3 text-center">Conv</th>
                {actionColumns.map((action) => (
                  <th
                    key={action}
                    className="py-2 px-1.5 text-center font-medium normal-case tracking-normal align-bottom"
                    style={{ maxWidth: 88, minWidth: 60, width: 72 }}
                    title={action}
                  >
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400 leading-tight" style={{ wordBreak: "break-word", whiteSpace: "normal" }}>
                      {action}
                    </span>
                  </th>
                ))}
                <th className="py-2 px-3 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.name}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-2.5 px-3 text-slate-800">{c.name}</td>
                  <td className="py-2.5 px-3 text-right text-slate-700">{formatDollars(c.spend)}</td>
                  <td className="py-2.5 px-3 text-center text-slate-700">{formatNumber(c.clicks)}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-slate-900">
                    {formatNumber(c.conversions)}
                  </td>
                  {actionColumns.map((action) => {
                    const n = c.conversionsByAction?.[action] ?? 0;
                    return (
                      <td
                        key={action}
                        className="py-2.5 px-1.5 text-center text-slate-400"
                        style={{ maxWidth: 88, minWidth: 60, width: 72 }}
                      >
                        {n > 0 ? Math.round(n).toLocaleString("en-US") : "—"}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-right text-slate-700">{formatDollars(c.cpa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
