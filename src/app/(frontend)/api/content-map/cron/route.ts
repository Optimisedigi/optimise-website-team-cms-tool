import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { triggerContentMapRun } from "@/lib/content-map/snapshots";

export const maxDuration = 300;

/** Weekly full analysis for every client with content analysis on. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const payload = await getPayload({ config });
    const clients = await payload.find({
      collection: "clients",
      where: { and: [{ contentMapEnabled: { equals: true } }, { websiteUrl: { exists: true } }] },
      limit: 500,
      depth: 0,
      sort: "id",
      overrideAccess: true,
      select: { name: true, websiteUrl: true },
    });
    const results: Array<{ clientId: string; ok: boolean; runId?: string; error?: string }> = [];
    for (const c of clients.docs) {
      if (!String(c.websiteUrl ?? "").trim()) continue;
      const clientId = String(c.id);
      const res = await triggerContentMapRun(payload, clientId, "full");
      results.push(res.ok ? { clientId, ok: true, runId: String(res.run.runId ?? "") } : { clientId, ok: false, error: res.error });
    }
    return NextResponse.json({ triggered: results.filter((r) => r.ok).length, results });
  } catch (err) {
    console.error("[content-map] cron failed:", (err as Error).message);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
