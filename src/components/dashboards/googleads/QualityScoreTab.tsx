"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type {
  GoogleAdsDashboardQualityData,
  GoogleAdsDashboardQualityKeyword,
  GoogleAdsDashboardTopAd,
} from "@/lib/dashboard-types";

interface QualityScoreTabProps {
  data: GoogleAdsDashboardQualityData;
}

type ChartMetric = "qualityScore" | "creativeQuality" | "searchPredictedCtr" | "landingPageQuality";

const METRIC_LABELS: Record<ChartMetric, string> = {
  qualityScore: "Quality Score",
  creativeQuality: "Ad Relevance",
  searchPredictedCtr: "Expected CTR",
  landingPageQuality: "Landing Page Experience",
};

function monthLabel(yyyymm: string): string {
  const [, mm] = yyyymm.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return months[parseInt(mm, 10) - 1] || mm;
}

function ratingColor(rating: string | null): string {
  if (!rating) return "text-slate-400";
  if (rating === "ABOVE_AVERAGE") return "text-emerald-600";
  if (rating === "AVERAGE") return "text-amber-500";
  return "text-red-500";
}

function ratingBg(rating: string | null): string {
  if (!rating) return "bg-slate-100 text-slate-400";
  if (rating === "ABOVE_AVERAGE") return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (rating === "AVERAGE") return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-red-50 text-red-700 border border-red-200";
}

function ratingLabel(rating: string | null): string {
  if (!rating) return "N/A";
  return rating.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convert ABOVE_AVERAGE/AVERAGE/BELOW_AVERAGE to 3/2/1 for charting */
function ratingToNumeric(rating: string | null): number | null {
  if (rating === "ABOVE_AVERAGE") return 3;
  if (rating === "AVERAGE") return 2;
  if (rating === "BELOW_AVERAGE") return 1;
  return null;
}

/** Weighted average QS for a set of keywords (weighted by impressions) */
function weightedQs(keywords: GoogleAdsDashboardQualityKeyword[]): number | null {
  let totalImpressions = 0;
  let weightedSum = 0;
  for (const kw of keywords) {
    if (kw.qualityScore == null) continue;
    weightedSum += kw.qualityScore * kw.impressions;
    totalImpressions += kw.impressions;
  }
  if (totalImpressions === 0) return null;
  return weightedSum / totalImpressions;
}

/** Weighted average of a rating field (converted to numeric) */
function weightedRating(
  keywords: GoogleAdsDashboardQualityKeyword[],
  field: "creativeQuality" | "searchPredictedCtr" | "landingPageQuality",
): number | null {
  let totalImpressions = 0;
  let weightedSum = 0;
  for (const kw of keywords) {
    const num = ratingToNumeric(kw[field]);
    if (num == null) continue;
    weightedSum += num * kw.impressions;
    totalImpressions += kw.impressions;
  }
  if (totalImpressions === 0) return null;
  return weightedSum / totalImpressions;
}

/** Average CPC for a set of keywords */
function avgCpc(keywords: GoogleAdsDashboardQualityKeyword[]): number | null {
  const withCpc = keywords.filter((k) => k.avgCpc > 0);
  if (withCpc.length === 0) return null;
  return withCpc.reduce((sum, k) => sum + k.avgCpc, 0) / withCpc.length;
}

function formatDollars(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
}

function truncateUrl(url: string | null, maxLen = 40): string {
  if (!url) return "\u2014";
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const display = u.hostname + path;
    return display.length > maxLen ? display.slice(0, maxLen - 1) + "\u2026" : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen - 1) + "\u2026" : url;
  }
}

/** Most common rating across keywords (weighted by impressions) */
function dominantRating(
  keywords: GoogleAdsDashboardQualityKeyword[],
  field: "creativeQuality" | "searchPredictedCtr" | "landingPageQuality",
): string | null {
  const counts: Record<string, number> = {};
  for (const kw of keywords) {
    const val = kw[field];
    if (!val) continue;
    counts[val] = (counts[val] || 0) + kw.impressions;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// Dual-axis line chart (SVG)

interface ChartPoint {
  label: string;
  primary: number | null;
  cpc: number | null;
}

interface DualAxisChartProps {
  points: ChartPoint[];
  metric: ChartMetric;
}

function DualAxisChart({ points, metric }: DualAxisChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isQs = metric === "qualityScore";
  const height = 220;
  const padTop = 20;
  const padBottom = 28;
  const padLeft = 40;
  const padRight = 50;
  const chartH = height - padTop - padBottom;
  const chartW = width - padLeft - padRight;

  const primaryValues = points.map((p) => p.primary).filter((v): v is number => v != null);
  const cpcValues = points.map((p) => p.cpc).filter((v): v is number => v != null);

  // Y-axis range for primary metric
  let pMin: number, pMax: number;
  if (isQs) {
    pMin = Math.max(Math.floor(Math.min(...primaryValues, 10) - 1), 1);
    pMax = Math.min(Math.ceil(Math.max(...primaryValues, 1) + 1), 10);
  } else {
    pMin = 0.5;
    pMax = 3.5;
  }

  const cpcMin = Math.max(Math.floor(Math.min(...cpcValues, 0) * 10) / 10 - 0.5, 0);
  const cpcMax = Math.ceil(Math.max(...cpcValues, 1) * 10) / 10 + 0.5;

  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;

  function pY(v: number) {
    return padTop + chartH - ((v - pMin) / (pMax - pMin)) * chartH;
  }
  function cpcY(v: number) {
    return padTop + chartH - ((v - cpcMin) / (cpcMax - cpcMin)) * chartH;
  }
  function x(i: number) {
    return padLeft + i * xStep;
  }

  const primaryLine = points
    .map((p, i) => (p.primary != null ? `${x(i)},${pY(p.primary)}` : null))
    .filter(Boolean)
    .join(" ");
  const cpcLine = points
    .map((p, i) => (p.cpc != null ? `${x(i)},${cpcY(p.cpc)}` : null))
    .filter(Boolean)
    .join(" ");

  const metricLabel = METRIC_LABELS[metric];

  // Left axis labels for rating metrics
  const leftTopLabel = isQs ? String(pMax) : "Above Avg";
  const leftBottomLabel = isQs ? String(pMin) : "Below Avg";

  return (
    <div>
      <div className="flex gap-4 mb-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" />
          {metricLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-slate-400 inline-block rounded" />
          Avg CPC
        </span>
      </div>
      <div ref={containerRef} className="w-full">
        {width > 0 && (
          <svg width={width} height={height}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
              <line
                key={frac}
                x1={padLeft}
                x2={width - padRight}
                y1={padTop + chartH * (1 - frac)}
                y2={padTop + chartH * (1 - frac)}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
            ))}

            {/* Rating zone backgrounds for sub-metrics */}
            {!isQs && (
              <>
                {/* Below Average zone (0.5-1.5) */}
                <rect
                  x={padLeft}
                  y={pY(1.5)}
                  width={chartW}
                  height={pY(0.5) - pY(1.5)}
                  fill="#fef2f2"
                  opacity={0.5}
                />
                {/* Average zone (1.5-2.5) */}
                <rect
                  x={padLeft}
                  y={pY(2.5)}
                  width={chartW}
                  height={pY(1.5) - pY(2.5)}
                  fill="#fefce8"
                  opacity={0.5}
                />
                {/* Above Average zone (2.5-3.5) */}
                <rect
                  x={padLeft}
                  y={pY(3.5)}
                  width={chartW}
                  height={pY(2.5) - pY(3.5)}
                  fill="#f0fdf4"
                  opacity={0.5}
                />
              </>
            )}

            {/* Left Y axis labels */}
            <text x={padLeft - 6} y={padTop + 4} fontSize={10} fill="#3b82f6" textAnchor="end">
              {leftTopLabel}
            </text>
            {!isQs && (
              <text x={padLeft - 6} y={pY(2) + 4} fontSize={10} fill="#3b82f6" textAnchor="end">
                Average
              </text>
            )}
            <text x={padLeft - 6} y={padTop + chartH + 4} fontSize={10} fill="#3b82f6" textAnchor="end">
              {leftBottomLabel}
            </text>

            {/* Right Y axis labels (CPC) */}
            <text x={width - padRight + 6} y={padTop + 4} fontSize={10} fill="#94a3b8" textAnchor="start">
              ${cpcMax.toFixed(2)}
            </text>
            <text x={width - padRight + 6} y={padTop + chartH + 4} fontSize={10} fill="#94a3b8" textAnchor="start">
              ${cpcMin.toFixed(2)}
            </text>

            {/* Primary line */}
            {primaryLine && (
              <>
                <polyline
                  points={primaryLine}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {points.map((p, i) =>
                  p.primary != null ? (
                    <circle
                      key={`p-${i}`}
                      cx={x(i)}
                      cy={pY(p.primary)}
                      r={3.5}
                      fill="#3b82f6"
                    />
                  ) : null,
                )}
              </>
            )}

            {/* CPC line */}
            {cpcLine && (
              <>
                <polyline
                  points={cpcLine}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeDasharray="6 3"
                />
                {points.map((p, i) =>
                  p.cpc != null ? (
                    <circle
                      key={`cpc-${i}`}
                      cx={x(i)}
                      cy={cpcY(p.cpc)}
                      r={3}
                      fill="#94a3b8"
                    />
                  ) : null,
                )}
              </>
            )}

            {/* X axis labels */}
            {points.map((p, i) => (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                fontSize={10}
                fill="#94a3b8"
                textAnchor="middle"
              >
                {p.label}
              </text>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

// Top Ads Section

function TopAdsSection({ ads }: { ads: GoogleAdsDashboardTopAd[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Top Ads by Impressions
        </h2>
      </div>
      <div className="divide-y divide-slate-100">
        {ads.map((ad) => {
          const isOpen = expanded === ad.adId;
          return (
            <div key={ad.adId}>
              <button
                onClick={() => setExpanded(isOpen ? null : ad.adId)}
                className="w-full px-5 py-3 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-700 truncate">
                    {ad.headlines[0] || "Untitled ad"}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {ad.campaignName} / {ad.adGroupName}
                  </p>
                </div>
                <div className="flex items-center gap-5 text-xs text-slate-500 shrink-0">
                  <div className="text-right">
                    <p className="font-medium text-slate-700">{ad.impressions.toLocaleString()}</p>
                    <p>impr</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-700">{ad.clicks.toLocaleString()}</p>
                    <p>clicks</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-700">{(ad.ctr * 100).toFixed(1)}%</p>
                    <p>CTR</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-700">{formatDollars(ad.spend)}</p>
                    <p>spend</p>
                  </div>
                  {ad.conversions > 0 && (
                    <div className="text-right">
                      <p className="font-medium text-emerald-600">{Math.round(ad.conversions)}</p>
                      <p>conv</p>
                    </div>
                  )}
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {isOpen && (
                <div className="px-5 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Ad preview card */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Ad Preview</p>
                      <div className="space-y-1">
                        <p className="text-blue-700 text-base font-medium leading-tight">
                          {ad.headlines.slice(0, 3).join(" | ")}
                        </p>
                        {ad.finalUrl && (
                          <p className="text-xs text-green-700">{truncateUrl(ad.finalUrl, 60)}</p>
                        )}
                        {ad.descriptions.length > 0 && (
                          <p className="text-sm text-slate-600 leading-snug mt-1">
                            {ad.descriptions[0]}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* All headlines + descriptions */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Headlines ({ad.headlines.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ad.headlines.map((h, i) => (
                            <span key={i} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded border border-blue-100">
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Descriptions ({ad.descriptions.length})</p>
                        <div className="space-y-1">
                          {ad.descriptions.map((d, i) => (
                            <p key={i} className="text-xs text-slate-600 leading-snug">
                              {d}
                            </p>
                          ))}
                        </div>
                      </div>
                      {ad.finalUrl && (
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Final URL</p>
                          <a
                            href={ad.finalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline break-all"
                          >
                            {ad.finalUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Main component

export function QualityScoreTab({ data }: QualityScoreTabProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedAdGroup, setSelectedAdGroup] = useState<string>("all");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("qualityScore");

  // Build ad groups for selected campaign
  const adGroups = useMemo(() => {
    const set = new Map<string, string>();
    for (const snap of data.snapshots) {
      for (const kw of snap.keywords) {
        if (selectedCampaign !== "all" && kw.campaignId !== selectedCampaign) continue;
        if (!set.has(kw.adGroupId)) set.set(kw.adGroupId, kw.adGroupName);
      }
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [data.snapshots, selectedCampaign]);

  // Reset ad group when campaign changes
  const handleCampaignChange = (val: string) => {
    setSelectedCampaign(val);
    setSelectedAdGroup("all");
  };

  // Filter keywords per snapshot
  const filterKeywords = (keywords: GoogleAdsDashboardQualityKeyword[]) => {
    return keywords.filter((kw) => {
      if (selectedCampaign !== "all" && kw.campaignId !== selectedCampaign) return false;
      if (selectedAdGroup !== "all" && kw.adGroupId !== selectedAdGroup) return false;
      return true;
    });
  };

  // Chart data points
  const chartPoints: ChartPoint[] = useMemo(() => {
    return data.snapshots.map((snap) => {
      const filtered = filterKeywords(snap.keywords);
      let primary: number | null;
      if (chartMetric === "qualityScore") {
        primary = weightedQs(filtered);
      } else {
        primary = weightedRating(filtered, chartMetric);
      }
      return {
        label: monthLabel(snap.month),
        primary,
        cpc: avgCpc(filtered),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.snapshots, selectedCampaign, selectedAdGroup, chartMetric]);

  // Latest snapshot for breakdown cards + table
  const latestSnapshot = data.snapshots[data.snapshots.length - 1];
  const latestKeywords = latestSnapshot ? filterKeywords(latestSnapshot.keywords) : [];

  // QS breakdown ratings
  const adRelevance = dominantRating(latestKeywords, "creativeQuality");
  const lpRating = dominantRating(latestKeywords, "landingPageQuality");

  // Sort keywords by spend desc, take top 10
  const sortedKeywords = [...latestKeywords].sort((a, b) => b.spend - a.spend).slice(0, 10);

  const currentQs = weightedQs(latestKeywords);

  const breakdownCards: Array<{
    label: string;
    metric: ChartMetric;
    rating: string | null;
  }> = [
    { label: "Quality Score", metric: "qualityScore", rating: null },
    { label: "Ad Relevance", metric: "creativeQuality", rating: adRelevance },
    { label: "Landing Page Experience", metric: "landingPageQuality", rating: lpRating },
  ];

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedCampaign}
          onChange={(e) => handleCampaignChange(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All campaigns</option>
          {data.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={selectedAdGroup}
          onChange={(e) => setSelectedAdGroup(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All ad groups</option>
          {adGroups.map((ag) => (
            <option key={ag.id} value={ag.id}>
              {ag.name}
            </option>
          ))}
        </select>
        {currentQs != null && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-slate-500">Weighted avg QS:</span>
            <span className="font-semibold text-blue-600">{currentQs.toFixed(1)}/10</span>
          </div>
        )}
      </div>

      {/* Note banner when < 2 months */}
      {data.snapshots.length < 2 && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          Quality score tracking started {latestSnapshot?.month || "recently"}. The trend chart
          builds as monthly snapshots are collected.
        </div>
      )}

      {/* Dual-axis chart */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-4">
          {METRIC_LABELS[chartMetric]} vs Avg CPC
        </h2>
        {chartPoints.length > 0 ? (
          <DualAxisChart points={chartPoints} metric={chartMetric} />
        ) : (
          <p className="text-sm text-slate-400 py-8 text-center">No data available</p>
        )}
      </div>

      {/* QS Component Breakdown — clickable cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {breakdownCards.map(({ label, metric, rating }) => {
          const isActive = chartMetric === metric;
          return (
            <button
              key={metric}
              onClick={() => setChartMetric(metric)}
              className={`rounded-xl border shadow-sm p-4 text-center transition-all cursor-pointer ${
                isActive
                  ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">
                {label}
              </p>
              {metric === "qualityScore" ? (
                <span className="inline-block text-lg font-bold text-blue-600">
                  {currentQs != null ? `${currentQs.toFixed(1)}/10` : "\u2014"}
                </span>
              ) : (
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${ratingBg(rating)}`}
                >
                  {ratingLabel(rating)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Top Ads */}
      {data.topAds && data.topAds.length > 0 && (
        <TopAdsSection ads={data.topAds} />
      )}

      {/* Keyword table */}
      {sortedKeywords.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
              Top 10 Keywords by Spend
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-2.5 font-medium">Keyword</th>
                  <th className="px-4 py-2.5 font-medium text-center">QS</th>
                  <th className="px-4 py-2.5 font-medium">Ad Rel.</th>
                  <th className="px-4 py-2.5 font-medium">CTR</th>
                  <th className="px-4 py-2.5 font-medium">LP</th>
                  <th className="px-4 py-2.5 font-medium text-right">Spend</th>
                  <th className="px-4 py-2.5 font-medium text-right">Clicks</th>
                  <th className="px-4 py-2.5 font-medium text-right">Impr.</th>
                  <th className="px-4 py-2.5 font-medium text-center">Conv</th>
                  <th className="px-4 py-2.5 font-medium text-right">CPA</th>
                  <th className="px-4 py-2.5 font-medium text-right">Avg CPC</th>
                  <th className="px-4 py-2.5 font-medium">Landing Page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedKeywords.map((kw, i) => (
                  <tr key={`${kw.keywordText}-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[220px] truncate" title={kw.keywordText}>
                      {kw.keywordText}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {kw.qualityScore != null ? (
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                            kw.qualityScore >= 7
                              ? "bg-emerald-100 text-emerald-700"
                              : kw.qualityScore >= 5
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {kw.qualityScore}
                        </span>
                      ) : (
                        <span className="text-slate-300">{"\u2014"}</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${ratingColor(kw.creativeQuality)}`}>
                      {ratingLabel(kw.creativeQuality)}
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${ratingColor(kw.searchPredictedCtr)}`}>
                      {ratingLabel(kw.searchPredictedCtr)}
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${ratingColor(kw.landingPageQuality)}`}>
                      {ratingLabel(kw.landingPageQuality)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 font-medium">
                      {formatDollars(kw.spend)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {(kw.clicks ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {kw.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-600">
                      {kw.conversions > 0 ? (
                        <span className="font-medium text-emerald-600">
                          {Math.round(kw.conversions)}
                        </span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {formatDollars(kw.costPerConversion)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      ${kw.avgCpc.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[200px] truncate">
                      {kw.finalUrl ? (
                        <a
                          href={kw.finalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 hover:underline"
                          title={kw.finalUrl}
                        >
                          {truncateUrl(kw.finalUrl)}
                        </a>
                      ) : (
                        <span className="text-slate-300">{"\u2014"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
