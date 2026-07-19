import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { del, get } from "@vercel/blob";
import type { Payload } from "payload";
import { SNAPSHOT_DATASET_KEYS, type SnapshotBlobMetadata, type SnapshotDatasetKey } from "./types";

export const MAX_COMPRESSED_EVIDENCE_BYTES = 100 * 1024 * 1024;
export const MAX_UNCOMPRESSED_EVIDENCE_BYTES = 512 * 1024 * 1024;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/;

function evidenceToken(): string {
  const token = process.env.GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Private Google Ads evidence storage is unavailable");
  return token;
}

export function validateBlobMetadata(value: unknown, expectedPathname?: string): SnapshotBlobMetadata {
  if (!value || typeof value !== "object") throw new Error("Private evidence Blob metadata is missing");
  const input = value as Record<string, unknown>;
  const metadata: SnapshotBlobMetadata = {
    storageMode: input.storageMode as "private_blob_gzip_v1",
    blobUrl: String(input.blobUrl ?? ""),
    blobPathname: String(input.blobPathname ?? ""),
    encoding: input.encoding as "gzip",
    checksum: String(input.checksum ?? ""),
    compressedBytes: Number(input.compressedBytes),
    uncompressedBytes: Number(input.uncompressedBytes),
  };
  if (metadata.storageMode !== "private_blob_gzip_v1" || metadata.encoding !== "gzip") throw new Error("Unsupported private evidence storage metadata");
  if (!metadata.blobUrl || !metadata.blobPathname || (expectedPathname && metadata.blobPathname !== expectedPathname)) throw new Error("Private evidence Blob pathname mismatch");
  if (!CHECKSUM_PATTERN.test(metadata.checksum)) throw new Error("Private evidence checksum is invalid");
  if (!Number.isInteger(metadata.compressedBytes) || metadata.compressedBytes < 1 || metadata.compressedBytes > MAX_COMPRESSED_EVIDENCE_BYTES) throw new Error("Private evidence compressed size is invalid");
  if (!Number.isInteger(metadata.uncompressedBytes) || metadata.uncompressedBytes < 1 || metadata.uncompressedBytes > MAX_UNCOMPRESSED_EVIDENCE_BYTES) throw new Error("Private evidence uncompressed size is invalid");
  return metadata;
}

export async function loadPrivateGzipJson<T>(metadataValue: unknown): Promise<T> {
  const metadata = validateBlobMetadata(metadataValue);
  const result = await get(metadata.blobPathname, {
    access: "private",
    token: evidenceToken(),
    useCache: false,
    abortSignal: AbortSignal.timeout(120_000),
  });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error(`Private evidence Blob is missing: ${metadata.blobPathname}`);
  if (result.blob.pathname !== metadata.blobPathname || result.blob.size !== metadata.compressedBytes) throw new Error(`Private evidence Blob size mismatch: ${metadata.blobPathname}`);

  const gunzip = createGunzip();
  Readable.fromWeb(result.stream as any).pipe(gunzip);
  const chunks: Buffer[] = [];
  let uncompressedBytes = 0;
  try {
    for await (const chunk of gunzip) {
      const bytes = Buffer.from(chunk);
      uncompressedBytes += bytes.byteLength;
      if (uncompressedBytes > metadata.uncompressedBytes || uncompressedBytes > MAX_UNCOMPRESSED_EVIDENCE_BYTES) {
        gunzip.destroy(new Error(`Private evidence decompression limit exceeded: ${metadata.blobPathname}`));
        throw new Error(`Private evidence decompression limit exceeded: ${metadata.blobPathname}`);
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof Error && /decompression limit/.test(error.message)) throw error;
    throw new Error(`Private evidence gzip decompression failed: ${metadata.blobPathname}`, { cause: error });
  }
  if (uncompressedBytes !== metadata.uncompressedBytes) throw new Error(`Private evidence uncompressed size mismatch: ${metadata.blobPathname}`);
  const jsonBytes = Buffer.concat(chunks, uncompressedBytes);
  const checksum = createHash("sha256").update(jsonBytes).digest("hex");
  if (checksum !== metadata.checksum) throw new Error(`Private evidence checksum mismatch: ${metadata.blobPathname}`);
  try {
    return JSON.parse(jsonBytes.toString("utf8")) as T;
  } catch (error) {
    throw new Error(`Private evidence JSON is invalid: ${metadata.blobPathname}`, { cause: error });
  }
}

function chunkBlobMetadata(chunk: any): SnapshotBlobMetadata {
  return validateBlobMetadata({
    storageMode: chunk.storageMode,
    blobUrl: chunk.blobUrl,
    blobPathname: chunk.blobPathname,
    encoding: chunk.encoding,
    checksum: chunk.checksum,
    compressedBytes: chunk.compressedBytes,
    uncompressedBytes: chunk.uncompressedBytes,
  }, `google-ads-audits/${typeof chunk.snapshot === "object" ? chunk.snapshot.id : chunk.snapshot}/datasets/${chunk.datasetKey}.json.gz`);
}

export async function loadSnapshotDataset(payload: Payload, snapshotId: string | number, datasetKey: SnapshotDatasetKey): Promise<Record<string, unknown>[]> {
  if (!SNAPSHOT_DATASET_KEYS.includes(datasetKey)) throw new Error(`Unknown snapshot dataset: ${datasetKey}`);
  const result = await (payload as any).find({
    collection: "google-ads-audit-snapshot-chunks",
    where: { and: [{ snapshot: { equals: snapshotId } }, { datasetKey: { equals: datasetKey } }] },
    sort: "chunkIndex",
    limit: 10_000,
    depth: 0,
    overrideAccess: true,
  });
  const chunks = [...(result.docs ?? [])].sort((left: any, right: any) => Number(left.chunkIndex) - Number(right.chunkIndex));
  if (!chunks.length) throw new Error(`Snapshot dataset is missing: ${datasetKey}`);
  const storageModes = new Set(chunks.map((chunk: any) => chunk.storageMode ?? "database_json"));
  if (storageModes.size !== 1) throw new Error(`Snapshot dataset has mixed storage modes: ${datasetKey}`);
  if (storageModes.has("private_blob_gzip_v1")) {
    if (chunks.length !== 1 || Number(chunks[0].chunkIndex) !== 0) throw new Error(`Blob-backed dataset must have one metadata record: ${datasetKey}`);
    const rows = await loadPrivateGzipJson<unknown>(chunkBlobMetadata(chunks[0]));
    if (!Array.isArray(rows) || rows.length !== chunks[0].rowCount) throw new Error(`Private evidence row count mismatch: ${datasetKey}`);
    return rows as Record<string, unknown>[];
  }

  const rows: Record<string, unknown>[] = [];
  chunks.forEach((chunk: any, index: number) => {
    if (Number(chunk.chunkIndex) !== index || !Array.isArray(chunk.rows) || chunk.rows.length !== chunk.rowCount) throw new Error(`Legacy snapshot chunk is invalid: ${datasetKey}:${chunk.chunkIndex}`);
    const checksum = createHash("sha256").update(JSON.stringify(chunk.rows)).digest("hex");
    if (checksum !== chunk.checksum) throw new Error(`Legacy snapshot chunk checksum mismatch: ${datasetKey}:${chunk.chunkIndex}`);
    rows.push(...chunk.rows);
  });
  return rows;
}

export async function loadFullSnapshotAnalysis(payload: Payload, snapshotId: string | number): Promise<Record<string, unknown>> {
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true });
  if (!snapshot.analysisBlobPathname) return snapshot.analysis as Record<string, unknown>;
  return loadPrivateGzipJson<Record<string, unknown>>(validateBlobMetadata({
    storageMode: "private_blob_gzip_v1",
    blobUrl: snapshot.analysisBlobUrl,
    blobPathname: snapshot.analysisBlobPathname,
    encoding: snapshot.analysisBlobEncoding,
    checksum: snapshot.analysisBlobChecksum,
    compressedBytes: snapshot.analysisBlobCompressedBytes,
    uncompressedBytes: snapshot.analysisBlobUncompressedBytes,
  }, `google-ads-audits/${snapshotId}/analysis/full-analysis.json.gz`));
}

export async function cleanupSnapshotEvidenceBlobs(payload: Payload, snapshotId: string | number): Promise<number> {
  if (!process.env.GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN) return 0;
  const [snapshot, chunks] = await Promise.all([
    (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true }),
    (payload as any).find({ collection: "google-ads-audit-snapshot-chunks", where: { snapshot: { equals: snapshotId } }, limit: 10_000, depth: 0, overrideAccess: true }),
  ]);
  const pathnames = new Set<string>([
    snapshot?.analysisBlobPathname,
    ...(chunks.docs ?? []).map((chunk: any) => chunk.blobPathname),
  ].filter((value): value is string => typeof value === "string" && value.startsWith(`google-ads-audits/${snapshotId}/`)));
  if (!pathnames.size) return 0;
  await del([...pathnames], { token: evidenceToken() });
  return pathnames.size;
}
