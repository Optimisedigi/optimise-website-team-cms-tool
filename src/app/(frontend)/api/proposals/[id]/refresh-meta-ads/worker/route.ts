import { after, NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { dispatchMetaAdsWorker, processNextBatch } from "@/lib/proposal-meta-ads-job";

// One batch of at most two competitors runs here. 180s is well below the 300s
// ceiling while allowing two 10s social fallbacks, two Meta scrapes, Blob
// uploads, and persistence. The batch runs in `after()` and the next batch is
// dispatched as a fresh invocation.
export const maxDuration = 180;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey || req.headers.get("x-internal-key") !== internalKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const origin = new URL(req.url).origin;

  after(async () => {
    try {
      const result = await processNextBatch(payload, id);
      if (!result.done && result.shouldDispatch) {
        await dispatchMetaAdsWorker(id, origin);
      }
    } catch (err: any) {
      console.error(`[refresh-meta-ads/worker] Proposal ${id} batch failed:`, err?.message || err);
    }
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
