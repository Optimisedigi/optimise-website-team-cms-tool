import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { runGoogleSearchUpdatesCron } from "@/lib/google-search-updates/cron";

export const maxDuration = 60;

/** Daily poll of Google's public Search Status Dashboard. No credentials. */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runGoogleSearchUpdatesCron();
    console.log(
      `[google-search-updates/cron] fetched ${summary.fetched}, created ${summary.created}, updated ${summary.updated}, notified ${summary.notified}`,
    );
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[google-search-updates/cron]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search updates cron failed" },
      { status: 500 },
    );
  }
}
