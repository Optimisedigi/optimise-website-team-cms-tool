import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { sql } from "drizzle-orm";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";
import { proxyProductionLandingDashboard } from "@/lib/production-landing-dashboard";
import { resolveLandingDateRange } from "@/lib/landing-date-range";
import { LANDING_PAGES } from "@/lib/landing-page-sections";

/**
 * The generated landing pages, read from the manifest the landing build emits.
 *
 * Proxied rather than fetched from the browser because the manifest is a static
 * file on another origin and sends no CORS header.
 *
 * The dashboard needs the manifest because event data alone cannot list a page
 * that has never been visited - which is exactly the page most likely to need
 * checking.
 *
 * Auth matches the rest of /api/dashboard: a client PIN token for this slug, or
 * a Payload admin session. It lives here rather than under /api/landing-admin
 * because the per-client dashboard is PIN-authenticated and would be locked out
 * of an admin-only route - and this list is not cross-tenant, so nothing about
 * it requires admin.
 */

const MANIFEST_URL = "https://hire.awaydigitalteams.com/lp/pages.json";
const LOCAL_PREVIEW_MANIFEST_URL = "http://localhost:4321/lp/pages.json";

/** Only these hosts may ever be previewed or linked from the dashboard. */
const ALLOWED_HOSTS = new Set(["hire.awaydigitalteams.com"]);

interface ManifestPage {
  pageId: string;
  slug: string;
  market: string;
  url: string;
  title: string;
  headline: string;
  adGroupIds: string[];
  noindex: boolean;
  campaignName?: string;
  adGroupName?: string;
}

interface AdGroupMetric {
  adGroupId: string;
  name: string;
  campaign: string;
  clicks: number;
  cost: number;
  conversions: number;
}

interface Engagement {
  sessions: number;
  /** Sessions that carried a Google click ID. */
  paidSessions: number;
  /** Sessions where a section stayed at least 50% visible for three seconds. */
  engagedSessions: number;
  /** Engaged sessions that also carried a Google click ID. */
  paidEngagedSessions: number;
  /** Sessions with a tracked form submission or completed booking. */
  conversionSessions: number;
  /** Converted sessions that also carried a Google click ID. */
  paidConversionSessions: number;
  /** Percent of sessions that left the first section without scrolling. */
  bounceRate: number;
  /** Mean active seconds across all sessions; single-event exits contribute zero. */
  averageSeconds: number | null;
  /** Median active seconds per measured session, or null when no dwell beacon arrived. */
  medianSeconds: number | null;
  /** Number of Google Ads sessions with a usable timing sample. */
  paidTimedSessions: number;
  /** Mean active seconds across all Google Ads sessions. */
  paidAverageSeconds: number | null;
  /** Median measured active seconds across Google Ads sessions. */
  paidMedianSeconds: number | null;
}

/**
 * Keep only entries that are well-formed and point at a host we control.
 *
 * The manifest is fetched over the network, so it is treated as untrusted input
 * even though we publish it: a DNS or hosting mistake should not put an
 * arbitrary origin into a dashboard iframe.
 */
function sanitise(raw: unknown): ManifestPage[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { pages?: unknown }).pages)) return [];

  return ((raw as { pages: unknown[] }).pages)
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const page = entry as Record<string, unknown>;
      const url = typeof page.url === "string" ? page.url : "";

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return [];
      }
      if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) return [];
      if (typeof page.slug !== "string" || !/^[a-z0-9-]+$/.test(page.slug)) return [];

      return [{
        pageId: String(page.pageId ?? ""),
        slug: page.slug,
        market: String(page.market ?? ""),
        url,
        title: String(page.title ?? ""),
        headline: String(page.headline ?? ""),
        adGroupIds: Array.isArray(page.adGroupIds)
          ? page.adGroupIds.map(String).filter((id) => /^[0-9]+$/.test(id))
          : [],
        noindex: Boolean(page.noindex),
        campaignName: typeof page.campaignName === "string" ? page.campaignName.slice(0, 200) : undefined,
        adGroupName: typeof page.adGroupName === "string" ? page.adGroupName.slice(0, 200) : undefined,
      }];
    });
}

/**
 * Ad group name, clicks and spend, straight from Google Ads via Growth Tools.
 *
 * The manifest knows which ad group ids point at a page but nothing about what
 * they are called or what they cost - that lives only in the ad account. Spend
 * is the number that decides which page is worth attention, so it is worth the
 * extra hop.
 *
 * Failures are swallowed deliberately: this decorates the list, and a page list
 * that renders without spend is far more useful than an error where the list
 * should be.
 */
async function loadAdGroupMetrics(
  customerId: string,
  dateRange: string,
): Promise<Map<string, AdGroupMetric>> {
  const base = process.env.GROWTH_TOOLS_URL;
  const key = process.env.INTERNAL_API_KEY;
  const empty = new Map<string, AdGroupMetric>();
  if (!base || !key || !/^[0-9]+$/.test(customerId)) return empty;

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/google-ads/ad-groups/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": key },
      body: JSON.stringify({ customerId, dateRange, statusFilter: "ALL" }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!res.ok) return empty;

    const json = (await res.json()) as { success?: boolean; adGroups?: unknown[] };
    if (!json.success || !Array.isArray(json.adGroups)) return empty;

    const metric = (value: unknown): number => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
    };
    for (const entry of json.adGroups) {
      const row = entry as Record<string, unknown>;
      const id = String(row.adGroupId ?? "");
      if (!/^[0-9]+$/.test(id)) continue;
      empty.set(id, {
        adGroupId: id,
        name: String(row.adGroupName ?? ""),
        campaign: String(row.campaignName ?? ""),
        clicks: metric(row.clicks),
        cost: metric(row.cost),
        conversions: metric(row.conversions),
      });
    }
    return empty;
  } catch {
    return empty;
  }
}

/**
 * Bounce rate and time on site per page, using the same definitions the report
 * beside it already uses.
 *
 * Bounce is "left from the first section without scrolling": a session that saw
 * the page, never reached a second section, and never crossed a scroll
 * milestone. That matches the drop-off the section table reports, rather than
 * inventing a second, differently-shaped number on the same screen.
 *
 * Time on site is the median of each session's summed `page_dwell.active_ms`,
 * copied from the report's own timing query - active milliseconds, so a tab left
 * open in the background does not read as engagement. Median, because one
 * visitor who left a tab open all afternoon would drag a mean past anything a
 * real reader did.
 *
 * Both stay null when unmeasured. A page whose visitors never fired a dwell
 * beacon has no time on site; printing 0s would claim they bounced instantly,
 * which is a different and stronger statement than "we do not know".
 */
async function loadEngagement(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: number | string,
  since: string,
  until: string,
): Promise<Map<string, Engagement>> {
  const out = new Map<string, Engagement>();

  /* clientId is a numeric database id and `since` is an ISO string generated
     here, so neither carries caller input. Both are coerced anyway, because raw
     SQL should not rely on a caller two functions away staying trustworthy. */
  const id = String(clientId).replace(/[^0-9]/g, "");
  if (!id) return out;
  const windowStart = since.replace(/'/g, "''");
  const windowEnd = until.replace(/'/g, "''");
  const scope = `client_id = ${id} AND occurred_at >= '${windowStart}' AND occurred_at < '${windowEnd}'`;

  const engagementSql = `
    SELECT page_id,
           COUNT(*) AS sessions,
           SUM(bounced) AS bounced,
           SUM(paid) AS paid,
           SUM(engaged) AS engaged,
           SUM(CASE WHEN paid = 1 AND engaged = 1 THEN 1 ELSE 0 END) AS paid_engaged,
           SUM(converted) AS converted,
           SUM(CASE WHEN paid = 1 AND converted = 1 THEN 1 ELSE 0 END) AS paid_converted
    FROM (
      SELECT session_id,
             page_id,
             MAX(CASE WHEN attribution LIKE '%gclid%' OR attribution LIKE '%gbraid%' OR attribution LIKE '%wbraid%' THEN 1 ELSE 0 END) AS paid,
             MAX(CASE WHEN event_type = 'section_engaged' THEN 1 ELSE 0 END) AS engaged,
             MAX(CASE WHEN event_type IN ('booking_complete', 'form_submit') THEN 1 ELSE 0 END) AS converted,
             CASE WHEN COUNT(DISTINCT CASE WHEN event_type = 'section_view'
                                           THEN json_extract(properties, '$.section_id') END) > 1
                    OR MAX(CASE WHEN event_type = 'scroll_depth' THEN 1 ELSE 0 END) = 1
                  THEN 0 ELSE 1 END AS bounced
      FROM landing_events
      WHERE ${scope}
      GROUP BY session_id, page_id
    )
    GROUP BY page_id`;

  /* Prefer the tracker's active page dwell. If a browser drops the lifecycle
     beacon, the first-to-last event span is a conservative lower bound rather
     than pretending the session has no measurable time at all. */
  const timingSql = `
    WITH page_views AS (
      SELECT page_id, session_id, page_view_id,
             MAX(CASE WHEN attribution LIKE '%gclid%' OR attribution LIKE '%gbraid%' OR attribution LIKE '%wbraid%' THEN 1 ELSE 0 END) AS paid,
             MAX(CASE WHEN event_type = 'page_dwell'
                      THEN CAST(json_extract(properties, '$.active_ms') AS REAL) END) AS active_ms,
             (julianday(MAX(occurred_at)) - julianday(MIN(occurred_at))) * 86400000 AS observed_ms,
             COUNT(*) AS event_count
      FROM landing_events
      WHERE ${scope}
      GROUP BY page_id, session_id, page_view_id
    )
    SELECT page_id, session_id,
           SUM(COALESCE(active_ms, CASE WHEN event_count > 1 THEN observed_ms END)) AS session_ms,
           MAX(paid) AS paid
    FROM page_views
    WHERE active_ms IS NOT NULL OR event_count > 1
    GROUP BY page_id, session_id`;

  const rowsOf = async (statement: string) => {
    const result = await payload.db.drizzle.run(sql.raw(statement));
    return (result as { rows?: Record<string, unknown>[] })?.rows ?? [];
  };

  try {
    const [engagement, timing] = await Promise.all([rowsOf(engagementSql), rowsOf(timingSql)]);

    const msByPage = new Map<string, number[]>();
    const paidMsByPage = new Map<string, number[]>();
    for (const row of timing) {
      const ms = Number(row.session_ms);
      if (!Number.isFinite(ms) || ms < 0) continue;
      const page = String(row.page_id ?? "");
      if (!msByPage.has(page)) msByPage.set(page, []);
      msByPage.get(page)!.push(ms);
      if (Number(row.paid) === 1) {
        if (!paidMsByPage.has(page)) paidMsByPage.set(page, []);
        paidMsByPage.get(page)!.push(ms);
      }
    }

    for (const row of engagement) {
      const sessions = Number(row.sessions ?? 0);
      if (!sessions) continue;
      const paidSessions = Number(row.paid ?? 0);
      const page = String(row.page_id ?? "");
      const values = (msByPage.get(page) ?? []).sort((a, b) => a - b);
      const paidValues = (paidMsByPage.get(page) ?? []).sort((a, b) => a - b);
      out.set(page, {
        sessions,
        paidSessions,
        engagedSessions: Number(row.engaged ?? 0),
        paidEngagedSessions: Number(row.paid_engaged ?? 0),
        conversionSessions: Number(row.converted ?? 0),
        paidConversionSessions: Number(row.paid_converted ?? 0),
        bounceRate: Math.round((Number(row.bounced ?? 0) / sessions) * 1000) / 10,
        // Traditional time-on-site treats a single-event exit as zero seconds.
        // Dwell medians below still describe measured sessions only.
        averageSeconds: values.length
          ? Math.round(values.reduce((total, value) => total + value, 0) / sessions / 1000)
          : null,
        medianSeconds: values.length ? Math.round(values[Math.floor((values.length - 1) / 2)] / 1000) : null,
        paidTimedSessions: paidValues.length,
        paidAverageSeconds: paidValues.length && paidSessions
          ? Math.round(paidValues.reduce((total, value) => total + value, 0) / paidSessions / 1000)
          : null,
        paidMedianSeconds: paidValues.length
          ? Math.round(paidValues[Math.floor((paidValues.length - 1) / 2)] / 1000)
          : null,
      });
    }
  } catch (error) {
    // Engagement decorates the list; losing it must not blank the list itself.
    console.error("[landing-pages] engagement query failed:", error);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    // No valid client token - fall back to a Payload admin session, so the
    // internal dashboard can read the list without a minted token.
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const localPreview = process.env.NODE_ENV === "development" && req.nextUrl.searchParams.get("preview") === "1";
  if (!localPreview) {
    const productionData = await proxyProductionLandingDashboard(
      req,
      "/api/dashboard/landing-pages",
    );
    if (productionData) return productionData;
  }

  const range = resolveLandingDateRange(req.nextUrl.searchParams);
  if (!range) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

  try {
    const upstream = await fetch(localPreview ? LOCAL_PREVIEW_MANIFEST_URL : MANIFEST_URL, {
      // Local previews must reflect the latest generated file immediately; production can cache briefly.
      ...(localPreview ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `Manifest unavailable (${upstream.status})`, pages: [] }, { status: 502 });
    }
    const pages = sanitise(await upstream.json()).map((page) => localPreview
      ? { ...page, url: `http://localhost:4321/${page.slug}.html` }
      : page);
    if (req.nextUrl.searchParams.get("catalog") === "1") {
      return NextResponse.json({ pages }, { headers: { "cache-control": "no-store" } });
    }

    /* Look up the client for its ad account and its stored events. Both are
       decoration: if either is unavailable the page list still renders, just
       without the numbers. */
    const payload = await getPayload({ config });
    const client = (
      await payload.find({ collection: "clients", where: { slug: { equals: slug } }, limit: 1, overrideAccess: true })
    ).docs[0] as { id?: number | string; googleAdsCustomerId?: string } | undefined;

    const [adGroups, engagement] = await Promise.all([
      client?.googleAdsCustomerId
        ? loadAdGroupMetrics(
            String(client.googleAdsCustomerId).replace(/[^0-9]/g, ""),
            range.googleAdsRange,
          )
        : Promise.resolve(new Map<string, AdGroupMetric>()),
      client?.id
        ? loadEngagement(payload, client.id, range.since, range.until)
        : Promise.resolve(new Map<string, Engagement>()),
    ]);

    const legacyPages: ManifestPage[] = Object.values(LANDING_PAGES).map((page) => ({
      pageId: page.pageId,
      slug: new URL(page.url).pathname.replace(/^\/+/, ""),
      market: page.pageId.endsWith("-us") ? "US" : "AU",
      url: page.url,
      title: page.label,
      headline: page.sections[0]?.label ?? page.label,
      adGroupIds: [],
      noindex: false,
    }));
    const reportPages = [
      ...pages,
      ...legacyPages.filter((legacy) => !pages.some((page) => page.pageId === legacy.pageId)),
    ];

    const decorated = reportPages.map((page) => {
      const groups = page.adGroupIds.flatMap((id) => {
        const metric = adGroups.get(id);
        if (metric) return [metric];
        if (!page.adGroupName || !page.campaignName) return [];
        return [{
          adGroupId: id,
          name: page.adGroupName,
          campaign: page.campaignName,
          clicks: 0,
          cost: 0,
          conversions: 0,
        }];
      });
      const stats = engagement.get(page.pageId);
      return {
        ...page,
        adGroups: groups.map((g) => ({
          id: g.adGroupId,
          name: g.name,
          campaign: g.campaign,
          clicks: g.clicks,
          cost: g.cost,
        })),
        clicks: groups.reduce((n, g) => n + g.clicks, 0),
        cost: Math.round(groups.reduce((n, g) => n + g.cost, 0) * 100) / 100,
        conversions: groups.reduce((n, g) => n + g.conversions, 0),
        sessions: stats?.sessions ?? 0,
        paidSessions: stats?.paidSessions ?? 0,
        engagedSessions: stats?.engagedSessions ?? 0,
        paidEngagedSessions: stats?.paidEngagedSessions ?? 0,
        trackedConversions: stats?.conversionSessions ?? 0,
        paidTrackedConversions: stats?.paidConversionSessions ?? 0,
        bounceRate: stats?.bounceRate ?? null,
        averageSeconds: stats?.averageSeconds ?? null,
        medianSeconds: stats?.medianSeconds ?? null,
        paidTimedSessions: stats?.paidTimedSessions ?? 0,
        paidAverageSeconds: stats?.paidAverageSeconds ?? null,
        paidMedianSeconds: stats?.paidMedianSeconds ?? null,
      };
    });

    return NextResponse.json({
      pages: decorated,
      // The UI says "no ad data" rather than showing a misleading zero spend.
      adMetricsAvailable: adGroups.size > 0,
      rangeLabel: range.label,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manifest fetch failed", pages: [] },
      { status: 502 },
    );
  }
}
