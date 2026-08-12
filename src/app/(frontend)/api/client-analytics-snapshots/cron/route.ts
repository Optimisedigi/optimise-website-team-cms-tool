import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import config from "@payload-config";
import { getPayload } from "payload";
import { runClientAnalyticsSnapshotsCron } from "@/lib/client-analytics-snapshots";

export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, summary: await runClientAnalyticsSnapshotsCron(await getPayload({ config })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Client analytics snapshot cron failed";
    console.error("[client-analytics-snapshots]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
