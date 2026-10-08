import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runGoogleAdsSnapshotsCron } from "@/lib/google-ads-snapshots/cron";
import { recordGoalRunProgress } from "@/lib/goal-agents/progress";

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

    // Daily goal-run progress point (yesterday's metrics per tracked run).
    // Runs after the snapshots so it never delays them; its own failure is
    // reported in the response rather than failing the cron.
    let goalRunProgress: Awaited<ReturnType<typeof recordGoalRunProgress>> | { error: string };
    try {
      const payload = await getPayload({ config });
      goalRunProgress = await recordGoalRunProgress(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[google-ads-snapshots-cron] goal-run progress failed:", message);
      goalRunProgress = { error: message };
    }

    return NextResponse.json({ ok: true, summary, goalRunProgress });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron job failed";
    console.error("[google-ads-snapshots-cron]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
