import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { ingestSnapshotChunk } from "@/lib/google-ads-audit-snapshots";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.INTERNAL_API_KEY || token !== process.env.INTERNAL_API_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const payload = await getPayload({ config: await config });
    const result = await ingestSnapshotChunk(payload, (await params).id, await req.json());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chunk ingest failed";
    return NextResponse.json({ error: message }, { status: /checksum|conflicting|job ID/i.test(message) ? 409 : 400 });
  }
}
