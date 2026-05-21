import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { runGoogleAdsSnapshotsCron } from "@/lib/google-ads-snapshots/cron";

export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Authenticate via CRON_SECRET bearer token
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Timing-safe comparison
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runGoogleAdsSnapshotsCron();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron job failed";
    console.error("[google-ads-snapshots-cron]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
