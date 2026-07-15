import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { computeProgress, dispatchMetaAdsWorker, initMetaAdsJob } from "@/lib/proposal-meta-ads-job";

// This route now only initializes/resumes the durable job and returns
// immediately; the actual scraping happens in the internal worker route, two
// competitors per invocation. Keep a small budget — no long work runs here.
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let init;
  try {
    init = await initMetaAdsJob(payload, id);
  } catch (err: any) {
    const message = err?.message || "Failed to start Meta Ads refresh.";
    console.error(`[refresh-meta-ads] Init failed for proposal ${id}:`, message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // New job or a stale (interrupted) job needs a worker kicked off.
  if (init.shouldDispatch) {
    const origin = new URL(req.url).origin;
    await dispatchMetaAdsWorker(id, origin);
  }

  return NextResponse.json(
    {
      ok: true,
      status: init.terminal ? "completed" : "running",
      ...computeProgress(init.state),
    },
    { status: 202 },
  );
}
