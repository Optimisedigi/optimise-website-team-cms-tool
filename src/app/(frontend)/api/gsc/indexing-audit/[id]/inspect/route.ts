import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runInspectionBatch } from "@/lib/gsc-indexing";

export const maxDuration = 60;

/**
 * POST: Inspect the next batch of URLs for an audit.
 * Called by the frontend polling loop to drive inspection forward
 * in small batches that fit within Vercel's timeout.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runInspectionBatch(payload, id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inspection batch failed";
    console.error(`[gsc-indexing-audit] Inspect ${id} failed:`, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
