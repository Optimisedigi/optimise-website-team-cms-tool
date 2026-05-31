/**
 * Post-Migration SEO Review — core logic.
 *
 * Evaluates the SEO health of a site after a migration (cutover) against
 * best-practice checks grounded in Google's site-move guidance + industry
 * consensus. Reuses the existing GSC service (`gsc-service.ts`) for search
 * analytics, branded split, sitemap parsing, and Core Web Vitals.
 *
 * Designed for SAME-DOMAIN migrations (replatform / URL restructure) as the
 * default, but degrades gracefully for domain moves. Change-of-Address
 * specific items are surfaced as advisory / not-applicable for same-domain.
 *
 * All network calls accept an AbortSignal and are bounded by timeouts so the
 * route handler can stay within Vercel's function limit. Pure helpers are
 * exported individually for unit testing.
 */

import {
  fetchSearchAnalytics,
  fetchBrandedAnalytics,
  fetchAndParseSitemaps,
  fetchCoreWebVitals,
} from "./gsc-service";

// ── Tunable thresholds (named so tests + reviewers can see the policy) ──

/** Industry consensus: a 10–25% dip in weeks 1–4 is normal for a clean move. */
export const NORMAL_DROP_PCT = 25;
/** A drop beyond this — especially past week 4 — warrants investigation. */
export const INVESTIGATE_DROP_PCT = 30;
/** Google advises ≤3 hops in a redirect chain; we warn above this. */
export const MAX_REDIRECT_HOPS = 3;
/** LCP (ms) field/lab thresholds per Core Web Vitals. */
export const LCP_GOOD_MS = 2500;
export const LCP_POOR_MS = 4000;
/** GSC finalises data ~3 days after the fact. */
export const GSC_LAG_DAYS = 3;
/** Max legacy URLs we trace per run (keeps within function time budget). */
export const MAX_REDIRECT_TRACE = 60;
/** Per-request fetch timeout (ms). */
const FETCH_TIMEOUT_MS = 15_000;
/** Crawler UA so we observe what Googlebot would see. */
const CRAWLER_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// ── Result types ──

export type CheckStatus =
  | "pass"
  | "warn"
  | "fail"
  | "advisory"
  | "not-applicable";

export type CheckPhase =
  | "redirects"
  | "indexing"
  | "performance"
  | "technical"
  | "process";

export interface ChecklistItem {
  id: string;
  phase: CheckPhase;
  title: string;
  status: CheckStatus;
  /** One-line factual summary of what was observed. */
  evidence: string;
  /** What to do about it (empty for pass/not-applicable). */
  recommendation: string;
  /** Optional supporting rows (URLs, queries) for the UI to render. */
  details?: string[];
}

export type RedirectClassification =
  | "equivalent"
  | "homepage-collapse"
  | "index-collapse"
  | "irrelevant"
  | "not-found"
  | "ok-200"
  | "error";

export interface RedirectTrace {
  oldUrl: string;
  finalUrl: string;
  finalStatus: number;
  hops: number;
  /** First-hop HTTP status (e.g. 301/308/302) — null if no redirect. */
  firstHopStatus: number | null;
  permanent: boolean;
  classification: RedirectClassification;
  /** GSC impressions this legacy URL still receives (priority signal). */
  impressions: number;
  clicks: number;
}

export interface PerformanceDelta {
  before: { clicks: number; impressions: number; ctr: number; position: number };
  after: { clicks: number; impressions: number; ctr: number; position: number };
  windowDays: number;
  clicksChangePct: number | null;
  impressionsChangePct: number | null;
  positionDelta: number;
  pageWinners: Array<{ page: string; clicksDelta: number }>;
  pageLosers: Array<{ page: string; clicksDelta: number }>;
  queryWinners: Array<{ query: string; clicksDelta: number }>;
  queryLosers: Array<{ query: string; clicksDelta: number }>;
  brandClicks: number | null;
  nonBrandClicks: number | null;
}

export interface MigrationAction {
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
}

export interface MigrationCheckResult {
  siteUrl: string;
  origin: string;
  cutoverDate: string;
  isDomainMove: boolean;
  overallScore: number;
  scoresByPhase: Record<CheckPhase, number>;
  checklist: ChecklistItem[];
  redirects: RedirectTrace[];
  performance: PerformanceDelta | null;
  actions: MigrationAction[];
  runAt: string;
}

// ── URL helpers ──

/** Convert an `sc-domain:` / property URL into a fetchable https origin. */
export function originFromSiteUrl(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) {
    return `https://${siteUrl.slice("sc-domain:".length)}`;
  }
  return siteUrl.replace(/\/+$/, "");
}

/** Normalise a path for comparison: drop trailing slash, lowercase host. */
export function normalizePath(url: string): string {
  try {
    const u = new URL(url);
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p.toLowerCase();
  } catch {
    return url;
  }
}

function isHomepage(url: string, origin: string): boolean {
  try {
    const u = new URL(url);
    const o = new URL(origin);
    return u.host === o.host && (u.pathname === "/" || u.pathname === "");
  } catch {
    return false;
  }
}

/** Heuristic: common "index" landing pages that collapse topical signals. */
const INDEX_PATHS = new Set([
  "/blog",
  "/blogs",
  "/news",
  "/articles",
  "/resources",
  "/insights",
  "/category",
  "/categories",
  "/shop",
  "/products",
]);

/**
 * Classify where an old URL ends up. The expensive part (soft-404) is supplied
 * by the caller so this stays a pure function and is unit-testable.
 *
 * `isSoft404` = the final 200 page is actually the SPA/CMS catch-all, not real
 * content for that URL.
 */
export function classifyDestination(args: {
  oldUrl: string;
  finalUrl: string;
  finalStatus: number;
  origin: string;
  isSoft404: boolean;
}): RedirectClassification {
  const { oldUrl, finalUrl, finalStatus, origin, isSoft404 } = args;

  if (finalStatus >= 500 || finalStatus === 0) return "error";
  if (finalStatus === 404 || finalStatus === 410) return "not-found";
  if (isSoft404) return "not-found";

  const oldPath = normalizePath(oldUrl);
  const newPath = normalizePath(finalUrl);

  // Same path (e.g. only a trailing-slash/protocol normalisation) — equivalent.
  if (oldPath === newPath) return "equivalent";

  // Old content URL collapsed onto the homepage — Google's documented mistake.
  if (isHomepage(finalUrl, origin) && oldPath !== "/") return "homepage-collapse";

  // Old content URL collapsed onto a section/index page.
  if (INDEX_PATHS.has(newPath) && oldPath !== newPath) return "index-collapse";

  // Landed on a real, different page — could be equivalent or irrelevant.
  // We can't judge topical match cheaply; treat a 200 on a distinct content
  // page as "ok-200" (a softer pass) unless it collapsed (handled above).
  if (finalStatus >= 200 && finalStatus < 300) return "ok-200";

  return "irrelevant";
}

// ── Network primitives ──

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { redirect?: RequestRedirect } = {},
  signal?: AbortSignal,
): Promise<Response | null> {
  try {
    const composite = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
      : AbortSignal.timeout(FETCH_TIMEOUT_MS);
    return await fetch(url, {
      ...init,
      headers: { "User-Agent": CRAWLER_UA, ...(init.headers || {}) },
      signal: composite,
    });
  } catch {
    return null;
  }
}

/**
 * Trace a URL's redirect chain manually (so we can count hops + see the first
 * permanent/temporary status), then return the final landing status.
 */
export async function traceRedirect(
  url: string,
  signal?: AbortSignal,
): Promise<Omit<RedirectTrace, "oldUrl" | "classification" | "impressions" | "clicks">> {
  let current = url;
  let hops = 0;
  let firstHopStatus: number | null = null;
  let permanent = false;

  for (let i = 0; i < 10; i++) {
    const res = await fetchWithTimeout(current, { redirect: "manual" }, signal);
    if (!res) {
      return { finalUrl: current, finalStatus: 0, hops, firstHopStatus, permanent };
    }
    const status = res.status;
    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        return { finalUrl: current, finalStatus: status, hops, firstHopStatus, permanent };
      }
      if (firstHopStatus === null) {
        firstHopStatus = status;
        permanent = status === 301 || status === 308;
      }
      current = new URL(loc, current).href;
      hops++;
      continue;
    }
    return { finalUrl: current, finalStatus: status, hops, firstHopStatus, permanent };
  }
  return { finalUrl: current, finalStatus: 508, hops, firstHopStatus, permanent };
}

/**
 * Detect an SPA/CMS soft-404 catch-all: request a URL that is almost certainly
 * fake and capture the body shape (status, size, title). Any unknown route
 * that returns 200 with a body resembling this baseline is a soft 404.
 */
export async function buildSoft404Baseline(
  origin: string,
  signal?: AbortSignal,
): Promise<{ is200Catchall: boolean; size: number; title: string } | null> {
  const fakeUrl = `${origin}/__migration-check-nonexistent-${Date.now()}`;
  const res = await fetchWithTimeout(fakeUrl, { redirect: "follow" }, signal);
  if (!res) return null;
  const body = await res.text().catch(() => "");
  return {
    is200Catchall: res.status >= 200 && res.status < 300,
    size: body.length,
    title: extractTitle(body),
  };
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return (m?.[1] || "").trim();
}

function extractCanonical(html: string): string | null {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  if (!m) return null;
  const href = m[0].match(/href=["']([^"']+)["']/i);
  return href?.[1] || null;
}

function hasNoindex(html: string): boolean {
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i);
  return !!m && /noindex/i.test(m[0]);
}

function hasStructuredData(html: string): boolean {
  return /application\/ld\+json/i.test(html) || /itemtype=["']https?:\/\/schema\.org/i.test(html);
}

/** Compare a fetched page to the soft-404 baseline. */
export function looksLikeSoft404(
  page: { status: number; size: number; title: string },
  baseline: { is200Catchall: boolean; size: number; title: string } | null,
): boolean {
  if (!baseline || !baseline.is200Catchall) return false;
  if (page.status < 200 || page.status >= 300) return false;
  // Same generic title as the fake URL → catch-all shell.
  if (page.title && page.title === baseline.title) return true;
  // Near-identical body size to the fake page → catch-all shell.
  if (baseline.size > 0 && Math.abs(page.size - baseline.size) / baseline.size < 0.05) {
    return true;
  }
  return false;
}

// ── Performance comparison ──

function pct(now: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((now - prev) / prev) * 1000) / 10;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build matched before/after windows around the cutover, honouring GSC lag. */
export function buildComparisonWindows(
  cutoverDate: string,
  now: Date = new Date(),
): { before: [string, string]; after: [string, string]; windowDays: number } {
  const cutover = new Date(cutoverDate + "T00:00:00Z");
  const lagEnd = new Date(now.getTime() - GSC_LAG_DAYS * 86400000);
  // After window: cutover → freshest finalised day.
  const afterStart = cutover;
  const afterEnd = lagEnd > afterStart ? lagEnd : afterStart;
  const windowDays = Math.max(
    1,
    Math.round((afterEnd.getTime() - afterStart.getTime()) / 86400000),
  );
  // Before window: same length, ending the day before cutover.
  const beforeEnd = new Date(cutover.getTime() - 86400000);
  const beforeStart = new Date(beforeEnd.getTime() - windowDays * 86400000);
  return {
    before: [dateStr(beforeStart), dateStr(beforeEnd)],
    after: [dateStr(afterStart), dateStr(afterEnd)],
    windowDays,
  };
}

interface PageRow { page: string; clicks: number; impressions: number; position: number }
interface QueryRow { keyword: string; clicks: number }

function diffTop<T extends { clicks: number }>(
  before: Map<string, T>,
  after: Map<string, T>,
): { winners: Array<{ k: string; d: number }>; losers: Array<{ k: string; d: number }> } {
  const keys = new Set([...before.keys(), ...after.keys()]);
  const deltas: Array<{ k: string; d: number }> = [];
  for (const k of keys) {
    const d = (after.get(k)?.clicks ?? 0) - (before.get(k)?.clicks ?? 0);
    if (d !== 0) deltas.push({ k, d });
  }
  deltas.sort((a, b) => b.d - a.d);
  return {
    winners: deltas.filter((x) => x.d > 0).slice(0, 10),
    losers: deltas.filter((x) => x.d < 0).slice(0, 10),
  };
}

// ── Orchestration ──

export interface MigrationCheckInput {
  /** GSC property (e.g. "sc-domain:example.com"). */
  siteUrl: string;
  /** Valid GSC OAuth access token (caller refreshes if expired). */
  accessToken: string;
  cutoverDate: string;
  brandTerms: string[];
  isDomainMove?: boolean;
  signal?: AbortSignal;
  now?: Date;
}

export async function runMigrationCheck(
  input: MigrationCheckInput,
): Promise<MigrationCheckResult> {
  const { siteUrl, accessToken, cutoverDate, brandTerms, signal } = input;
  const now = input.now ?? new Date();
  const origin = originFromSiteUrl(siteUrl);
  const isDomainMove = !!input.isDomainMove;

  const windows = buildComparisonWindows(cutoverDate, now);

  // Fetch GSC data + page/query breakdowns for both windows in parallel.
  const [beforeAnalytics, afterAnalytics, branded, robotsRes, soft404Baseline, sitemapUrls, cwv] =
    await Promise.all([
      fetchSearchAnalytics(accessToken, siteUrl, windows.before[0], windows.before[1]).catch(() => null),
      fetchSearchAnalytics(accessToken, siteUrl, windows.after[0], windows.after[1]).catch(() => null),
      brandTerms.length
        ? fetchBrandedAnalytics(accessToken, siteUrl, windows.after[0], windows.after[1], brandTerms).catch(() => ({ brand: null, nonBrand: null }))
        : Promise.resolve({ brand: null, nonBrand: null }),
      fetchWithTimeout(`${origin}/robots.txt`, { redirect: "follow" }, signal),
      buildSoft404Baseline(origin, signal),
      fetchAndParseSitemaps(accessToken, siteUrl).catch(() => [] as string[]),
      fetchCoreWebVitals(accessToken, siteUrl).catch(() => ({ cwvMobile: null, cwvDesktop: null })),
    ]);

  const performance = buildPerformanceDelta(beforeAnalytics, afterAnalytics, branded, windows.windowDays);

  // Legacy URLs to trace: pages that still appear in GSC. Prioritise by
  // impressions so the highest-risk URLs are traced first within the cap.
  const legacyPages = ((afterAnalytics?.topPages ?? []) as PageRow[])
    .concat((beforeAnalytics?.topPages ?? []) as PageRow[]);
  const byUrl = new Map<string, PageRow>();
  for (const p of legacyPages) {
    const existing = byUrl.get(p.page);
    if (!existing || p.impressions > existing.impressions) byUrl.set(p.page, p);
  }
  const tracedTargets = [...byUrl.values()]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, MAX_REDIRECT_TRACE);

  const redirects = await traceLegacyUrls(tracedTargets, origin, soft404Baseline, signal);

  const checklist = buildChecklist({
    origin,
    isDomainMove,
    redirects,
    performance,
    robotsText: robotsRes ? await robotsRes.text().catch(() => "") : "",
    sitemapUrls,
    soft404Baseline,
    cwv,
    windows,
  });

  const scoresByPhase = scorePhases(checklist);
  const overallScore = Math.round(
    (Object.values(scoresByPhase).reduce((a, b) => a + b, 0) /
      (Object.keys(scoresByPhase).length || 1)),
  );
  const actions = buildActions(checklist, redirects);

  return {
    siteUrl,
    origin,
    cutoverDate,
    isDomainMove,
    overallScore,
    scoresByPhase,
    checklist,
    redirects,
    performance,
    actions,
    runAt: now.toISOString(),
  };
}

function buildPerformanceDelta(
  before: Awaited<ReturnType<typeof fetchSearchAnalytics>> | null,
  after: Awaited<ReturnType<typeof fetchSearchAnalytics>> | null,
  branded: { brand: { clicks: number } | null; nonBrand: { clicks: number } | null },
  windowDays: number,
): PerformanceDelta | null {
  if (!before && !after) return null;
  const b = before ?? { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0, topPages: [], topKeywords: [] };
  const a = after ?? { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0, topPages: [], topKeywords: [] };

  const beforePages = new Map<string, PageRow>();
  for (const p of (b.topPages ?? []) as PageRow[]) beforePages.set(normalizePath(p.page), p);
  const afterPages = new Map<string, PageRow>();
  for (const p of (a.topPages ?? []) as PageRow[]) afterPages.set(normalizePath(p.page), p);
  const pageDiff = diffTop(beforePages, afterPages);

  const beforeQ = new Map<string, { clicks: number }>();
  for (const q of (b.topKeywords ?? []) as QueryRow[]) beforeQ.set(q.keyword, { clicks: q.clicks });
  const afterQ = new Map<string, { clicks: number }>();
  for (const q of (a.topKeywords ?? []) as QueryRow[]) afterQ.set(q.keyword, { clicks: q.clicks });
  const queryDiff = diffTop(beforeQ, afterQ);

  return {
    before: { clicks: b.totalClicks, impressions: b.totalImpressions, ctr: b.avgCtr, position: b.avgPosition },
    after: { clicks: a.totalClicks, impressions: a.totalImpressions, ctr: a.avgCtr, position: a.avgPosition },
    windowDays,
    clicksChangePct: pct(a.totalClicks, b.totalClicks),
    impressionsChangePct: pct(a.totalImpressions, b.totalImpressions),
    positionDelta: Math.round((a.avgPosition - b.avgPosition) * 10) / 10,
    pageWinners: pageDiff.winners.map((x) => ({ page: x.k, clicksDelta: x.d })),
    pageLosers: pageDiff.losers.map((x) => ({ page: x.k, clicksDelta: x.d })),
    queryWinners: queryDiff.winners.map((x) => ({ query: x.k, clicksDelta: x.d })),
    queryLosers: queryDiff.losers.map((x) => ({ query: x.k, clicksDelta: x.d })),
    brandClicks: branded.brand?.clicks ?? null,
    nonBrandClicks: branded.nonBrand?.clicks ?? null,
  };
}

async function traceLegacyUrls(
  targets: PageRow[],
  origin: string,
  soft404Baseline: { is200Catchall: boolean; size: number; title: string } | null,
  signal?: AbortSignal,
): Promise<RedirectTrace[]> {
  const out: RedirectTrace[] = [];
  for (const t of targets) {
    const trace = await traceRedirect(t.page, signal);

    // For 200 finals, fetch the body to detect a soft-404 catch-all.
    let isSoft404 = false;
    if (trace.finalStatus >= 200 && trace.finalStatus < 300 && soft404Baseline?.is200Catchall) {
      const res = await fetchWithTimeout(trace.finalUrl, { redirect: "follow" }, signal);
      if (res) {
        const body = await res.text().catch(() => "");
        isSoft404 = looksLikeSoft404(
          { status: res.status, size: body.length, title: extractTitle(body) },
          soft404Baseline,
        );
      }
    }

    out.push({
      oldUrl: t.page,
      finalUrl: trace.finalUrl,
      finalStatus: trace.finalStatus,
      hops: trace.hops,
      firstHopStatus: trace.firstHopStatus,
      permanent: trace.permanent,
      classification: classifyDestination({
        oldUrl: t.page,
        finalUrl: trace.finalUrl,
        finalStatus: trace.finalStatus,
        origin,
        isSoft404,
      }),
      impressions: t.impressions,
      clicks: t.clicks,
    });
    // Gentle pacing to avoid hammering the origin.
    await new Promise((r) => setTimeout(r, 80));
  }
  return out;
}

// ── Checklist construction ──

interface ChecklistContext {
  origin: string;
  isDomainMove: boolean;
  redirects: RedirectTrace[];
  performance: PerformanceDelta | null;
  robotsText: string;
  sitemapUrls: string[];
  soft404Baseline: { is200Catchall: boolean; size: number; title: string } | null;
  cwv: { cwvMobile: { lcp: number | null; status?: string } | null; cwvDesktop: { lcp: number | null; status?: string } | null };
  windows: { before: [string, string]; after: [string, string]; windowDays: number };
}

export function buildChecklist(ctx: ChecklistContext): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const { redirects } = ctx;

  // 1. Permanent redirects (301/308) on redirected legacy URLs.
  const redirected = redirects.filter((r) => r.firstHopStatus !== null);
  const temporary = redirected.filter((r) => !r.permanent);
  items.push({
    id: "redirects-permanent",
    phase: "redirects",
    title: "Legacy URLs use permanent (301/308) redirects",
    status: redirected.length === 0 ? "advisory" : temporary.length ? "fail" : "pass",
    evidence:
      redirected.length === 0
        ? "No redirected legacy URLs observed in GSC sample."
        : `${redirected.length - temporary.length}/${redirected.length} redirects are permanent.`,
    recommendation: temporary.length
      ? "Convert temporary (302/307) redirects to 301/308 so link equity transfers."
      : "",
    details: temporary.map((r) => `${r.oldUrl} → ${r.firstHopStatus}`),
  });

  // 2. No long redirect chains / loops; final hop 200.
  const chains = redirects.filter((r) => r.hops > MAX_REDIRECT_HOPS);
  const brokenFinal = redirects.filter((r) => r.finalStatus >= 400 || r.finalStatus === 0);
  items.push({
    id: "redirects-chains",
    phase: "redirects",
    title: "Redirects resolve directly (≤3 hops) to a 200",
    status: brokenFinal.length ? "fail" : chains.length ? "warn" : "pass",
    evidence: `${chains.length} chains >${MAX_REDIRECT_HOPS} hops, ${brokenFinal.length} ending in an error/4xx.`,
    recommendation:
      brokenFinal.length || chains.length
        ? "Point each old URL directly at its final destination; fix any landing on 4xx/5xx."
        : "",
    details: [...brokenFinal, ...chains].map((r) => `${r.oldUrl} → ${r.finalStatus} (${r.hops} hops)`),
  });

  // 3. Topically-equivalent destinations (the #1 traffic-loss cause).
  const collapses = redirects.filter(
    (r) => r.classification === "homepage-collapse" || r.classification === "index-collapse",
  );
  items.push({
    id: "redirects-equivalence",
    phase: "redirects",
    title: "Old URLs redirect to topically-equivalent pages",
    status: collapses.length ? "fail" : "pass",
    evidence: collapses.length
      ? `${collapses.length} content URL(s) collapse onto the homepage or a section index.`
      : "No homepage/index collapses detected in the sample.",
    recommendation: collapses.length
      ? "Re-map these to their closest equivalent page. Redirecting content to the homepage evaporates topical signals (Google-documented mistake)."
      : "",
    details: collapses
      .sort((a, b) => b.impressions - a.impressions)
      .map((r) => `${r.oldUrl} → ${r.finalUrl} [${r.classification}] (${r.impressions} impr)`),
  });

  // 4. Legacy URLs still indexed but 404/soft-404 on the new site.
  const notFound = redirects.filter((r) => r.classification === "not-found");
  items.push({
    id: "indexing-legacy-404",
    phase: "indexing",
    title: "Legacy ranking URLs are not 404 / soft-404",
    status: notFound.length ? "fail" : "pass",
    evidence: notFound.length
      ? `${notFound.length} URL(s) with search history return 404 or a soft-404.`
      : "All sampled legacy URLs resolve to live content.",
    recommendation: notFound.length
      ? "301 these to their closest live equivalent, or restore the content."
      : "",
    details: notFound
      .sort((a, b) => b.impressions - a.impressions)
      .map((r) => `${r.oldUrl} → ${r.finalStatus} (${r.impressions} impr)`),
  });

  // 5. SPA / CMS soft-404 catch-all.
  items.push({
    id: "indexing-soft404-catchall",
    phase: "indexing",
    title: "Unknown URLs return a real 404 (no SPA catch-all)",
    status: ctx.soft404Baseline?.is200Catchall ? "fail" : "pass",
    evidence: ctx.soft404Baseline?.is200Catchall
      ? "A known-fake URL returned HTTP 200 with a generic shell — soft-404 risk."
      : ctx.soft404Baseline
        ? "Unknown URLs correctly return a non-200 status."
        : "Could not probe (origin unreachable).",
    recommendation: ctx.soft404Baseline?.is200Catchall
      ? "Configure the app/host to return a 404 status for unknown routes, or noindex the catch-all."
      : "",
  });

  // 6. Sitemap present, fresh, populated.
  items.push({
    id: "indexing-sitemap",
    phase: "indexing",
    title: "New XML sitemap exists and is populated",
    status: ctx.sitemapUrls.length === 0 ? "warn" : "pass",
    evidence: ctx.sitemapUrls.length
      ? `${ctx.sitemapUrls.length} URL(s) discovered across submitted sitemaps.`
      : "No sitemap URLs found via GSC. Submit the new sitemap in Search Console.",
    recommendation: ctx.sitemapUrls.length
      ? ""
      : "Generate and submit the new sitemap.xml in GSC, then request indexing of key pages.",
  });

  // 7. robots.txt allows crawling + declares sitemap; no leftover staging block.
  const robots = ctx.robotsText.toLowerCase();
  const globalBlock = /user-agent:\s*\*\s*[\s\S]*?disallow:\s*\/\s*(\n|$)/.test(robots);
  const declaresSitemap = /sitemap:/i.test(ctx.robotsText);
  items.push({
    id: "indexing-robots",
    phase: "indexing",
    title: "robots.txt allows crawling and declares the sitemap",
    status: !ctx.robotsText ? "warn" : globalBlock ? "fail" : declaresSitemap ? "pass" : "warn",
    evidence: !ctx.robotsText
      ? "No robots.txt fetched."
      : globalBlock
        ? "robots.txt contains a site-wide Disallow: / — likely leftover staging block."
        : declaresSitemap
          ? "robots.txt allows crawling and declares a sitemap."
          : "robots.txt allows crawling but does not declare a sitemap.",
    recommendation: globalBlock
      ? "Remove the global Disallow that blocks the whole site."
      : declaresSitemap
        ? ""
        : "Add a `Sitemap:` directive pointing at the new sitemap.",
  });

  // 8. Performance vs expectation.
  const perf = ctx.performance;
  const drop = perf?.clicksChangePct;
  let perfStatus: CheckStatus = "advisory";
  let perfEvidence = "Insufficient GSC data to compare windows.";
  if (perf && drop !== null && drop !== undefined) {
    if (drop >= 0) {
      perfStatus = "pass";
      perfEvidence = `Clicks ${drop >= 0 ? "up" : "down"} ${Math.abs(drop)}% vs the matched pre-cutover window; avg position moved ${perf.positionDelta <= 0 ? "up" : "down"} ${Math.abs(perf.positionDelta)}.`;
    } else if (Math.abs(drop) <= NORMAL_DROP_PCT) {
      perfStatus = "warn";
      perfEvidence = `Clicks down ${Math.abs(drop)}% — within the normal ${NORMAL_DROP_PCT}% early-migration range.`;
    } else if (Math.abs(drop) < INVESTIGATE_DROP_PCT) {
      perfStatus = "warn";
      perfEvidence = `Clicks down ${Math.abs(drop)}% — near the investigation threshold.`;
    } else {
      perfStatus = "fail";
      perfEvidence = `Clicks down ${Math.abs(drop)}% — beyond the ${INVESTIGATE_DROP_PCT}% threshold; investigate.`;
    }
  }
  items.push({
    id: "performance-trend",
    phase: "performance",
    title: "Organic clicks holding vs pre-cutover",
    status: perfStatus,
    evidence: perfEvidence,
    recommendation:
      perfStatus === "fail"
        ? "Cross-reference page/query losers below with the redirect findings — most post-migration loss traces to bad redirect mapping."
        : "",
    details: perf
      ? [
          `Before (${ctx.windows.before[0]}→${ctx.windows.before[1]}): ${perf.before.clicks} clicks, pos ${perf.before.position}`,
          `After (${ctx.windows.after[0]}→${ctx.windows.after[1]}): ${perf.after.clicks} clicks, pos ${perf.after.position}`,
        ]
      : [],
  });

  // 9. Page/query losers surfaced (informational, always advisory).
  if (perf && (perf.pageLosers.length || perf.queryLosers.length)) {
    items.push({
      id: "performance-losers",
      phase: "performance",
      title: "Pages / queries that lost the most clicks",
      status: perf.pageLosers.length ? "warn" : "advisory",
      evidence: `${perf.pageLosers.length} page(s) and ${perf.queryLosers.length} query/queries lost clicks post-cutover.`,
      recommendation: "Verify each loser page redirected to a topically-equivalent destination.",
      details: [
        ...perf.pageLosers.map((p) => `page ${p.page}: ${p.clicksDelta}`),
        ...perf.queryLosers.map((q) => `query "${q.query}": ${q.clicksDelta}`),
      ],
    });
  }

  // 10. Core Web Vitals (LCP focus).
  const mobileLcp = ctx.cwv.cwvMobile?.lcp ?? null;
  let cwvStatus: CheckStatus = "advisory";
  let cwvEvidence = "No Core Web Vitals data available.";
  if (mobileLcp !== null) {
    if (mobileLcp <= LCP_GOOD_MS) {
      cwvStatus = "pass";
      cwvEvidence = `Mobile LCP ${mobileLcp}ms — good.`;
    } else if (mobileLcp <= LCP_POOR_MS) {
      cwvStatus = "warn";
      cwvEvidence = `Mobile LCP ${mobileLcp}ms — needs improvement (>2.5s).`;
    } else {
      cwvStatus = "fail";
      cwvEvidence = `Mobile LCP ${mobileLcp}ms — poor (>4s).`;
    }
  }
  items.push({
    id: "technical-cwv",
    phase: "technical",
    title: "Core Web Vitals (mobile LCP) within target",
    status: cwvStatus,
    evidence: cwvEvidence,
    recommendation:
      cwvStatus === "warn" || cwvStatus === "fail"
        ? "Optimise the LCP element (preload hero image, correct sizing, modern format, reduce server response time)."
        : "",
  });

  // 11. Replatform parity advisories (same-domain WP→Next.js etc.).
  items.push({
    id: "technical-schema-parity",
    phase: "technical",
    title: "Structured data / schema preserved after replatform",
    status: "advisory",
    evidence: "Replatforming can drop schema markup the old CMS emitted.",
    recommendation: "Confirm key page types still emit JSON-LD (Organization, Breadcrumb, Article/FAQ) and validate in the Rich Results Test.",
  });
  items.push({
    id: "technical-internal-links",
    phase: "technical",
    title: "Internal links point to new URLs (not through redirects)",
    status: "advisory",
    evidence: "Internal links left pointing at old URLs waste crawl budget and slow consolidation.",
    recommendation: "Crawl the new site and update internal links/nav/CTAs to the final new URLs.",
  });
  items.push({
    id: "technical-canonical-title-parity",
    phase: "technical",
    title: "Canonicals, titles & metadata carried over",
    status: "advisory",
    evidence: "New templates can change titles/canonicals/meta vs the old CMS.",
    recommendation: "Spot-check that canonicals reference the new URL (not old/staging) and titles/meta match intent on top pages.",
  });

  // 12. Process / GSC account items.
  items.push({
    id: "process-change-of-address",
    phase: "process",
    title: "Change of Address tool",
    status: ctx.isDomainMove ? "advisory" : "not-applicable",
    evidence: ctx.isDomainMove
      ? "Domain move detected — use the Change of Address tool."
      : "Same-domain migration — Change of Address does not apply.",
    recommendation: ctx.isDomainMove
      ? "Submit Change of Address in GSC from the old property once 301s are verified."
      : "",
  });
  items.push({
    id: "process-redirect-retention",
    phase: "process",
    title: "Maintain redirects ≥180 days",
    status: "advisory",
    evidence: "Google keeps consolidating signals for ~180 days; removing redirects early loses equity.",
    recommendation: "Keep all migration redirects live for at least 180 days (longer while old URLs still get traffic).",
  });
  items.push({
    id: "process-monitoring",
    phase: "process",
    title: "Post-migration monitoring cadence",
    status: "advisory",
    evidence: "Recovery typically takes 2–8 weeks; the first 72 hours show the biggest swings.",
    recommendation: "Monitor GSC Coverage + Performance daily for 2 weeks, then weekly to week 8. Re-run this review weekly.",
  });

  return items;
}

const PHASES: CheckPhase[] = ["redirects", "indexing", "performance", "technical", "process"];

function scorePhases(checklist: ChecklistItem[]): Record<CheckPhase, number> {
  const out = {} as Record<CheckPhase, number>;
  for (const phase of PHASES) {
    const items = checklist.filter(
      (i) => i.phase === phase && i.status !== "not-applicable" && i.status !== "advisory",
    );
    if (items.length === 0) {
      out[phase] = 100;
      continue;
    }
    const points = items.reduce((sum, i) => {
      if (i.status === "pass") return sum + 100;
      if (i.status === "warn") return sum + 60;
      return sum; // fail = 0
    }, 0);
    out[phase] = Math.round(points / items.length);
  }
  return out;
}

function buildActions(
  checklist: ChecklistItem[],
  redirects: RedirectTrace[],
): MigrationAction[] {
  const actions: MigrationAction[] = [];

  const collapses = redirects.filter(
    (r) => r.classification === "homepage-collapse" || r.classification === "index-collapse",
  );
  if (collapses.length) {
    actions.push({
      priority: "critical",
      title: `Re-map ${collapses.length} collapsed redirect(s) to equivalent pages`,
      detail: collapses
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10)
        .map((r) => `${r.oldUrl} → ${r.finalUrl}`)
        .join("; "),
    });
  }

  const notFound = redirects.filter((r) => r.classification === "not-found");
  if (notFound.length) {
    actions.push({
      priority: "critical",
      title: `Fix ${notFound.length} legacy URL(s) returning 404/soft-404`,
      detail: notFound.slice(0, 10).map((r) => r.oldUrl).join("; "),
    });
  }

  for (const item of checklist) {
    if (item.status === "fail" && !item.id.startsWith("redirects-equivalence") && !item.id.startsWith("indexing-legacy-404")) {
      actions.push({
        priority: "high",
        title: item.title,
        detail: item.recommendation || item.evidence,
      });
    } else if (item.status === "warn") {
      actions.push({
        priority: "medium",
        title: item.title,
        detail: item.recommendation || item.evidence,
      });
    }
  }

  return actions;
}
