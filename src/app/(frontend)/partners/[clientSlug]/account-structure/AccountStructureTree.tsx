"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

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

// ── 4-column grid: Campaign | Ad group | Ads + Keywords | Landing pages ─────
//
// Colour system: each *campaign* owns a distinct hue (cycled from
// CAMPAIGN_HUES). Everything nested under it — ad groups, ads, keywords,
// landing pages — is a progressively lighter shade of that same hue, so the
// eye can instantly group rows by campaign and tell campaigns apart.
//
// Layout: per campaign one CSS-grid block. Column 1 = campaign card spanning
// every row. Columns 2/3/4 = one row per ad/keyword. The ad-group cell uses
// row-span to vertically merge across all of its detail rows, and the
// landing-page cell uses row-span to merge across consecutive rows that
// share the same finalUrl. Result: visually "merged" landing-page cards.
//
// Keyword display modes (header toggle):
//   compact (default)  — top 5 by conversions + top 5 by spend with no
//                        conversions — max 10 rows per ad group
//   all                — every spending keyword (up to 50, server-capped)
//
// When both ads and keywords are hidden the block switches to a compact
// layout — ad groups become thin full-width bars so many ad groups (and
// multiple campaigns) fit on screen at once.

const PALETTE = {
  pageBg: "#283848",
};

// Distinct base hues per campaign (cycled). Tuned to be clearly separable
// around the wheel while staying in a muted, professional range.
const CAMPAIGN_HUES = [212, 270, 330, 18, 158, 95, 300, 240, 45, 188];

interface CampaignPalette {
  hue: number;
  campaign: string;
  adGroup: string;
  ad: string;
  keyword: string;
  landingPage: string;
}

/**
 * Build a campaign's colour ramp: one hue, increasing lightness as you descend
 * the hierarchy (campaign darkest → landing page lightest). All tiles carry
 * white text, so lightness is capped so the lightest shade still reads.
 */
function campaignPalette(index: number): CampaignPalette {
  const hue = CAMPAIGN_HUES[index % CAMPAIGN_HUES.length];
  const s = 40;
  return {
    hue,
    campaign: `hsl(${hue}, ${s}%, 28%)`,
    adGroup: `hsl(${hue}, ${s}%, 38%)`,
    ad: `hsl(${hue}, ${s}%, 47%)`,
    keyword: `hsl(${hue}, ${s}%, 55%)`,
    landingPage: `hsl(${hue}, ${Math.round(s * 0.8)}%, 62%)`,
  };
}

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

function CampaignCard({ campaign, palette }: { campaign: Campaign; palette: CampaignPalette }) {
  const h = healthStyles[campaignHealth(campaign)];
  return (
    <div
      className="relative h-full rounded-2xl p-4 shadow-lg flex flex-col gap-3 overflow-hidden text-white"
      style={{ backgroundColor: palette.campaign }}
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
          <div className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Spend</div>
          <div className="text-base font-mono font-bold leading-none">{fmt(campaign.spend)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Conv.</div>
          <div className="text-base font-mono font-bold leading-none">
            {campaign.conversions > 0 ? campaign.conversions.toFixed(0) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold opacity-70">CPA</div>
          <div className="text-base font-mono font-bold leading-none">{fmtCpa(campaign.cpa)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Imp. Share</div>
          <div className="text-base font-mono font-bold leading-none">{fmtPct(campaign.searchImpressionShare)}</div>
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
  palette,
  keywordCount,
  adCount,
  collapsed,
  onToggleCollapse,
}: {
  adGroup: AdGroup;
  palette: CampaignPalette;
  keywordCount: number;
  adCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <button
      onClick={onToggleCollapse}
      className="group h-full w-full text-left rounded-xl p-3 shadow-md flex flex-col gap-2 text-white transition-all hover:shadow-lg hover:brightness-110"
      style={{ backgroundColor: palette.adGroup }}
      title={`${adGroup.name} — click to ${collapsed ? "expand" : "collapse"}`}
    >
      <div>
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <div className="text-[9px] uppercase tracking-wider font-semibold opacity-70">Ad Group</div>
          <span
            className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded group-hover:bg-white/20 transition-colors"
            aria-hidden="true"
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
      <div className="mt-auto grid grid-cols-3 gap-1 font-mono text-[17px] leading-none">
        <div>
          <div className="text-[14px] uppercase opacity-70">Spend</div>
          <div className="font-bold">{fmt(adGroup.spend)}</div>
        </div>
        <div>
          <div className="text-[14px] uppercase opacity-70">Conv</div>
          <div className="font-bold">{adGroup.conversions > 0 ? adGroup.conversions.toFixed(0) : "—"}</div>
        </div>
        <div>
          <div className="text-[14px] uppercase opacity-70">CPA</div>
          <div className="font-bold">{fmtCpa(adGroup.cpa)}</div>
        </div>
      </div>
    </button>
  );
}

function KeywordRow({
  kw,
  palette,
}: {
  kw: Keyword & { bucket: "converter" | "spend-no-conv" | "other" };
  palette: CampaignPalette;
}) {
  const hasConv = kw.conversions > 0;
  return (
    <div
      className="h-full w-full rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-white"
      style={{
        backgroundColor: palette.keyword,
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
          <span className="text-[13px] font-mono font-semibold truncate">{kw.text}</span>
          <span className={`shrink-0 text-[9px] font-bold px-1 py-0 rounded ${matchBadge(kw.matchType)}`}>
            {kw.matchType}
          </span>
        </div>
      </div>
      <div className="shrink-0 grid grid-cols-3 gap-2 font-mono text-[13px] leading-none">
        <div className="w-14 text-right">
          <div className="text-[11px] uppercase opacity-70">Avg CPC</div>
          <div className="font-bold">{fmtAvgCpc(kw.spend, kw.clicks)}</div>
        </div>
        <div className="w-14 text-right">
          <div className="text-[11px] uppercase opacity-70">Spend</div>
          <div className="font-bold">{fmt(kw.spend)}</div>
        </div>
        <div className="w-10 text-right">
          <div className="text-[11px] uppercase opacity-70">Conv</div>
          <div className="font-bold">{hasConv ? kw.conversions.toFixed(0) : "\u00a0"}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Rendered Google-style search-ad card. Shown in a fixed-position portal so it
 * sits on top of everything (and is never clipped by the grid's horizontal
 * scroll container). Approximates a real Google paid result: favicon + display
 * URL, "Sponsored" label, blue headline (first headlines joined with " | "),
 * and the description line.
 */
function GoogleAdPreviewCard({ ad, x, y }: { ad: Ad; x: number; y: number }) {
  const host = ad.finalUrl ? prettyUrl(ad.finalUrl).host || "your-site.com" : "your-site.com";
  const path = ad.finalUrl ? prettyUrl(ad.finalUrl).path : "";
  const headline = ad.headlines.slice(0, 3).join(" | ") || ad.type.replace(/_/g, " ");
  const description = ad.descriptions.slice(0, 2).join(" ") || "—";
  // Clamp into the viewport: 380px wide, prefer below-right of the icon, flip
  // up when near the bottom edge.
  const W = 380;
  const left = Math.max(12, Math.min(x, window.innerWidth - W - 12));
  const below = y + 8;
  const flipUp = below > window.innerHeight - 220;
  const top = flipUp ? Math.max(12, y - 230) : below;
  return (
    <div
      style={{ position: "fixed", left, top, width: W, zIndex: 9999 }}
      className="rounded-xl border border-gray-200 bg-white shadow-2xl p-4 text-left pointer-events-none"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold">
          {host.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="text-[12px] text-gray-800 font-medium leading-none truncate">{host}</div>
          <div className="text-[11px] text-gray-500 leading-tight truncate">
            <span className="font-bold text-gray-700">Sponsored</span>
            {path && path !== "/" ? <span className="text-gray-400"> · {host}{path}</span> : null}
          </div>
        </div>
      </div>
      <div className="text-[18px] leading-snug text-[#1a0dab] font-normal" style={{ fontFamily: "arial, sans-serif" }}>
        {headline}
      </div>
      <p className="text-[13px] text-gray-600 leading-snug mt-1" style={{ fontFamily: "arial, sans-serif" }}>
        {description}
      </p>
      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-3 font-mono text-[10px] text-gray-500">
        <span className="uppercase tracking-wider text-gray-400">{ad.type.replace(/_/g, " ")}</span>
        {ad.status !== "ENABLED" && <span className="text-amber-600 font-semibold">{ad.status}</span>}
        <span className="ml-auto">Spend {fmt(ad.spend)}</span>
        <span>Conv {ad.conversions > 0 ? ad.conversions.toFixed(0) : "\u2014"}</span>
        <span>CPA {fmtCpa(ad.cpa)}</span>
      </div>
    </div>
  );
}

/**
 * Ad icon that reveals the Google-style preview on hover. The preview is
 * portalled to <body> at fixed coordinates so it sits above the whole grid
 * (the user's "sit on top of everything") and is never clipped by the grid's
 * horizontal scroll container.
 */
function AdPreviewIcon({ ad }: { ad: Ad }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="shrink-0 inline-flex"
      onClick={(e) => e.preventDefault()}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: r.right - 360, y: r.bottom });
      }}
      onMouseLeave={() => setPos(null)}
    >
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded bg-white/25 hover:bg-white/45 transition-colors"
        aria-label="Preview ad"
        title="Preview ad"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7h6m-6 5h5M4 5h16v14H4z" />
        </svg>
      </span>
      {pos && typeof document !== "undefined" &&
        createPortal(<GoogleAdPreviewCard ad={ad} x={pos.x} y={pos.y} />, document.body)}
    </span>
  );
}

function LandingPageCard({
  url,
  rowCount,
  spend,
  conversions,
  cpa,
  inherited,
  previewAd,
  palette,
}: {
  url: string | null;
  rowCount: number;
  spend: number;
  conversions: number;
  cpa: number | null;
  /** True when this URL was inherited from the ad-group landing page. */
  inherited?: boolean;
  /** Ad whose final URL matches this landing page — drives the hover preview. */
  previewAd?: Ad | null;
  palette: CampaignPalette;
}) {
  if (!url) {
    return (
      <div
        className="h-full w-full rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-white/90 italic"
        style={{ backgroundColor: palette.landingPage, filter: "saturate(0.6) brightness(0.85)" }}
      >
        {previewAd && <AdPreviewIcon ad={previewAd} />}
        <span className="text-[13px]">— no landing page</span>
        <span className="ml-auto text-[12px] font-mono opacity-80">{rowCount}</span>
      </div>
    );
  }
  const { host, path } = prettyUrl(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative h-full w-full rounded-lg px-3 py-2 shadow-sm flex flex-col items-stretch gap-2 text-white transition-all hover:brightness-110"
      style={{ backgroundColor: palette.landingPage, filter: inherited ? "brightness(0.9)" : undefined }}
      title={inherited ? `${url} (inherited from ad group)` : url}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-2 pr-5">
        <div className="font-mono text-[14px] font-semibold break-all">{path || "/"}</div>
        {previewAd ? (
          <div className="rounded-lg bg-white px-3 py-2 text-slate-900 shadow-sm" title={previewAd.headlines.join("\n") || previewAd.type.replace(/_/g, " ")}>
            <div className="text-[11px] font-bold text-slate-500">Sponsored</div>
            <div className="text-[15px] font-semibold text-[#1a0dab] leading-snug">
              {previewAd.headlines.slice(0, 3).join(" | ") || previewAd.type.replace(/_/g, " ")}
            </div>
            <div className="mt-1 text-[12px] leading-snug text-slate-600">
              {previewAd.descriptions.slice(0, 2).join(" ") || "—"}
            </div>
          </div>
        ) : null}
        <div className="mt-auto pt-2 flex items-end gap-3 font-mono text-[14px] leading-none whitespace-nowrap">
          <span><span className="uppercase opacity-70">Spend</span> <span className="font-bold">{fmt(spend)}</span></span>
          <span><span className="uppercase opacity-70">Conv</span> <span className="font-bold">{conversions > 0 ? conversions.toFixed(0) : "—"}</span></span>
          <span><span className="uppercase opacity-70">CPA</span> <span className="font-bold">{fmtCpa(cpa)}</span></span>
        </div>
      </div>
      <svg className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-70 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
function AdRow({ ad, palette }: { ad: Ad; palette: CampaignPalette }) {
  const hasConv = ad.conversions > 0;
  const primaryHeadline = ad.headlines[0] ?? ad.type.replace(/_/g, " ");
  return (
    <div
      className="h-full w-full rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 text-white"
      style={{ backgroundColor: palette.ad, filter: hasConv ? "brightness(1.1)" : "brightness(0.96)" }}
      title={ad.headlines.join(" | ") || ad.type}
    >
      <AdPreviewIcon ad={ad} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold truncate">{primaryHeadline}</span>
          <span className="shrink-0 text-[10px] font-bold px-1 py-0 rounded bg-white/20">AD</span>
          {ad.status !== "ENABLED" && (
            <span className="shrink-0 text-[10px] font-semibold text-amber-300">{ad.status}</span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2 font-mono text-[14px] leading-none">
        <div className="text-right">
          <div className="text-[12px] uppercase opacity-70">Spend</div>
          <div className="font-bold">{fmt(ad.spend)}</div>
        </div>
        {hasConv && (
          <div className="text-right">
            <div className="text-[12px] uppercase opacity-70">Conv</div>
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
  conversions: number;
  cpa: number | null;
  count: number;
  startIndex: number;
  inherited: boolean;
  previewAd: Ad | null;
}> {
  const adByUrl = new Map<string, Ad>();
  for (const ad of ads) if (ad.finalUrl && !adByUrl.has(ad.finalUrl)) adByUrl.set(ad.finalUrl, ad);
  const runs: Array<{ url: string | null; spend: number; conversions: number; cpa: number | null; count: number; startIndex: number; inherited: boolean; previewAd: Ad | null }> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const url = row.landingPage ?? null;
    const spend = row.kind === "ad" ? row.ad.spend : row.kw.spend;
    const conversions = row.kind === "ad" ? row.ad.conversions : row.kw.conversions;
    const last = runs[runs.length - 1];
    if (last && last.url === url) {
      last.count += 1;
      last.spend += spend;
      last.conversions += conversions;
      last.cpa = last.conversions > 0 ? last.spend / last.conversions : null;
      last.inherited = last.inherited && (row.kind === "keyword" ? row.inherited : false);
    } else {
      runs.push({
        url,
        spend,
        conversions,
        cpa: conversions > 0 ? spend / conversions : null,
        count: 1,
        startIndex: i,
        inherited: row.kind === "keyword" ? row.inherited : false,
        previewAd: row.kind === "ad" ? row.ad : url ? adByUrl.get(url) ?? null : null,
      });
    }
  }
  return runs;
}

/**
 * Thin full-width ad-group bar used in compact mode (ads + keywords both
 * hidden). One bar per row so many ad groups — and multiple campaigns — fit on
 * screen at once. Click toggles this group's collapse flag so re-showing ads/
 * keywords reopens it.
 */
function CompactAdGroupBar({
  adGroup,
  palette,
  onClick,
}: {
  adGroup: AdGroup;
  palette: CampaignPalette;
  onClick: () => void;
}) {
  const adCount = adGroup.ads?.length ?? 0;
  const kwCount = adGroup.keywords?.length ?? adGroup.topKeywordsBySpend.length;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md px-3 py-1.5 shadow-sm flex items-center gap-3 text-white transition-all hover:brightness-110"
      style={{ backgroundColor: palette.adGroup }}
      title={adGroup.name}
    >
      <span className="text-[12px] font-semibold truncate flex-1 min-w-0">{adGroup.name}</span>
      {adGroup.status !== "ENABLED" && (
        <span className="shrink-0 text-[8px] font-semibold px-1 rounded bg-amber-400/30">{adGroup.status}</span>
      )}
      <span className="shrink-0 text-[9px] uppercase font-semibold opacity-75">{adCount} ads</span>
      <span className="shrink-0 text-[9px] uppercase font-semibold opacity-75">{kwCount} kws</span>
      <span className="shrink-0 font-mono text-[13px] font-bold w-16 text-right">{fmt(adGroup.spend)}</span>
      <span className="shrink-0 font-mono text-[13px] font-bold w-10 text-right">
        {adGroup.conversions > 0 ? adGroup.conversions.toFixed(0) : "\u2014"}
      </span>
      <span className="shrink-0 font-mono text-[13px] font-bold w-12 text-right">{fmtCpa(adGroup.cpa)}</span>
    </button>
  );
}

function CampaignGridBlock({
  campaign,
  palette,
  mode,
  showAds,
  showKeywords,
  collapsedAdGroups,
  onToggleAdGroup,
}: {
  campaign: Campaign;
  palette: CampaignPalette;
  mode: KeywordMode;
  showAds: boolean;
  showKeywords: boolean;
  /** Ad-group ids whose detail rows are collapsed (per-row override). */
  collapsedAdGroups: Set<string>;
  onToggleAdGroup: (id: string) => void;
}) {
  // Compact mode — both ads and keywords hidden: collapse the campaign to a
  // narrow card + a stack of thin full-width ad-group bars so many ad groups
  // and multiple campaigns are visible at once.
  const compact = !showAds && !showKeywords;

  // For each ad group: build the unified ad+keyword detail rows and the
  // landing-page run groupings. Memoised so toggling a control is the only
  // thing that triggers re-computation. A collapsed ad group contributes a
  // single summary row regardless of the global show toggles.
  const adGroupRows = useMemo(() => {
    return campaign.adGroups.map((ag) => {
      const collapsed = collapsedAdGroups.has(ag.id);
      const rows = collapsed ? [] : buildDetailRows(ag, mode, showAds, showKeywords);
      const visibleRows = rows.filter((row) => (showKeywords ? row.kind === "keyword" : row.kind === "ad"));
      const lpRuns = groupByLandingPageRun(visibleRows, showAds ? ag.ads ?? [] : []);
      return { adGroup: ag, rows, visibleRows, lpRuns, collapsed };
    });
  }, [campaign, mode, showAds, showKeywords, collapsedAdGroups]);

  const totalRows = adGroupRows.reduce((s, r) => s + Math.max(1, r.visibleRows.length), 0);

  if (adGroupRows.length === 0) {
    return (
      <div
        className="items-stretch"
        style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "0.75rem" }}
      >
        <CampaignCard campaign={campaign} palette={palette} />
        <div className="rounded-xl border-2 border-dashed border-white/20 p-6 text-center text-xs text-white/60 italic">
          No active ad groups with spend in this range.
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="items-start"
        style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "0.5rem" }}
      >
        <CampaignCard campaign={campaign} palette={palette} />
        <div className="flex flex-col gap-1">
          {campaign.adGroups.map((ag) => (
            <CompactAdGroupBar
              key={ag.id}
              adGroup={ag}
              palette={palette}
              onClick={() => onToggleAdGroup(ag.id)}
            />
          ))}
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
        gridTemplateColumns: "360px 270px minmax(240px, 1fr) minmax(230px, 0.9fr)",
        gap: "0.5rem",
      }}
    >
      {/* Column 1: campaign card spans every detail row across every ad group. */}
      <div style={{ gridColumn: 1, gridRow: `1 / span ${totalRows}` }}>
        <CampaignCard campaign={campaign} palette={palette} />
      </div>

      {adGroupRows.map(({ adGroup, rows, visibleRows, lpRuns, collapsed }) => {
        const adGroupSpan = Math.max(1, visibleRows.length);
        const adCount = adGroup.ads?.length ?? 0;
        if (rows.length === 0) {
          // Collapsed, or nothing to show given the current toggles: render a
          // single placeholder row so the ad group still appears in structure.
          return (
            <div key={adGroup.id} className="contents">
              <div style={{ gridColumn: 2, gridRow: `span 1` }}>
                <AdGroupCard
                  adGroup={adGroup}
                  palette={palette}
                  keywordCount={adGroup.keywords?.length ?? adGroup.topKeywordsBySpend.length}
                  adCount={adCount}
                  collapsed={collapsed}
                  onToggleCollapse={() => onToggleAdGroup(adGroup.id)}
                />
              </div>
              <div style={{ gridColumn: 3 }} className="rounded-lg border border-dashed border-white/15 p-2 text-[11px] text-white/50 italic flex items-center">
                {collapsed ? "collapsed — click to expand" : "no ads or keywords in view"}
              </div>
              <div style={{ gridColumn: 4 }} className="rounded-lg border border-dashed border-white/15 p-2 text-[11px] text-white/50 italic flex items-center">
                {adGroup.landingPage ? prettyUrl(adGroup.landingPage).path || "/" : "\u2014"}
              </div>
            </div>
          );
        }
        return (
          <div key={adGroup.id} className="contents">
            {/* Column 2: ad-group cell spans all this ad group's detail rows. */}
            <div style={{ gridColumn: 2, gridRow: `span ${adGroupSpan}` }}>
              <AdGroupCard
                adGroup={adGroup}
                palette={palette}
                keywordCount={rows.filter((r) => r.kind === "keyword").length}
                adCount={adCount}
                collapsed={collapsed}
                onToggleCollapse={() => onToggleAdGroup(adGroup.id)}
              />
            </div>
            {/* Columns 3+4 — one row per ad/keyword, with landing-page cells
                merged across runs of consecutive same-URL rows. */}
            {visibleRows.map((row, i) => {
              const lpRun = lpRuns[i];
              return (
                <div key={row.key} className="contents">
                  <div aria-label={row.kind === "keyword" ? "Keyword" : "Ad shown with landing page"} style={{ gridColumn: 3 }}>
                    {row.kind === "keyword" ? <KeywordRow kw={row.kw} palette={palette} /> : null}
                  </div>
                  {lpRun && (
                    <div aria-label="Landing page" style={{ gridColumn: 4, gridRow: `span ${lpRun.count}` }}>
                      <LandingPageCard
                        url={lpRun.url}
                        rowCount={lpRun.count}
                        spend={lpRun.spend}
                        conversions={lpRun.conversions}
                        cpa={lpRun.cpa}
                        inherited={lpRun.inherited}
                        previewAd={lpRun.previewAd}
                        palette={palette}
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
  mode,
  showAds,
  showKeywords,
  collapsedAdGroups,
  onToggleAdGroup,
}: {
  campaigns: Campaign[];
  mode: KeywordMode;
  showAds: boolean;
  showKeywords: boolean;
  collapsedAdGroups: Set<string>;
  onToggleAdGroup: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {campaigns.map((c, i) => (
        <CampaignGridBlock
          key={c.id}
          campaign={c}
          palette={campaignPalette(i)}
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
      <header className="sticky top-0 z-30 bg-slate-800/95 backdrop-blur border-b border-slate-700 shadow-sm">
        <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="pb-px text-base font-bold text-white leading-none">Account Structure Explorer</h1>
            <p className="text-[11px] text-slate-300 mt-1 leading-none">
              {clientName}
              {googleAdsCustomerId ? <span className="ml-2 font-mono text-slate-400">· {googleAdsCustomerId}</span> : null}
              <span className="ml-2 text-slate-400">· {rangeLabel(range)}</span>
              <span className="ml-1 font-mono text-slate-400">({range.from} → {range.to})</span>
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
                <span className="text-[12px] text-slate-400 uppercase tracking-wider">{label}</span>
                <span className="text-[17px] font-mono font-bold mt-0.5 text-white">{value}</span>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-900/60 hover:bg-slate-900 text-xs text-slate-100"
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
        <div className="px-6 pb-0">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "360px 270px minmax(240px, 1fr) minmax(230px, 0.9fr)" }}
          >
            <div className="rounded-md bg-slate-900/95 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white/70">Campaigns</div>
            <div className="rounded-md bg-slate-900/95 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white/70">Ad groups</div>
            <div className="rounded-md bg-slate-900/95 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white/70">Keywords</div>
            <div className="rounded-md bg-slate-900/95 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white/70">Ads + landing pages</div>
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
          <div className="w-full">
            <div className="w-full min-w-0">
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
                <div className="ml-auto text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 flex-wrap">
                  <span>
                    Showing <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{filtered.length}</span> of{" "}
                    <span className="font-mono">{data.campaignCount}</span> campaigns
                  </span>
                  <span>·</span>
                  <span className="text-emerald-600 dark:text-emerald-400">● Healthy CPA</span>
                  <span className="text-amber-600 dark:text-amber-400">● Warning</span>
                  <span className="text-red-600 dark:text-red-400">● High CPA / no conv.</span>
                </div>
              </div>

              {/* Full-width grid: Campaign | Ad group | Ads + Keywords |
                  Landing pages. Each campaign + ad-group + landing-page cell
                  row-spans its detail rows so vertically aligned items merge
                  into a single tall block. */}
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-white/50 text-sm">No campaigns match your filters.</div>
              ) : (
                // overflow-x-auto contains the grid's fixed min-width columns so
                // wide rows scroll within this region instead of bleeding out.
                <div className="overflow-x-auto pb-2">
                  <AccountGrid
                    campaigns={filtered}
                    mode={keywordMode}
                    showAds={showAds}
                    showKeywords={showKeywords}
                    collapsedAdGroups={collapsedAdGroups}
                    onToggleAdGroup={toggleAdGroup}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
