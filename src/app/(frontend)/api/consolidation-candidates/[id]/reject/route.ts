import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = await (payload.findByID as any)({
    collection: "consolidation-candidates",
    id,
    depth: 0,
    overrideAccess: true,
  });

  if (!candidate) {
    return NextResponse.json({ error: "Consolidation candidate not found" }, { status: 404 });
  }

  if (candidate.status !== "pending") {
    return NextResponse.json(
      { error: `Candidate is already ${candidate.status}` },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  await (payload.update as any)({
    collection: "consolidation-candidates",
    id,
    data: { status: "rejected", rejectedAt: now },
    overrideAccess: true,
  });

  // Dismiss related notifications
  const notifResult = await (payload.find as any)({
    collection: "notifications",
    where: {
      and: [
        { kind: { equals: "consolidation-pending" } },
        { relatedConsolidationCandidate: { equals: id } },
        { readAt: { exists: false } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  for (const n of notifResult.docs) {
    await (payload.update as any)({
      collection: "notifications",
      id: (n as any).id,
      data: { readAt: now },
      overrideAccess: true,
    });
  }

  const clientId = typeof candidate.client === "object"
    ? (candidate.client as any).id
    : candidate.client;

  await logActivity(payload, {
    type: "consolidation_rejected",
    title: `Consolidation rejected: "${candidate.phraseCandidate}"`,
    description:
      `Phrase negative proposal "${candidate.phraseCandidate}" was rejected. ${candidate.exactNegativesToRemove?.length ?? 0} exact negatives kept as-is.`,
    client: clientId,
  });

  return NextResponse.json({ ok: true });
}
