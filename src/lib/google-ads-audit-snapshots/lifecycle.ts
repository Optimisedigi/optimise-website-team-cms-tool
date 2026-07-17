import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { discoverSnapshotWindow } from "./window";
import { SNAPSHOT_DATASET_KEYS, SNAPSHOT_SCHEMA_VERSION, type SnapshotManifestItem } from "./types";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function relationId(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "id" in value) return (value as { id: string | number }).id;
  return undefined;
}

function cmsBaseUrl(): string {
  if (process.env.CMS_BASE_URL) return process.env.CMS_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3004";
}

export async function dispatchSnapshot(payload: Payload, snapshot: any): Promise<{ jobId: string; duplicate: boolean }> {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) throw new Error("Missing GROWTH_TOOLS_URL or INTERNAL_API_KEY");
  const response = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/comprehensive-audit-snapshot`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-key": INTERNAL_API_KEY },
    body: JSON.stringify({
      snapshotId: String(snapshot.id),
      customerId: snapshot.customerId,
      requestedAt: snapshot.requestedAt,
      periodStart: String(snapshot.periodStart).slice(0, 10),
      periodEnd: String(snapshot.periodEnd).slice(0, 10),
      earliestAvailableActivityDate: String(snapshot.earliestAvailableActivityDate).slice(0, 10),
      accountTimeZone: snapshot.accountTimeZone,
      currencyCode: snapshot.currencyCode,
      callbackBaseUrl: cmsBaseUrl(),
      callbackToken: INTERNAL_API_KEY,
      schemaVersion: snapshot.schemaVersion,
    }),
  });
  if (!response.ok) throw new Error(`Growth Tools snapshot dispatch failed (${response.status}): ${await response.text()}`);
  const result = await response.json() as { jobId: string; duplicate?: boolean };
  await (payload as any).update({
    collection: "google-ads-audit-snapshots", id: snapshot.id,
    data: { status: "running", progress: 1, growthToolsJobId: result.jobId, error: null },
    overrideAccess: true, context: { googleAdsSnapshotInternal: true },
  });
  await (payload as any).update({
    collection: "google-ads-audits", id: relationId(snapshot.audit),
    data: { snapshotState: "running", auditStatus: "running", auditProgress: "Capturing immutable Google Ads evidence|1", auditError: null },
    overrideAccess: true,
  });
  return { jobId: result.jobId, duplicate: Boolean(result.duplicate) };
}

export async function createSnapshotForAudit(payload: Payload, auditId: string | number, options: { requestedAt?: string; allowNew?: boolean; dispatch?: boolean } = {}): Promise<any> {
  const audit = await (payload as any).findByID({ collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true });
  if (!audit?.customerId) throw new Error("Audit has no Google Ads customer ID");
  const clientId = relationId(audit.client);
  if (!clientId) throw new Error("Audit must be linked to a client before a snapshot can be created");
  const existing = await (payload as any).find({
    collection: "google-ads-audit-snapshots", depth: 0, limit: 1, sort: "-requestedAt",
    where: { audit: { equals: auditId } }, overrideAccess: true,
  });
  const latest = existing.docs?.[0];
  if (latest && ["pending", "running", "completed"].includes(latest.status) && !options.allowNew) return latest;
  if (latest?.status === "failed" && !options.allowNew) {
    const retried = await (payload as any).update({
      collection: "google-ads-audit-snapshots", id: latest.id,
      data: { status: "pending", error: null, retryCount: Number(latest.retryCount ?? 0) + 1 },
      overrideAccess: true, context: { googleAdsSnapshotInternal: true },
    });
    if (options.dispatch !== false) await dispatchSnapshot(payload, retried);
    return retried;
  }
  if (latest && !options.allowNew) throw new Error("Creating a newer snapshot requires explicit confirmation");
  const window = await discoverSnapshotWindow(audit.customerId, options.requestedAt);
  const snapshot = await (payload as any).create({
    collection: "google-ads-audit-snapshots",
    data: {
      audit: auditId, client: clientId, proposal: relationId(audit.proposal), customerId: audit.customerId.replace(/-/g, ""),
      ...window, schemaVersion: SNAPSHOT_SCHEMA_VERSION, status: "pending", progress: 0, retryCount: 0,
    },
    overrideAccess: true, context: { googleAdsSnapshotInternal: true },
  });
  await (payload as any).update({
    collection: "google-ads-audits", id: auditId,
    data: { snapshot: snapshot.id, snapshotState: "pending", snapshotPeriodStart: window.periodStart, snapshotPeriodEnd: window.periodEnd, auditStatus: "pending", auditProgress: "Snapshot window frozen|0" },
    overrideAccess: true,
  });
  if (options.dispatch !== false) await dispatchSnapshot(payload, snapshot);
  return snapshot;
}

function checksumRows(rows: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export async function ingestSnapshotChunk(payload: Payload, snapshotId: string, input: any): Promise<{ duplicate: boolean }> {
  if (!SNAPSHOT_DATASET_KEYS.includes(input.datasetKey) || !Number.isInteger(input.chunkIndex) || input.chunkIndex < 0 || !Array.isArray(input.rows)) throw new Error("Invalid snapshot chunk");
  if (input.rowCount !== input.rows.length || checksumRows(input.rows) !== input.checksum) throw new Error("Snapshot chunk checksum or row count mismatch");
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true });
  if (snapshot.status === "completed") throw new Error("Completed snapshot is immutable");
  if (snapshot.growthToolsJobId && snapshot.growthToolsJobId !== input.jobId) throw new Error("Snapshot job ID mismatch");
  const identity = `${snapshotId}:${input.datasetKey}:${input.chunkIndex}`;
  const found = await (payload as any).find({ collection: "google-ads-audit-snapshot-chunks", where: { identity: { equals: identity } }, limit: 1, depth: 0, overrideAccess: true });
  if (found.docs?.[0]) {
    if (found.docs[0].checksum !== input.checksum || found.docs[0].rowCount !== input.rowCount) throw new Error("Conflicting duplicate snapshot chunk");
    return { duplicate: true };
  }
  await (payload as any).create({ collection: "google-ads-audit-snapshot-chunks", data: { identity, snapshot: snapshotId, datasetKey: input.datasetKey, chunkIndex: input.chunkIndex, rowCount: input.rowCount, checksum: input.checksum, rows: input.rows }, overrideAccess: true, context: { googleAdsSnapshotInternal: true } });
  return { duplicate: false };
}

export async function finalizeSnapshot(payload: Payload, snapshotId: string, input: any): Promise<any> {
  if (!Array.isArray(input.manifest) || !input.analysis) throw new Error("Final manifest and analysis are required");
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true });
  if (snapshot.status === "completed") return snapshot;
  if (snapshot.growthToolsJobId !== input.jobId) throw new Error("Snapshot job ID mismatch");
  const chunks = await (payload as any).find({ collection: "google-ads-audit-snapshot-chunks", where: { snapshot: { equals: snapshotId } }, limit: 10_000, depth: 0, overrideAccess: true });
  const byIdentity = new Map<string, any>(chunks.docs.map((chunk: any) => [`${chunk.datasetKey}:${chunk.chunkIndex}`, chunk]));
  const counts: Record<string, number> = {};
  for (const item of input.manifest as SnapshotManifestItem[]) {
    const chunk = byIdentity.get(`${item.datasetKey}:${item.chunkIndex}`);
    if (!chunk || chunk.checksum !== item.checksum || chunk.rowCount !== item.rowCount) throw new Error(`Manifest verification failed for ${item.datasetKey}:${item.chunkIndex}`);
    counts[item.datasetKey] = (counts[item.datasetKey] ?? 0) + item.rowCount;
  }
  for (const key of SNAPSHOT_DATASET_KEYS) if (!input.manifest.some((item: SnapshotManifestItem) => item.datasetKey === key)) throw new Error(`Manifest missing dataset ${key}`);
  if (byIdentity.size !== input.manifest.length) throw new Error("Manifest does not account for every stored chunk");
  const finalizedAt = new Date().toISOString();
  const completed = await (payload as any).update({
    collection: "google-ads-audit-snapshots", id: snapshotId,
    data: { status: "completed", progress: 100, capturedAt: input.capturedAt, finalizedAt, sourceRowCounts: counts, chunkManifest: input.manifest, manifestChecksum: createHash("sha256").update(JSON.stringify(input.manifest)).digest("hex"), analysis: input.analysis, error: null },
    overrideAccess: true, context: { googleAdsSnapshotInternal: true },
  });
  await (payload as any).update({
    collection: "google-ads-audits", id: relationId(snapshot.audit),
    data: { snapshot: snapshotId, snapshotState: "completed", snapshotCapturedAt: input.capturedAt, auditStatus: "completed", auditProgress: "Snapshot complete|100", auditCompletedAt: finalizedAt, overallScore: input.analysis?.scoring?.total },
    overrideAccess: true,
  });
  return completed;
}
