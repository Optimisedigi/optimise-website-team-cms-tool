import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  refreshAccessToken,
  discoverAllUrls,
  inspectUrlBatch,
  fetchSitemaps,
  type InspectionResult,
} from "@/lib/gsc-service";

export const maxDuration = 120;

/** Never inspect more than this many URLs in a single audit. */
const URL_CAP = 500;
/**
 * Wall-clock time one invocation may use before it must return. Google's URL
 * Inspection API takes seconds per URL, so a full site cannot fit in one
 * invocation — each poll inspects the next chunk and the audit resumes where
 * it left off. Kept well under `maxDuration` (120s) to leave room for
 * discovery, the summary write and the sitemap ping.
 */
const INVOCATION_BUDGET_MS = 75_000;
/** Minimum time worth starting a chunk with. */
const MIN_CHUNK_MS = 5_000;
/** How many inspections to run in parallel within a chunk. */
const INSPECTION_CONCURRENCY = 4;
/**
 * How long an in-flight chunk is assumed to still be running. Polls arriving
 * inside this window report progress instead of starting a duplicate chunk.
 * Only covers invocations killed mid-chunk — a chunk that finishes normally
 * releases the lease itself.
 */
const LEASE_MS = 110_000;
/**
 * Overall wall-clock cap for one audit. Guards against an audit that can never
 * finish (e.g. sustained Google rate limiting) polling forever.
 */
const MAX_AUDIT_MS = 30 * 60_000;

/** Time this invocation has left for inspecting, given what it already spent. */
function remainingBudget(invocationStart: number): number {
  return INVOCATION_BUDGET_MS - (Date.now() - invocationStart);
}

/**
 * Build action items from non-indexed inspection results.
 */
function buildActionItems(results: InspectionResult[], siteUrl: string) {
  const notIndexedResults = results.filter(
    (r) =>
      r.coverageState !== "inspection_failed" &&
      r.coverageState !== "Submitted and indexed",
  );

  const actionItems = notIndexedResults.map((r) => {
    const encodedUrl = encodeURIComponent(r.url);
    const encodedSiteUrl = encodeURIComponent(siteUrl);
    const gscInspectionLink = `https://search.google.com/search-console/inspect?resource_id=${encodedSiteUrl}&id=${encodedUrl}`;

    let action: string;
    let priority: "high" | "medium" | "low";

    if (r.pageFetchState === "NOT_FOUND") {
      action = "Page returns 404. Add a 301 redirect to a relevant page, or recreate the content.";
      priority = "high";
    } else if (r.pageFetchState === "SOFT_404") {
      action = "Google sees this as a soft 404 (page exists but looks empty). Add substantial content.";
      priority = "high";
    } else if (r.pageFetchState === "SERVER_ERROR") {
      action = "Page returns a server error. Fix the underlying issue and re-request indexing.";
      priority = "high";
    } else if (r.pageFetchState === "REDIRECT_ERROR") {
      action = "Redirect chain or loop detected. Fix the redirect to point directly to the final URL.";
      priority = "high";
    } else if (r.coverageState === "Crawled - currently not indexed") {
      action = "Google crawled this but chose not to index it. Improve content quality, add internal links, then request indexing.";
      priority = "medium";
    } else if (r.coverageState === "Discovered - currently not indexed") {
      action = "Google knows about this URL but hasn't crawled it yet. Add internal links and request indexing to boost priority.";
      priority = "medium";
    } else if (r.coverageState === "URL is unknown to Google") {
      action = "Google has never seen this URL. Ensure it's in the sitemap, linked from other pages, then request indexing.";
      priority = "medium";
    } else if (r.robotsTxtState === "DISALLOWED") {
      action = "Blocked by robots.txt. Remove the disallow rule if you want this page indexed.";
      priority = "high";
    } else if (r.indexingState === "BLOCKED_BY_META_TAG") {
      action = "Blocked by a noindex meta tag. Remove the tag if you want this page indexed.";
      priority = "high";
    } else {
      action = `Not indexed: ${r.coverageState}. Review in GSC and request indexing after fixing.`;
      priority = "medium";
    }

    return {
      url: r.url,
      reason: r.coverageState,
      fetchState: r.pageFetchState,
      lastCrawled: r.lastCrawlTime,
      action,
      priority,
      gscInspectionLink,
    };
  });

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actionItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  return actionItems;
}

/**
 * Ensure the client's GSC access token is fresh.
 */
async function ensureFreshToken(
  payload: any,
  client: any,
): Promise<string> {
  let accessToken = client.gscAccessToken as string;
  const tokenExpiry = client.gscTokenExpiry
    ? new Date(client.gscTokenExpiry as string)
    : null;

  if (!tokenExpiry || tokenExpiry <= new Date()) {
    const refreshed = await refreshAccessToken(client.gscRefreshToken as string);
    accessToken = refreshed.accessToken;
    await payload.update({
      collection: "clients",
      id: client.id,
      overrideAccess: true,
      data: {
        gscAccessToken: refreshed.accessToken,
        gscTokenExpiry: refreshed.expiry,
      },
    });
  }

  return accessToken;
}

/**
 * Inspect the next chunk of URLs for an audit, appending to whatever has
 * already been inspected.
 *
 * A single serverless invocation cannot inspect a whole site, so this runs
 * within a time budget and leaves the audit in `inspecting` when more URLs
 * remain — the next poll continues from the same offset.
 */
async function runInspectionChunk(
  payload: any,
  auditId: string,
  accessToken: string,
  siteUrl: string,
  urls: string[],
  existingResults: InspectionResult[] = [],
  startedAt?: string | null,
  budgetMs: number = INVOCATION_BUDGET_MS,
): Promise<void> {
  try {
    const toInspect = urls.slice(0, URL_CAP);
    const remaining = toInspect.slice(existingResults.length);

    if (remaining.length > 0 && startedAt) {
      const elapsed = Date.now() - new Date(startedAt).getTime();
      if (elapsed > MAX_AUDIT_MS) {
        throw new Error(
          `Timed out after inspecting ${existingResults.length} of ${toInspect.length} URLs. Google may be rate limiting this property — try again later.`,
        );
      }
    }

    // Claim the lease up front so concurrent polls don't start a second chunk.
    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: { status: "inspecting", lastBatchDate: new Date().toISOString() },
    });

    const fresh = remaining.length
      ? await inspectUrlBatch(accessToken, siteUrl, remaining, {
          budgetMs,
          concurrency: INSPECTION_CONCURRENCY,
        })
      : [];
    const results = [...existingResults, ...fresh];
    const isComplete = results.length >= toInspect.length;

    if (!isComplete) {
      // More URLs to go: persist progress and release the lease so the very
      // next poll continues immediately.
      await payload.update({
        collection: "gsc-indexing-audits",
        id: auditId,
        overrideAccess: true,
        data: {
          status: "inspecting",
          inspectedCount: results.length,
          inspectionResults: results,
          lastBatchDate: null,
        },
      });
      return;
    }

    // Build summary
    let indexed = 0;
    let notIndexed = 0;
    const byReason: Record<string, number> = {};
    for (const r of results) {
      if (r.coverageState === "inspection_failed") continue;
      if (r.coverageState === "Submitted and indexed") {
        indexed++;
      } else {
        notIndexed++;
        const reason = r.coverageState || "Unknown";
        byReason[reason] = (byReason[reason] || 0) + 1;
      }
    }

    // Build action items + sitemap ping
    const actionItems = buildActionItems(results, siteUrl);

    let sitemapPingResult: string | null = null;
    try {
      const sitemaps = await fetchSitemaps(accessToken, siteUrl);
      if (sitemaps.length > 0) {
        const mainSitemap = sitemaps[0];
        const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(mainSitemap.url)}`;
        const pingRes = await fetch(pingUrl);
        sitemapPingResult = pingRes.ok
          ? `Sitemap ping sent successfully for ${mainSitemap.url}`
          : `Sitemap ping failed (${pingRes.status})`;
      }
    } catch {
      // best-effort
    }

    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: {
        status: "completed",
        inspectedCount: results.length,
        inspectionResults: results,
        summaryStats: {
          indexed,
          notIndexed,
          byReason,
          actionItems,
          sitemapPingResult,
          indexRate: indexed + notIndexed > 0
            ? `${Math.round((indexed / (indexed + notIndexed)) * 100)}%`
            : "N/A",
        },
        completedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inspection failed";
    console.error(`[gsc/indexing-helper] Inspection ${auditId} failed:`, message);
    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: {
        status: "failed",
        error: message,
      },
    }).catch(() => {}); // prevent double-fault
  }
}

/**
 * POST: Start the indexing helper.
 * Discovers URLs, then inspects the first chunk within a time budget. Any
 * remaining URLs are inspected by subsequent GET polls, so the request always
 * returns JSON instead of hitting the serverless time limit.
 */
export async function POST(req: NextRequest) {
  const invocationStart = Date.now();
  try {
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { siteUrl, clientId } = body;

    if (!siteUrl) {
      return NextResponse.json({ error: "siteUrl is required" }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });

    if (!client.gscConnected || !client.gscAccessToken || !client.gscRefreshToken) {
      return NextResponse.json(
        { error: "Client does not have GSC connected" },
        { status: 400 },
      );
    }

    // Create audit record
    const audit = await payload.create({
      collection: "gsc-indexing-audits",
      overrideAccess: true,
      data: {
        client: Number(clientId),
        siteUrl,
        status: "discovering",
        totalUrls: 0,
        inspectedCount: 0,
        startedAt: new Date().toISOString(),
      },
    });

    const auditId = String(audit.id);

    // --- URL DISCOVERY: done synchronously so it always completes ---
    let accessToken: string;
    let urls: string[];
    let sources: { sitemap: string[]; searchAnalytics: string[] };

    try {
      accessToken = await ensureFreshToken(payload, client);
      const discovered = await discoverAllUrls(accessToken, siteUrl);
      urls = discovered.urls;
      sources = discovered.sources;
    } catch (err) {
      const message = err instanceof Error ? err.message : "URL discovery failed";
      console.error(`[gsc/indexing-helper] Discovery ${auditId} failed:`, message);
      await payload.update({
        collection: "gsc-indexing-audits",
        id: auditId,
        overrideAccess: true,
        data: { status: "failed", error: message },
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (urls.length === 0) {
      await payload.update({
        collection: "gsc-indexing-audits",
        id: auditId,
        overrideAccess: true,
        data: {
          status: "completed",
          totalUrls: 0,
          discoveredUrls: [],
          urlSources: sources,
          inspectionResults: [],
          summaryStats: { indexed: 0, notIndexed: 0, byReason: {} },
          completedAt: new Date().toISOString(),
        },
      });
      return NextResponse.json({ ok: true, auditId });
    }

    // Update audit with discovered URLs — status becomes "inspecting"
    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: {
        status: "inspecting",
        totalUrls: urls.length,
        discoveredUrls: urls,
        urlSources: sources,
      },
    });

    // --- INSPECTION: first chunk with whatever time discovery left over,
    // the rest continues on GET polls ---
    const budgetMs = remainingBudget(invocationStart);
    if (budgetMs >= MIN_CHUNK_MS) {
      await runInspectionChunk(
        payload,
        auditId,
        accessToken,
        siteUrl,
        urls,
        [],
        audit.startedAt as string,
        budgetMs,
      );
    }

    return NextResponse.json({ ok: true, auditId });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start indexing helper";
    console.error("[gsc/indexing-helper/run]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET: Poll for indexing helper results.
 * Returns only the fields the frontend needs. While the audit is still
 * inspecting and no chunk is in flight, this poll inspects the next chunk.
 */
export async function GET(req: NextRequest) {
  const invocationStart = Date.now();
  try {
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const auditId = req.nextUrl.searchParams.get("auditId");
    if (!auditId) {
      return NextResponse.json({ error: "auditId is required" }, { status: 400 });
    }

    const audit = await payload.findByID({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
    });

    // Continue inspecting unless another invocation still holds the lease.
    // A null lease means no chunk is running; a stale one means it was killed.
    if (audit.status === "inspecting") {
      const leaseAt = (audit as any).lastBatchDate;
      const leaseAge = leaseAt ? Date.now() - new Date(leaseAt as string).getTime() : Infinity;

      if (leaseAge > LEASE_MS) {
        const clientId = typeof audit.client === "object" ? (audit.client as any).id : audit.client;
        const client = await payload.findByID({
          collection: "clients",
          id: clientId,
          overrideAccess: true,
        });

        const siteUrl = (audit as any).siteUrl || client.gscPropertyUrl;
        const urls: string[] = (audit as any).discoveredUrls || [];
        const budgetMs = remainingBudget(invocationStart);

        if (siteUrl && client.gscRefreshToken && urls.length > 0 && budgetMs >= MIN_CHUNK_MS) {
          const accessToken = await ensureFreshToken(payload, client);
          const done: InspectionResult[] = (audit as any).inspectionResults || [];
          await runInspectionChunk(
            payload,
            auditId,
            accessToken,
            siteUrl,
            urls,
            done,
            (audit as any).startedAt,
            budgetMs,
          );

          // Re-read so this poll reports the chunk it just finished.
          const refreshed = await payload.findByID({
            collection: "gsc-indexing-audits",
            id: auditId,
            overrideAccess: true,
          });
          return NextResponse.json({
            id: refreshed.id,
            status: refreshed.status,
            totalUrls: refreshed.totalUrls,
            inspectedCount: refreshed.inspectedCount,
            summaryStats: refreshed.summaryStats,
            error: refreshed.error,
          });
        }
      }
    }

    // Return only what the frontend needs
    return NextResponse.json({
      id: audit.id,
      status: audit.status,
      totalUrls: audit.totalUrls,
      inspectedCount: audit.inspectedCount,
      summaryStats: audit.summaryStats,
      error: audit.error,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch results";
    console.error("[gsc/indexing-helper/run]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
