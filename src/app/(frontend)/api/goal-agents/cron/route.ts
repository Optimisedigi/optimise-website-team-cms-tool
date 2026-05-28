import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runGoalAgentsTick } from "@/lib/goal-agents/scheduler";

export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Authenticate via CRON_SECRET bearer token
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
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
    const payload = await getPayload({ config });
    const summary = await runGoalAgentsTick(payload);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron job failed";
    console.error("[goal-agents-cron]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
