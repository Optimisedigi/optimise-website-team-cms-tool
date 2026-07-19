import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { SNAPSHOT_DATASET_KEYS } from "@/lib/google-ads-audit-snapshots/types";

const MAX_EVIDENCE_BLOB_BYTES = 100 * 1024 * 1024;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/;

function expectedEvidencePath(snapshotId: string, pathname: string): boolean {
  if (pathname === `google-ads-audits/${snapshotId}/analysis/full-analysis.json.gz`) return true;
  return SNAPSHOT_DATASET_KEYS.some((datasetKey) => pathname === `google-ads-audits/${snapshotId}/datasets/${datasetKey}.json.gz`);
}

function parseClientPayload(value: string | null): { checksum: string; compressedBytes: number; uncompressedBytes: number } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(value ?? "") as Record<string, unknown>;
  } catch {
    throw new Error("Evidence upload metadata is invalid");
  }
  const checksum = String(parsed.checksum ?? "");
  const compressedBytes = Number(parsed.compressedBytes);
  const uncompressedBytes = Number(parsed.uncompressedBytes);
  if (!CHECKSUM_PATTERN.test(checksum) || !Number.isInteger(compressedBytes) || compressedBytes < 1 || compressedBytes > MAX_EVIDENCE_BLOB_BYTES || !Number.isInteger(uncompressedBytes) || uncompressedBytes < 1) {
    throw new Error("Evidence upload metadata is invalid");
  }
  return { checksum, compressedBytes, uncompressedBytes };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const internalKey = req.headers.get("authorization")?.split(/\s+/).at(-1);
  if (!process.env.INTERNAL_API_KEY || internalKey !== process.env.INTERNAL_API_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const evidenceToken = process.env.GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!evidenceToken) return NextResponse.json({ error: "Private evidence storage is unavailable" }, { status: 503 });

  try {
    const { id } = await params;
    const jobId = req.headers.get("x-snapshot-job-id");
    const payload = await getPayload({ config: await config });
    const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id, depth: 0, overrideAccess: true });
    if (snapshot.status !== "running" || !jobId || snapshot.growthToolsJobId !== jobId) {
      return NextResponse.json({ error: "Snapshot is not accepting evidence uploads" }, { status: 409 });
    }

    const body = await req.json() as HandleUploadBody;
    const result = await handleUpload({
      token: evidenceToken,
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!expectedEvidencePath(id, pathname)) throw new Error("Evidence upload pathname is not allowed");
        const metadata = parseClientPayload(clientPayload);
        return {
          allowedContentTypes: ["application/gzip"],
          maximumSizeInBytes: Math.min(metadata.compressedBytes, MAX_EVIDENCE_BLOB_BYTES),
          validUntil: Date.now() + 5 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ snapshotId: id, jobId, pathname, ...metadata }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evidence upload authorization failed";
    return NextResponse.json({ error: message }, { status: /pathname|metadata/i.test(message) ? 400 : 500 });
  }
}
