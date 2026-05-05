"use client";

import { useMemo } from "react";
import { DataTable, type Column } from "@/components/dashboards/shared/DataTable";
import type { GoogleAdsDashboardCampaign } from "@/lib/dashboard-types";

function formatDollars(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

interface CategoryBreakdownProps {
  campaigns: GoogleAdsDashboardCampaign[];
}

export function CategoryBreakdown({ campaigns }: CategoryBreakdownProps) {
  // Discover the distinct conversion-action names that contributed to any
  // campaign in the table. Sorted by total conversions across the table so
  // the most-active action becomes the leftmost extra column. Truncated to
  // the top 4 to keep the table readable; remaining actions still roll up
  // into the existing Conv total.
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

  const columns: Column<GoogleAdsDashboardCampaign>[] = useMemo(() => {
    const base: Column<GoogleAdsDashboardCampaign>[] = [
      { key: "name", label: "Campaign", align: "left" },
      {
        key: "spend",
        label: "Spend",
        align: "right",
        format: (v) => formatDollars(v as number),
      },
      {
        key: "clicks",
        label: "Clicks",
        align: "center",
        format: (v) => (v as number).toLocaleString("en-US"),
      },
      {
        key: "conversions",
        label: "Conv",
        align: "center",
        format: (v) => String(Math.round(v as number)),
      },
    ];
    // Per-action columns. The DataTable Column type is strictly typed by
    // keyof T, so we cast — the format callback ignores the raw value and
    // reads conversionsByAction[action] from the row.
    const perAction: Column<GoogleAdsDashboardCampaign>[] = actionColumns.map(
      (action) => {
        const shortLabel = action.length > 18 ? action.slice(0, 16) + "…" : action;
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          key: (`__action_${action}`) as any,
          label: shortLabel,
          align: "center",
          format: (_v: unknown, row: GoogleAdsDashboardCampaign) => {
            const n = row?.conversionsByAction?.[action];
            if (!n || n === 0) return "—";
            return String(Math.round(n));
          },
        };
      },
    );
    const tail: Column<GoogleAdsDashboardCampaign>[] = [
      {
        key: "cpa",
        label: "CPA",
        align: "right",
        format: (v) => formatDollars(v as number | null),
      },
    ];
    return [...base, ...perAction, ...tail];
  }, [actionColumns]);

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
      <DataTable columns={columns} rows={campaigns} emptyMessage="No campaign data" />
    </div>
  );
}
