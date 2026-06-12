"use client";

import { useState, useEffect, useMemo } from "react";

/**
 * Figma-style horizontal account structure explorer.
 *
 * Campaign frames sit on the left. When expanded, the frame grows to the right
 * to visually contain its ad groups (rendered as nested cards). Clicking an
 * ad group opens a keyword side panel.
 *
 * Data: GET /api/partners/[clientSlug]/account-structure (proxies growth-tools).
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface Keyword {
  id: string;
  text: string;
  matchType: string;
  status: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  impressions: number;
  finalUrl: string | null;
}

interface Ad {
  id: string;
  /** Ad type, e.g. RESPONSIVE_SEARCH_AD. */
  type: string;
  status: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  impressions: number;
  finalUrl: string | null;
  /** RSA headlines for the hover preview. */
  headlines: string[];
  /** RSA descriptions for the hover preview. */
  descriptions: string[];
}

interface AdGroup {
  id: string;
  name: string;
  status: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  impressions: number;
  /**
   * Ad-group-level landing page (highest-spend ad's final URL). Keywords with
   * no final URL of their own inherit this. Optional for backwards compat
   * with the fixture endpoint that does not populate it.
   */
  landingPage?: string | null;
  /** Ads in this ad group, sorted by spend desc. Optional for fixtures. */
  ads?: Ad[];
  topKeywordsBySpend: Keyword[];
  topKeywordsByConversions: Keyword[];
  /**
   * All spending keywords for this ad group, sorted by spend desc (capped
   * at 50 server-side). Optional for backwards compat with the fixture
   * endpoint that does not populate it.
   */
  keywords?: Keyword[];
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  channelType: string;
  biddingStrategy: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  impressions: number;
  searchImpressionShare: number | null;
  searchBudgetLostImpressionShare: number | null;
  adGroups: AdGroup[];
}

interface AccountStructureResponse {
  partner: string;
  campaignCount: number;
  campaigns: Campaign[];
}

interface Props {
  clientSlug: string;
  clientName: string;
  googleAdsCustomerId: string | null;
  /**
   * API path used to fetch the account structure. Defaults to the legacy
   * `/api/partners/[clientSlug]/account-structure` proxy for backwards compat.
   * The newer `/api/client/[slug]/google-ads/account-structure` proxy supports
   * `from`/`to` query params for date-range filtering.
   */
  apiPath?: string;
}

// ── Date-range presets ───────────────────────────────────────────────────────

type RangePreset = "7d" | "30d" | "90d" | "this_month" | "last_month" | "custom";

interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  preset: RangePreset;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeRange(preset: Exclude<RangePreset, "custom">): DateRange {
  const today = new Date();
  const to = isoDate(today);
  if (preset === "7d") {
    return { preset, to, from: isoDate(new Date(today.getTime() - 7 * 86400000)) };
  }
  if (preset === "30d") {
    return { preset, to, from: isoDate(new Date(today.getTime() - 30 * 86400000)) };
  }
  if (preset === "90d") {
    return { preset, to, from: isoDate(new Date(today.getTime() - 90 * 86400000)) };
  }
  if (preset === "this_month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { preset, to, from: isoDate(first) };
  }
  // last_month
  const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastEnd = new Date(firstThis.getTime() - 86400000);
  const lastStart = new Date(lastEnd.getFullYear(), lastEnd.getMonth(), 1);
  return { preset, from: isoDate(lastStart), to: isoDate(lastEnd) };
}

function rangeLabel(r: DateRange): string {
  switch (r.preset) {
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
    case "this_month":
      return "This month";
    case "last_month":
      return "Last month";
    case "custom":
      return `${r.from} → ${r.to}`;
  }
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtCpa(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

// ── Health / colour ──────────────────────────────────────────────────────────

type Health = "good" | "warn" | "bad" | "neutral";

function campaignHealth(c: Campaign): Health {
  if (c.conversions === 0 && c.spend > 500) return "bad";
  if (c.conversions === 0) return "neutral";
  if (c.cpa === null) return "neutral";
  if (c.cpa > 400) return "bad";
  if (c.cpa > 200) return "warn";
  return "good";
}

function adGroupHealth(ag: AdGroup): Health {
  if (ag.conversions === 0 && ag.spend > 200) return "bad";
  if (ag.conversions === 0) return "neutral";
  if (ag.cpa === null) return "neutral";
  if (ag.cpa > 400) return "bad";
  if (ag.cpa > 200) return "warn";
  return "good";
}

const healthStyles: Record<Health, { ring: string; bg: string; dot: string; label: string }> = {
  good: {
    ring: "ring-emerald-500/30 border-emerald-400/60",
    bg: "bg-emerald-500/5",
    dot: "bg-emerald-500",
    label: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    ring: "ring-amber-500/30 border-amber-400/60",
    bg: "bg-amber-500/5",
    dot: "bg-amber-500",
    label: "text-amber-600 dark:text-amber-400",
  },
  bad: {
    ring: "ring-red-500/30 border-red-400/60",
    bg: "bg-red-500/5",
    dot: "bg-red-500",
    label: "text-red-600 dark:text-red-400",
  },
  neutral: {
    ring: "ring-gray-200 dark:ring-gray-700 border-gray-200 dark:border-gray-700",
    bg: "bg-gray-50/40 dark:bg-gray-900/40",
    dot: "bg-gray-400",
    label: "text-gray-500",
  },
};

function channelColor(channel: string): string {
  switch (channel) {
    case "SEARCH":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30";
    case "PERFORMANCE_MAX":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
    case "DEMAND_GEN":
      return "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30";
    case "VIDEO":
      return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
    case "DISPLAY":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
    case "SHOPPING":
      return "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300";
  }
}

function matchBadge(mt: string): string {
  switch (mt.toUpperCase()) {
    case "EXACT":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300";
    case "PHRASE":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "BROAD":
      return "bg-green-500/15 text-green-700 dark:text-green-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

// ── Keyword panel ────────────────────────────────────────────────────────────

function KeywordPanel({ adGroup, onClose }: { adGroup: AdGroup; onClose: () => void }) {
  const merged = useMemo(() => {
    const map = new Map<string, Keyword>();
    for (const k of adGroup.topKeywordsBySpend) map.set(k.id, k);
    for (const k of adGroup.topKeywordsByConversions) if (!map.has(k.id)) map.set(k.id, k);
    return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
  }, [adGroup]);

  return (
    <div className="w-[360px] shrink-0 rounded-xl border-2 border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900 shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/40 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Keywords</p>
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate" title={adGroup.name}>
            {adGroup.name}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-white/50 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
          aria-label="Close keyword panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="px-3 py-2 text-center border-r border-gray-200 dark:border-gray-700">
          <div className="text-[9px] uppercase text-gray-400 tracking-wider">Spend</div>
          <div className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{fmt(adGroup.spend)}</div>
        </div>
        <div className="px-3 py-2 text-center border-r border-gray-200 dark:border-gray-700">
          <div className="text-[9px] uppercase text-gray-400 tracking-wider">Conv.</div>
          <div className={`text-sm font-mono font-bold ${adGroup.conversions > 0 ? "text-emerald-600" : "text-gray-400"}`}>
            {adGroup.conversions > 0 ? adGroup.conversions.toFixed(0) : "—"}
          </div>
        </div>
        <div className="px-3 py-2 text-center">
          <div className="text-[9px] uppercase text-gray-400 tracking-wider">CPA</div>
          <div className={`text-sm font-mono font-bold ${adGroup.cpa !== null && adGroup.cpa > 200 ? "text-red-500" : "text-emerald-600"}`}>
            {fmtCpa(adGroup.cpa)}
          </div>
        </div>
      </div>

      {/* Keyword list */}
      <div className="flex-1 overflow-y-auto max-h-[520px]">
        {merged.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-400 italic">No keywords with spend or conversions</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 backdrop-blur-sm">
              <tr>
                <th className="text-left py-1.5 px-3 font-semibold text-gray-500 dark:text-gray-400">Keyword</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-500 dark:text-gray-400">Spend</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-500 dark:text-gray-400">Conv.</th>
                <th className="text-right py-1.5 pr-3 font-semibold text-gray-500 dark:text-gray-400">CPA</th>
              </tr>
            </thead>
            <tbody>
              {merged.map((kw, i) => (
                <tr key={kw.id} className={`border-b border-gray-100 dark:border-gray-800 ${i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/30" : ""}`}>
                  <td className="py-1.5 px-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-gray-800 dark:text-gray-200 break-all">{kw.text}</span>
                      {kw.finalUrl && (
                        <a
                          href={kw.finalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={kw.finalUrl}
                          className="shrink-0 inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                          aria-label={`Open landing page ${kw.finalUrl}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </a>
                      )}
                      <span className={`shrink-0 px-1 py-0 rounded text-[9px] font-medium ${matchBadge(kw.matchType)}`}>
                        {kw.matchType}
                      </span>
                      {kw.status !== "ENABLED" && (
                        <span className="shrink-0 text-[9px] font-medium text-amber-600">{kw.status}</span>
                      )}
                    </div>
                  </td>
                  <td className="text-right py-1.5 px-2 font-mono text-gray-700 dark:text-gray-300">{fmt(kw.spend)}</td>
                  <td className={`text-right py-1.5 px-2 font-mono font-medium ${kw.conversions > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {kw.conversions > 0 ? kw.conversions.toFixed(0) : "—"}
                  </td>
                  <td className={`text-right py-1.5 pr-3 font-mono font-medium ${kw.cpa !== null && kw.cpa > 200 ? "text-red-500" : kw.cpa !== null ? "text-emerald-600" : "text-gray-400"}`}>
                    {fmtCpa(kw.cpa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}



// ── 4-column grid: Campaign | Ad group | Keywords | Landing pages ──────────
//
// Palette (sampled from the user-provided reference at .gg/eyes/refs/palette.png):
//   campaign   #385878 (slate-blue)
//   ad group   #685878 (muted plum)
//   keyword    #B87080 (dusty rose)
//   landing pg #E87880 (coral)
//   page bg    #283848 (dark navy) — makes the cards pop the way they do in
//                                     the reference image.
//
// Layout: per campaign one CSS-grid block. Column 1 = campaign card spanning
// every row. Columns 2/3/4 = one row per *keyword*. The ad-group cell uses
// row-span to vertically merge across all of its keyword rows, and the
// landing-page cell uses row-span to merge across all keyword rows that
// share the same finalUrl. Result: visually "merged" landing-page cards.
//
// Keyword display modes (header toggle):
//   compact (default)  — top 5 by conversions + top 5 by spend with no
//                        conversions — max 10 rows per ad group
//   all                — every spending keyword (up to 50, server-capped)
//
// The shared `KeywordPanel` (clickable side panel via ad-group click) is
// preserved for the deep "top keywords by spend/conversions" deep-dive
// workflow it has always served.

const PALETTE = {
  campaignBg: "#385878",
  adGroupBg: "#685878",
  keywordBg: "#B87080",
  landingPageBg: "#E87880",
  pageBg: "#283848",
};

type KeywordMode = "compact" | "all";

/**
 * Build the displayed keyword rows for one ad group.
 *
 * "compact" mode (default): up to 5 top-converters + up to 5 top-spenders
 * that have zero conversions. Dedupes by keyword id so a converting keyword
 * never appears in both groups.
 *
 * "all" mode: every keyword the server returned for this ad group (already
 * sorted desc by spend, capped at 50). When the server didn't populate the
 * full keyword list (fixture endpoint), falls back to topKeywordsBySpend.
 *
 * Returns one flat array — each row is rendered as a KeywordRow. The
 * `bucket` field is used to colour-tint the row so the team can tell
 * "converter" rows from "spender-no-conv" rows at a glance.
 */
function visibleKeywords(
  ag: AdGroup,
  mode: KeywordMode,
): Array<Keyword & { bucket: "converter" | "spend-no-conv" | "other" }> {
  if (mode === "all") {
    const all = ag.keywords ?? ag.topKeywordsBySpend;
    return all.map((k) => ({
      ...k,
      bucket: k.conversions > 0 ? "converter" : k.spend > 0 ? "spend-no-conv" : "other",
    }));
  }
  const converters = [...ag.topKeywordsByConversions]
    .filter((k) => k.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 5)
    .map((k) => ({ ...k, bucket: "converter" as const }));
  const converterIds = new Set(converters.map((k) => k.id));
  // "top 5 by spend with no conversions" — prefer the keywords[] list if
  // present (richer than topKeywordsBySpend which is already capped at 5).
  const spendPool = (ag.keywords ?? ag.topKeywordsBySpend).filter(
    (k) => k.conversions === 0 && !converterIds.has(k.id) && k.spend > 0,
  );
  const spenders = spendPool
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)
    .map((k) => ({ ...k, bucket: "spend-no-conv" as const }));
  return [...converters, ...spenders];
}

function prettyUrl(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    return { host: u.host.replace(/^www\./, ""), path: u.pathname + (u.search || "") };
  } catch {
    return { host: "", path: url };
  }
}

/**
 * Format avg CPC. Returns "—" when clicks=0 (avoids divide-by-zero noise).
 */
function fmtAvgCpc(spend: number, clicks: number): string {
  if (!clicks) return "—";
  const cpc = spend / clicks;
  if (cpc >= 100) return `$${cpc.toFixed(0)}`;
  if (cpc >= 10) return `$${cpc.toFixed(1)}`;
  return `$${cpc.toFixed(2)}`;
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const h = healthStyles[campaignHealth(campaign)];
  return (
    <div
      className="relative h-full rounded-2xl p-4 shadow-lg flex flex-col gap-3 overflow-hidden text-white"
      style={{ backgroundColor: PALETTE.campaignBg }}
      title={campaign.name}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${h.dot}`} />
      <div>
        <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70 mb-0.5">Campaign</div>
        <div className="text-sm font-bold leading-tight line-clamp-4">{campaign.name}</div>
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/15">
            {campaign.channelType}
          </span>
          {campaign.status !== "ENABLED" && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-400/30">{campaign.status}</span>
          )}
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/15">
            {campaign.adGroups.length} AG
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        <div>
          <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">Spend</div>
          <div className="text-sm font-mono font-bold leading-none">{fmt(campaign.spend)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">Conv.</div>
          <div className="text-sm font-mono font-bold leading-none">
            {campaign.conversions > 0 ? campaign.conversions.toFixed(0) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">CPA</div>
          <div className="text-sm font-mono font-bold leading-none">{fmtCpa(campaign.cpa)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">Imp. Share</div>
          <div className="text-sm font-mono font-bold leading-none">{fmtPct(campaign.searchImpressionShare)}</div>
        </div>
      </div>
      {campaign.searchBudgetLostImpressionShare !== null &&
        campaign.searchBudgetLostImpressionShare > 0.05 && (
          <div className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
            <span>⚠</span>
            <span>{fmtPct(campaign.searchBudgetLostImpressionShare)} budget-lost IS</span>
          </div>
        )}
    </div>
  );
}

function AdGroupCard({
  adGroup,
  isSelected,
  onSelect,
  keywordCount,
  adCount,
  collapsed,
  onToggleCollapse,
}: {
  adGroup: AdGroup;
  isSelected: boolean;
  onSelect: () => void;
  keywordCount: number;
  adCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`group h-full w-full text-left rounded-xl p-3 shadow-md flex flex-col gap-2 text-white transition-all ${
        isSelected ? "ring-2 ring-white/70" : "hover:shadow-lg hover:brightness-110"
      }`}
      style={{ backgroundColor: PALETTE.adGroupBg }}
      title={adGroup.name}
    >
      <div>
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">Ad Group</div>
          {/* Per-row expand/collapse. stopPropagation so it doesn't also fire
              the card's onSelect (which opens the keyword side panel). */}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onToggleCollapse(); } }}
            className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded hover:bg-white/20 transition-colors cursor-pointer"
            aria-label={collapsed ? "Expand ad group" : "Collapse ad group"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <svg
              className={`w-3 h-3 transition-transform ${collapsed ? "" : "rotate-90"}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
        <div className="text-sm font-bold leading-tight line-clamp-3">{adGroup.name}</div>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] uppercase font-semibold opacity-80">kws ({keywordCount})</span>
          <span className="text-[9px] uppercase font-semibold opacity-80">ads ({adCount})</span>
          {adGroup.status !== "ENABLED" && (
            <span className="text-[9px] font-semibold px-1 py-0 rounded bg-amber-400/30">{adGroup.status}</span>
          )}
        </div>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1 font-mono text-[11px] leading-none">
        <div>
          <div className="text-[8px] uppercase opacity-70">Spend</div>
          <div className="font-bold">{fmt(adGroup.spend)}</div>
        </div>
        <div>
          <div className="text-[8px] uppercase opacity-70">Conv</div>
          <div className="font-bold">{adGroup.conversions > 0 ? adGroup.conversions.toFixed(0) : "—"}</div>
        </div>
        <div>
          <div className="text-[8px] uppercase opacity-70">CPA</div>
          <div className="font-bold">{fmtCpa(adGroup.cpa)}</div>
        </div>
      </div>
    </button>
  );
}

function KeywordRow({
  kw,
}: {
  kw: Keyword & { bucket: "converter" | "spend-no-conv" | "other" };
}) {
  const hasConv = kw.conversions > 0;
  return (
    <div
      className="h-full w-full rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-white"
      style={{
        backgroundColor: PALETTE.keywordBg,
        // Lighten/darken slightly so converters "glow" vs spenders. Subtle
        // — the colour distinction is the bucket-tint stripe on the left.
        filter: hasConv ? "brightness(1.08)" : "brightness(0.92)",
      }}
      title={kw.text}
    >
      <span
        className="w-1 self-stretch rounded-sm shrink-0"
        style={{
          backgroundColor: hasConv ? "#34D399" : kw.bucket === "spend-no-conv" ? "#FBBF24" : "rgba(255,255,255,0.3)",
        }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-mono font-semibold truncate">{kw.text}</span>
          <span className={`shrink-0 text-[8px] font-bold px-1 py-0 rounded ${matchBadge(kw.matchType)}`}>
            {kw.matchType}
          </span>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2 font-mono text-[10px] leading-none">
        <div className="text-right">
          <div className="text-[8px] uppercase opacity-70">Avg CPC</div>
          <div className="font-bold">{fmtAvgCpc(kw.spend, kw.clicks)}</div>
        </div>
        <div className="text-right">
          <div className="text-[8px] uppercase opacity-70">Spend</div>
          <div className="font-bold">{fmt(kw.spend)}</div>
        </div>
        {hasConv && (
          <div className="text-right">
            <div className="text-[8px] uppercase opacity-70">Conv</div>
            <div className="font-bold">{kw.conversions.toFixed(0)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hover preview for an ad — small ad icon that reveals the ad's headlines,
 * descriptions and final URL on hover. Rendered inside a landing-page card so
 * the team can see which ad drives that landing page without leaving the grid.
 */
function AdPreviewIcon({ ad }: { ad: Ad }) {
  return (
    <span
      className="group/ad relative shrink-0 inline-flex"
      onClick={(e) => e.preventDefault()}
    >
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded bg-white/25 hover:bg-white/40 transition-colors"
        aria-label="Preview ad"
        title="Preview ad"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7h6m-6 5h5M4 5h16v14H4z" />
        </svg>
      </span>
      <span
        role="tooltip"
        className="invisible opacity-0 group-hover/ad:visible group-hover/ad:opacity-100 transition-opacity duration-150 absolute right-0 top-full mt-1 z-40 w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-3 text-left cursor-default"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">
            {ad.type.replace(/_/g, " ")}
          </span>
          {ad.status !== "ENABLED" && (
            <span className="text-[9px] font-semibold text-amber-600">{ad.status}</span>
          )}
        </div>
        {ad.headlines.length > 0 ? (
          <div className="flex flex-wrap gap-1 mb-2">
            {ad.headlines.slice(0, 6).map((h, i) => (
              <span key={i} className="text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-blue-500/10 rounded px-1.5 py-0.5">
                {h}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 italic mb-2">No headlines (non-RSA ad)</p>
        )}
        {ad.descriptions.length > 0 && (
          <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug mb-2">
            {ad.descriptions.slice(0, 2).join(" · ")}
          </p>
        )}
        {ad.finalUrl && (
          <p className="text-[10px] font-mono text-gray-400 truncate" title={ad.finalUrl}>
            {ad.finalUrl}
          </p>
        )}
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 grid grid-cols-3 gap-1 font-mono text-[10px] text-gray-600 dark:text-gray-300">
          <span><span className="text-gray-400">Spend </span>{fmt(ad.spend)}</span>
          <span><span className="text-gray-400">Conv </span>{ad.conversions > 0 ? ad.conversions.toFixed(0) : "\u2014"}</span>
          <span><span className="text-gray-400">CPA </span>{fmtCpa(ad.cpa)}</span>
        </div>
      </span>
    </span>
  );
}

function LandingPageCard({
  url,
  rowCount,
  spend,
  inherited,
  previewAd,
}: {
  url: string | null;
  rowCount: number;
  spend: number;
  /** True when this URL was inherited from the ad-group landing page. */
  inherited?: boolean;
  /** Ad whose final URL matches this landing page — drives the hover preview. */
  previewAd?: Ad | null;
}) {
  if (!url) {
    return (
      <div
        className="h-full w-full rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-white/90 italic"
        style={{ backgroundColor: PALETTE.landingPageBg, filter: "saturate(0.6) brightness(0.85)" }}
      >
        <span className="text-[11px]">— no landing page</span>
        <span className="ml-auto text-[10px] font-mono opacity-80">{rowCount}</span>
      </div>
    );
  }
  const { host, path } = prettyUrl(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group h-full w-full rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-white transition-all hover:brightness-110"
      style={{ backgroundColor: PALETTE.landingPageBg, filter: inherited ? "brightness(0.9)" : undefined }}
      title={inherited ? `${url} (inherited from ad group)` : url}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {host && <div className="text-[9px] uppercase tracking-wider font-semibold opacity-80 truncate">{host}</div>}
          {inherited && (
            <span className="shrink-0 text-[8px] font-semibold px-1 rounded bg-white/20" title="Inherited from ad-group / ad landing page">
              inherited
            </span>
          )}
        </div>
        <div className="font-mono text-[12px] font-semibold truncate">{path || "/"}</div>
      </div>
      {previewAd && <AdPreviewIcon ad={previewAd} />}
      <div className="shrink-0 flex items-center gap-2 font-mono text-[10px] leading-none">
        <div className="text-right">
          <div className="text-[8px] uppercase opacity-70">Spend</div>
          <div className="font-bold">{fmt(spend)}</div>
        </div>
        <div className="text-right">
          <div className="text-[8px] uppercase opacity-70">Rows</div>
          <div className="font-bold">{rowCount}</div>
        </div>
      </div>
      <svg className="w-3 h-3 opacity-70 group-hover:opacity-100 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
    </a>
  );
}

/**
 * One ad row — sibling of keyword rows under an ad group. Shows ad type,
 * status and metrics. Mirrors KeywordRow's visual language but tinted toward
 * the ad-group plum so ads read as a distinct entity from keywords.
 */
function AdRow({ ad }: { ad: Ad }) {
  const hasConv = ad.conversions > 0;
  const primaryHeadline = ad.headlines[0] ?? ad.type.replace(/_/g, " ");
  return (
    <div
      className="h-full w-full rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-white"
      style={{ backgroundColor: PALETTE.adGroupBg, filter: hasConv ? "brightness(1.12)" : "brightness(0.96)" }}
      title={ad.headlines.join(" | ") || ad.type}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded bg-white/20"
        aria-hidden="true"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7h6m-6 5h5M4 5h16v14H4z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold truncate">{primaryHeadline}</span>
          <span className="shrink-0 text-[8px] font-bold px-1 py-0 rounded bg-white/20">AD</span>
          {ad.status !== "ENABLED" && (
            <span className="shrink-0 text-[8px] font-semibold text-amber-300">{ad.status}</span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2 font-mono text-[10px] leading-none">
        <div className="text-right">
          <div className="text-[8px] uppercase opacity-70">Spend</div>
          <div className="font-bold">{fmt(ad.spend)}</div>
        </div>
        {hasConv && (
          <div className="text-right">
            <div className="text-[8px] uppercase opacity-70">Conv</div>
            <div className="font-bold">{ad.conversions.toFixed(0)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Unified detail-row model (ads + keywords as siblings) ────────────────────

type DetailRow =
  | { kind: "ad"; key: string; ad: Ad; landingPage: string | null; inherited: false }
  | {
      kind: "keyword";
      key: string;
      kw: Keyword & { bucket: "converter" | "spend-no-conv" | "other" };
      landingPage: string | null;
      /** True when the landing page was inherited from the ad group, not the
       *  keyword's own final URL. */
      inherited: boolean;
    };

/**
 * Build the ordered detail rows for one ad group: ad rows first (when shown),
 * then keyword rows (when shown). Resolves each keyword's landing page with
 * the ad-group fallback so keywords with no final URL inherit the ad-level
 * landing page — mirrors Google's keyword→ad final-URL precedence.
 */
function buildDetailRows(
  ag: AdGroup,
  mode: KeywordMode,
  showAds: boolean,
  showKeywords: boolean,
): DetailRow[] {
  const rows: DetailRow[] = [];
  if (showAds) {
    for (const ad of ag.ads ?? []) {
      rows.push({ kind: "ad", key: `ad-${ad.id}`, ad, landingPage: ad.finalUrl, inherited: false });
    }
  }
  if (showKeywords) {
    for (const kw of visibleKeywords(ag, mode)) {
      const own = kw.finalUrl ?? null;
      const landingPage = own ?? ag.landingPage ?? null;
      rows.push({
        kind: "keyword",
        key: `kw-${kw.id}`,
        kw,
        landingPage,
        inherited: own == null && landingPage != null,
      });
    }
  }
  return rows;
}

/**
 * Group consecutive detail rows that share the same resolved landing page into
 * runs. Each run becomes one merged landing-page cell that row-spans the run
 * length. Tracks the run's total spend, whether it was inherited, and the ad
 * (if any) whose final URL produced the landing page so the cell can render
 * an ad hover-preview.
 */
function groupByLandingPageRun(
  rows: DetailRow[],
  ads: Ad[],
): Array<{
  url: string | null;
  spend: number;
  count: number;
  startIndex: number;
  inherited: boolean;
  previewAd: Ad | null;
}> {
  const adByUrl = new Map<string, Ad>();
  for (const ad of ads) if (ad.finalUrl && !adByUrl.has(ad.finalUrl)) adByUrl.set(ad.finalUrl, ad);
  const runs: Array<{ url: string | null; spend: number; count: number; startIndex: number; inherited: boolean; previewAd: Ad | null }> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const url = row.landingPage ?? null;
    const spend = row.kind === "ad" ? row.ad.spend : row.kw.spend;
    const last = runs[runs.length - 1];
    if (last && last.url === url) {
      last.count += 1;
      last.spend += spend;
      last.inherited = last.inherited && (row.kind === "keyword" ? row.inherited : false);
    } else {
      runs.push({
        url,
        spend,
        count: 1,
        startIndex: i,
        inherited: row.kind === "keyword" ? row.inherited : false,
        previewAd: url ? adByUrl.get(url) ?? null : null,
      });
    }
  }
  return runs;
}

function CampaignGridBlock({
  campaign,
  selectedAdGroupId,
  onSelectAdGroup,
  mode,
  showAds,
  showKeywords,
  collapsedAdGroups,
  onToggleAdGroup,
}: {
  campaign: Campaign;
  selectedAdGroupId: string | null;
  onSelectAdGroup: (ag: AdGroup | null) => void;
  mode: KeywordMode;
  showAds: boolean;
  showKeywords: boolean;
  /** Ad-group ids whose detail rows are collapsed (per-row override). */
  collapsedAdGroups: Set<string>;
  onToggleAdGroup: (id: string) => void;
}) {
  // For each ad group: build the unified ad+keyword detail rows and the
  // landing-page run groupings. Memoised so toggling a control is the only
  // thing that triggers re-computation. A collapsed ad group contributes a
  // single summary row regardless of the global show toggles.
  const adGroupRows = useMemo(() => {
    return campaign.adGroups.map((ag) => {
      const collapsed = collapsedAdGroups.has(ag.id);
      const rows = collapsed ? [] : buildDetailRows(ag, mode, showAds, showKeywords);
      const lpRuns = groupByLandingPageRun(rows, ag.ads ?? []);
      return { adGroup: ag, rows, lpRuns, collapsed };
    });
  }, [campaign, mode, showAds, showKeywords, collapsedAdGroups]);

  const totalRows = adGroupRows.reduce((s, r) => s + Math.max(1, r.rows.length), 0);

  if (adGroupRows.length === 0) {
    return (
      <div
        className="items-stretch"
        style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "0.75rem" }}
      >
        <CampaignCard campaign={campaign} />
        <div className="rounded-xl border-2 border-dashed border-white/20 p-6 text-center text-xs text-white/60 italic">
          No active ad groups with spend in this range.
        </div>
      </div>
    );
  }

  return (
    <div
      className="items-stretch"
      style={{
        display: "grid",
        // Tailwind JIT chokes on arbitrary classes with commas inside
        // minmax() — inline style avoids the silent-fallback-to-block bug.
        gridTemplateColumns: "240px 240px minmax(280px, 1fr) minmax(240px, 0.9fr)",
        gap: "0.5rem",
      }}
    >
      {/* Column 1: campaign card spans every detail row across every ad group. */}
      <div style={{ gridRow: `1 / span ${totalRows}` }}>
        <CampaignCard campaign={campaign} />
      </div>

      {adGroupRows.map(({ adGroup, rows, lpRuns, collapsed }) => {
        const adGroupSpan = Math.max(1, rows.length);
        const adCount = adGroup.ads?.length ?? 0;
        if (rows.length === 0) {
          // Collapsed, or nothing to show given the current toggles: render a
          // single placeholder row so the ad group still appears in structure.
          return (
            <div key={adGroup.id} className="contents">
              <div style={{ gridRow: `span 1` }}>
                <AdGroupCard
                  adGroup={adGroup}
                  isSelected={selectedAdGroupId === adGroup.id}
                  onSelect={() => onSelectAdGroup(selectedAdGroupId === adGroup.id ? null : adGroup)}
                  keywordCount={adGroup.keywords?.length ?? adGroup.topKeywordsBySpend.length}
                  adCount={adCount}
                  collapsed={collapsed}
                  onToggleCollapse={() => onToggleAdGroup(adGroup.id)}
                />
              </div>
              <div className="rounded-lg border border-dashed border-white/15 p-2 text-[11px] text-white/50 italic flex items-center">
                {collapsed ? "collapsed — click ▸ to expand" : "no ads or keywords in view"}
              </div>
              <div className="rounded-lg border border-dashed border-white/15 p-2 text-[11px] text-white/50 italic flex items-center">
                {adGroup.landingPage ? prettyUrl(adGroup.landingPage).path || "/" : "\u2014"}
              </div>
            </div>
          );
        }
        return (
          <div key={adGroup.id} className="contents">
            {/* Column 2: ad-group cell spans all this ad group's detail rows. */}
            <div style={{ gridRow: `span ${adGroupSpan}` }}>
              <AdGroupCard
                adGroup={adGroup}
                isSelected={selectedAdGroupId === adGroup.id}
                onSelect={() => onSelectAdGroup(selectedAdGroupId === adGroup.id ? null : adGroup)}
                keywordCount={rows.filter((r) => r.kind === "keyword").length}
                adCount={adCount}
                collapsed={collapsed}
                onToggleCollapse={() => onToggleAdGroup(adGroup.id)}
              />
            </div>
            {/* Columns 3+4 — one row per ad/keyword, with landing-page cells
                merged across runs of consecutive same-URL rows. */}
            {rows.map((row, i) => {
              const lpRun = lpRuns.find((r) => r.startIndex === i);
              return (
                <div key={row.key} className="contents">
                  <div>
                    {row.kind === "ad" ? <AdRow ad={row.ad} /> : <KeywordRow kw={row.kw} />}
                  </div>
                  {lpRun && (
                    <div style={{ gridRow: `span ${lpRun.count}` }}>
                      <LandingPageCard
                        url={lpRun.url}
                        rowCount={lpRun.count}
                        spend={lpRun.spend}
                        inherited={lpRun.inherited}
                        previewAd={lpRun.previewAd}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function AccountGrid({
  campaigns,
  selectedAdGroupId,
  onSelectAdGroup,
  mode,
  showAds,
  showKeywords,
  collapsedAdGroups,
  onToggleAdGroup,
}: {
  campaigns: Campaign[];
  selectedAdGroupId: string | null;
  onSelectAdGroup: (ag: AdGroup | null) => void;
  mode: KeywordMode;
  showAds: boolean;
  showKeywords: boolean;
  collapsedAdGroups: Set<string>;
  onToggleAdGroup: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {campaigns.map((c) => (
        <CampaignGridBlock
          key={c.id}
          campaign={c}
          selectedAdGroupId={selectedAdGroupId}
          onSelectAdGroup={onSelectAdGroup}
          mode={mode}
          showAds={showAds}
          showKeywords={showKeywords}
          collapsedAdGroups={collapsedAdGroups}
          onToggleAdGroup={onToggleAdGroup}
        />
      ))}
    </div>
  );
}

export default function AccountStructureTree({
  clientSlug,
  clientName,
  googleAdsCustomerId,
  apiPath,
}: Props) {
  const resolvedApiPath = apiPath ?? `/api/partners/${clientSlug}/account-structure`;
  // Date-range support is only meaningful for the new `/api/client/...` proxy.
  // The legacy `/api/partners/...` proxy ignores `from`/`to`, but appending
  // them is harmless, so the UI is always available.
  const supportsDateRange = apiPath !== undefined;

  const [data, setData] = useState<AccountStructureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAdGroup, setSelectedAdGroup] = useState<AdGroup | null>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<Health | "all">("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  // Keyword display mode — "compact" (default) shows the curated top-5 by
  // conversions + top-5 spenders-with-no-conv; "all" shows every spending
  // keyword the server returned. Boxes grow vertically when expanded.
  const [keywordMode, setKeywordMode] = useState<KeywordMode>("compact");
  // Global entity visibility — progressive disclosure. Both on by default so
  // the grid opens at full detail; turning ads/keywords off zooms back out to
  // the campaign + ad-group structure.
  const [showAds, setShowAds] = useState(true);
  const [showKeywords, setShowKeywords] = useState(true);
  // Per-ad-group collapse overrides (independent of the global toggles).
  const [collapsedAdGroups, setCollapsedAdGroups] = useState<Set<string>>(() => new Set());
  const toggleAdGroup = (id: string) =>
    setCollapsedAdGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Date range — default: last 30 days.
  const [range, setRange] = useState<DateRange>(() => computeRange("30d"));
  const [customFrom, setCustomFrom] = useState<string>(range.from);
  const [customTo, setCustomTo] = useState<string>(range.to);

  const fetchData = (r: DateRange = range) => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (supportsDateRange) {
      qs.set("from", r.from);
      qs.set("to", r.to);
    }
    const url = qs.toString() ? `${resolvedApiPath}?${qs}` : resolvedApiPath;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AccountStructureResponse>;
      })
      .then((json) => {
        setData(json);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSlug, range.from, range.to]);

  const applyPreset = (preset: RangePreset) => {
    if (preset === "custom") {
      setRange({ preset, from: customFrom, to: customTo });
      return;
    }
    const next = computeRange(preset);
    setCustomFrom(next.from);
    setCustomTo(next.to);
    setRange(next);
  };

  const channels = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const c of data.campaigns) set.add(c.channelType);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [] as Campaign[];
    return data.campaigns.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (channelFilter !== "all" && c.channelType !== channelFilter) return false;
      if (healthFilter !== "all" && campaignHealth(c) !== healthFilter) return false;
      return true;
    });
  }, [data, search, channelFilter, healthFilter]);

  const totalSpend = data?.campaigns.reduce((s, c) => s + c.spend, 0) ?? 0;
  const totalConv = data?.campaigns.reduce((s, c) => s + c.conversions, 0) ?? 0;
  const totalCpa = totalConv > 0 ? totalSpend / totalConv : null;
  const totalAdGroups = data?.campaigns.reduce((s, c) => s + c.adGroups.length, 0) ?? 0;

  return (
    <div
      className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] min-h-screen w-screen"
      style={{ backgroundColor: PALETTE.pageBg }}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none">Account Structure Explorer</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-none">
              {clientName}
              {googleAdsCustomerId ? <span className="ml-2 font-mono text-gray-400">· {googleAdsCustomerId}</span> : null}
              <span className="ml-2 text-gray-400">· {rangeLabel(range)}</span>
              <span className="ml-1 font-mono text-gray-400">({range.from} → {range.to})</span>
            </p>
          </div>

          <div className="hidden md:flex items-center gap-6 shrink-0">
            {[
              { label: "Total Spend", value: fmt(totalSpend) },
              { label: "Conversions", value: fmtNum(totalConv) },
              { label: "Blended CPA", value: fmtCpa(totalCpa) },
              { label: "Campaigns", value: String(data?.campaignCount ?? 0) },
              { label: "Ad Groups", value: String(totalAdGroups) },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center leading-none">
                <span className="text-[9px] text-gray-400 uppercase tracking-wider">{label}</span>
                <span className="text-sm font-mono font-bold mt-0.5 text-gray-900 dark:text-gray-100">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={range.preset}
              onChange={(e) => applyPreset(e.target.value as RangePreset)}
              className="px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100"
              aria-label="Date range preset"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="custom">Custom…</option>
            </select>
            {range.preset === "custom" && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  onBlur={() => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(customFrom) && /^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
                      setRange({ preset: "custom", from: customFrom, to: customTo });
                    }
                  }}
                  className="px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100"
                  aria-label="Custom from date"
                />
                <span className="text-xs text-gray-400">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  onBlur={() => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(customFrom) && /^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
                      setRange({ preset: "custom", from: customFrom, to: customTo });
                    }
                  }}
                  className="px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100"
                  aria-label="Custom to date"
                />
              </div>
            )}
            <button
              onClick={() => fetchData(range)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs text-gray-700 dark:text-gray-300"
              title="Refresh"
            >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="px-4 sm:px-6 py-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-gray-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Loading account structure…</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="max-w-md mx-auto text-center py-20">
            <p className="text-red-600 dark:text-red-400 font-medium mb-2">Failed to load account structure</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{error}</p>
            <button
              onClick={() => fetchData(range)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Retry
            </button>
            {!googleAdsCustomerId && (
              <p className="text-[11px] text-gray-400 mt-4">
                Tip: this client has no Google Ads Customer ID set. Currently only{" "}
                <span className="font-mono">away-digital</span> has structure data available.
              </p>
            )}
          </div>
        )}

        {!loading && !error && data && (
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Filter campaigns…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="all">All channels</option>
                  {channels.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
                <select
                  value={healthFilter}
                  onChange={(e) => setHealthFilter(e.target.value as Health | "all")}
                  className="px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="all">All health</option>
                  <option value="good">● Healthy</option>
                  <option value="warn">● Warning</option>
                  <option value="bad">● Bad</option>
                  <option value="neutral">● No conv.</option>
                </select>
                {/* Keyword display toggle. Default "compact" matches the
                    spec: top 5 by conversions + top 5 by spend with no
                    conversions. "All" expands to every spending keyword
                    the server returned (capped at 50). Toggling "on"
                    grows each ad group row — cascades up through the
                    campaign card row-span automatically. */}
                <button
                  type="button"
                  onClick={() => setKeywordMode((m) => (m === "compact" ? "all" : "compact"))}
                  disabled={!showKeywords}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    keywordMode === "all"
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  title={keywordMode === "compact" ? "Show every keyword (boxes grow)" : "Show curated top-5 + top-5"}
                >
                  {keywordMode === "compact" ? "⊕ Show all keywords" : "⊖ Hide extra keywords"}
                </button>
                {/* Global entity toggles — hide ads / hide keywords to zoom out
                    to campaign + ad-group structure, show them to drill in. */}
                <button
                  type="button"
                  onClick={() => setShowAds((v) => !v)}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    showAds
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  title={showAds ? "Hide ads" : "Show ads"}
                >
                  {showAds ? "▣ Hide ads" : "▣ Show ads"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowKeywords((v) => !v)}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    showKeywords
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  title={showKeywords ? "Hide keywords" : "Show keywords"}
                >
                  {showKeywords ? "▤ Hide keywords" : "▤ Show keywords"}
                </button>
              </div>

              <div className="mb-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 flex-wrap">
                <span>
                  Showing <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{filtered.length}</span> of{" "}
                  <span className="font-mono">{data.campaignCount}</span> campaigns
                </span>
                <span>·</span>
                <span className="text-emerald-600 dark:text-emerald-400">● Healthy CPA</span>
                <span className="text-amber-600 dark:text-amber-400">● Warning</span>
                <span className="text-red-600 dark:text-red-400">● High CPA / no conv.</span>
              </div>

              {/* 4-column grid: Campaign | Ad group | Keywords | Landing pages.
                  Each campaign + ad-group + landing-page cell row-spans the
                  appropriate count of keyword rows so vertically aligned
                  items merge into a single tall block. */}
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-white/50 text-sm">No campaigns match your filters.</div>
              ) : (
                // overflow-x-auto contains the grid's fixed min-width columns
                // so wide keyword/landing-page rows scroll within this column
                // instead of bleeding to the right and sliding under the
                // sticky keyword panel. pb-2 keeps card shadows from clipping.
                <div className="overflow-x-auto pb-2">
                  <AccountGrid
                    campaigns={filtered}
                    selectedAdGroupId={selectedAdGroup?.id ?? null}
                    onSelectAdGroup={setSelectedAdGroup}
                    mode={keywordMode}
                    showAds={showAds}
                    showKeywords={showKeywords}
                    collapsedAdGroups={collapsedAdGroups}
                    onToggleAdGroup={toggleAdGroup}
                  />
                </div>
              )}
            </div>

            {/* Sticky keyword panel — xl and above */}
            <div className="hidden xl:block sticky top-20 self-start">
              {selectedAdGroup ? (
                <KeywordPanel adGroup={selectedAdGroup} onClose={() => setSelectedAdGroup(null)} />
              ) : (
                <div className="w-[360px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-6 text-center bg-white dark:bg-gray-900">
                  <svg
                    className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                  </svg>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Click an ad group</p>
                  <p className="text-xs text-gray-400 mt-1">to see top keywords by spend &amp; conversions</p>
                </div>
              )}
            </div>

            {/* Mobile/tablet keyword panel (overlay bottom sheet) */}
            {selectedAdGroup && (
              <div className="xl:hidden fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-2xl max-h-[70vh] overflow-hidden flex flex-col">
                <KeywordPanel adGroup={selectedAdGroup} onClose={() => setSelectedAdGroup(null)} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
