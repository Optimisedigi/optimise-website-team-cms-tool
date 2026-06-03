"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { GoogleAdsDashboardData, GoogleAdsDashboardQualityData, GoogleAdsDashboardAvoidedSpend, GoogleAdsDashboardMonthlyWasteRelevancy } from "@/lib/dashboard-types";
import { DASHBOARD_MONTHLY_WINDOW, padMonthlySeries } from "@/lib/dashboard-types";
import { KpiRow } from "./KpiRow";
import { MonthlyChart } from "./MonthlyChart";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { TopKeywords } from "./TopKeywords";
import { ConversionSplit } from "./ConversionSplit";
import { NotesSection } from "./NotesSection";
import { KeywordDeepDive } from "./KeywordDeepDive";
import { CompetitorAnalysis } from "./CompetitorAnalysis";
import { ActivityStats } from "./ActivityStats";
import { QualityScoreTab } from "./QualityScoreTab";
import { ProgressTab } from "./ProgressTab";
import { AccountStructureTab } from "./AccountStructureTab";

interface GoogleAdsDashboardProps {
  data: GoogleAdsDashboardData;
  mockQualityData?: GoogleAdsDashboardQualityData;
  initialQualityData?: GoogleAdsDashboardQualityData;
  brandKeywords?: string;
  conversionActions?: string;
  phoneCallActions?: string;
  formSubmitActions?: string;
  /** JSON-encoded `Array<{ label, color, actions: string[] }>` defining the
   *  client's editable conversion-action categories. */
  conversionActionCategories?: string;
  clientId?: string;
  initialKeywordSelections?: string[];
  initialAddedSelections?: string[];
  initialAddedNegatives?: string[];
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
  { value: "last_60_days", label: "Last 60 days" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "all_time", label: "All time" },
] as const;

// Deep Dive uses a narrower set — negative keyword review needs a recent
// rolling window, not a calendar-month or full-year view.
const DEEP_DIVE_RANGE_OPTIONS = [
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_60_days", label: "Last 60 days" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
] as const;

type Tab = "overview" | "competitors" | "keywords" | "quality" | "progress" | "accountStructure";

export function GoogleAdsDashboard({ data: initialData, mockQualityData, initialQualityData, brandKeywords, conversionActions: defaultConversionActions, phoneCallActions, formSubmitActions, conversionActionCategories, clientId, initialKeywordSelections, initialAddedSelections, initialAddedNegatives }: GoogleAdsDashboardProps) {
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
  // Search-term lists scoped to a fixed lookback (last_6_months) for the
  // Progress tab's Monthly Trend chart. The chart's wasteRate / relevancy
  // overlay lines use these so they don't go flat at 0% / 100% when the
  // global range is set to "this month" early in the month. Independent of
  // the user's selected range. Used as a fallback when monthlyWasteRelevancy
  // hasn't loaded yet.
  const [trendBudgetWasters, setTrendBudgetWasters] = useState<typeof initialData.budgetWasters | null>(null);
  const [trendIrrelevantTerms, setTrendIrrelevantTerms] = useState<typeof initialData.irrelevantTerms | null>(null);
  const [trendTotalSpend, setTrendTotalSpend] = useState<number | null>(null);
  // True per-month historical waste / relevancy figures — each month gets
  // its own real numerator (no projection trick). When this loads, the
  // chart's wasteRate / relevancy lines reflect actual historical search-
  // term spend per month against today's NKL.
  const [monthlyWasteRelevancy, setMonthlyWasteRelevancy] = useState<GoogleAdsDashboardMonthlyWasteRelevancy[] | null>(null);
  // Avoided-spend (negative keyword value) data — fetched once on mount when
  // both clientId and customerId are available. Stays null otherwise so the
  // Progress tab gracefully hides the section.
  const [avoidedSpend, setAvoidedSpend] = useState<GoogleAdsDashboardAvoidedSpend | null>(null);
  // Keyword Deep Dive owns its own date range — negative-keyword review wants
  // a recent rolling window (default 60 days), independent of whatever the
  // global selector is set to. We fetch dashboard data scoped to this range
  // and stash the search-term lists separately so they don't clobber the
  // global `data` (which other tabs rely on).
  const [deepDiveRange, setDeepDiveRange] = useState<string>("last_60_days");
  const [deepDiveData, setDeepDiveData] = useState<GoogleAdsDashboardData | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const deepDiveFetched = useRef(false);

  useEffect(() => {
    if (!clientId || !initialData.customerId || !initialData.slug) return;
    const params = new URLSearchParams({
      slug: initialData.slug,
      clientId,
      customerId: initialData.customerId,
      // 14 months gives the chart a slightly longer trend than the standard
      // 12-month rolling window — the extra two months help spot seasonality
      // changes year-over-year without the cost of a full 24-month pull.
      monthsBack: "14",
    });
    fetch(`/api/dashboard/avoided-spend?${params}`, { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GoogleAdsDashboardAvoidedSpend | null) => {
        if (data) setAvoidedSpend(data);
      })
      .catch(() => {});
  }, [clientId, initialData.customerId, initialData.slug]);

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
  // Custom range picker state for the global date dropdown
  const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);
  const rangeDropdownRef = useRef<HTMLDivElement>(null);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
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
      if (rangeDropdownRef.current && !rangeDropdownRef.current.contains(e.target as Node)) {
        setRangeDropdownOpen(false);
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
    if (phoneCallActions) params.set("phoneCallActions", phoneCallActions);
    if (formSubmitActions) params.set("formSubmitActions", formSubmitActions);
    if (conversionActionCategories) params.set("conversionActionCategories", conversionActionCategories);
    fetch(`/api/dashboard/data?${params}`, { credentials: "include", cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((fullData) => {
        if (fullData?.monthlyTrend) setChartMonthlyTrend(fullData.monthlyTrend);
      })
      .catch(() => {});
  }, [initialData.slug, initialData.customerId, initialData.clientName, brandKeywords, activeConversionActions, phoneCallActions, formSubmitActions]);

  // Separate fetch for the Progress chart's overlay metrics (waste / relevancy).
  // Fixed last_6_months lookback so the chart lines stay meaningful regardless
  // of which date range the rest of the dashboard is on. Used as fallback
  // until monthlyWasteRelevancy resolves with true per-month data.
  useEffect(() => {
    if (!initialData.slug) return;
    const params = new URLSearchParams({ slug: initialData.slug, range: "last_6_months" });
    if (initialData.customerId) params.set("customerId", initialData.customerId);
    if (initialData.clientName) params.set("clientName", initialData.clientName);
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    if (activeConversionActions) params.set("conversionActions", activeConversionActions);
    if (phoneCallActions) params.set("phoneCallActions", phoneCallActions);
    if (formSubmitActions) params.set("formSubmitActions", formSubmitActions);
    if (conversionActionCategories) params.set("conversionActionCategories", conversionActionCategories);
    fetch(`/api/dashboard/data?${params}`, { credentials: "include", cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((trendData) => {
        if (!trendData) return;
        if (Array.isArray(trendData.budgetWasters)) setTrendBudgetWasters(trendData.budgetWasters);
        if (Array.isArray(trendData.irrelevantTerms)) setTrendIrrelevantTerms(trendData.irrelevantTerms);
        if (typeof trendData.kpis?.spend === "number") setTrendTotalSpend(trendData.kpis.spend);
      })
      .catch(() => {});
  }, [initialData.slug, initialData.customerId, initialData.clientName, brandKeywords, activeConversionActions]);

  // True per-month historical waste/relevancy fetch. Heavier than the
  // last_6_months overlay fetch — pulls 14 months of search-term data
  // from Google Ads — so it's gated on having a clientId + customerId.
  // Runs once on mount; the Progress tab gracefully shows the projected
  // overlay numbers in the meantime. 14 months matches the avoided-spend
  // window so both charts share the same x-axis range.
  useEffect(() => {
    if (!clientId || !initialData.customerId || !initialData.slug) return;
    const params = new URLSearchParams({
      slug: initialData.slug,
      clientId,
      customerId: initialData.customerId,
      monthsBack: "14",
    });
    fetch(`/api/dashboard/monthly-waste-relevancy?${params}`, { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.monthly)) {
          setMonthlyWasteRelevancy(data.monthly);
        }
      })
      .catch(() => {});
  }, [clientId, initialData.customerId, initialData.slug]);

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
        if (phoneCallActions) {
          params.set("phoneCallActions", phoneCallActions);
        }
        if (formSubmitActions) {
          params.set("formSubmitActions", formSubmitActions);
        }
        if (conversionActionCategories) {
          params.set("conversionActionCategories", conversionActionCategories);
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

  // Fetch Deep Dive search-term lists scoped to the deep-dive-only range.
  // Reuses /api/dashboard/data but stores the result separately so the rest
  // of the dashboard (Overview / Progress / Quality) keeps using the global
  // range's data. We only need the search-term arrays for Deep Dive but the
  // endpoint returns the full payload — cheap enough not to optimise.
  const fetchDeepDiveData = useCallback(
    async (rangeOverride?: string) => {
      if (!data.slug) return;
      setDeepDiveLoading(true);
      try {
        const params = new URLSearchParams({
          slug: data.slug,
          range: rangeOverride || deepDiveRange,
        });
        if (data.customerId) params.set("customerId", data.customerId);
        if (data.clientName) params.set("clientName", data.clientName);
        if (brandKeywords) params.set("brandKeywords", brandKeywords);
        if (activeConversionActions) params.set("conversionActions", activeConversionActions);
        if (phoneCallActions) params.set("phoneCallActions", phoneCallActions);
        if (formSubmitActions) params.set("formSubmitActions", formSubmitActions);
        const res = await fetch(
          `/api/dashboard/data?${params}`,
          { credentials: "include", cache: "no-store" },
        );
        if (res.ok) {
          const result = await res.json();
          setDeepDiveData(result);
          deepDiveFetched.current = true;
        }
      } catch (err) {
        console.error("[DeepDive] Fetch error:", err);
      } finally {
        setDeepDiveLoading(false);
      }
    },
    [data.slug, data.customerId, data.clientName, brandKeywords, activeConversionActions, deepDiveRange],
  );

  const handleTabChange = useCallback(
    async (tab: Tab) => {
      setActiveTab(tab);
      if (tab === "quality" && !qualityFetched.current) {
        await fetchQualityData();
      }
      if (tab === "keywords" && !deepDiveFetched.current) {
        await fetchDeepDiveData();
      }
    },
    [fetchQualityData, fetchDeepDiveData],
  );

  const changeDeepDiveRange = useCallback(
    (newRange: string) => {
      if (newRange === deepDiveRange) return;
      setDeepDiveRange(newRange);
      // The fetch effect below picks this up.
    },
    [deepDiveRange],
  );

  // Re-fetch Deep Dive data when its range changes — but only if the user
  // has already opened the tab. Avoids a wasted request for users who
  // never click in.
  useEffect(() => {
    if (!deepDiveFetched.current) return;
    fetchDeepDiveData(deepDiveRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepDiveRange]);

  // Re-fetch when conversion-action selection changes — same gate.
  useEffect(() => {
    if (!deepDiveFetched.current) return;
    fetchDeepDiveData(deepDiveRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversionActions]);

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

  const selectDefaultConversions = useCallback(() => {
    // Restore the client's CMS-saved default conversion actions, intersected
    // with what the account currently exposes so we never select a stale
    // action name that no longer exists.
    const availableSet = new Set(availableActions);
    const defaults = defaultSelected.filter((a) => availableSet.has(a));
    setSelectedConversions(defaults.length > 0 ? defaults : defaultSelected);
  }, [availableActions, defaultSelected]);

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
    if (phoneCallActions) params.set("phoneCallActions", phoneCallActions);
    if (formSubmitActions) params.set("formSubmitActions", formSubmitActions);
    if (conversionActionCategories) params.set("conversionActionCategories", conversionActionCategories);
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

  const isCustomRange = range.startsWith("custom:");
  const rangeLabel = isCustomRange
    ? "Custom range"
    : RANGE_OPTIONS.find((r) => r.value === range)?.label || "Last month";
  const deepDiveRangeLabel =
    DEEP_DIVE_RANGE_OPTIONS.find((r) => r.value === deepDiveRange)?.label || "Last 60 days";
  // On the Keyword Deep Dive tab show the deep-dive scope under the
  // selector; everywhere else use the global range's label.
  const displayedDateLabel =
    activeTab === "keywords"
      ? (deepDiveData?.dateRangeLabel || deepDiveRangeLabel)
      : (data.dateRangeLabel || rangeLabel);

  // Monthly chart always shows the last DASHBOARD_MONTHLY_WINDOW months
  // ending at the current month, unaffected by the global date-range
  // selector. Pad with zeros so missing months still appear on the X-axis
  // and so May 2026 lines up with April 2025 across all tabs.
  const paddedTrend = padMonthlySeries(
    chartMonthlyTrend,
    DASHBOARD_MONTHLY_WINDOW,
    (month) => ({ month, spend: 0, conversions: 0, brandSpend: 0, genericSpend: 0 }),
  );

  // Override the per-month brand/generic split using search-term ratios
  // from the waste-relevancy fetch. The brand fraction is computed from
  // the search-term data (cost on terms containing any brand keyword)
  // and applied to the campaign-level total spend so non-search channels
  // (Display / PMax / Video) roll into "generic" by default.
  const chart14Months = paddedTrend.map((m) => {
    const wr = monthlyWasteRelevancy?.find((w) => w.month === m.month);
    if (!wr || !wr.totalSpend || !wr.brandSpend) return m;
    const ratio = Math.max(0, Math.min(1, wr.brandSpend / wr.totalSpend));
    const brandSpend = Math.round(m.spend * ratio * 100) / 100;
    const genericSpend = Math.max(0, Math.round((m.spend - brandSpend) * 100) / 100);
    return { ...m, brandSpend, genericSpend };
  });

  const isAccountStructureTab = activeTab === "accountStructure";

  return (
    <div className="od-dashboard-root min-h-screen bg-slate-50 text-slate-900">
      <div className={`mx-auto px-4 sm:px-6 lg:px-8 pt-[11px] pb-6 ${isAccountStructureTab ? "max-w-none" : "max-w-7xl"}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-[20px]">
          <div className="flex items-center gap-3 flex-wrap">
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt={data.clientName}
                className="w-auto object-contain" style={{ height: '28px' }}
              />
            ) : (
              <h1 className="font-bold tracking-tight text-slate-900 leading-tight my-0" style={{ fontSize: '26px', transform: 'translateY(-1px)' }}>
                {data.clientName}
              </h1>
            )}
            <span className="text-slate-400 font-normal" style={{ fontSize: '18px' }}>
              Google Ads Dashboard
            </span>
            {data.slug && (
              <a
                href={`/google-dashboard/${data.slug}/simple`}
                className="text-[10px] text-slate-400 hover:text-slate-600"
                title="Open the stakeholder one-page summary"
              >
                Simple view →
              </a>
            )}
          </div>
          {/* Right side: 2-row grid so all controls share one top row and all
              labels share one bottom row, regardless of individual heights.
              Parent is items-center so the title vertically centers against
              the whole right block (controls + labels). */}
          <div
            className="grid items-start gap-x-3 gap-y-1"
            style={{ gridTemplateColumns: 'repeat(3, auto)' }}
          >
            {/* Row 1, Col 1: Date range dropdown.
                Keyword Deep Dive owns its own narrower range (default 60 days)
                so a different selector is shown there. The global range
                doesn't apply on that tab — negative-keyword review wants a
                recent rolling window independent of how the rest of the
                dashboard is scoped. */}
            {activeTab === "keywords" ? (
              <select
                value={deepDiveRange}
                onChange={(e) => changeDeepDiveRange(e.target.value)}
                disabled={deepDiveLoading}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                {DEEP_DIVE_RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="relative" ref={rangeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setRangeDropdownOpen((o) => !o)}
                  disabled={loading}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 flex items-center gap-1.5 min-w-[140px] justify-between"
                >
                  <span>{rangeLabel}</span>
                  <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${rangeDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {rangeDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                    <div className="max-h-72 overflow-y-auto">
                      {RANGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setRangeDropdownOpen(false);
                            changeRange(opt.value);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                            range === opt.value ? "text-blue-600 font-medium bg-blue-50" : "text-slate-700"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-slate-100 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">
                        Custom range
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Start"
                        />
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="End"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={
                          !customStartDate ||
                          !customEndDate ||
                          customEndDate < customStartDate
                        }
                        onClick={() => {
                          setRangeDropdownOpen(false);
                          changeRange(`custom:${customStartDate},${customEndDate}`);
                        }}
                        className="w-full rounded bg-blue-600 text-white text-xs font-medium px-2 py-1.5 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        Apply custom range
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Row 1, Col 2: Conversion action selector */}
            {availableActions.length > 1 ? (
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
                  <div className="absolute right-0 top-full mt-1 w-[420px] max-w-[92vw] bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                    <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Conversion Actions</span>
                      <div className="flex gap-2">
                        <button onClick={selectAllConversions} className="text-xs text-blue-600 hover:text-blue-800">All</button>
                        {defaultSelected.length > 0 && (
                          <button
                            onClick={selectDefaultConversions}
                            className="text-xs text-blue-600 hover:text-blue-800"
                            title="Restore the client's CMS-saved default conversion actions"
                          >
                            Default
                          </button>
                        )}
                        <button onClick={clearAllConversions} className="text-xs text-slate-400 hover:text-slate-600">None</button>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {availableActions.map((action) => {
                        const isDefault = defaultSelectedSet.has(action);
                        return (
                          <label
                            key={action}
                            className="flex items-start gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer group/conv relative"
                            title={action}
                          >
                            <input
                              type="checkbox"
                              checked={selectedConversions.includes(action)}
                              onChange={() => toggleConversion(action)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 mt-0.5 shrink-0"
                            />
                            <span
                              className="text-sm text-slate-700 flex-1 leading-snug"
                              style={{ wordBreak: "break-word" }}
                            >
                              {action}
                            </span>
                            {isDefault && (
                              <span
                                className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0 mt-0.5"
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
            ) : (
              <span />
            )}

            {/* Row 1, Col 3: vs Last Month/Year toggle (Overview only,
                hidden for custom ranges — period-over-period is ambiguous). */}
            {activeTab === "overview" && !isCustomRange ? (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
                <button
                  onClick={() => setCompareMode("month")}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    compareMode === "month"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  vs Last Month
                </button>
                <button
                  onClick={() => setCompareMode("year")}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    compareMode === "year"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  vs Last Year
                </button>
              </div>
            ) : (
              <span />
            )}

            {/* Row 2, Col 1: date range label under dropdown */}
            <span className="text-xs text-slate-500 whitespace-nowrap">{displayedDateLabel}</span>

            {/* Row 2, Col 2: empty spacer under conversion selector */}
            <span />

            {/* Row 2, Col 3: 'Updated X ago' under the toggle (or right-aligned
                when toggle is hidden on non-Overview tabs) */}
            <span className="text-xs text-slate-400 whitespace-nowrap ml-[15px]">
              Updated {timeAgo(data.lastUpdated)}
            </span>
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
            { key: "accountStructure" as Tab, label: "Account Structure View" },
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
        {(loading || (deepDiveLoading && activeTab === "keywords")) && (
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
            Loading {(activeTab === "keywords" ? deepDiveRangeLabel : rangeLabel).toLowerCase()} data...
          </div>
        )}

        <div className={(loading || (deepDiveLoading && activeTab === "keywords")) ? "opacity-50 pointer-events-none" : ""}>
          {activeTab === "overview" && (
            <>
              <KpiRow
                kpis={data.kpis}
                compareMode={compareMode}
                selectedConversionActions={selectedConversions}
              />
              <div className="mt-6">
                <MonthlyChart data={chart14Months} />
              </div>
              {data.conversionSplit && (
                <div className="mt-6">
                  <ConversionSplit
                    totals={data.conversionSplit ?? null}
                    byCampaign={data.conversionSplitByCampaign ?? []}
                  />
                </div>
              )}
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 min-w-0">
                  <CategoryBreakdown campaigns={data.campaignBreakdown} />
                </div>
                <div className="lg:col-span-1 min-w-0">
                  <TopKeywords
                    keywords={data.topKeywords}
                    limit={6}
                    onViewAll={() => setActiveTab("keywords")}
                  />
                </div>
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
            // Pass the always-13-month trend (fetched once on mount with
            // range=all_time) instead of the range-scoped data.monthlyTrend.
            // The Progress tab's Monthly Trend chart should always show the
            // full historical view regardless of which date range the user
            // picks at the top of the dashboard — otherwise selecting
            // "This month" on the 1st collapses the chart to a single point.
            <ProgressTab
              monthlyTrend={chart14Months}
              budgetWasters={data.budgetWasters}
              irrelevantTerms={data.irrelevantTerms}
              kpis={data.kpis}
              avoidedSpend={avoidedSpend}
              trendBudgetWasters={trendBudgetWasters ?? undefined}
              trendIrrelevantTerms={trendIrrelevantTerms ?? undefined}
              trendTotalSpend={trendTotalSpend ?? undefined}
              monthlyWasteRelevancy={monthlyWasteRelevancy ?? undefined}
              clientId={clientId}
              slug={data.slug}
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
            // Use deep-dive-scoped data once it's fetched. Until then, fall
            // back to the global `data` so the tab isn't blank during the
            // first-open fetch (loading spinner above covers the difference).
            (() => {
              const dd = deepDiveData ?? data;
              return (
                <KeywordDeepDive
                  topConverters={dd.topConverters}
                  budgetWasters={dd.budgetWasters}
                  irrelevantTerms={dd.irrelevantTerms}
                  customerId={dd.customerId}
                  slug={dd.slug}
                  clientId={clientId}
                  initialKeywordSelections={initialKeywordSelections}
                  initialAddedSelections={initialAddedSelections}
                  initialAddedNegatives={initialAddedNegatives}
                />
              );
            })()
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

          {activeTab === "accountStructure" && data.slug && (
            <AccountStructureTab
              slug={data.slug}
              clientName={data.clientName ?? data.slug}
              googleAdsCustomerId={data.customerId ?? null}
            />
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
