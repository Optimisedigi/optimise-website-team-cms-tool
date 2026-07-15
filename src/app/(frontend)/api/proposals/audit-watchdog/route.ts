import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { sweepStuckProposalAudits } from "@/lib/proposal-audit-watchdog";
import { sweepStaleMetaJobs } from "@/lib/proposal-meta-ads-job";

export const maxDuration = 60;

// Cron sweep: flip any proposal audit stranded at "running" (background function
// killed before it could write the final status) to "failed" so the UI unblocks
// even when no one is watching the polling status route.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await getPayload({ config });
    const recovered = await sweepStuckProposalAudits(payload);
    const meta = await sweepStaleMetaJobs(payload);
    return NextResponse.json({
      ok: true,
      recovered,
      metaResumed: meta.resumed,
      metaFailed: meta.failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Watchdog failed";
    console.error("[proposal-audit-watchdog]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
