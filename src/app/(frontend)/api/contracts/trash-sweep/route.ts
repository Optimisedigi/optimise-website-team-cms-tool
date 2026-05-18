/**
 * Daily cron \u2014 hard-deletes contracts whose `deletedAt` is more than
 * 30 days ago. Auth: `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Idempotent: rows already gone simply don't match. Safe to run more
 * than once per day.
 *
 * Register in `vercel.json` (or the dashboard's Cron Jobs UI) with a
 * daily schedule, e.g. `0 3 * * *`.
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

const TRASH_RETENTION_DAYS = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayload({ config: await config });
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const due = await payload.find({
      collection: "contracts",
      where: { deletedAt: { less_than: cutoff.toISOString() } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });

    const purged: Array<{ id: string | number; contractTitle?: string }> = [];
    const failed: Array<{ id: string | number; error: string }> = [];

    for (const doc of due.docs as any[]) {
      try {
        await payload.delete({
          collection: "contracts",
          id: doc.id,
          overrideAccess: true,
          context: { allowPurge: true },
        });
        purged.push({ id: doc.id, contractTitle: doc.contractTitle });
      } catch (e) {
        failed.push({ id: doc.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (purged.length > 0 || failed.length > 0) {
      logActivity(payload, {
        type: "contract_client_signed",
        title: `Trash sweep purged ${purged.length} contract${purged.length === 1 ? "" : "s"}`,
        description:
          `Cutoff: older than ${TRASH_RETENTION_DAYS} days.` +
          (failed.length > 0 ? ` Failures: ${failed.length}.` : ""),
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      cutoff: cutoff.toISOString(),
      considered: due.totalDocs,
      purged,
      failed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
