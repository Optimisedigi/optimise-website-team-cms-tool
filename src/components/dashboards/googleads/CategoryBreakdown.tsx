"use client";

import { DataTable, type Column } from "@/components/dashboards/shared/DataTable";
import type { GoogleAdsDashboardCampaign } from "@/lib/dashboard-types";

function formatDollars(n: number | null): string {
  if (n == null) return "\u2014";
  return n >= 1000
    ? `$${(n / 1000).toFixed(1)}k`
    : `$${n.toLocaleString("en-US")}`;
}

const columns: Column<GoogleAdsDashboardCampaign>[] = [
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
  {
    key: "cpa",
    label: "CPA",
    align: "right",
    format: (v) => formatDollars(v as number | null),
  },
];

interface CategoryBreakdownProps {
  campaigns: GoogleAdsDashboardCampaign[];
}

export function CategoryBreakdown({ campaigns }: CategoryBreakdownProps) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3">
        Category Breakdown
      </h2>
      <DataTable columns={columns} rows={campaigns} emptyMessage="No campaign data" />
    </div>
  );
}
