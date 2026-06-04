import { google, searchconsole_v1 } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/webmasters",
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GSC_REDIRECT_URI
  );
}

/** Escape RE2 metacharacters so a literal brand term is safe inside a Search
 * Console `includingRegex` / `excludingRegex` pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate the Google OAuth consent URL for GSC access.
 *
 * `state` must be an HMAC-signed payload produced by the connect route — it
 * binds the OAuth flow to (nonce, clientId, initiatorUserId) so the callback
 * can verify the round-trip wasn't tampered with (OAuth CSRF / row-rebind
 * mitigation — see BP-007). The bare-clientId form was retired alongside
 * that fix; users must click "Connect GSC" once after the rollout to obtain
 * a freshly-signed state.
 */
export function getOAuthUrl(state: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state,
    prompt: "consent",
  });
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeCode(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiry: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return {
    accessToken: credentials.access_token!,
    expiry: credentials.expiry_date
      ? new Date(credentials.expiry_date).toISOString()
      : null,
  };
}

/**
 * Fetch search analytics data from GSC for a given date range.
 * Returns clicks, impressions, CTR, position, and top keywords/pages.
 */
export async function fetchSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  // Overall metrics
  const overallRes = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: [],
    },
  });

  const overall = overallRes.data.rows?.[0] || {
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
  };

  // Top keywords (by clicks)
  const keywordsRes = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 50,
    },
  });

  const topKeywords = (keywordsRes.data.rows || []).map((row: searchconsole_v1.Schema$ApiDataRow) => ({
    keyword: row.keys?.[0] || "",
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: Math.round((row.ctr || 0) * 10000) / 100,
    position: Math.round((row.position || 0) * 10) / 10,
  }));

  // Top pages (by clicks)
  const pagesRes = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 50,
    },
  });

  const topPages = (pagesRes.data.rows || []).map((row: searchconsole_v1.Schema$ApiDataRow) => ({
    page: row.keys?.[0] || "",
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: Math.round((row.ctr || 0) * 10000) / 100,
    position: Math.round((row.position || 0) * 10) / 10,
  }));

  return {
    totalClicks: overall.clicks || 0,
    totalImpressions: overall.impressions || 0,
    avgCtr: Math.round((overall.ctr as number || 0) * 10000) / 100,
    avgPosition: Math.round((overall.position as number || 0) * 10) / 10,
    topKeywords,
    topPages,
  };
}

/**
 * Fetch brand vs non-brand query breakdown from GSC.
 * Uses dimensionFilterGroups to split queries containing brand terms from generic ones.
 */
export async function fetchBrandedAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  brandTerms: string[]
) {
  if (!brandTerms.length) {
    return { brand: null, nonBrand: null };
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  // Build a single regex matching ANY brand term (true OR). The Search Console
  // API does NOT support a `groupType: "or"` filter group — it only accepts
  // "and" — so an OR across multiple `contains` filters returns HTTP 400.
  // `includingRegex` / `excludingRegex` give correct OR / NOR semantics in one
  // filter. Brand terms are regex-escaped since they now go into a pattern.
  const brandRegex = brandTerms
    .map((term) => escapeRegExp(term.trim().toLowerCase()))
    .filter((t) => t.length > 0)
    .join("|");

  // All brand terms were blank after trimming — an empty regex would match
  // everything (brand) / nothing (non-brand), silently mislabelling the split.
  if (!brandRegex) {
    return { brand: null, nonBrand: null };
  }

  try {
    // Brand queries — query matches any brand term (regex OR).
    const brandRes = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query"],
        dimensionFilterGroups: [
          { filters: [{ dimension: "query", operator: "includingRegex", expression: brandRegex }] },
        ],
        // Sum over ALL matching queries, not just the top 25 — otherwise the
        // long-tail impressions are dropped and totals undercount badly.
        rowLimit: 25000,
      },
    });

    const brandRows = brandRes.data.rows || [];
    let brandClicks = 0, brandImpressions = 0, brandPosWeighted = 0;
    for (const row of brandRows) {
      const impressions = row.impressions || 0;
      brandClicks += row.clicks || 0;
      brandImpressions += impressions;
      // Position is averaged impression-weighted (a query seen 1000x should
      // dominate one seen 5x); a flat per-row mean misreports badly.
      brandPosWeighted += (row.position || 0) * impressions;
    }

    // Non-brand queries — query matches none of the brand terms (regex NOR).
    const nonBrandRes = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query"],
        dimensionFilterGroups: [
          { filters: [{ dimension: "query", operator: "excludingRegex", expression: brandRegex }] },
        ],
        // Sum over ALL matching queries (see brand query above).
        rowLimit: 25000,
      },
    });

    const nonBrandRows = nonBrandRes.data.rows || [];
    let nbClicks = 0, nbImpressions = 0, nbPosWeighted = 0;
    for (const row of nonBrandRows) {
      const impressions = row.impressions || 0;
      nbClicks += row.clicks || 0;
      nbImpressions += impressions;
      nbPosWeighted += (row.position || 0) * impressions;
    }

    const topQueries = nonBrandRows.slice(0, 10).map((row: searchconsole_v1.Schema$ApiDataRow) => ({
      query: row.keys?.[0] || "",
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: Math.round((row.ctr || 0) * 10000) / 100,
      position: Math.round((row.position || 0) * 10) / 10,
    }));

    return {
      brand: {
        clicks: brandClicks,
        impressions: brandImpressions,
        // CTR is clicks/impressions by definition, not a mean of per-query CTRs.
        ctr: brandImpressions > 0
          ? Math.round((brandClicks / brandImpressions) * 10000) / 100
          : 0,
        position: brandImpressions > 0
          ? Math.round((brandPosWeighted / brandImpressions) * 10) / 10
          : 0,
      },
      nonBrand: {
        clicks: nbClicks,
        impressions: nbImpressions,
        ctr: nbImpressions > 0
          ? Math.round((nbClicks / nbImpressions) * 10000) / 100
          : 0,
        position: nbImpressions > 0
          ? Math.round((nbPosWeighted / nbImpressions) * 10) / 10
          : 0,
        topQueries,
      },
    };
  } catch (err) {
    console.error("[gsc-service] fetchBrandedAnalytics error:", err);
    return { brand: null, nonBrand: null };
  }
}

/**
 * Fetch indexing status using the URL Inspection API.
 * Inspects a sample of URLs from the sitemap to estimate index coverage.
 * Falls back to sitemap submitted counts if inspection fails.
 */
export async function fetchIndexingStatus(
  accessToken: string,
  siteUrl: string
) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  try {
    // Get sitemap data for submitted page counts
    const sitemapsRes = await searchconsole.sitemaps.list({ siteUrl });
    const sitemaps = sitemapsRes.data.sitemap || [];

    let totalSubmitted = 0;
    for (const sitemap of sitemaps) {
      for (const content of sitemap.contents || []) {
        if (content.type === "web") {
          totalSubmitted += Number(content.submitted) || 0;
        }
      }
    }

    // Use search analytics pages as a proxy for indexed pages.
    // Pages that appear in search results are definitely indexed.
    const pagesRes = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10),
        endDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        dimensions: ["page"],
        rowLimit: 500,
      },
    });

    const indexedPages = pagesRes.data.rows?.length || 0;
    const notIndexedPages = Math.max(0, totalSubmitted - indexedPages);

    // Try URL Inspection API on a small sample to detect issues
    const indexingIssues: Array<{ reason: string; count: number; urls: string[] }> = [];
    const sampleUrls = (pagesRes.data.rows || []).slice(0, 5).map((r: searchconsole_v1.Schema$ApiDataRow) => r.keys?.[0]).filter(Boolean) as string[];

    if (sampleUrls.length > 0) {
      const issueMap = new Map<string, string[]>();
      const inspectionResults = await Promise.allSettled(
        sampleUrls.map(async (url) => {
          try {
            const res = await searchconsole.urlInspection.index.inspect({
              requestBody: { inspectionUrl: url, siteUrl },
            });
            const result = res.data.inspectionResult?.indexStatusResult;
            if (result && result.coverageState !== "Submitted and indexed") {
              const reason = result.coverageState || "Unknown issue";
              if (!issueMap.has(reason)) issueMap.set(reason, []);
              issueMap.get(reason)!.push(url);
            }
          } catch {
            // URL Inspection API may not be available for all properties
          }
        })
      );

      for (const [reason, urls] of issueMap) {
        indexingIssues.push({ reason, count: urls.length, urls });
      }
    }

    return {
      indexedPages,
      notIndexedPages,
      indexingIssues,
    };
  } catch (err) {
    console.error("[gsc-service] fetchIndexingStatus error:", err);
    return { indexedPages: 0, notIndexedPages: 0, indexingIssues: [] };
  }
}

/**
 * Fetch sitemap data from GSC.
 */
export async function fetchSitemaps(accessToken: string, siteUrl: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  try {
    const res = await searchconsole.sitemaps.list({ siteUrl });
    return (res.data.sitemap || []).map((s: searchconsole_v1.Schema$WmxSitemap) => ({
      url: s.path || "",
      lastSubmitted: s.lastSubmitted || null,
      isPending: s.isPending || false,
      warnings: s.warnings ? Number(s.warnings) : 0,
      errors: s.errors ? Number(s.errors) : 0,
    }));
  } catch (err) {
    console.error("[gsc-service] fetchSitemaps error:", err);
    return [];
  }
}

/**
 * Fetch Core Web Vitals. Tries CrUX API first (real user data), then falls back
 * to PageSpeed Insights Lighthouse lab data for sites with low traffic.
 */
export async function fetchCoreWebVitals(
  _accessToken: string,
  siteUrl: string
) {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) {
    return { cwvMobile: null, cwvDesktop: null };
  }

  // Normalize siteUrl to a fetchable URL
  const origin = siteUrl.startsWith("sc-domain:")
    ? `https://${siteUrl.replace("sc-domain:", "")}`
    : siteUrl.replace(/\/$/, "");

  // Try CrUX first (field data from real users)
  const fetchCrux = async (formFactor: string) => {
    try {
      const res = await fetch(
        `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, formFactor }),
        }
      );

      if (!res.ok) return null;

      const data = await res.json();
      const metrics = data.record?.metrics || {};

      const getP75 = (metric: any) => metric?.percentiles?.p75 ?? null;

      const getStatus = (metric: any) => {
        const histogram = metric?.histogram || [];
        if (histogram.length === 0) return "UNKNOWN";
        const goodDensity = histogram[0]?.density || 0;
        if (goodDensity >= 0.75) return "GOOD";
        const poorDensity = histogram[2]?.density || 0;
        if (poorDensity >= 0.25) return "POOR";
        return "NEEDS_IMPROVEMENT";
      };

      const lcp = metrics.largest_contentful_paint;
      const inp = metrics.interaction_to_next_paint || metrics.first_input_delay;
      const cls = metrics.cumulative_layout_shift;

      const statuses = [lcp, inp, cls].filter(Boolean).map(getStatus);
      let overallStatus = "GOOD";
      if (statuses.includes("POOR")) overallStatus = "POOR";
      else if (statuses.includes("NEEDS_IMPROVEMENT"))
        overallStatus = "NEEDS_IMPROVEMENT";

      return {
        lcp: getP75(lcp),
        inp: getP75(inp),
        cls: getP75(cls),
        status: overallStatus,
        source: "field" as const,
      };
    } catch {
      return null;
    }
  };

  // Fallback: PageSpeed Insights Lighthouse lab data
  const fetchLighthouse = async (strategy: string) => {
    try {
      const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(origin)}&category=performance&strategy=${strategy}&key=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) return null;

      const data = await res.json();
      const audits = data.lighthouseResult?.audits || {};

      const lcpMs = audits["largest-contentful-paint"]?.numericValue;
      const inpMs = audits["interaction-to-next-paint"]?.numericValue ??
                    audits["total-blocking-time"]?.numericValue;
      const clsVal = audits["cumulative-layout-shift"]?.numericValue;

      // Determine status from performance score
      const perfScore = data.lighthouseResult?.categories?.performance?.score ?? 0;
      let status = "GOOD";
      if (perfScore < 0.5) status = "POOR";
      else if (perfScore < 0.9) status = "NEEDS_IMPROVEMENT";

      return {
        lcp: lcpMs ? Math.round(lcpMs) : null,
        inp: inpMs ? Math.round(inpMs) : null,
        cls: clsVal != null ? Math.round(clsVal * 1000) / 1000 : null,
        status,
        source: "lab" as const,
        performanceScore: Math.round(perfScore * 100),
      };
    } catch {
      return null;
    }
  };

  // Try CrUX first, fall back to Lighthouse
  let [cwvMobile, cwvDesktop]: [any, any] = await Promise.all([
    fetchCrux("PHONE"),
    fetchCrux("DESKTOP"),
  ]);

  // If CrUX returned nothing (low traffic site), use Lighthouse lab data
  if (!cwvMobile && !cwvDesktop) {
    console.log("[gsc-service] CrUX returned no data, falling back to Lighthouse lab data");
    [cwvMobile, cwvDesktop] = await Promise.all([
      fetchLighthouse("mobile"),
      fetchLighthouse("desktop"),
    ]);
  }

  return { cwvMobile, cwvDesktop };
}

export interface GscSnapshotData {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  indexedPages: number;
  notIndexedPages: number;
  cwvMobile: any;
  cwvDesktop: any;
}

export interface AlertData {
  severity: "critical" | "warning" | "info";
  category: "indexing" | "performance" | "cwv" | "keyword" | "sitemap";
  title: string;
  description: string;
  recommendation: string;
}

/**
 * Compare two snapshots and generate alerts based on thresholds.
 */
export function compareSnapshots(
  current: GscSnapshotData,
  previous: GscSnapshotData
): AlertData[] {
  const alerts: AlertData[] = [];

  // Clicks change
  if (previous.totalClicks > 0) {
    const clicksChange =
      ((current.totalClicks - previous.totalClicks) / previous.totalClicks) * 100;

    if (clicksChange <= -20) {
      alerts.push({
        severity: "critical",
        category: "performance",
        title: `Clicks dropped ${Math.abs(Math.round(clicksChange))}%`,
        description: `Total clicks fell from ${previous.totalClicks} to ${current.totalClicks} — a ${Math.abs(Math.round(clicksChange))}% decline compared to the previous period.`,
        recommendation:
          "Investigate potential ranking losses, algorithm updates, or technical issues. Check for crawl errors and indexing drops.",
      });
    } else if (clicksChange <= -10) {
      alerts.push({
        severity: "warning",
        category: "performance",
        title: `Clicks dropped ${Math.abs(Math.round(clicksChange))}%`,
        description: `Total clicks fell from ${previous.totalClicks} to ${current.totalClicks} — a ${Math.abs(Math.round(clicksChange))}% decline.`,
        recommendation:
          "Review top queries for position changes. Check if any key pages lost rankings.",
      });
    }
  }

  // Indexing drop
  if (previous.indexedPages > 0) {
    const indexChange =
      ((current.indexedPages - previous.indexedPages) / previous.indexedPages) * 100;

    if (indexChange <= -10) {
      alerts.push({
        severity: "critical",
        category: "indexing",
        title: `Indexed pages dropped ${Math.abs(Math.round(indexChange))}%`,
        description: `Indexed pages fell from ${previous.indexedPages} to ${current.indexedPages}.`,
        recommendation:
          "Check for noindex tags, robots.txt blocks, or server errors preventing crawling. Review Google Search Console coverage report.",
      });
    }
  }

  // Position worsening
  if (previous.avgPosition > 0 && current.avgPosition > 0) {
    const positionDelta = current.avgPosition - previous.avgPosition;

    if (positionDelta >= 5) {
      alerts.push({
        severity: "warning",
        category: "performance",
        title: `Average position worsened by ${Math.round(positionDelta)} spots`,
        description: `Average position moved from ${previous.avgPosition} to ${current.avgPosition}.`,
        recommendation:
          "Review content quality, backlink profile, and competitor movements. Check for algorithm updates.",
      });
    }
  }

  // CWV failures
  if (current.cwvMobile?.status === "POOR") {
    alerts.push({
      severity: "critical",
      category: "cwv",
      title: "Mobile Core Web Vitals failing",
      description: `Mobile CWV status is POOR. LCP: ${current.cwvMobile.lcp}ms, CLS: ${current.cwvMobile.cls}.`,
      recommendation:
        "Optimize LCP by reducing server response time and image sizes. Fix CLS by setting explicit dimensions on images and ads.",
    });
  }

  if (current.cwvDesktop?.status === "POOR") {
    alerts.push({
      severity: "critical",
      category: "cwv",
      title: "Desktop Core Web Vitals failing",
      description: `Desktop CWV status is POOR. LCP: ${current.cwvDesktop.lcp}ms, CLS: ${current.cwvDesktop.cls}.`,
      recommendation:
        "Optimize LCP by reducing server response time and image sizes. Fix CLS by setting explicit dimensions on images and ads.",
    });
  }

  return alerts;
}

// ─── Indexing Audit Functions ──────────────────────────────────

export interface InspectionResult {
  url: string;
  coverageState: string;
  crawledAs: string;
  lastCrawlTime: string | null;
  pageFetchState: string;
  robotsTxtState: string;
  indexingState: string;
  verdict: string;
  referringUrls: string[];
  sitemap: string[];
  inspectedAt: string;
  error?: string;
}

/**
 * Fetch all sitemap URLs from GSC, parsing sitemap XML to extract <loc> URLs.
 * Handles <sitemapindex> recursion (max depth 2).
 * Cap at 10,000 URLs total.
 */
export async function fetchAndParseSitemaps(
  accessToken: string,
  siteUrl: string
): Promise<string[]> {
  const sitemapEntries = await fetchSitemaps(accessToken, siteUrl);
  const sitemapUrls = sitemapEntries.map((s) => s.url).filter(Boolean);

  if (sitemapUrls.length === 0) return [];

  const allUrls = new Set<string>();
  const MAX_URLS = 10000;
  const TIMEOUT = 15000;

  async function parseSitemap(url: string, depth: number): Promise<void> {
    if (depth > 2 || allUrls.size >= MAX_URLS) return;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) return;
      const text = await res.text();

      // Check if this is a sitemap index
      if (text.includes("<sitemapindex")) {
        const indexLocs = [...text.matchAll(/<sitemap[^>]*>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>/g)];
        for (const match of indexLocs) {
          if (allUrls.size >= MAX_URLS) break;
          await parseSitemap(match[1], depth + 1);
        }
      } else {
        // Regular sitemap — extract <loc> tags
        const locs = [...text.matchAll(/<url[^>]*>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>/g)];
        for (const match of locs) {
          if (allUrls.size >= MAX_URLS) break;
          allUrls.add(match[1]);
        }
      }
    } catch {
      // Timeout or fetch error — skip this sitemap
    }
  }

  for (const url of sitemapUrls) {
    if (allUrls.size >= MAX_URLS) break;
    await parseSitemap(url, 0);
  }

  return [...allUrls];
}

/**
 * Normalize a URL for deduplication: lowercase host, remove trailing slash.
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * Discover all URLs for a site from sitemaps + search analytics.
 * Returns deduplicated URLs and source breakdown.
 */
export async function discoverAllUrls(
  accessToken: string,
  siteUrl: string
): Promise<{ urls: string[]; sources: { sitemap: string[]; searchAnalytics: string[] } }> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  // Fetch sitemap URLs and search analytics pages in parallel
  const [sitemapUrls, analyticsRes] = await Promise.all([
    fetchAndParseSitemaps(accessToken, siteUrl),
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
        endDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        dimensions: ["page"],
        rowLimit: 5000,
      },
    }),
  ]);

  const analyticsUrls = (analyticsRes.data.rows || [])
    .map((r: searchconsole_v1.Schema$ApiDataRow) => r.keys?.[0])
    .filter(Boolean) as string[];

  // Deduplicate by normalized URL
  const seen = new Map<string, string>();
  for (const url of [...sitemapUrls, ...analyticsUrls]) {
    const normalized = normalizeUrl(url);
    if (!seen.has(normalized)) {
      seen.set(normalized, url);
    }
  }

  return {
    urls: [...seen.values()],
    sources: {
      sitemap: sitemapUrls,
      searchAnalytics: analyticsUrls,
    },
  };
}

/**
 * Inspect a batch of URLs via the URL Inspection API.
 * Sequential processing with 200ms delay. Stops on 429 rate limit.
 */
export async function inspectUrlBatch(
  accessToken: string,
  siteUrl: string,
  urls: string[]
): Promise<InspectionResult[]> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  const results: InspectionResult[] = [];

  for (const url of urls) {
    try {
      const res = await searchconsole.urlInspection.index.inspect({
        requestBody: { inspectionUrl: url, siteUrl },
      });

      const idx = res.data.inspectionResult?.indexStatusResult;

      results.push({
        url,
        coverageState: idx?.coverageState || "Unknown",
        crawledAs: idx?.crawledAs || "Unknown",
        lastCrawlTime: idx?.lastCrawlTime || null,
        pageFetchState: idx?.pageFetchState || "Unknown",
        robotsTxtState: idx?.robotsTxtState || "Unknown",
        indexingState: idx?.indexingState || "Unknown",
        verdict: idx?.verdict || "Unknown",
        referringUrls: (idx?.referringUrls || []) as string[],
        sitemap: (idx?.sitemap || []) as string[],
        inspectedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      // On 429 (rate limit): stop batch, return results so far
      if (err?.code === 429 || err?.status === 429) {
        console.log(`[gsc-service] Rate limited after ${results.length} inspections, stopping batch`);
        break;
      }

      // Other errors: mark as failed, continue
      results.push({
        url,
        coverageState: "inspection_failed",
        crawledAs: "",
        lastCrawlTime: null,
        pageFetchState: "",
        robotsTxtState: "",
        indexingState: "",
        verdict: "",
        referringUrls: [],
        sitemap: [],
        inspectedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Inspection failed",
      });
    }

    // 200ms delay between requests
    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * List available sites from the user's GSC account.
 */
export async function listGscSites(accessToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });
  const res = await searchconsole.sites.list();
  return (res.data.siteEntry || []).map((site: searchconsole_v1.Schema$WmxSite) => ({
    siteUrl: site.siteUrl || "",
    permissionLevel: site.permissionLevel || "",
  }));
}
