import { getPayload } from "payload";
import config from "@/payload.config";
import {
  refreshAccessToken,
  discoverAllUrls,
  inspectUrlBatch,
  type InspectionResult,
} from "./gsc-service";

/** Fetch states that indicate an indexed page is problematic */
const PROBLEMATIC_FETCH_STATES = new Set([
  "NOT_FOUND",
  "SOFT_404",
  "SERVER_ERROR",
  "REDIRECT_ERROR",
  "ACCESS_DENIED",
  "ACCESS_FORBIDDEN",
  "BLOCKED_4XX",
  "BLOCKED_ROBOTS_TXT",
]);

/**
 * Build summary stats from inspection results.
 * Separates truly healthy indexed pages from indexed pages with problematic fetch states.
 */
function buildSummaryStats(results: InspectionResult[]) {
  let indexed = 0;
  let indexedProblematic = 0;
  let notIndexed = 0;
  const byReason: Record<string, number> = {};
  const byFetchIssue: Record<string, number> = {};

  for (const r of results) {
    if (r.coverageState === "inspection_failed") continue;

    if (r.coverageState === "Submitted and indexed") {
      if (r.pageFetchState && PROBLEMATIC_FETCH_STATES.has(r.pageFetchState)) {
        indexedProblematic++;
        byFetchIssue[r.pageFetchState] = (byFetchIssue[r.pageFetchState] || 0) + 1;
      } else {
        indexed++;
      }
    } else {
      notIndexed++;
      const reason = r.coverageState || "Unknown";
      byReason[reason] = (byReason[reason] || 0) + 1;
    }
  }

  return { indexed, indexedProblematic, notIndexed, byReason, byFetchIssue };
}

/**
 * Refresh the client's GSC access token if needed.
 * Returns the current (or refreshed) access token.
 * Uses a direct SQL UPDATE to save the token — Payload's update() generates
 * a full upsert with all 88+ columns which is too slow on Turso.
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

    // Direct SQL update for just the token fields — avoids Payload's full 88-column upsert
    const dbClient = (payload.db as any).client;
    if (dbClient) {
      await dbClient.execute({
        sql: "UPDATE clients SET gsc_access_token = ?, gsc_token_expiry = ?, updated_at = ? WHERE id = ?",
        args: [refreshed.accessToken, refreshed.expiry, new Date().toISOString(), client.id],
      });
    } else {
      // Fallback to Payload update if raw client not available
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

    const dbClient = (payload.db as any).client;
    const now = new Date().toISOString();
    const numId = Number(auditId);

    if (urls.length === 0) {
      if (dbClient) {
        await dbClient.execute({
          sql: `UPDATE gsc_indexing_audits SET status = 'completed', total_urls = 0, discovered_urls = '[]', url_sources = ?, inspection_results = '[]', summary_stats = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
          args: [JSON.stringify(sources), JSON.stringify({ indexed: 0, notIndexed: 0, byReason: {} }), now, now, numId],
        });
      } else {
        await payload.update({ collection: "gsc-indexing-audits", id: auditId, overrideAccess: true, data: { status: "completed", totalUrls: 0, discoveredUrls: [], urlSources: sources, inspectionResults: [], summaryStats: { indexed: 0, notIndexed: 0, byReason: {} }, completedAt: now } });
      }
      return null;
    }

    if (dbClient) {
      await dbClient.execute({
        sql: `UPDATE gsc_indexing_audits SET status = 'inspecting', total_urls = ?, discovered_urls = ?, url_sources = ?, updated_at = ? WHERE id = ?`,
        args: [urls.length, JSON.stringify(urls), JSON.stringify(sources), now, numId],
      });
    } else {
      await payload.update({ collection: "gsc-indexing-audits", id: auditId, overrideAccess: true, data: { status: "inspecting", totalUrls: urls.length, discoveredUrls: urls, urlSources: sources } });
    }

    return { urls, accessToken };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    console.error(`[gsc-indexing] Discovery ${auditId} failed:`, message);
    const dbClient = (payload.db as any).client;
    if (dbClient) {
      await dbClient.execute({
        sql: `UPDATE gsc_indexing_audits SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
        args: [message, new Date().toISOString(), Number(auditId)],
      }).catch(() => {});
    } else {
      await payload.update({ collection: "gsc-indexing-audits", id: auditId, overrideAccess: true, data: { status: "failed", error: message } }).catch(() => {});
    }
    return null;
  }
}

/**
 * Save current inspection progress to the database.
 * Called after each sub-batch so partial results survive timeouts.
 * Uses direct SQL to avoid Payload's heavy upsert on the audit table.
 */
async function saveInspectionProgress(
  payload: any,
  auditId: string,
  results: InspectionResult[],
  totalUrls: number,
): Promise<void> {
  const summaryStats = buildSummaryStats(results);
  const isComplete = results.length >= totalUrls;
  const now = new Date().toISOString();

  const dbClient = (payload.db as any).client;
  if (dbClient) {
    if (isComplete) {
      await dbClient.execute({
        sql: `UPDATE gsc_indexing_audits SET inspected_count = ?, inspection_results = ?, summary_stats = ?, last_batch_date = ?, status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`,
        args: [results.length, JSON.stringify(results), JSON.stringify(summaryStats), now, now, now, Number(auditId)],
      });
    } else {
      await dbClient.execute({
        sql: `UPDATE gsc_indexing_audits SET inspected_count = ?, inspection_results = ?, summary_stats = ?, last_batch_date = ?, updated_at = ? WHERE id = ?`,
        args: [results.length, JSON.stringify(results), JSON.stringify(summaryStats), now, now, Number(auditId)],
      });
    }
  } else {
    // Fallback to Payload update
    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: {
        inspectedCount: results.length,
        inspectionResults: results,
        summaryStats,
        lastBatchDate: now,
        ...(isComplete
          ? { status: "completed", completedAt: now }
          : {}),
      },
    });
  }
}

/** Sub-batch size: save progress to DB every N URLs */
const SUB_BATCH_SIZE = 25;

/**
 * Run the inspection phase: inspect URLs in small sub-batches, saving
 * progress after each one so partial results survive Vercel timeouts.
 * Caps at 100 URLs per invocation to stay well within the 120s limit.
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

    // Cap first run at 100 URLs (~70s at 700ms/URL) to fit in 120s timeout
    const firstBatch = urls.slice(0, 100);
    const allResults: InspectionResult[] = [];

    // Process in sub-batches of 25, saving after each
    for (let i = 0; i < firstBatch.length; i += SUB_BATCH_SIZE) {
      const subBatch = firstBatch.slice(i, i + SUB_BATCH_SIZE);
      const subResults = await inspectUrlBatch(accessToken!, client.gscPropertyUrl, subBatch);
      allResults.push(...subResults);

      // Save progress after each sub-batch
      await saveInspectionProgress(payload, auditId, allResults, urls.length);
      console.log(`[gsc-indexing] Audit ${auditId}: saved ${allResults.length}/${urls.length} (sub-batch ${Math.floor(i / SUB_BATCH_SIZE) + 1})`);

      // If rate-limited (inspectUrlBatch returns fewer than requested), stop
      if (subResults.length < subBatch.length) {
        console.log(`[gsc-indexing] Audit ${auditId}: rate limited, stopping early`);
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inspection failed";
    console.error(`[gsc-indexing] Inspection ${auditId} failed:`, message);
    const dbClient = (payload.db as any).client;
    const errorMsg = `Inspection interrupted: ${message}. Remaining URLs will be processed by cron.`;
    if (dbClient) {
      await dbClient.execute({
        sql: `UPDATE gsc_indexing_audits SET error = ?, last_batch_date = ?, updated_at = ? WHERE id = ?`,
        args: [errorMsg, new Date().toISOString(), new Date().toISOString(), Number(auditId)],
      }).catch(() => {});
    } else {
      await payload.update({ collection: "gsc-indexing-audits", id: auditId, overrideAccess: true, data: { error: errorMsg, lastBatchDate: new Date().toISOString() } }).catch(() => {});
    }
  }
}

/**
 * Run a single inspection batch for an audit. Called from the /inspect endpoint.
 * Returns a result object with status, counts, and any error message.
 * Does NOT swallow errors — the caller gets full visibility.
 */
export async function runInspectionBatch(
  payload: any,
  auditId: string
): Promise<{
  ok: boolean;
  status: string;
  inspectedCount: number;
  totalUrls: number;
  error?: string;
}> {
  const audit = await payload.findByID({
    collection: "gsc-indexing-audits",
    id: auditId,
    overrideAccess: true,
  });

  if (audit.status !== "inspecting") {
    return {
      ok: true,
      status: audit.status,
      inspectedCount: audit.inspectedCount || 0,
      totalUrls: audit.totalUrls || 0,
      error: audit.error || undefined,
    };
  }

  const discoveredUrls: string[] = (audit.discoveredUrls as string[]) || [];
  const existingResults: InspectionResult[] = (audit.inspectionResults as InspectionResult[]) || [];
  const inspectedUrls = new Set(existingResults.map((r) => r.url));
  const remaining = discoveredUrls.filter((u) => !inspectedUrls.has(u));

  if (remaining.length === 0) {
    const summaryStats = buildSummaryStats(existingResults);
    await payload.update({
      collection: "gsc-indexing-audits",
      id: auditId,
      overrideAccess: true,
      data: {
        status: "completed",
        completedAt: new Date().toISOString(),
        summaryStats,
      },
    });
    return {
      ok: true,
      status: "completed",
      inspectedCount: existingResults.length,
      totalUrls: discoveredUrls.length,
    };
  }

  // Get client and fresh token
  const clientId = typeof audit.client === "object" ? (audit.client as any).id : audit.client;
  let client;
  try {
    client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load client";
    return { ok: false, status: "inspecting", inspectedCount: existingResults.length, totalUrls: discoveredUrls.length, error: `Client load failed: ${msg}` };
  }

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(payload, client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token refresh failed";
    return { ok: false, status: "inspecting", inspectedCount: existingResults.length, totalUrls: discoveredUrls.length, error: `Token refresh failed: ${msg}` };
  }

  // Inspect 25 URLs per call — fits comfortably in Vercel Pro's 300s limit
  const BATCH_CAP = 25;
  const batch = remaining.slice(0, BATCH_CAP);
  const allResults = [...existingResults];
  let batchError: string | undefined;

  for (let i = 0; i < batch.length; i += SUB_BATCH_SIZE) {
    const subBatch = batch.slice(i, i + SUB_BATCH_SIZE);
    try {
      const subResults = await inspectUrlBatch(accessToken, client.gscPropertyUrl, subBatch);
      allResults.push(...subResults);
      await saveInspectionProgress(payload, auditId, allResults, discoveredUrls.length);
      console.log(`[gsc-indexing] Audit ${auditId}: ${allResults.length}/${discoveredUrls.length} inspected`);

      if (subResults.length < subBatch.length) {
        batchError = "Rate limited by Google API, will continue on next poll";
        break;
      }
    } catch (err) {
      batchError = err instanceof Error ? err.message : "Inspection sub-batch failed";
      console.error(`[gsc-indexing] Audit ${auditId} sub-batch error:`, batchError);
      break;
    }
  }

  // Re-fetch to get the saved state
  const updated = await payload.findByID({
    collection: "gsc-indexing-audits",
    id: auditId,
    overrideAccess: true,
  });

  return {
    ok: !batchError,
    status: updated.status,
    inspectedCount: updated.inspectedCount || 0,
    totalUrls: updated.totalUrls || 0,
    error: batchError,
  };
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
      const dbClient = (payload.db as any).client;
      if (dbClient) {
        await dbClient.execute({
          sql: `UPDATE gsc_indexing_audits SET status = 'failed', error = 'Timed out (stuck for over 5 minutes)', updated_at = ? WHERE id = ?`,
          args: [new Date().toISOString(), Number(existing.id)],
        });
      } else {
        await payload.update({ collection: "gsc-indexing-audits", id: existing.id, overrideAccess: true, data: { status: "failed", error: "Timed out (stuck for over 5 minutes)" } });
      }
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
      const allResults = [...existingResults];

      // Process in sub-batches, saving after each
      for (let i = 0; i < batch.length; i += SUB_BATCH_SIZE) {
        const subBatch = batch.slice(i, i + SUB_BATCH_SIZE);
        const subResults = await inspectUrlBatch(accessToken, client.gscPropertyUrl, subBatch);
        allResults.push(...subResults);

        await saveInspectionProgress(payload, String(audit.id), allResults, discoveredUrls.length);

        if (subResults.length < subBatch.length) break; // rate limited
      }

      console.log(
        `[gsc-indexing] Audit ${audit.id}: inspected ${allResults.length - existingResults.length} URLs (${allResults.length}/${discoveredUrls.length} total)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch processing failed";
      console.error(`[gsc-indexing] Audit ${audit.id} batch error:`, message);
      // Don't fail the audit on batch errors — will retry next cron
    }
  }
}
