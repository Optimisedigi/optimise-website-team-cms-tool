import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { loadSnapshotDataset } from "@/lib/google-ads-audit-snapshots/evidence-storage";
import { SNAPSHOT_DATASET_KEYS, type SnapshotDatasetKey } from "@/lib/google-ads-audit-snapshots/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; datasetKey: string }> }) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, datasetKey } = await params;
  if (!SNAPSHOT_DATASET_KEYS.includes(datasetKey as SnapshotDatasetKey)) return NextResponse.json({ error: "Unknown snapshot dataset" }, { status: 404 });
  try {
    const rows = await loadSnapshotDataset(payload, id, datasetKey as SnapshotDatasetKey);
    const headers = new Headers({ "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" });
    if (req.nextUrl.searchParams.has("download")) headers.set("content-disposition", `attachment; filename="google-ads-audit-${id}-${datasetKey}.json"`);
    return new NextResponse(JSON.stringify(rows), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot dataset retrieval failed";
    const status = /missing|unknown/i.test(message) ? 404 : /checksum|size|decompression|invalid|mixed|mismatch/i.test(message) ? 422 : 500;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "private, no-store" } });
  }
}
