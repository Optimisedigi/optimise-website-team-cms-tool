import { getPayload } from "payload";
import config from "@/payload.config";
import {
  refreshAccessToken,
  discoverAllUrls,
  inspectUrlBatch,
  type InspectionResult,
} from "./gsc-service";

/**
 * Build summary stats from inspection results.
 */
function buildSummaryStats(results: InspectionResult[]) {
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

  return { indexed, notIndexed, byReason };
}

/**
 * Refresh the client's GSC access token if needed.
 * Returns the current (or refreshed) access token.
 */
async function ensureFreshToken(
  payload: any,
  client: any
): Promise<string> {
  let accessToken = client.gscAccessToken;
  const tokenExpiry = client.gscTokenExpiry
    ? new Date(client.gscTokenExpiry)
    : null;

  if (!tokenExpiry || tokenExpiry <= new Date()) {
    const refreshed = await refreshAccessToken(client.gscRefreshToken);
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
 * Run URL discovery only (no inspection).
 * Called synchronously from the POST handler so discovery always completes.
 * Returns the discovered URLs and access token, or null if 0 URLs found (audit auto-completed).
 */
export async function runDiscovery(
  payload: any,
  auditId: string,
  client: any
): Promise<{ urls: string[]; accessToken: string } | null> {
  try {
    const accessToken = await ensureFreshToken(payload, client);

    const { urls, sources } = await discoverAllUrls(accessToken, client.gscPropertyUrl);

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
      return null;
    }

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

    return { urls, accessToken };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    console.error(`[gsc-indexing] Discovery ${auditId} failed:`, message);
    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: { status: "failed", error: message },
    }).catch(() => {}); // prevent double-fault
    return null;
  }
}

/**
 * Run the inspection phase: inspect the first batch of URLs and update the audit.
 * Called as background work via after().
 */
export async function runInspectionWork(
  payload: any,
  auditId: string,
  client: any,
  urls: string[],
  accessToken?: string,
): Promise<void> {
  try {
    if (!accessToken) {
      accessToken = await ensureFreshToken(payload, client);
    }

    // Run first batch immediately (max 200 URLs)
    const firstBatch = urls.slice(0, 200);
    const results = await inspectUrlBatch(accessToken, client.gscPropertyUrl, firstBatch);

    const summaryStats = buildSummaryStats(results);
    const isComplete = results.length >= urls.length;

    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: {
        inspectedCount: results.length,
        inspectionResults: results,
        summaryStats,
        lastBatchDate: new Date().toISOString(),
        ...(isComplete
          ? { status: "completed", completedAt: new Date().toISOString() }
          : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inspection failed";
    console.error(`[gsc-indexing] Inspection ${auditId} failed:`, message);
    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: { status: "failed", error: message },
    }).catch(() => {}); // prevent double-fault
  }
}

/**
 * Start a new indexing audit for a client.
 * Creates the audit record and returns the auditId + client.
 * Caller is responsible for running discovery + scheduling inspection.
 */
export async function startIndexingAudit(
  payload: any,
  clientId: string
): Promise<{ auditId: string; client: any }> {
  // Verify client has GSC connected
  const client = await payload.findByID({
    collection: "clients",
    id: clientId,
    overrideAccess: true,
  });

  if (!client.gscConnected || !client.gscAccessToken || !client.gscRefreshToken || !client.gscPropertyUrl) {
    throw new Error("Client does not have GSC connected");
  }

  // Check for active audit
  const activeAudit = await payload.find({
    collection: "gsc-indexing-audits",
    where: {
      client: { equals: clientId },
      status: { in: ["discovering", "inspecting"] },
    },
    limit: 1,
    overrideAccess: true,
  });

  if (activeAudit.docs[0]) {
    const existing = activeAudit.docs[0];
    const updatedAt = new Date(existing.updatedAt as string).getTime();
    const stuckMinutes = (Date.now() - updatedAt) / 60000;

    // If stuck for >5 minutes, mark as failed so a new audit can start
    if (stuckMinutes > 5) {
      await payload.update({
        collection: "gsc-indexing-audits",
        id: existing.id,
        overrideAccess: true,
        data: { status: "failed", error: "Timed out (stuck for over 5 minutes)" },
      });
    } else {
      return { auditId: String(existing.id), client: null };
    }
  }

  // Create audit record
  const audit = await payload.create({
    collection: "gsc-indexing-audits",
    overrideAccess: true,
    data: {
      client: Number(clientId),
      siteUrl: client.gscPropertyUrl,
      status: "discovering",
      totalUrls: 0,
      inspectedCount: 0,
      startedAt: new Date().toISOString(),
    },
  });

  return { auditId: String(audit.id), client };
}

/**
 * Process pending indexing audit batches. Called from cron.
 * Handles both "discovering" (stuck) and "inspecting" audits.
 */
export async function processIndexingBatches(payload?: any): Promise<void> {
  if (!payload) {
    const payloadConfig = await config;
    payload = await getPayload({ config: payloadConfig });
  }

  // Also pick up stuck "discovering" audits (after() may have failed)
  const stuckDiscovering = await payload.find({
    collection: "gsc-indexing-audits",
    where: {
      status: { equals: "discovering" },
    },
    limit: 10,
    overrideAccess: true,
  });

  for (const audit of stuckDiscovering.docs) {
    try {
      const clientId = typeof audit.client === "object" ? audit.client.id : audit.client;
      const client = await payload.findByID({
        collection: "clients",
        id: clientId,
        overrideAccess: true,
      });

      if (!client.gscRefreshToken || !client.gscPropertyUrl) {
        await payload.update({
          collection: "gsc-indexing-audits",
          id: audit.id,
          overrideAccess: true,
          data: { status: "failed", error: "Client GSC credentials missing" },
        });
        continue;
      }

      // Run full discovery + first batch
      const discoveryResult = await runDiscovery(payload, String(audit.id), client);
      if (discoveryResult && discoveryResult.urls.length > 0) {
        await runInspectionWork(
          payload,
          String(audit.id),
          client,
          discoveryResult.urls,
          discoveryResult.accessToken,
        );
      }

      console.log(`[gsc-indexing] Recovered stuck audit ${audit.id}`);
    } catch (err) {
      console.error(`[gsc-indexing] Failed to recover stuck audit ${audit.id}:`, err);
    }
  }

  // Process "inspecting" audits with remaining URLs
  const activeAudits = await payload.find({
    collection: "gsc-indexing-audits",
    where: { status: { equals: "inspecting" } },
    limit: 50,
    overrideAccess: true,
  });

  if (activeAudits.docs.length === 0) return;

  const activeCount = activeAudits.docs.length;
  // Dynamic batch size: share the ~2000/day rate limit across active audits
  const batchSize = Math.max(50, Math.min(200, Math.floor(1800 / activeCount)));

  for (const audit of activeAudits.docs) {
    try {
      const client = await payload.findByID({
        collection: "clients",
        id: typeof audit.client === "object" ? audit.client.id : audit.client,
        overrideAccess: true,
      });

      if (!client.gscRefreshToken || !client.gscPropertyUrl) {
        await payload.update({
          collection: "gsc-indexing-audits",
          id: audit.id,
          overrideAccess: true,
          data: {
            status: "failed",
            error: "Client GSC credentials missing",
          },
        });
        continue;
      }

      const accessToken = await ensureFreshToken(payload, client);

      const discoveredUrls: string[] = audit.discoveredUrls || [];
      const existingResults: InspectionResult[] = audit.inspectionResults || [];
      const inspectedUrls = new Set(existingResults.map((r) => r.url));

      // Find uninspected URLs
      const remaining = discoveredUrls.filter((u) => !inspectedUrls.has(u));
      if (remaining.length === 0) {
        const summaryStats = buildSummaryStats(existingResults);
        await payload.update({
          collection: "gsc-indexing-audits",
          id: audit.id,
          overrideAccess: true,
          data: {
            status: "completed",
            completedAt: new Date().toISOString(),
            summaryStats,
          },
        });
        continue;
      }

      const batch = remaining.slice(0, batchSize);
      const newResults = await inspectUrlBatch(accessToken, client.gscPropertyUrl, batch);

      const allResults = [...existingResults, ...newResults];
      const summaryStats = buildSummaryStats(allResults);
      const isComplete = allResults.length >= discoveredUrls.length;

      await payload.update({
        collection: "gsc-indexing-audits",
        id: audit.id,
        overrideAccess: true,
        data: {
          inspectedCount: allResults.length,
          inspectionResults: allResults,
          summaryStats,
          lastBatchDate: new Date().toISOString(),
          ...(isComplete
            ? { status: "completed", completedAt: new Date().toISOString() }
            : {}),
        },
      });

      console.log(
        `[gsc-indexing] Audit ${audit.id}: inspected ${newResults.length} URLs (${allResults.length}/${discoveredUrls.length} total)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch processing failed";
      console.error(`[gsc-indexing] Audit ${audit.id} batch error:`, message);
      // Don't fail the audit on batch errors — will retry next cron
    }
  }
}
