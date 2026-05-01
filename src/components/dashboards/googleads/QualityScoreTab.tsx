"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type {
  GoogleAdsDashboardQualityData,
  GoogleAdsDashboardQualityKeyword,
  GoogleAdsDashboardTopAd,
} from "@/lib/dashboard-types";

interface QualityScoreTabProps {
  data: GoogleAdsDashboardQualityData;
  brandKeywords?: string;
}

type KeywordFilter = "all" | "generic" | "brand";

type ChartMetric = "qualityScore" | "creativeQuality" | "searchPredictedCtr" | "landingPageQuality";

const METRIC_LABELS: Record<ChartMetric, string> = {
  qualityScore: "Quality Score",
  creativeQuality: "Ad Relevance",
  searchPredictedCtr: "Expected CTR",
  landingPageQuality: "Landing Page Experience",
};

const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fullMonthLabel(yyyymm: string): string {
  const [yyyy, mm] = yyyymm.split("-");
  return `${MONTH_NAMES_FULL[parseInt(mm, 10) - 1] || mm} ${yyyy}`;
}

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

/** Single-line rating label for compact table display */
function RatingCell({ rating, className }: { rating: string | null; className?: string }) {
  if (!rating) return <span className={`text-slate-400 ${className || ""}`}>N/A</span>;
  if (rating === "AVERAGE") return <span className={`text-amber-500 whitespace-nowrap ${className || ""}`}>Average</span>;
  const label = rating === "ABOVE_AVERAGE" ? "Above Average" : "Below Average";
  const color = rating === "ABOVE_AVERAGE" ? "text-emerald-600" : "text-red-500";
  return (
    <span className={`${color} whitespace-nowrap ${className || ""}`}>
      {label}
    </span>
  );
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

// ── Top performing asset thumbnail ────────────────────────────
//
// Compact thumbnail with a shape label (LANDSCAPE / SQUARE / LOGO) and a
// performance badge (BEST / GOOD / LOW). PENDING gets no badge — we don't
// want a row of grey "PENDING" labels on a brand-new campaign distracting
// from the actual creative.
function TopAssetThumbnail({
  asset,
}: {
  asset: { url: string; shape: "landscape" | "square" | "logo"; performanceLabel: string };
}) {
  const shapeLabel = asset.shape === "landscape" ? "1.91:1" : asset.shape === "square" ? "1:1" : "Logo";
  // Visual aspect ratio matches the asset's actual ratio so the team can
  // tell at a glance which shape is which without reading the label.
  const widthPx = asset.shape === "landscape" ? 76 : 40; // 1.91:1 vs 1:1
  const heightPx = 40;
  const labelColor =
    asset.performanceLabel === "BEST"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : asset.performanceLabel === "GOOD"
        ? "bg-blue-100 text-blue-700 border-blue-200"
        : asset.performanceLabel === "LOW"
          ? "bg-amber-100 text-amber-700 border-amber-200"
          : ""; // PENDING / unknown — no badge
  const showBadge = asset.performanceLabel === "BEST" || asset.performanceLabel === "GOOD" || asset.performanceLabel === "LOW";
  return (
    <div className="flex flex-col items-center gap-0.5" title={`${shapeLabel} — ${asset.performanceLabel}`}>
      <div
        className="relative bg-slate-100 border border-slate-200 rounded overflow-hidden flex items-center justify-center"
        style={{ width: widthPx, height: heightPx }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={`${shapeLabel} asset`}
          className="max-h-full max-w-full object-cover"
          style={{ width: widthPx, height: heightPx }}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[8px] uppercase tracking-wider text-slate-400 leading-none">
          {shapeLabel}
        </span>
        {showBadge && (
          <span
            className={`text-[8px] uppercase font-medium px-1 py-px rounded border leading-none ${labelColor}`}
          >
            {asset.performanceLabel}
          </span>
        )}
      </div>
    </div>
  );
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

// How many ads to show in each visibility mode. Limits keep the section
// scannable rather than a wall of identical-looking creatives — the user
// can still drill into Google Ads itself to see everything.
const MAX_SEARCH_ADS = 4;
const MAX_DISPLAY_ADS = 4;

function TopAdsSection({ ads }: { ads: GoogleAdsDashboardTopAd[] }) {
  const [expandedAdId, setExpandedAdId] = useState<string | null>(null);
  // Default: hide display/non-search ads. Toggle reveals them when the team
  // wants to review Display / PMax / Video creative performance.
  const [showDisplay, setShowDisplay] = useState(false);

  // Older Growth Tools versions don’t populate adType. When that’s the case
  // we have no way to distinguish search vs display, so just show everything
  // (preserves prior behavior, capped to MAX_SEARCH_ADS).
  const hasAdTypes = ads.some((ad) => !!ad.adType);
  const isSearchAd = (ad: GoogleAdsDashboardTopAd) =>
    !ad.adType || ad.adType === "SEARCH" || ad.adType === "RESPONSIVE_SEARCH_AD" || ad.adType === "EXPANDED_TEXT_AD";

  const visibleAds = useMemo(() => {
    if (!hasAdTypes) return ads.slice(0, MAX_SEARCH_ADS);
    const search = ads.filter(isSearchAd).slice(0, MAX_SEARCH_ADS);
    if (!showDisplay) return search;
    const display = ads.filter((ad) => !isSearchAd(ad)).slice(0, MAX_DISPLAY_ADS);
    return [...search, ...display];
  }, [ads, hasAdTypes, showDisplay]);

  const displayCount = ads.filter((ad) => !isSearchAd(ad)).length;

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          Top Ads by Impressions
        </h2>
        {hasAdTypes && displayCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDisplay}
              onChange={(e) => setShowDisplay(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            Show display ads
            <span className="text-slate-400">
              ({Math.min(displayCount, MAX_DISPLAY_ADS)} shown)
            </span>
          </label>
        )}
      </div>
      {visibleAds.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-slate-400">
          No ads to show for the selected date range.
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleAds.map((ad) => {
            const isOpen = expandedAdId === ad.adId;
            // Headline source priority:
            //   1. responsive ad headlines (Search RSA / Responsive Display)
            //   2. ad.adName (Image Ad asset filename, e.g. "display_gads_300x250")
            //   3. "Untitled ad"
            const topHeadlineParts = ad.headlines.slice(0, 3).filter(Boolean);
            const headline = topHeadlineParts.length > 0
              ? topHeadlineParts.join(" | ")
              : (ad.adName || "Untitled ad");
            const hasImage = !!ad.imageUrl;
            return (
              <div
                key={ad.adId}
                className="rounded-lg border-2 border-slate-300 bg-white overflow-hidden hover:border-slate-400 hover:shadow-sm transition-all"
              >
                {/* Ad preview — image-first for display ads, text-first for search ads.
                    Single tight padding block, no internal section gaps. */}
                {hasImage && (
                  <div className="bg-slate-50 border-b border-slate-200 flex items-center justify-center" style={{ height: 140 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ad.imageUrl!}
                      alt={ad.adName || headline}
                      className="max-h-full max-w-full object-contain"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Top assets strip — best-performing landscape / square / logo
                    for RDA ads. Communicates "this ad has varied creative
                    running" without overwhelming the card. Only renders when
                    Growth Tools returned at least one entry. */}
                {ad.topAssets && ad.topAssets.length > 0 && (
                  <div className="px-3 pt-2 pb-2 border-b border-slate-200 bg-white">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 mb-1.5">
                      Top performing assets
                    </p>
                    <div className="flex items-center gap-2">
                      {ad.topAssets.map((asset, i) => (
                        <TopAssetThumbnail key={`${asset.url}-${i}`} asset={asset} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="px-3 pt-2 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block bg-slate-100 text-slate-600 text-[9px] font-medium px-1.5 py-0 rounded uppercase tracking-wider leading-snug">
                      Sponsored
                    </span>
                    {ad.finalUrl && (
                      <span className="text-[11px] text-slate-700 truncate leading-snug" title={ad.finalUrl}>
                        {truncateUrl(ad.finalUrl, 50)}
                      </span>
                    )}
                  </div>
                  {/* Headline + description sit close together to mirror real
                      Google SERP ad spacing (no paragraph gap between them). */}
                  <p className="text-blue-700 text-sm font-medium leading-snug m-0" title={headline}>
                    {headline}
                  </p>
                  {ad.descriptions[0] && (
                    <p className="text-[12px] text-slate-600 leading-snug m-0 mt-0.5">
                      {ad.descriptions[0]}
                    </p>
                  )}
                  {/* Campaign + Ad Group on consecutive tight lines */}
                  <div className="mt-1.5 text-[11px] text-slate-500 leading-tight">
                    <p className="truncate m-0" title={`Campaign: ${ad.campaignName}`}>
                      <span className="text-slate-400">Campaign:</span> {ad.campaignName}
                    </p>
                    <p className="truncate m-0" title={`Ad Group: ${ad.adGroupName}`}>
                      <span className="text-slate-400">Ad Group:</span> {ad.adGroupName}
                    </p>
                  </div>
                </div>

                {/* Stats row — compact single band */}
                <div className="px-3 py-1.5 grid grid-cols-5 gap-1 bg-slate-50 border-t border-slate-200">
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 leading-tight">Impr</p>
                    <p className="text-xs font-medium text-slate-700 leading-tight">{ad.impressions.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 leading-tight">Clicks</p>
                    <p className="text-xs font-medium text-slate-700 leading-tight">{ad.clicks.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 leading-tight">CTR</p>
                    <p className="text-xs font-medium text-slate-700 leading-tight">{(ad.ctr * 100).toFixed(1)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 leading-tight">Spend</p>
                    <p className="text-xs font-medium text-slate-700 leading-tight">{formatDollars(ad.spend)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 leading-tight">Conv</p>
                    <p className={`text-xs font-medium leading-tight ${ad.conversions > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                      {ad.conversions > 0 ? Math.round(ad.conversions) : "—"}
                    </p>
                  </div>
                </div>

                {/* Expand toggle for full asset list */}
                {(ad.headlines.length > 3 || ad.descriptions.length > 1) && (
                  <>
                    <button
                      onClick={() => setExpandedAdId(isOpen ? null : ad.adId)}
                      className="w-full px-4 py-1 text-[11px] text-slate-500 hover:bg-slate-50 border-t border-slate-200 cursor-pointer flex items-center justify-center gap-1"
                    >
                      {isOpen ? "Hide" : "Show"} all assets
                      <span>({ad.headlines.length} headlines, {ad.descriptions.length} descriptions)</span>
                      <svg
                        className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 space-y-3">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">All Headlines ({ad.headlines.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {ad.headlines.map((h, i) => (
                              <span key={i} className="inline-block bg-blue-50 text-blue-700 text-[11px] px-1.5 py-0.5 rounded border border-blue-100">
                                {h}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">All Descriptions ({ad.descriptions.length})</p>
                          <div className="space-y-1">
                            {ad.descriptions.map((d, i) => (
                              <p key={i} className="text-[11px] text-slate-600 leading-snug">• {d}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Main component

export function QualityScoreTab({ data, brandKeywords }: QualityScoreTabProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedAdGroup, setSelectedAdGroup] = useState<string>("all");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("qualityScore");
  const [keywordFilter, setKeywordFilter] = useState<KeywordFilter>("all");

  // Parse brand terms from brandKeywords (one per line)
  const brandTerms = useMemo(() => {
    if (!brandKeywords) return [];
    return brandKeywords
      .split("\n")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }, [brandKeywords]);

  const isBrandKeyword = (keywordText: string): boolean => {
    if (brandTerms.length === 0) return false;
    const lower = keywordText.toLowerCase();
    return brandTerms.some((term) => lower.includes(term));
  };

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

  // Chart data points — always show the last 6 months regardless of the
  // dashboard's date range selector. The chart is a quality-score trend view,
  // not a per-period summary, so a fixed 6-month window keeps it interpretable.
  //
  // Source priority:
  //   1. data.qualityTrend (live 6-month series from Google Ads, present in
  //      newer Growth Tools deployments). Used directly — no campaign/ad-group
  //      filtering since it's pre-aggregated server-side.
  //   2. data.snapshots (DB monthly snapshots, last 6) — fallback for older
  //      deployments and clients with extensive snapshot history.
  const chartPoints: ChartPoint[] = useMemo(() => {
    if (data.qualityTrend && data.qualityTrend.length > 0) {
      return data.qualityTrend.map((p) => {
        let primary: number | null;
        if (chartMetric === "qualityScore") primary = p.qualityScore;
        else if (chartMetric === "creativeQuality") primary = p.creativeQuality;
        else if (chartMetric === "searchPredictedCtr") primary = p.searchPredictedCtr;
        else primary = p.landingPageQuality;
        return {
          label: monthLabel(p.month),
          primary,
          cpc: p.avgCpc,
        };
      });
    }
    const last6 = data.snapshots.slice(-6);
    return last6.map((snap) => {
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
  }, [data.qualityTrend, data.snapshots, selectedCampaign, selectedAdGroup, chartMetric]);

  // Latest snapshot for breakdown cards + table
  const latestSnapshot = data.snapshots[data.snapshots.length - 1];
  const latestKeywords = latestSnapshot ? filterKeywords(latestSnapshot.keywords) : [];

  // QS breakdown ratings
  const adRelevance = dominantRating(latestKeywords, "creativeQuality");
  const lpRating = dominantRating(latestKeywords, "landingPageQuality");

  // Order keywords for the table:
  //   1. Keywords with conversions, sorted by spend desc (these are the ones
  //      actually generating outcomes — most useful to see first)
  //   2. Then keywords without conversions, sorted by spend desc (high spend
  //      / no conversion = optimisation opportunity, second-priority)
  // Top 30 across both buckets combined.
  const filteredByBrand = keywordFilter === "all"
    ? latestKeywords
    : keywordFilter === "brand"
      ? latestKeywords.filter((kw) => isBrandKeyword(kw.keywordText))
      : latestKeywords.filter((kw) => !isBrandKeyword(kw.keywordText));
  const withConversions = filteredByBrand
    .filter((kw) => (kw.conversions || 0) > 0)
    .sort((a, b) => b.spend - a.spend);
  const withoutConversions = filteredByBrand
    .filter((kw) => (kw.conversions || 0) === 0)
    .sort((a, b) => b.spend - a.spend);
  const sortedKeywords = [...withConversions, ...withoutConversions].slice(0, 30);

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
      {/* Note banner when < 2 months */}
      {data.snapshots.length < 2 && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          Quality score tracking started {latestSnapshot?.month || "recently"}. The trend chart
          builds as monthly snapshots are collected.
        </div>
      )}

      {/* Dual-axis chart — sits at the top, account-level. The campaign /
          ad group filter below scopes the breakdown cards + keywords table
          only; the chart is pre-aggregated server-side and intentionally
          unfiltered. */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
            {METRIC_LABELS[chartMetric]} vs Avg CPC
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-4 leading-snug">
          This trend covers <span className="font-medium text-slate-600">all keywords across the account</span>.
          The campaign / ad group filter below only changes the breakdown cards and keywords table — not this chart.
        </p>
        {chartPoints.length > 0 ? (
          <DualAxisChart points={chartPoints} metric={chartMetric} />
        ) : (
          <p className="text-sm text-slate-400 py-8 text-center">No data available</p>
        )}
      </div>

      {/* Selectors — placed directly above the breakdown cards + keywords
          table they scope. The filter applies to the QS / Ad Relevance /
          Landing Page Experience cards and the Top 30 keywords table only. */}
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

      {/* Keyword table */}
      {(latestKeywords.length > 0) && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
              Top 30 Keywords by Spend
              {latestSnapshot && (
                <span className="ml-2 normal-case tracking-normal font-normal text-slate-400">
                  — {fullMonthLabel(latestSnapshot.month)}
                </span>
              )}
            </h2>
            {brandTerms.length > 0 && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                {(["all", "generic", "brand"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setKeywordFilter(filter)}
                    className={`px-3 py-1 rounded-md font-medium transition-colors capitalize cursor-pointer ${
                      keywordFilter === filter
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Note explaining sort order so users don't expect strict spend desc */}
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 leading-snug">
            <span className="text-slate-600 font-medium">Showing keywords with conversions first</span> (sorted by spend), followed by the remaining top keywords by spend.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-2.5 py-2 font-medium">Keyword</th>
                  <th className="px-2.5 py-2 font-medium text-center">QS</th>
                  <th className="px-2.5 py-2 font-medium text-center whitespace-nowrap min-w-[110px]">Ad Relevance</th>
                  <th className="px-2.5 py-2 font-medium text-center whitespace-nowrap min-w-[110px]">Landing Page</th>
                  <th className="px-2.5 py-2 font-medium text-right">Spend</th>
                  <th className="px-2.5 py-2 font-medium text-right">Clicks</th>
                  <th className="px-2.5 py-2 font-medium text-center">Conv</th>
                  <th className="px-2.5 py-2 font-medium text-right">CPA</th>
                  <th className="px-2.5 py-2 font-medium text-right">Avg CPC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedKeywords.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2.5 py-6 text-center text-xs text-slate-400">
                      No {keywordFilter === "brand" ? "brand" : "generic"} keywords found
                    </td>
                  </tr>
                )}
                {sortedKeywords.map((kw, i) => (
                  <tr key={`${kw.keywordText}-${i}`} className="hover:bg-slate-50">
                    <td className="px-2.5 py-0.5 font-medium text-slate-700 max-w-[220px] truncate" title={kw.keywordText}>
                      <span className="inline-flex items-center gap-1">
                        {kw.keywordText}
                        {kw.finalUrl && (
                          <a
                            href={kw.finalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={kw.finalUrl}
                            className="text-slate-300 hover:text-blue-600 transition-colors shrink-0"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="px-2.5 py-0.5 text-center">
                      {kw.qualityScore != null ? (
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
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
                    <td className="px-2.5 py-0.5 text-center">
                      <RatingCell rating={kw.creativeQuality} />
                    </td>
                    <td className="px-2.5 py-0.5 text-center">
                      <RatingCell rating={kw.landingPageQuality} />
                    </td>
                    <td className="px-2.5 py-0.5 text-right text-slate-600 font-medium">
                      {formatDollars(kw.spend)}
                    </td>
                    <td className="px-2.5 py-0.5 text-right text-slate-600">
                      {(kw.clicks ?? 0).toLocaleString()}
                    </td>
                    <td className="px-2.5 py-0.5 text-center text-slate-600">
                      {kw.conversions > 0 ? (
                        <span className="font-medium text-emerald-600">
                          {Math.round(kw.conversions)}
                        </span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td className="px-2.5 py-0.5 text-right text-slate-600">
                      {formatDollars(kw.costPerConversion)}
                    </td>
                    <td className="px-2.5 py-0.5 text-right text-slate-600">
                      ${kw.avgCpc.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Ads by Impressions — sits at the bottom (account-level, not
          affected by the campaign / ad group filter above). */}
      {data.topAds && data.topAds.length > 0 && (
        <TopAdsSection ads={data.topAds} />
      )}

      {/* Footer note explaining N/A ratings on new campaigns / keywords.
          Heads off client questions about empty Quality Score, Ad Relevance,
          and Landing Page Experience values. */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 leading-relaxed">
        <p className="flex gap-2">
          <span className="shrink-0 text-slate-400" aria-hidden="true">ℹ</span>
          <span>
            <span className="font-medium text-slate-700">Why am I seeing N/A?</span>{" "}
            Google Ads needs enough impressions on a keyword before it can assign
            a Quality Score, Ad Relevance, or Landing Page Experience rating.
            New campaigns, new keywords, and ones with low search volume will show
            as N/A until enough data accumulates — typically after a few hundred
            impressions on exact-match searches. The score appears automatically
            once Google has enough signal.
          </span>
        </p>
      </div>
    </div>
  );
}
