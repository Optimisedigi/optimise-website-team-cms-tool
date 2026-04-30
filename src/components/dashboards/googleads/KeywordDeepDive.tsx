"use client";

import { useState, useEffect, useCallback } from "react";
import { useShiftSelect } from "@/lib/useShiftSelect";
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
  slug?: string;
  clientId?: string;
  initialKeywordSelections?: string[];
}

export function KeywordDeepDive({
  topConverters,
  budgetWasters,
  irrelevantTerms,
  customerId,
  slug,
  clientId,
  initialKeywordSelections,
}: KeywordDeepDiveProps) {
  const storageKey = `dashboard-keep-terms:${customerId}`;

  const [keptTerms, setKeptTerms] = useState<Set<string>>(new Set());
  const [showAllConverters, setShowAllConverters] = useState(false);

  // Negative keyword selection state
  const [selectedNegatives, setSelectedNegatives] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [negativeResult, setNegativeResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Load kept terms from localStorage (unchanged)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setKeptTerms(new Set(JSON.parse(saved)));
    } catch {
      // ignore
    }
  }, [storageKey]);

  // Load initial saved selections (server-side prop, or belt-and-suspenders fetch)
  useEffect(() => {
    if (initialKeywordSelections?.length) {
      setSelectedNegatives(new Set(initialKeywordSelections));
      return;
    }
    if (!clientId || !slug) return;
    fetch(
      `/api/dashboard/keyword-selections?slug=${encodeURIComponent(slug)}&clientId=${encodeURIComponent(clientId)}`,
      { credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : { keywords: [] }))
      .then((d) => {
        if (d.keywords?.length) setSelectedNegatives(new Set(d.keywords));
      })
      .catch(() => {});
  }, [clientId, slug, initialKeywordSelections]);

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

  function toggleNegative(term: string) {
    setSelectedNegatives((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  }

  function selectAllNegatives(terms: GoogleAdsDashboardSearchTerm[]) {
    setSelectedNegatives((prev) => {
      const next = new Set(prev);
      const allSelected = terms.every((t) => next.has(t.term));
      if (allSelected) {
        terms.forEach((t) => next.delete(t.term));
      } else {
        terms.forEach((t) => next.add(t.term));
      }
      return next;
    });
  }

  const budgetWasterTerms = budgetWasters.map((t) => t.term);
  const irrelevantTermIds = irrelevantTerms.map((t) => t.term);
  const { onCheckboxChange: shiftSelectBudgetWaster } = useShiftSelect(budgetWasterTerms, selectedNegatives, setSelectedNegatives);
  const { onCheckboxChange: shiftSelectIrrelevant } = useShiftSelect(irrelevantTermIds, selectedNegatives, setSelectedNegatives);

  const saveSelections = useCallback(async () => {
    if (selectedNegatives.size === 0 || !clientId || !slug) return;
    setSaving(true);
    setNegativeResult(null);
    try {
      const res = await fetch("/api/dashboard/keyword-selections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          slug,
          selectedTerms: Array.from(selectedNegatives),
        }),
      });
      const data = await res.json();
      setNegativeResult({
        type: res.ok ? "success" : "error",
        message: res.ok
          ? `${data.count} term${data.count !== 1 ? "s" : ""} saved`
          : data.error || "Save failed",
      });
    } catch {
      setNegativeResult({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  }, [selectedNegatives, clientId, slug]);

  const visibleConverters = showAllConverters
    ? topConverters
    : topConverters.slice(0, DEFAULT_LIMIT);
  const hasMoreConverters = topConverters.length > DEFAULT_LIMIT;

  const totalWastedTerms = [...budgetWasters, ...irrelevantTerms];
  const selectedCount = selectedNegatives.size;
  const selectedSpend = totalWastedTerms
    .filter((t) => selectedNegatives.has(t.term))
    .reduce((s, t) => s + t.spend, 0);

  return (
    <div className="space-y-6">
      {/* Negative keyword action bar */}
      {selectedCount > 0 && clientId && (
        <div className="sticky top-0 z-20 rounded-xl bg-red-50 border border-red-200 shadow-sm px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 text-sm font-bold">
              {selectedCount}
            </span>
            <div>
              <p className="text-sm font-medium text-red-800">
                {selectedCount} term{selectedCount !== 1 ? "s" : ""} selected as negative keywords
              </p>
              <p className="text-xs text-red-600">
                ${selectedSpend.toLocaleString()} total waste identified
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedNegatives(new Set())}
              className="px-3 py-1.5 text-xs font-medium text-red-700 hover:text-red-800 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={saveSelections}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save Selection"}
            </button>
          </div>
        </div>
      )}

      {/* Result banner */}
      {negativeResult && (
        <div
          className={`rounded-lg px-4 py-3 text-sm flex items-center justify-between ${
            negativeResult.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          <p>{negativeResult.message}</p>
          <button
            onClick={() => setNegativeResult(null)}
            className="text-xs font-medium opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

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

      {/* Low-Converting Keywords */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
              Low-Converting Keywords
            </h2>
          </div>
          {clientId && budgetWasters.length > 0 && (
            <button
              onClick={() => selectAllNegatives(budgetWasters)}
              className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              {budgetWasters.every((t) => selectedNegatives.has(t.term))
                ? "Deselect all"
                : "Select all as negatives"}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Keywords with spend but no conversions in the selected period. Consider adding as negatives.
        </p>
        {budgetWasters.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            No low-converting keywords found
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-slate-200">
                  {clientId && (
                    <th className="py-2 px-3 text-left font-medium text-xs uppercase tracking-wider text-slate-500 w-10">
                      <span className="sr-only">Negative</span>
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </th>
                  )}
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
                {budgetWasters.map((row) => {
                  const isSelected = selectedNegatives.has(row.term);
                  return (
                    <tr
                      key={row.term}
                      className={`border-b border-slate-100 last:border-0 transition-colors ${
                        isSelected
                          ? "bg-red-50/50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      {clientId && (
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => shiftSelectBudgetWaster(row.term, e)}
                            className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                          />
                        </td>
                      )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Possibly Irrelevant */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
              Possibly Irrelevant
            </h2>
          </div>
          {clientId && irrelevantTerms.length > 0 && (
            <button
              onClick={() => selectAllNegatives(irrelevantTerms)}
              className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
            >
              {irrelevantTerms.every((t) => selectedNegatives.has(t.term))
                ? "Deselect all"
                : "Select all as negatives"}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Low click-through terms that may not match your services. Tick &quot;Keep&quot; for
          terms you want to protect, or check the box to flag as negative.
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
                  <th className="py-2 px-3 text-left font-medium text-xs uppercase tracking-wider text-slate-500 w-12">
                    Keep
                  </th>
                  {clientId && (
                    <th className="py-2 px-3 text-left font-medium text-xs uppercase tracking-wider text-slate-500 w-10">
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </th>
                  )}
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
                {irrelevantTerms.map((row) => {
                  const isKept = keptTerms.has(row.term);
                  const isNeg = selectedNegatives.has(row.term);
                  return (
                    <tr
                      key={row.term}
                      className={`border-b border-slate-100 last:border-0 transition-colors ${
                        isKept
                          ? "bg-emerald-50/50"
                          : isNeg
                            ? "bg-red-50/50"
                            : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isKept}
                          onChange={() => toggleKeep(row.term)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      {clientId && (
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={isNeg}
                            disabled={isKept}
                            onChange={(e) => !isKept && shiftSelectIrrelevant(row.term, e)}
                            className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500 disabled:opacity-30"
                          />
                        </td>
                      )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
