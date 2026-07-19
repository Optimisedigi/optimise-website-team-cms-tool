import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.INTERNAL_API_KEY || req.headers.get("x-internal-key") !== process.env.INTERNAL_API_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Blob storage is unavailable" }, { status: 503 });
  const { id } = await params;
  const payload = await getPayload({ config: await config });
  const snapshot = await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id, depth: 0, overrideAccess: true });
  const jobId = req.headers.get("x-snapshot-job-id");
  if (snapshot.status !== "running" || !jobId || snapshot.growthToolsJobId !== jobId) return NextResponse.json({ error: "Snapshot is not accepting evidence blobs" }, { status: 409 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SCREENSHOT_BYTES) return NextResponse.json({ error: "Screenshot must contain 1 byte to 5 MB" }, { status: 413 });
  const expectedChecksum = req.headers.get("x-content-sha256");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (!expectedChecksum || expectedChecksum !== checksum) return NextResponse.json({ error: "Screenshot checksum mismatch" }, { status: 400 });
  const domain = (req.headers.get("x-competitor-domain") || "competitor").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 120);
  const index = Number(req.headers.get("x-screenshot-index") ?? 0);
  const blob = await put(`google-ads-audits/${id}/competitors/${domain}-${Number.isInteger(index) ? index : 0}.png`, bytes, {
    access: "public", contentType: "image/png", addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return NextResponse.json({ blobUrl: blob.url, checksum });
}
