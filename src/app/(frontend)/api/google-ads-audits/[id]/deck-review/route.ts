import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const audit = await payload.findByID({ collection: "google-ads-audits", id: (await params).id, depth: 0, overrideAccess: true });
    const snapshotId = typeof (audit as any).snapshot === "object" ? (audit as any).snapshot?.id : (audit as any).snapshot;
    const snapshot = snapshotId ? await (payload as any).findByID({ collection: "google-ads-audit-snapshots", id: snapshotId, depth: 0, overrideAccess: true }) : null;
    return NextResponse.json({
      auditId: audit.id, businessName: (audit as any).businessName, published: (audit as any).presentationPublished,
      generatedAt: (audit as any).deckGeneratedAt, deck: (audit as any).generatedDeckPayload ?? null,
      snapshot: snapshot ? { id: snapshot.id, status: snapshot.status, requestedAt: snapshot.requestedAt, capturedAt: snapshot.capturedAt, periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd, accountTimeZone: snapshot.accountTimeZone, currencyCode: snapshot.currencyCode, earliestAvailableActivityDate: snapshot.earliestAvailableActivityDate, sourceRowCounts: snapshot.sourceRowCounts, error: snapshot.error } : null,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }
}
