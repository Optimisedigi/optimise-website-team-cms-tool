import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { createSnapshotForAudit } from "@/lib/google-ads-audit-snapshots";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const snapshot = await createSnapshotForAudit(payload, id, { allowNew: body.confirmNew === true });
    return NextResponse.json({ snapshotId: snapshot.id, status: snapshot.status, periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd }, { status: snapshot.status === "running" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot request failed";
    return NextResponse.json({ error: message }, { status: /confirmation/i.test(message) ? 409 : 400 });
  }
}
