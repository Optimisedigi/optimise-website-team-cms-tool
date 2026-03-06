"use client";

import { DataTable, type Column } from "@/components/dashboards/shared/DataTable";
import type { GoogleAdsDashboardKeyword } from "@/lib/dashboard-types";

function formatDollars(n: number | null): string {
  if (n == null) return "\u2014";
  return n >= 1000
    ? `$${(n / 1000).toFixed(1)}k`
    : `$${n.toLocaleString("en-US")}`;
}

const columns: Column<GoogleAdsDashboardKeyword>[] = [
  { key: "term", label: "Keyword", align: "left" },
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

interface TopKeywordsProps {
  keywords: GoogleAdsDashboardKeyword[];
  limit?: number;
  onViewAll?: () => void;
}

export function TopKeywords({ keywords, limit, onViewAll }: TopKeywordsProps) {
  const displayKeywords = limit ? keywords.slice(0, limit) : keywords;
  const hasMore = limit != null && keywords.length > limit;

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Top Keywords
        </h2>
        {hasMore && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View all &rarr;
          </button>
        )}
      </div>
      <DataTable columns={columns} rows={displayKeywords} emptyMessage="No keyword data" />
    </div>
  );
}
