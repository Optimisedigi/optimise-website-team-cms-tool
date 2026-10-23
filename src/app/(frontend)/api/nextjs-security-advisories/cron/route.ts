import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { runNextjsSecurityAdvisoriesCron } from "@/lib/nextjs-security-advisories/check";

export const maxDuration = 60;

/** Daily check of the GitHub Advisory Database for new Next.js security advisories. */
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
    const summary = await runNextjsSecurityAdvisoriesCron();
    console.log(
      `[nextjs-security-advisories/cron] fresh ${summary.fresh.join(", ") || "none"}, notified ${summary.notified}${summary.error ? `, error ${summary.error}` : ""}`,
    );
    return NextResponse.json(summary, { status: summary.error ? 502 : 200 });
  } catch (error) {
    console.error("[nextjs-security-advisories/cron]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Next.js security advisories cron failed" },
      { status: 500 },
    );
  }
}
