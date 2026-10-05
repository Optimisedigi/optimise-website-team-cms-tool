import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { runLandingConversionSync } from "@/lib/landing-conversions/sync";

export const maxDuration = 120;

/**
 * Daily replay of landing-page leads to Google Ads (Data Manager API), so
 * leads whose browser blocked the Google tag still count. Idempotent: the
 * `landing-conversion-uploads` ledger and Google's own transaction-ID dedupe
 * mean re-running creates nothing new.
 *
 * Query params (manual runs only, same bearer secret):
 *   ?propertyId=1        limit to one landing property
 *   ?windowDays=90       widen the look-back (max 90, Google's click window)
 *   ?validateOnly=1      ask Google to validate without recording conversions
 */
function authorised(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.GROWTH_TOOLS_URL || !process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" }, { status: 500 });
  }
  const params = req.nextUrl.searchParams;
  const propertyId = Number(params.get("propertyId"));
  const windowDays = Number(params.get("windowDays"));
  try {
    const summary = await runLandingConversionSync({
      propertyIds: Number.isInteger(propertyId) && propertyId > 0 ? [propertyId] : undefined,
      windowDays: Number.isInteger(windowDays) && windowDays > 0 ? windowDays : undefined,
      validateOnly: params.get("validateOnly") === "1",
    });
    const sent = summary.properties.reduce((n, p) => n + p.sent, 0);
    const errored = summary.properties.filter((p) => p.error).length;
    console.log(`[landing-conversions/sync] ${summary.properties.length} properties, ${sent} sent, ${errored} errored, window ${summary.windowStart}..${summary.windowEnd}`);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[landing-conversions/sync]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}
