import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runMilestoneAuditTick } from "@/lib/google-ads-milestone-audits/runner";

export const maxDuration = 300;

/**
 * GET /api/google-ads-milestone-audits/cron
 *
 * Hourly Vercel cron (CRON_SECRET bearer). Creates the 1/3/6/9/12-month
 * milestone rows from each client's Campaign start date, starts Growth Tools
 * captures for due milestones, and queues finished decks in OptiMate Approvals.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (!token || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await getPayload({ config: await config });
    const result = await runMilestoneAuditTick(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[google-ads-milestone-audits/cron] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Milestone audit run failed" }, { status: 500 });
  }
}
