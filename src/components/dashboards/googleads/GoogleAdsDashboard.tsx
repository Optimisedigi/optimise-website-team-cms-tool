"use client";

import { useState, useCallback, useRef } from "react";
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

interface GoogleAdsDashboardProps {
  data: GoogleAdsDashboardData;
  mockQualityData?: GoogleAdsDashboardQualityData;
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
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "all_time", label: "All time" },
] as const;

type Tab = "overview" | "competitors" | "keywords" | "quality";

export function GoogleAdsDashboard({ data: initialData, mockQualityData }: GoogleAdsDashboardProps) {
  const [data, setData] = useState(initialData);
  const [compareMode, setCompareMode] = useState<"month" | "year">("month");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [range, setRange] = useState(initialData.range || "last_month");
  const [loading, setLoading] = useState(false);
  const [qualityData, setQualityData] = useState<GoogleAdsDashboardQualityData | null>(mockQualityData ?? null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const qualityFetched = useRef(!!mockQualityData);

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
        const res = await fetch(
          `/api/dashboard/data?${params}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const newData = await res.json();
          setData(newData);
        }
      } finally {
        setLoading(false);
      }
    },
    [range, data.slug, data.customerId],
  );

  const handleTabChange = useCallback(
    async (tab: Tab) => {
      setActiveTab(tab);
      if (tab === "quality" && !qualityFetched.current && data.slug) {
        qualityFetched.current = true;
        setQualityLoading(true);
        try {
          const res = await fetch(
            `/api/dashboard/quality-scores?slug=${encodeURIComponent(data.slug)}`,
            { credentials: "include" },
          );
          if (res.ok) {
            setQualityData(await res.json());
          }
        } finally {
          setQualityLoading(false);
        }
      }
    },
    [data.slug],
  );

  const rangeLabel =
    RANGE_OPTIONS.find((r) => r.value === range)?.label || "Last month";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-4">
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt={data.clientName}
                className="h-10 w-auto object-contain"
              />
            ) : (
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {data.clientName}
              </h1>
            )}
            <span className="text-base text-slate-400 font-normal">
              Google Ads Dashboard
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Date range dropdown */}
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
            {data.dateRangeLabel && (
              <span className="text-xs text-slate-500">{data.dateRangeLabel}</span>
            )}

            {activeTab === "overview" && (
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
            )}

            <p className="text-xs text-slate-400">
              Updated {timeAgo(data.lastUpdated)}
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm mb-5">
          {([
            { key: "overview" as Tab, label: "Overview" },
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
                <MonthlyChart data={data.monthlyTrend} />
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

          {activeTab === "competitors" && (
            <CompetitorAnalysis
              auctionInsights={data.auctionInsights}
              impressionShare={data.impressionShare}
            />
          )}

          {activeTab === "keywords" && (
            <KeywordDeepDive
              topConverters={data.topConverters}
              budgetWasters={data.budgetWasters}
              irrelevantTerms={data.irrelevantTerms}
              customerId={data.customerId}
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
            ) : qualityData ? (
              <QualityScoreTab data={qualityData} />
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">
                Quality score data is not available yet.
              </p>
            )
          )}
        </div>

        {/* Managed by badge */}
        <div className="mt-8 flex justify-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Managed by Optimise Digital</span>
          </div>
        </div>
      </div>
    </div>
  );
}
