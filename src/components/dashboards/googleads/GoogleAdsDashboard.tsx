"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { GoogleAdsDashboardData, GoogleAdsDashboardQualityData } from "@/lib/dashboard-types";
import { KpiRow } from "./KpiRow";
import { MonthlyChart } from "./MonthlyChart";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { TopKeywords } from "./TopKeywords";
import { NotesSection } from "./NotesSection";
import { KeywordDeepDive } from "./KeywordDeepDive";
import { CompetitorAnalysis } from "./CompetitorAnalysis";
import { ActivityStats } from "./ActivityStats";
import { QualityScoreTab } from "./QualityScoreTab";
import { ProgressTab } from "./ProgressTab";

interface GoogleAdsDashboardProps {
  data: GoogleAdsDashboardData;
  mockQualityData?: GoogleAdsDashboardQualityData;
  initialQualityData?: GoogleAdsDashboardQualityData;
  brandKeywords?: string;
  conversionActions?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const RANGE_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "all_time", label: "All time" },
] as const;

type Tab = "overview" | "competitors" | "keywords" | "quality" | "progress";

export function GoogleAdsDashboard({ data: initialData, mockQualityData, initialQualityData, brandKeywords, conversionActions: defaultConversionActions }: GoogleAdsDashboardProps) {
  const [data, setData] = useState(initialData);
  const [compareMode, setCompareMode] = useState<"month" | "year">("year");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [range, setRange] = useState(initialData.range || "this_month");
  const [loading, setLoading] = useState(false);
  const [qualityData, setQualityData] = useState<GoogleAdsDashboardQualityData | null>(initialQualityData ?? mockQualityData ?? null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState("");
  const qualityFetched = useRef(!!initialQualityData || !!mockQualityData);
  // Chart always shows last 13 months, fetched once on mount with all_time range
  const [chartMonthlyTrend, setChartMonthlyTrend] = useState(initialData.monthlyTrend);

  // Conversion action filtering
  // `defaultSelected` reflects the client's saved defaults (CMS Clients > Google Ads >
  // Default Conversion Actions). These are pre-checked but the user can override
  // ad-hoc here — the saved set is shown with a small "Default" badge so it's clear
  // which items are the persistent client setting vs. session overrides.
  const defaultSelected = defaultConversionActions
    ? defaultConversionActions.split("\n").map((s) => s.trim()).filter(Boolean)
    : [];
  const defaultSelectedSet = new Set(defaultSelected);
  const [selectedConversions, setSelectedConversions] = useState<string[]>(defaultSelected);
  const [conversionDropdownOpen, setConversionDropdownOpen] = useState(false);
  const conversionDropdownRef = useRef<HTMLDivElement>(null);
  const availableActions = data.availableConversionActions || defaultSelected;

  // Derive the active conversionActions param from selection.
  // Always send explicit action names (comma-separated) so Growth Tools
  // uses consistent filtering. The fallback uses defaultSelected (already
  // parsed from the newline-separated CMS textarea) joined with commas —
  // never the raw `defaultConversionActions` string, which would carry
  // newlines into the GAQL query and trigger BAD_VALUE.
  const activeConversionActions = selectedConversions.length > 0
    ? selectedConversions.join(",")
    : availableActions.length > 0
      ? availableActions.join(",")
      : defaultSelected.join(",");

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (conversionDropdownRef.current && !conversionDropdownRef.current.contains(e.target as Node)) {
        setConversionDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!initialData.slug) return;
    const params = new URLSearchParams({ slug: initialData.slug, range: "all_time" });
    if (initialData.customerId) params.set("customerId", initialData.customerId);
    if (initialData.clientName) params.set("clientName", initialData.clientName);
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    if (activeConversionActions) params.set("conversionActions", activeConversionActions);
    fetch(`/api/dashboard/data?${params}`, { credentials: "include", cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((fullData) => {
        if (fullData?.monthlyTrend) setChartMonthlyTrend(fullData.monthlyTrend);
      })
      .catch(() => {});
  }, [initialData.slug, initialData.customerId, initialData.clientName, brandKeywords, activeConversionActions]);

  const changeRange = useCallback(
    async (newRange: string) => {
      if (newRange === range || !data.slug) return;
      setRange(newRange);
      setLoading(true);
      try {
        const params = new URLSearchParams({
          slug: data.slug,
          range: newRange,
        });
        if (data.customerId) {
          params.set("customerId", data.customerId);
        }
        if (data.clientName) {
          params.set("clientName", data.clientName);
        }
        if (brandKeywords) {
          params.set("brandKeywords", brandKeywords);
        }
        if (activeConversionActions) {
          params.set("conversionActions", activeConversionActions);
        }
        const res = await fetch(
          `/api/dashboard/data?${params}`,
          { credentials: "include", cache: "no-store" },
        );
        if (res.ok) {
          const newData = await res.json();
          setData((prev) => ({
            ...prev,
            ...newData,
            range: newRange,
            dateRangeLabel: newData.dateRangeLabel || undefined,
            slug: prev.slug,
            customerId: prev.customerId,
            clientName: prev.clientName,
          }));
        }
      } finally {
        setLoading(false);
      }
    },
    [range, data.slug, data.customerId, data.clientName, brandKeywords, activeConversionActions],
  );

  const fetchQualityData = useCallback(
    async (rangeOverride?: string) => {
      if (!data.slug || !data.customerId) return;
      setQualityLoading(true);
      setQualityError("");
      try {
        const params = new URLSearchParams({
          slug: data.slug,
          customerId: data.customerId,
          range: rangeOverride || range,
        });
        const res = await fetch(
          `/api/dashboard/quality-scores?${params}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const result = await res.json();
          setQualityData(result);
          qualityFetched.current = true;
        } else {
          const text = await res.text().catch(() => "");
          console.error(`[QualityScore] Fetch failed (${res.status}):`, text);
          setQualityError(`Failed to load quality scores (${res.status})`);
        }
      } catch (err) {
        console.error("[QualityScore] Fetch error:", err);
        setQualityError("Failed to load quality scores. Please try again.");
      } finally {
        setQualityLoading(false);
      }
    },
    [data.slug, data.customerId, range],
  );

  const handleTabChange = useCallback(
    async (tab: Tab) => {
      setActiveTab(tab);
      if (tab === "quality" && !qualityFetched.current) {
        await fetchQualityData();
      }
    },
    [fetchQualityData],
  );

  // Re-fetch quality data when the date range changes — but only if the
  // Quality tab has already been opened at least once. Avoids a wasted
  // request for users who never click into the tab.
  useEffect(() => {
    if (!qualityFetched.current) return;
    fetchQualityData(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const toggleConversion = useCallback(
    (action: string) => {
      setSelectedConversions((prev) => {
        const next = prev.includes(action)
          ? prev.filter((a) => a !== action)
          : [...prev, action];
        return next;
      });
    },
    [],
  );

  const selectAllConversions = useCallback(() => {
    setSelectedConversions(availableActions);
  }, [availableActions]);

  const clearAllConversions = useCallback(() => {
    setSelectedConversions([]);
  }, []);

  // Re-fetch when selected conversions change (after initial render)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!data.slug) return;
    const newActions = selectedConversions.length > 0
      ? selectedConversions.join(",")
      : availableActions.length > 0
        ? availableActions.join(",")
        : defaultSelected.join(",");
    setLoading(true);
    const params = new URLSearchParams({ slug: data.slug, range });
    if (data.customerId) params.set("customerId", data.customerId);
    if (data.clientName) params.set("clientName", data.clientName);
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    if (newActions) params.set("conversionActions", newActions);
    fetch(`/api/dashboard/data?${params}`, { credentials: "include", cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((newData) => {
        if (newData) {
          setData((prev) => ({ ...prev, ...newData, slug: prev.slug, customerId: prev.customerId, clientName: prev.clientName }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversions]);

  const rangeLabel =
    RANGE_OPTIONS.find((r) => r.value === range)?.label || "Last month";
  const displayedDateLabel = data.dateRangeLabel || rangeLabel;

  // Monthly chart always shows last 14 months, unaffected by date range
  const chart14Months = chartMonthlyTrend.slice(-14);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-[11px] pb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <div className="flex items-center gap-3 flex-wrap pt-1">
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt={data.clientName}
                className="w-auto object-contain" style={{ height: '28px' }}
              />
            ) : (
              <h1 className="font-bold tracking-tight text-slate-900 leading-tight" style={{ fontSize: '26px' }}>
                {data.clientName}
              </h1>
            )}
            <span className="text-slate-400 font-normal" style={{ fontSize: '18px' }}>
              Google Ads Dashboard
            </span>
          </div>
          <div className="flex items-start gap-3">
            {/* Date range dropdown + resolved date label below it */}
            <div className="flex flex-col items-start gap-1">
              <select
                value={range}
                onChange={(e) => changeRange(e.target.value)}
                disabled={loading}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                {RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">{displayedDateLabel}</span>
            </div>

            {/* Conversion action selector */}
            {availableActions.length > 1 && (
              <div className="relative" ref={conversionDropdownRef}>
                <button
                  onClick={() => setConversionDropdownOpen((o) => !o)}
                  disabled={loading}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Conversions
                  {selectedConversions.length > 0 && selectedConversions.length < availableActions.length && (
                    <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                      {selectedConversions.length}
                    </span>
                  )}
                  <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${conversionDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {conversionDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                    <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Conversion Actions</span>
                      <div className="flex gap-2">
                        <button onClick={selectAllConversions} className="text-xs text-blue-600 hover:text-blue-800">All</button>
                        <button onClick={clearAllConversions} className="text-xs text-slate-400 hover:text-slate-600">None</button>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {availableActions.map((action) => {
                        const isDefault = defaultSelectedSet.has(action);
                        return (
                          <label
                            key={action}
                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedConversions.includes(action)}
                              onChange={() => toggleConversion(action)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                            <span className="text-sm text-slate-700 truncate flex-1">{action}</span>
                            {isDefault && (
                              <span
                                className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0"
                                title="Saved as a default for this client"
                              >
                                Default
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "overview" && (
              <div className="flex flex-col items-start gap-1">
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
                  <button
                    onClick={() => setCompareMode("month")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                      compareMode === "month"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    vs Last Month
                  </button>
                  <button
                    onClick={() => setCompareMode("year")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                      compareMode === "year"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    vs Last Year
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Updated {timeAgo(data.lastUpdated)}
                </p>
              </div>
            )}

            {/* When not on Overview, the toggle is hidden — still show the
                'Updated X ago' line so it doesn't disappear with the toggle. */}
            {activeTab !== "overview" && (
              <p className="text-xs text-slate-400 self-end">
                Updated {timeAgo(data.lastUpdated)}
              </p>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm mb-5">
          {([
            { key: "overview" as Tab, label: "Overview" },
            { key: "progress" as Tab, label: "Progress" },
            { key: "competitors" as Tab, label: "Competitor Analysis" },
            { key: "keywords" as Tab, label: "Keyword Deep Dive" },
            { key: "quality" as Tab, label: "Quality Score" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-4 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="flex items-center gap-2 mb-4 text-sm text-slate-500">
            <svg
              className="animate-spin h-4 w-4 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading {rangeLabel.toLowerCase()} data...
          </div>
        )}

        <div className={loading ? "opacity-50 pointer-events-none" : ""}>
          {activeTab === "overview" && (
            <>
              <KpiRow kpis={data.kpis} compareMode={compareMode} />
              <div className="mt-6">
                <MonthlyChart data={chart14Months} />
              </div>
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CategoryBreakdown campaigns={data.campaignBreakdown} />
                <TopKeywords
                  keywords={data.topKeywords}
                  limit={6}
                  onViewAll={() => setActiveTab("keywords")}
                />
              </div>
              <div className="mt-6">
                <ActivityStats stats={data.activityStats} />
              </div>
              <div className="mt-6">
                <NotesSection
                  notes={data.notes}
                  workDone={data.workDone}
                  slug={data.slug}
                />
              </div>
            </>
          )}

          {activeTab === "progress" && (
            <ProgressTab
              monthlyTrend={data.monthlyTrend}
              budgetWasters={data.budgetWasters}
              kpis={data.kpis}
            />
          )}

          {activeTab === "competitors" && (
            <CompetitorAnalysis
              auctionInsights={data.auctionInsights}
              adGroupAuctionInsights={data.adGroupAuctionInsights}
              impressionShare={data.impressionShare}
            />
          )}

          {activeTab === "keywords" && (
            <KeywordDeepDive
              topConverters={data.topConverters}
              budgetWasters={data.budgetWasters}
              irrelevantTerms={data.irrelevantTerms}
              customerId={data.customerId}
              slug={data.slug}
            />
          )}

          {activeTab === "quality" && (
            qualityLoading ? (
              <div className="flex items-center gap-2 py-12 justify-center text-sm text-slate-500">
                <svg
                  className="animate-spin h-4 w-4 text-blue-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading quality score data...
              </div>
            ) : qualityError ? (
              <div className="py-12 text-center">
                <p className="text-sm text-red-500 mb-3">{qualityError}</p>
                <button
                  onClick={() => fetchQualityData()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : qualityData ? (
              <QualityScoreTab data={qualityData} brandKeywords={brandKeywords} />
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">
                Quality score data is not available yet.
              </p>
            )
          )}
        </div>

        {/* Managed by badge */}
        <div className="mt-8 flex justify-end">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Managed by</span>
            <img
              src="/optimise-logo-animated.gif"
              alt="Optimise Digital"
              style={{ height: '14px', width: 'auto', mixBlendMode: 'multiply' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
