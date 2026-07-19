import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { discoverSnapshotWindow } from "./window";
import { cleanupSnapshotEvidenceBlobs, loadPrivateGzipJson, validateBlobMetadata } from "./evidence-storage";
import { SNAPSHOT_DATASET_KEYS, SNAPSHOT_SCHEMA_VERSION, type SnapshotManifestItem } from "./types";
import { GOOGLE_ADS_AUDIT_RUBRIC_VERSION } from "./scoring";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const ACTIVE_SNAPSHOT_TIMEOUT_MS = 30 * 60 * 1_000;
const SNAPSHOT_TIMEOUT_ERROR = "Snapshot timed out, Growth Tools job presumed dead";

function coerceId(value: string | number): string | number {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
}

function relationId(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") return coerceId(value);
  if (value && typeof value === "object" && "id" in value) return coerceId((value as { id: string | number }).id);
  return undefined;
}

function parseList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;]+/) : [];
  const seen = new Set<string>();
  return items.map((item) => String(item).trim()).filter((item) => {
    const key = item.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cmsBaseUrl(): string {
  if (process.env.CMS_BASE_URL) return process.env.CMS_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3004";
}

export async function dispatchSnapshot(payload: Payload, snapshot: any): Promise<{ jobId: string; duplicate: boolean }> {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) throw new Error("Missing GROWTH_TOOLS_URL or INTERNAL_API_KEY");
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || snapshot.rubricVersion !== GOOGLE_ADS_AUDIT_RUBRIC_VERSION) throw new Error("Snapshot schema or rubric does not match the active immutable evidence contract");
  const context = snapshot.captureContext ?? {};
  const response = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/comprehensive-audit-snapshot`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${INTERNAL_API_KEY}` },
    body: JSON.stringify({
      snapshotId: String(snapshot.id),
      customerId: snapshot.customerId,
      requestedAt: snapshot.requestedAt,
      periodStart: String(snapshot.periodStart).slice(0, 10),
      periodEnd: String(snapshot.periodEnd).slice(0, 10),
      earliestAvailableActivityDate: String(snapshot.earliestAvailableActivityDate).slice(0, 10),
      accountTimeZone: snapshot.accountTimeZone,
      accountName: snapshot.accountName,
      currencyCode: snapshot.currencyCode,
      callbackBaseUrl: cmsBaseUrl(),
      callbackToken: INTERNAL_API_KEY,
      schemaVersion: snapshot.schemaVersion,
      rubricVersion: snapshot.rubricVersion,
      websiteUrl: snapshot.websiteUrl,
      businessName: snapshot.businessName ?? context.businessName,
      businessType: snapshot.businessType ?? context.businessType,
      brandTerms: snapshot.brandTerms ?? context.brandTerms,
      conversionObjectives: snapshot.conversionObjectives ?? context.conversionObjectives,
      searchLocation: snapshot.searchLocation ?? context.searchLocation,
      searchLanguage: snapshot.searchLanguage ?? context.searchLanguage,
      competitorSeedQueries: snapshot.competitorSeedQueries ?? context.competitorSeedQueries,
      ...(process.env.GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN ? { storageMode: "private_blob_gzip_v1" } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Growth Tools snapshot dispatch failed (${response.status}): ${await response.text()}`);
  const result = await response.json() as { jobId?: string; duplicate?: boolean };
  if (!result.jobId) throw new Error("Growth Tools snapshot dispatch returned no job ID");
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

async function dispatchWithFailureRecording(payload: Payload, snapshot: any): Promise<void> {
  try {
    await dispatchSnapshot(payload, snapshot);
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await (payload as any).update({
      collection: "google-ads-audit-snapshots", id: snapshot.id,
      data: { status: "failed", progress: 100, error },
      overrideAccess: true, context: { googleAdsSnapshotInternal: true },
    }).catch(() => undefined);
    await (payload as any).update({
      collection: "google-ads-audits", id: relationId(snapshot.audit),
      data: { snapshotState: "failed", auditStatus: "failed", auditProgress: "Dispatch failed|100", auditError: error },
      overrideAccess: true,
    }).catch(() => undefined);
    throw cause;
  }
}

export async function createSnapshotForAudit(payload: Payload, auditId: string | number, options: { requestedAt?: string; allowNew?: boolean; dispatch?: boolean } = {}): Promise<any> {
  const audit = await (payload as any).findByID({ collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true });
  if (!audit?.customerId) throw new Error("Audit has no Google Ads customer ID");
  const clientId = relationId(audit.client);
  if (!clientId) throw new Error("Audit must be linked to a client before a snapshot can be created");
  const client = await (payload as any).findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true });
  const existing = await (payload as any).find({
    collection: "google-ads-audit-snapshots", depth: 0, limit: 1, sort: "-requestedAt",
    where: { audit: { equals: auditId } }, overrideAccess: true,
  });
  let latest = existing.docs?.[0];
  if (latest && ["pending", "running"].includes(latest.status)) {
    const lastActivityAt = Date.parse(latest.updatedAt || latest.requestedAt);
    const isStale = Number.isFinite(lastActivityAt) && Date.now() - lastActivityAt >= ACTIVE_SNAPSHOT_TIMEOUT_MS;
    if (!isStale) return latest;

    latest = await (payload as any).update({
      collection: "google-ads-audit-snapshots", id: latest.id,
      data: { status: "failed", progress: 100, error: SNAPSHOT_TIMEOUT_ERROR },
      overrideAccess: true, context: { googleAdsSnapshotInternal: true },
    });
    await (payload as any).update({
      collection: "google-ads-audits", id: auditId,
      data: { snapshotState: "failed", auditStatus: "failed", auditProgress: "Snapshot timed out|100", auditError: SNAPSHOT_TIMEOUT_ERROR },
      overrideAccess: true,
    });
  }
  if (latest?.status === "completed" && !options.allowNew) return latest;
  if (latest?.status === "failed" && !options.allowNew) {
    await cleanupSnapshotEvidenceBlobs(payload, latest.id);
    await (payload as any).delete({
      collection: "google-ads-audit-snapshot-chunks",
      where: { snapshot: { equals: latest.id } },
      overrideAccess: true,
      context: { googleAdsSnapshotInternal: true },
    });
    const retried = await (payload as any).update({
      collection: "google-ads-audit-snapshots", id: latest.id,
      data: { status: "pending", error: null, growthToolsJobId: null, retryCount: Number(latest.retryCount ?? 0) + 1 },
      overrideAccess: true, context: { googleAdsSnapshotInternal: true },
    });
    if (options.dispatch !== false) await dispatchWithFailureRecording(payload, retried);
    return retried;
  }
  if (latest && !options.allowNew) throw new Error("Creating a newer snapshot requires explicit confirmation");
  const inheritedBrandTerms = parseList(audit.brandTerms).length ? parseList(audit.brandTerms) : parseList(client?.brandKeywords);
  const brandTerms = parseList([...inheritedBrandTerms, audit.businessName]);
  const conversionObjectives = parseList(audit.conversionObjectives);
  const competitorSeedQueries = parseList(audit.competitorSeedQueries).slice(0, 10);
  const frozenContext = {
    websiteUrl: audit.websiteUrl || client?.websiteUrl || undefined,
    businessName: audit.businessName,
    businessType: audit.businessType,
    brandTerms,
    conversionObjectives,
    searchLocation: audit.searchLocation || "au:sydney",
    searchLanguage: audit.searchLanguage || "en",
    competitorSeedQueries,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION as 3,
    rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION,
  };
  const window = await discoverSnapshotWindow(audit.customerId, options.requestedAt, frozenContext);
  let snapshot: any;
  try {
    snapshot = await (payload as any).create({
      collection: "google-ads-audit-snapshots",
      data: {
        audit: coerceId(auditId), client: clientId, proposal: relationId(audit.proposal), customerId: audit.customerId.replace(/-/g, ""),
        ...window, schemaVersion: SNAPSHOT_SCHEMA_VERSION, rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION,
        websiteUrl: frozenContext.websiteUrl, businessName: frozenContext.businessName, businessType: frozenContext.businessType,
        brandTerms: frozenContext.brandTerms, conversionObjectives: frozenContext.conversionObjectives,
        searchLocation: frozenContext.searchLocation, searchLanguage: frozenContext.searchLanguage,
        competitorSeedQueries: frozenContext.competitorSeedQueries, captureContext: frozenContext,
        status: "pending", progress: 0, retryCount: 0,
      },
      overrideAccess: true, context: { googleAdsSnapshotInternal: true },
    });
  } catch (cause) {
    const active = await (payload as any).find({
      collection: "google-ads-audit-snapshots", depth: 0, limit: 1, sort: "-requestedAt", overrideAccess: true,
      where: { and: [{ audit: { equals: auditId } }, { status: { in: ["pending", "running"] } }] },
    });
    if (active.docs?.[0]) return active.docs[0];
    throw cause;
  }
  await (payload as any).update({
    collection: "google-ads-audits", id: auditId,
    data: { snapshot: snapshot.id, snapshotState: "pending", snapshotPeriodStart: window.periodStart, snapshotPeriodEnd: window.periodEnd, auditStatus: "pending", auditProgress: "Snapshot window frozen|0" },
    overrideAccess: true,
  });
  if (options.dispatch !== false) await dispatchWithFailureRecording(payload, snapshot);
  return snapshot;
}

function checksumRows(rows: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export async function ingestSnapshotChunk(payload: Payload, snapshotId: string, input: any): Promise<{ duplicate: boolean }> {
  if (!SNAPSHOT_DATASET_KEYS.includes(input.datasetKey) || !Number.isInteger(input.chunkIndex) || input.chunkIndex < 0 || !Number.isInteger(input.rowCount) || input.rowCount < 0 || !/^[a-f0-9]{64}$/.test(String(input.checksum ?? ""))) throw new Error("Invalid snapshot chunk");
  if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error("Snapshot chunk schema version mismatch");
  const storageMode = input.storageMode ?? "database_json";
  let chunkData: Record<string, unknown>;
  if (storageMode === "database_json") {
    if (!Array.isArray(input.rows) || input.rowCount !== input.rows.length || checksumRows(input.rows) !== input.checksum) throw new Error("Snapshot chunk checksum or row count mismatch");
    chunkData = { storageMode, rows: input.rows };
  } else if (storageMode === "private_blob_gzip_v1") {
    if (input.chunkIndex !== 0 || "rows" in input) throw new Error("Blob-backed datasets require one metadata record without rows");
    const metadata = validateBlobMetadata(input, `google-ads-audits/${snapshotId}/datasets/${input.datasetKey}.json.gz`);
    chunkData = { storageMode, blobUrl: metadata.blobUrl, blobPathname: metadata.blobPathname, encoding: metadata.encoding, compressedBytes: metadata.compressedBytes, uncompressedBytes: metadata.uncompressedBytes };
  } else {
    throw new Error("Unsupported snapshot storage mode");
  }
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true });
  if (snapshot.status !== "running") throw new Error("Snapshot is not accepting chunks");
  if (!snapshot.growthToolsJobId || snapshot.growthToolsJobId !== input.jobId) throw new Error("Snapshot job ID mismatch");
  const identity = `${snapshotId}:${input.datasetKey}:${input.chunkIndex}`;
  const found = await (payload as any).find({ collection: "google-ads-audit-snapshot-chunks", where: { identity: { equals: identity } }, limit: 1, depth: 0, overrideAccess: true });
  if (found.docs?.[0]) {
    const existing = found.docs[0];
    if (existing.checksum !== input.checksum || existing.rowCount !== input.rowCount || (existing.storageMode ?? "database_json") !== storageMode || (storageMode === "private_blob_gzip_v1" && (existing.blobPathname !== input.blobPathname || existing.compressedBytes !== input.compressedBytes || existing.uncompressedBytes !== input.uncompressedBytes))) throw new Error("Conflicting duplicate snapshot chunk");
    return { duplicate: true };
  }
  await (payload as any).create({ collection: "google-ads-audit-snapshot-chunks", data: { identity, snapshot: coerceId(snapshotId), datasetKey: input.datasetKey, chunkIndex: input.chunkIndex, rowCount: input.rowCount, checksum: input.checksum, ...chunkData }, overrideAccess: true, context: { googleAdsSnapshotInternal: true } });
  return { duplicate: false };
}

export async function finalizeSnapshot(payload: Payload, snapshotId: string, input: any): Promise<any> {
  if (!Array.isArray(input.manifest) || !input.analysis) throw new Error("Final manifest and analysis are required");
  if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || input.rubricVersion !== GOOGLE_ADS_AUDIT_RUBRIC_VERSION) throw new Error("Final snapshot schema or rubric version mismatch");
  if (input.analysis?.scoring?.rubricVersion !== GOOGLE_ADS_AUDIT_RUBRIC_VERSION || input.analysis?.scoring?.categories?.length !== 13) throw new Error("Final analysis does not contain the complete active 13-area rubric");
  for (const item of input.manifest as SnapshotManifestItem[]) {
    if (!SNAPSHOT_DATASET_KEYS.includes(item?.datasetKey) || !Number.isInteger(item?.chunkIndex) || item.chunkIndex < 0 || !Number.isInteger(item?.rowCount) || item.rowCount < 0 || !/^[a-f0-9]{64}$/.test(String(item?.checksum ?? ""))) throw new Error("Final manifest contains an invalid item");
  }
  const manifestIdentities = new Set(input.manifest.map((item: SnapshotManifestItem) => `${item.datasetKey}:${item.chunkIndex}`));
  if (manifestIdentities.size !== input.manifest.length) throw new Error("Final manifest contains duplicate chunks");
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true });
  if (input.analysis?.scoring?.rubricVersion && input.analysis.scoring.rubricVersion !== snapshot?.rubricVersion) throw new Error("Analysis rubric version does not match frozen snapshot rubric");
  if (snapshot.status === "completed") return snapshot;
  if (snapshot.status !== "running") throw new Error("Snapshot is not ready to finalize");
  if (!snapshot.growthToolsJobId || snapshot.growthToolsJobId !== input.jobId) throw new Error("Snapshot job ID mismatch");
  const chunks = await (payload as any).find({ collection: "google-ads-audit-snapshot-chunks", where: { snapshot: { equals: coerceId(snapshotId) } }, limit: 10_000, depth: 0, overrideAccess: true });
  const byIdentity = new Map<string, any>(chunks.docs.map((chunk: any) => [`${chunk.datasetKey}:${chunk.chunkIndex}`, chunk]));
  const counts: Record<string, number> = {};
  const storageModes = new Set<string>();
  for (const item of input.manifest as SnapshotManifestItem[]) {
    const chunk = byIdentity.get(`${item.datasetKey}:${item.chunkIndex}`);
    const storageMode = item.storageMode ?? "database_json";
    storageModes.add(storageMode);
    if (!chunk || chunk.checksum !== item.checksum || chunk.rowCount !== item.rowCount || (chunk.storageMode ?? "database_json") !== storageMode) throw new Error(`Manifest verification failed for ${item.datasetKey}:${item.chunkIndex}`);
    if (storageMode === "private_blob_gzip_v1") {
      const metadata = validateBlobMetadata(item, `google-ads-audits/${snapshotId}/datasets/${item.datasetKey}.json.gz`);
      if (chunk.blobPathname !== metadata.blobPathname || chunk.compressedBytes !== metadata.compressedBytes || chunk.uncompressedBytes !== metadata.uncompressedBytes) throw new Error(`Manifest Blob metadata mismatch for ${item.datasetKey}`);
    } else if (storageMode !== "database_json") throw new Error("Final manifest contains an unsupported storage mode");
    counts[item.datasetKey] = (counts[item.datasetKey] ?? 0) + item.rowCount;
  }
  if (storageModes.size !== 1) throw new Error("Final manifest mixes snapshot storage modes");
  for (const key of SNAPSHOT_DATASET_KEYS) if (!input.manifest.some((item: SnapshotManifestItem) => item.datasetKey === key)) throw new Error(`Manifest missing dataset ${key}`);
  if (byIdentity.size !== input.manifest.length) throw new Error("Manifest does not account for every stored chunk");
  let analysisBlobData: Record<string, unknown> = {};
  if (storageModes.has("private_blob_gzip_v1")) {
    if (input.manifest.length !== SNAPSHOT_DATASET_KEYS.length || !input.analysisBlob) throw new Error("Private Blob finalization requires one object per dataset and a full-analysis object");
    for (const item of input.manifest as SnapshotManifestItem[]) {
      const rows = await loadPrivateGzipJson<unknown[]>(validateBlobMetadata(item, `google-ads-audits/${snapshotId}/datasets/${item.datasetKey}.json.gz`));
      if (!Array.isArray(rows) || rows.length !== item.rowCount) throw new Error(`Private evidence row count mismatch for ${item.datasetKey}`);
    }
    const analysisBlob = validateBlobMetadata(input.analysisBlob, `google-ads-audits/${snapshotId}/analysis/full-analysis.json.gz`);
    const fullAnalysis = await loadPrivateGzipJson<Record<string, unknown>>(analysisBlob);
    if (!fullAnalysis || typeof fullAnalysis !== "object" || !(fullAnalysis as any).scoring) throw new Error("Full analysis Blob is invalid");
    analysisBlobData = { analysisBlobUrl: analysisBlob.blobUrl, analysisBlobPathname: analysisBlob.blobPathname, analysisBlobChecksum: analysisBlob.checksum, analysisBlobEncoding: analysisBlob.encoding, analysisBlobCompressedBytes: analysisBlob.compressedBytes, analysisBlobUncompressedBytes: analysisBlob.uncompressedBytes };
  } else if (input.analysisBlob) throw new Error("Legacy database finalization cannot include an analysis Blob");
  const finalizedAt = new Date().toISOString();
  const completed = await (payload as any).update({
    collection: "google-ads-audit-snapshots", id: snapshotId,
    data: { status: "completed", progress: 100, capturedAt: input.capturedAt, finalizedAt, sourceRowCounts: counts, chunkManifest: input.manifest, manifestChecksum: createHash("sha256").update(JSON.stringify(input.manifest)).digest("hex"), analysis: input.analysis, ...analysisBlobData, error: null },
    overrideAccess: true, context: { googleAdsSnapshotInternal: true },
  });
  await (payload as any).update({
    collection: "google-ads-audits", id: relationId(snapshot.audit),
    data: { snapshot: coerceId(snapshotId), snapshotState: "completed", snapshotCapturedAt: input.capturedAt, auditStatus: "completed", auditProgress: "Snapshot complete|100", auditCompletedAt: finalizedAt, overallScore: input.analysis?.scoring?.total, scoreRubricVersion: input.analysis?.scoring?.rubricVersion ?? snapshot.rubricVersion, scoreStatus: input.analysis?.scoring?.total == null ? "insufficient_evidence" : "scored", auditDetailUrl: `/partners/_audit-preview/${snapshot.audit}` },
    overrideAccess: true,
  });
  return completed;
}

export async function failSnapshot(payload: Payload, snapshotId: string, input: any): Promise<any> {
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true });
  if (snapshot.status === "completed") return snapshot;
  if (!input?.jobId || snapshot.growthToolsJobId !== input.jobId) throw new Error("Snapshot job ID mismatch");
  if (snapshot.status === "failed") return snapshot;
  if (snapshot.status !== "running") throw new Error("Snapshot is not running");
  const error = String(input.error || "Growth Tools snapshot capture failed").slice(0, 4_000);
  const failed = await (payload as any).update({
    collection: "google-ads-audit-snapshots", id: snapshotId,
    data: { status: "failed", progress: 100, error },
    overrideAccess: true, context: { googleAdsSnapshotInternal: true },
  });
  await (payload as any).update({
    collection: "google-ads-audits", id: relationId(snapshot.audit),
    data: { snapshotState: "failed", auditStatus: "failed", auditProgress: "Snapshot failed|100", auditError: error },
    overrideAccess: true,
  });
  return failed;
}
