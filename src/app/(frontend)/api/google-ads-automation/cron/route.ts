import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { runGoogleAdsAutomationCron } from "@/lib/google-ads-automation/cron";

export const maxDuration = 300;

/**
 * Daily poll of Google Ads change_event into `google-ads-automation-events`.
 * change_event is only queryable for the trailing ~30 days, so a missed run
 * loses history permanently — the cron window overlaps by 3 days to self-heal.
 */
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

  if (!process.env.GROWTH_TOOLS_URL || !process.env.INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
      { status: 500 },
    );
  }

  try {
    const summary = await runGoogleAdsAutomationCron();
    console.log(
      `[google-ads-automation/cron] ${summary.clientsProcessed} clients, ${summary.eventsCreated} new events, ${summary.clientsErrored} errored`,
    );
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[google-ads-automation/cron]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automation cron failed" },
      { status: 500 },
    );
  }
}
