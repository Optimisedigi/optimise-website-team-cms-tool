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

interface AdGroup {
  id: string;
  name: string;
  status: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  impressions: number;
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
}: {
  adGroup: AdGroup;
  isSelected: boolean;
  onSelect: () => void;
  keywordCount: number;
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
        <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70 mb-0.5">Ad Group</div>
        <div className="text-sm font-bold leading-tight line-clamp-3">{adGroup.name}</div>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[9px] uppercase font-semibold opacity-80">kws ({keywordCount})</span>
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

function LandingPageCard({
  url,
  keywordCount,
  spend,
}: {
  url: string | null;
  keywordCount: number;
  spend: number;
}) {
  if (!url) {
    return (
      <div
        className="h-full w-full rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-white/90 italic"
        style={{ backgroundColor: PALETTE.landingPageBg, filter: "saturate(0.6) brightness(0.85)" }}
      >
        <span className="text-[11px]">— no landing page</span>
        <span className="ml-auto text-[10px] font-mono opacity-80">{keywordCount} kw</span>
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
      style={{ backgroundColor: PALETTE.landingPageBg }}
      title={url}
    >
      <div className="min-w-0 flex-1">
        {host && <div className="text-[9px] uppercase tracking-wider font-semibold opacity-80 truncate">{host}</div>}
        <div className="font-mono text-[12px] font-semibold truncate">{path || "/"}</div>
      </div>
      <div className="shrink-0 flex items-center gap-2 font-mono text-[10px] leading-none">
        <div className="text-right">
          <div className="text-[8px] uppercase opacity-70">Spend</div>
          <div className="font-bold">{fmt(spend)}</div>
        </div>
        <div className="text-right">
          <div className="text-[8px] uppercase opacity-70">Kw</div>
          <div className="font-bold">{keywordCount}</div>
        </div>
      </div>
      <svg className="w-3 h-3 opacity-70 group-hover:opacity-100 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
    </a>
  );
}

/**
 * Group consecutive keyword rows that share the same finalUrl into runs.
 * Each run becomes one merged landing-page cell that row-spans the run length.
 * Runs preserve the order produced by visibleKeywords() (converters first,
 * then spend-no-conv) so visually adjacent keywords with the same landing
 * page collapse cleanly.
 */
function groupByLandingPageRun(
  keywords: Array<Keyword & { bucket: string }>,
): Array<{ url: string | null; spend: number; count: number; startIndex: number }> {
  const runs: Array<{ url: string | null; spend: number; count: number; startIndex: number }> = [];
  for (let i = 0; i < keywords.length; i++) {
    const url = keywords[i].finalUrl ?? null;
    const last = runs[runs.length - 1];
    if (last && last.url === url) {
      last.count += 1;
      last.spend += keywords[i].spend;
    } else {
      runs.push({ url, spend: keywords[i].spend, count: 1, startIndex: i });
    }
  }
  return runs;
}

function CampaignGridBlock({
  campaign,
  selectedAdGroupId,
  onSelectAdGroup,
  mode,
}: {
  campaign: Campaign;
  selectedAdGroupId: string | null;
  onSelectAdGroup: (ag: AdGroup | null) => void;
  mode: KeywordMode;
}) {
  // For each ad group: compute the visible keyword list and the landing-page
  // run groupings. Memoised so toggling the mode is the only thing that
  // triggers re-computation.
  const adGroupRows = useMemo(() => {
    return campaign.adGroups.map((ag) => {
      const keywords = visibleKeywords(ag, mode);
      const lpRuns = groupByLandingPageRun(keywords);
      return { adGroup: ag, keywords, lpRuns };
    });
  }, [campaign, mode]);

  const totalKeywordRows = adGroupRows.reduce((s, r) => s + Math.max(1, r.keywords.length), 0);

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
      {/* Column 1: campaign card spans every keyword row across every ad group. */}
      <div style={{ gridRow: `1 / span ${totalKeywordRows}` }}>
        <CampaignCard campaign={campaign} />
      </div>

      {adGroupRows.map(({ adGroup, keywords, lpRuns }) => {
        const adGroupSpan = Math.max(1, keywords.length);
        if (keywords.length === 0) {
          // Ad group with no visible keywords: render a single placeholder row.
          return (
            <div key={adGroup.id} className="contents">
              <div style={{ gridRow: `span 1` }}>
                <AdGroupCard
                  adGroup={adGroup}
                  isSelected={selectedAdGroupId === adGroup.id}
                  onSelect={() => onSelectAdGroup(selectedAdGroupId === adGroup.id ? null : adGroup)}
                  keywordCount={0}
                />
              </div>
              <div className="rounded-lg border border-dashed border-white/15 p-2 text-[11px] text-white/50 italic flex items-center">
                no keywords in view
              </div>
              <div className="rounded-lg border border-dashed border-white/15 p-2 text-[11px] text-white/50 italic flex items-center">
                —
              </div>
            </div>
          );
        }
        return (
          <div key={adGroup.id} className="contents">
            {/* Column 2: ad-group cell spans all this ad group's keyword rows. */}
            <div style={{ gridRow: `span ${adGroupSpan}` }}>
              <AdGroupCard
                adGroup={adGroup}
                isSelected={selectedAdGroupId === adGroup.id}
                onSelect={() => onSelectAdGroup(selectedAdGroupId === adGroup.id ? null : adGroup)}
                keywordCount={keywords.length}
              />
            </div>
            {/* Columns 3+4 — one row per keyword, with landing-page cells
                merged across runs of consecutive same-URL keywords. */}
            {keywords.map((kw, i) => {
              const lpRun = lpRuns.find((r) => r.startIndex === i);
              return (
                <div key={kw.id} className="contents">
                  <div>
                    <KeywordRow kw={kw} />
                  </div>
                  {lpRun && (
                    <div style={{ gridRow: `span ${lpRun.count}` }}>
                      <LandingPageCard url={lpRun.url} keywordCount={lpRun.count} spend={lpRun.spend} />
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
}: {
  campaigns: Campaign[];
  selectedAdGroupId: string | null;
  onSelectAdGroup: (ag: AdGroup | null) => void;
  mode: KeywordMode;
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
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    keywordMode === "all"
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  title={keywordMode === "compact" ? "Show every keyword (boxes grow)" : "Show curated top-5 + top-5"}
                >
                  {keywordMode === "compact" ? "⊕ Show all keywords" : "⊖ Hide extra keywords"}
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
                <AccountGrid
                  campaigns={filtered}
                  selectedAdGroupId={selectedAdGroup?.id ?? null}
                  onSelectAdGroup={setSelectedAdGroup}
                  mode={keywordMode}
                />
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
