import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { put } from "@vercel/blob";
import { getPayload } from "payload";
import config from "@/payload.config";
import { loadPrivateGzipJson, loadSnapshotDataset } from "@/lib/google-ads-audit-snapshots/evidence-storage";
import { SNAPSHOT_DATASET_KEYS, type SnapshotBlobMetadata } from "@/lib/google-ads-audit-snapshots/types";

interface BackfillOptions { snapshotId: string; apply: boolean; clearLegacyRows: boolean }

export function optionsFromArgs(args: string[]): BackfillOptions {
  const snapshotIndex = args.indexOf("--snapshot-id");
  const snapshotId = snapshotIndex >= 0 ? args[snapshotIndex + 1] : "7";
  if (!snapshotId) throw new Error("--snapshot-id requires a value");
  const apply = args.includes("--apply");
  const clearLegacyRows = args.includes("--clear-legacy-rows");
  if (clearLegacyRows && !apply) throw new Error("--clear-legacy-rows requires --apply");
  return { snapshotId, apply, clearLegacyRows };
}

function compress(value: unknown) {
  const json = Buffer.from(JSON.stringify(value));
  const compressed = gzipSync(json, { level: 9 });
  return { json, compressed, checksum: createHash("sha256").update(json).digest("hex") };
}

function compactAnalysis(analysis: Record<string, any>): Record<string, any> {
  const classified = Array.isArray(analysis.searchTerms?.classified) ? [...analysis.searchTerms.classified] : [];
  const bounded = classified.sort((left, right) => Number(right?.spend ?? 0) - Number(left?.spend ?? 0)).slice(0, 250);
  return { ...analysis, searchTerms: { ...analysis.searchTerms, classified: bounded, classifiedTotalCount: classified.length, classifiedRowsTruncated: classified.length > bounded.length } };
}

async function uploadAndVerify(pathname: string, value: unknown, token: string): Promise<SnapshotBlobMetadata> {
  const encoded = compress(value);
  const blob = await put(pathname, encoded.compressed, { access: "private", contentType: "application/gzip", addRandomSuffix: false, allowOverwrite: true, token });
  const metadata: SnapshotBlobMetadata = {
    storageMode: "private_blob_gzip_v1", blobUrl: blob.url, blobPathname: blob.pathname, encoding: "gzip", checksum: encoded.checksum,
    compressedBytes: encoded.compressed.length, uncompressedBytes: encoded.json.length,
  };
  const verified = await loadPrivateGzipJson<unknown>(metadata);
  if (JSON.stringify(verified) !== encoded.json.toString("utf8")) throw new Error(`Round-trip JSON mismatch: ${pathname}`);
  return metadata;
}

export async function backfillGoogleAdsAuditEvidence(options: BackfillOptions) {
  const token = process.env.GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN;
  if (options.apply && !token) throw new Error("GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN is required with --apply");
  const payload = await getPayload({ config: await config });
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: options.snapshotId, depth: 0, overrideAccess: true });
  if (snapshot.status !== "completed") throw new Error(`Snapshot ${options.snapshotId} is not completed`);
  const datasets = new Map<string, Record<string, unknown>[]>();
  let logicalBytes = 0;
  let estimatedCompressedBytes = 0;
  for (const datasetKey of SNAPSHOT_DATASET_KEYS) {
    const rows = await loadSnapshotDataset(payload, options.snapshotId, datasetKey);
    datasets.set(datasetKey, rows);
    const encoded = compress(rows);
    logicalBytes += encoded.json.length;
    estimatedCompressedBytes += encoded.compressed.length;
  }
  const fullAnalysis = snapshot.analysis as Record<string, any>;
  const encodedAnalysis = compress(fullAnalysis);
  logicalBytes += encodedAnalysis.json.length;
  estimatedCompressedBytes += encodedAnalysis.compressed.length;
  const report: Record<string, unknown> = { snapshotId: options.snapshotId, mode: options.apply ? options.clearLegacyRows ? "apply-and-clear" : "copy-and-verify" : "dry-run", datasetCount: datasets.size, logicalBytes, estimatedCompressedBytes, compressionRatio: Number((estimatedCompressedBytes / Math.max(1, logicalBytes)).toFixed(4)) };
  if (!options.apply) return report;

  const metadata = new Map<string, SnapshotBlobMetadata>();
  for (const [datasetKey, rows] of datasets) metadata.set(datasetKey, await uploadAndVerify(`google-ads-audits/${options.snapshotId}/datasets/${datasetKey}.json.gz`, rows, token!));
  const analysisMetadata = await uploadAndVerify(`google-ads-audits/${options.snapshotId}/analysis/full-analysis.json.gz`, fullAnalysis, token!);
  await (payload as any).update({
    collection: "google-ads-audit-snapshots", id: options.snapshotId, overrideAccess: true, context: { googleAdsSnapshotInternal: true },
    data: { analysis: compactAnalysis(fullAnalysis), analysisBlobUrl: analysisMetadata.blobUrl, analysisBlobPathname: analysisMetadata.blobPathname, analysisBlobChecksum: analysisMetadata.checksum, analysisBlobEncoding: analysisMetadata.encoding, analysisBlobCompressedBytes: analysisMetadata.compressedBytes, analysisBlobUncompressedBytes: analysisMetadata.uncompressedBytes },
  });
  if (!options.clearLegacyRows) return { ...report, verifiedObjects: metadata.size + 1, legacyRowsCleared: false };

  for (const datasetKey of SNAPSHOT_DATASET_KEYS) {
    const found = await (payload as any).find({ collection: "google-ads-audit-snapshot-chunks", where: { and: [{ snapshot: { equals: options.snapshotId } }, { datasetKey: { equals: datasetKey } }] }, sort: "chunkIndex", limit: 10_000, depth: 0, overrideAccess: true });
    const chunks = [...found.docs].sort((left: any, right: any) => Number(left.chunkIndex) - Number(right.chunkIndex));
    if (!chunks.length || Number(chunks[0].chunkIndex) !== 0) throw new Error(`Legacy chunks missing for ${datasetKey}`);
    const blob = metadata.get(datasetKey)!;
    await (payload as any).update({ collection: "google-ads-audit-snapshot-chunks", id: chunks[0].id, overrideAccess: true, context: { googleAdsSnapshotInternal: true }, data: { rowCount: datasets.get(datasetKey)!.length, checksum: blob.checksum, storageMode: blob.storageMode, rows: null, blobUrl: blob.blobUrl, blobPathname: blob.blobPathname, encoding: blob.encoding, compressedBytes: blob.compressedBytes, uncompressedBytes: blob.uncompressedBytes } });
    for (const chunk of chunks.slice(1)) await (payload as any).delete({ collection: "google-ads-audit-snapshot-chunks", id: chunk.id, overrideAccess: true, context: { googleAdsSnapshotInternal: true } });
  }
  return { ...report, verifiedObjects: metadata.size + 1, legacyRowsCleared: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  backfillGoogleAdsAuditEvidence(optionsFromArgs(process.argv.slice(2)))
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
