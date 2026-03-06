"use client";

import { useState, useEffect } from "react";
import { DataTable, type Column } from "@/components/dashboards/shared/DataTable";
import type { GoogleAdsDashboardSearchTerm } from "@/lib/dashboard-types";

function formatDollars(n: number | null): string {
  if (n == null) return "\u2014";
  return n >= 1000
    ? `$${(n / 1000).toFixed(1)}k`
    : `$${n.toLocaleString("en-US")}`;
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// Column width classes for alignment across all three tables
const W_TERM = "w-[28%]";
const W_METRIC = "w-[12%]";

// Best Performers: all 7 metric columns
const converterColumns: Column<GoogleAdsDashboardSearchTerm>[] = [
  { key: "term", label: "Search Term", align: "left", width: W_TERM },
  { key: "spend", label: "Spend", align: "right", width: W_METRIC, format: (v) => formatDollars(v as number) },
  { key: "impressions", label: "Impr", align: "center", width: W_METRIC, format: (v) => (v as number).toLocaleString("en-US") },
  { key: "clicks", label: "Clicks", align: "center", width: W_METRIC, format: (v) => (v as number).toLocaleString("en-US") },
  { key: "conversions", label: "Conv", align: "center", width: W_METRIC, format: (v) => String(Math.round(v as number)) },
  { key: "ctr", label: "CTR", align: "right", width: W_METRIC, format: (v) => formatPct(v as number) },
  { key: "cpa", label: "CPA", align: "right", width: W_METRIC, format: (v) => formatDollars(v as number | null) },
];

// Budget Wasters & Irrelevant: no Conv/CPA columns
const reducedColumns: Column<GoogleAdsDashboardSearchTerm>[] = [
  { key: "term", label: "Search Term", align: "left", width: W_TERM },
  { key: "spend", label: "Spend", align: "right", width: W_METRIC, format: (v) => formatDollars(v as number) },
  { key: "impressions", label: "Impr", align: "center", width: W_METRIC, format: (v) => (v as number).toLocaleString("en-US") },
  { key: "clicks", label: "Clicks", align: "center", width: W_METRIC, format: (v) => (v as number).toLocaleString("en-US") },
  { key: "ctr", label: "CTR", align: "right", width: W_METRIC, format: (v) => formatPct(v as number) },
];

const DEFAULT_LIMIT = 10;

interface KeywordDeepDiveProps {
  topConverters: GoogleAdsDashboardSearchTerm[];
  budgetWasters: GoogleAdsDashboardSearchTerm[];
  irrelevantTerms: GoogleAdsDashboardSearchTerm[];
  customerId: string;
}

export function KeywordDeepDive({
  topConverters,
  budgetWasters,
  irrelevantTerms,
  customerId,
}: KeywordDeepDiveProps) {
  const storageKey = `dashboard-keep-terms:${customerId}`;

  const [keptTerms, setKeptTerms] = useState<Set<string>>(new Set());
  const [showAllConverters, setShowAllConverters] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setKeptTerms(new Set(JSON.parse(saved)));
    } catch {
      // ignore
    }
  }, [storageKey]);

  function toggleKeep(term: string) {
    setKeptTerms((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const visibleConverters = showAllConverters
    ? topConverters
    : topConverters.slice(0, DEFAULT_LIMIT);
  const hasMoreConverters = topConverters.length > DEFAULT_LIMIT;

  return (
    <div className="space-y-6">
      {/* Best Performers */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
            Best Performers
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Search terms that led to conversions in the last 30 days
        </p>
        <DataTable
          columns={converterColumns}
          rows={visibleConverters}
          emptyMessage="No converting search terms yet"
        />
        {hasMoreConverters && (
          <div className="mt-3 text-center">
            <button
              onClick={() => setShowAllConverters((prev) => !prev)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              {showAllConverters
                ? "Show top 10"
                : `Show all ${topConverters.length} converting terms`}
            </button>
          </div>
        )}
      </div>

      {/* Budget Wasters */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
            Budget Wasters
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Spent over $20 with zero conversions
        </p>
        <DataTable
          columns={reducedColumns}
          rows={budgetWasters}
          emptyMessage="No budget wasters found"
        />
      </div>

      {/* Possibly Irrelevant */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
            Possibly Irrelevant
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Low click-through terms that may not match your services. Tick any you
          want to keep.
        </p>
        {irrelevantTerms.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            No irrelevant terms detected
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 px-3 text-left font-medium text-xs uppercase tracking-wider text-slate-500 w-8">
                    Keep
                  </th>
                  {reducedColumns.map((col) => (
                    <th
                      key={String(col.key)}
                      className={`py-2 px-3 font-medium text-xs uppercase tracking-wider text-slate-500 ${col.width || ""} ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left"
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {irrelevantTerms.map((row) => (
                  <tr
                    key={row.term}
                    className={`border-b border-slate-100 last:border-0 transition-colors ${
                      keptTerms.has(row.term)
                        ? "bg-emerald-50/50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        checked={keptTerms.has(row.term)}
                        onChange={() => toggleKeep(row.term)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    {reducedColumns.map((col) => {
                      const raw = row[col.key];
                      const formatted = col.format
                        ? col.format(raw, row)
                        : raw == null
                          ? "\u2014"
                          : String(raw);
                      return (
                        <td
                          key={String(col.key)}
                          className={`py-2.5 px-3 text-slate-700 ${
                            col.align === "right"
                              ? "text-right"
                              : col.align === "center"
                                ? "text-center"
                                : "text-left"
                          }`}
                        >
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
