import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { runNodeSecurityReleasesCron } from "@/lib/node-security-releases/check";

export const maxDuration = 60;

/** Daily check of nodejs.org for new Node.js security releases. No credentials. */
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
    const summary = await runNodeSecurityReleasesCron();
    console.log(
      `[node-security-releases/cron] fresh ${summary.fresh.join(", ") || "none"}, notified ${summary.notified}${summary.error ? `, error ${summary.error}` : ""}`,
    );
    return NextResponse.json(summary, { status: summary.error ? 502 : 200 });
  } catch (error) {
    console.error("[node-security-releases/cron]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Node security releases cron failed" },
      { status: 500 },
    );
  }
}
