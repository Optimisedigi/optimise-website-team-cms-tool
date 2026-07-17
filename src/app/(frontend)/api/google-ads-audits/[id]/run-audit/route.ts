import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { createSnapshotForAudit } from "@/lib/google-ads-audit-snapshots";

/** Compatibility wrapper. Snapshot capture replaces the legacy live comprehensive audit. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const snapshot = await createSnapshotForAudit(payload, (await params).id);
    return NextResponse.json({ ok: true, status: snapshot.status, snapshotId: snapshot.id, periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd }, { status: snapshot.status === "running" ? 202 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Snapshot capture failed" }, { status: 400 });
  }
}
