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
 * Run the heavy audit work (discover URLs + inspect first batch).
 * Called in the background via after() — must not throw to the caller.
 */
export async function runAuditWork(
  payload: any,
  auditId: string,
  client: any
): Promise<void> {
  try {
    const accessToken = await ensureFreshToken(payload, client);

    // Discover URLs
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
      return;
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
    const message = err instanceof Error ? err.message : "Audit failed";
    console.error(`[gsc-indexing] Audit ${auditId} failed:`, message);
    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: {
        status: "failed",
        error: message,
      },
    });
  }
}

/**
 * Start a new indexing audit for a client.
 * Creates the audit record and returns the auditId + client.
 * Caller is responsible for scheduling runAuditWork() via after().
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
    return { auditId: String(activeAudit.docs[0].id), client: null };
  }

  // Create audit record
  const audit = await payload.create({
    collection: "gsc-indexing-audits",
    overrideAccess: true,
    data: {
      client: clientId,
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
 * Finds all audits with status "inspecting" and runs the next batch for each.
 */
export async function processIndexingBatches(payload?: any): Promise<void> {
  if (!payload) {
    const payloadConfig = await config;
    payload = await getPayload({ config: payloadConfig });
  }

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
