import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

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
    depth: 2,
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

  // ── 1. Call Growth Tools to apply the consolidation to Google Ads ──────────
  const clientDoc = candidate.client;
  const clientId = typeof clientDoc === "object" ? (clientDoc as any).id : clientDoc;
  const nklDoc = candidate.nkl;
  const nklId = typeof nklDoc === "object" ? (nklDoc as any).id : nklDoc;

  const client = await (payload.findByID as any)({
    collection: "clients",
    id: clientId,
    depth: 0,
    overrideAccess: true,
  });

  const customerId = client?.googleAdsCustomerId as string | null;
  if (!customerId || !GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Missing customer ID or Growth Tools configuration" },
      { status: 500 },
    );
  }

  const exactNegatives: string[] = Array.isArray(candidate.exactNegativesToRemove)
    ? candidate.exactNegativesToRemove.map((e: any) => e.keyword ?? e)
    : [];

  const growthToolsRes = await fetch(
    `${GROWTH_TOOLS_URL}/api/google-ads/consolidation-apply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        customerId: customerId.replace(/-/g, ""),
        phrase: candidate.phraseCandidate,
        exactKeywords: exactNegatives,
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!growthToolsRes.ok) {
    const text = await growthToolsRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Growth Tools apply failed: ${growthToolsRes.status} ${text}` },
      { status: 502 },
    );
  }

  // ── 2. Update the NKL in the CMS ──────────────────────────────────────────
  const nkl = await (payload.findByID as any)({
    collection: "negative-keyword-lists",
    id: nklId,
    depth: 1,
    overrideAccess: true,
  });

  const now = new Date().toISOString();
  const updatedKeywords = Array.isArray(nkl?.keywords) ? [...nkl.keywords] : [];

  // Remove the exact negatives
  for (const neg of exactNegatives) {
    const negLower = (neg as string).trim().toLowerCase();
    const idx = updatedKeywords.findIndex(
      (k: any) => (k.keyword ?? "").trim().toLowerCase() === negLower,
    );
    if (idx !== -1) updatedKeywords.splice(idx, 1);
  }

  // Add the phrase negative
  updatedKeywords.push({
    keyword: candidate.phraseCandidate,
    matchType: "phrase",
    negatedAt: now,
  });

  // Sort by keyword
  updatedKeywords.sort((a: any, b: any) =>
    (a.keyword ?? "").localeCompare(b.keyword ?? ""),
  );

  await (payload.update as any)({
    collection: "negative-keyword-lists",
    id: nklId,
    data: { keywords: updatedKeywords },
    overrideAccess: true,
  });

  // ── 3. Mark candidate approved ─────────────────────────────────────────────
  await (payload.update as any)({
    collection: "consolidation-candidates",
    id,
    data: {
      status: "approved",
      approvedAt: now,
      approvedBy: typeof user.id === "object" ? (user.id as any).id : user.id,
    },
    overrideAccess: true,
  });

  // ── 4. Dismiss related notifications ────────────────────────────────────────
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

  // ── 5. Log activity ─────────────────────────────────────────────────────────
  await logActivity(payload, {
    type: "consolidation_approved",
    title: `Consolidation approved: "${candidate.phraseCandidate}"`,
    description:
      `Phrase negative "${candidate.phraseCandidate}" added to NKL "${nkl?.name ?? nklId}". ${exactNegatives.length} exact negatives removed.`,
    client: clientId,
  });

  return NextResponse.json({
    ok: true,
    phrase: candidate.phraseCandidate,
    exactsRemoved: exactNegatives.length,
  });
}
