import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { candidateIds, assignedListId } = body as {
    candidateIds?: string[];
    assignedListId?: string;
  };

  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds must be a non-empty array" }, { status: 400 });
  }

  if (!assignedListId) {
    return NextResponse.json({ error: "assignedListId is required" }, { status: 400 });
  }

  const nkl = await payload.findByID({
    collection: "negative-keyword-lists",
    id: assignedListId,
    depth: 0,
    overrideAccess: true,
  }).catch(() => null);

  if (!nkl) {
    return NextResponse.json({ error: "Negative keyword list not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const userId = typeof user.id === "object" ? (user.id as any).id : user.id;
  const existingKeywords = Array.isArray((nkl as any).keywords) ? (nkl as any).keywords : [];

  const results = await Promise.allSettled(
    candidateIds.map(async (id) => {
      const candidate = await (payload.findByID as any)({
        collection: "match-type-violation-candidates",
        id,
        depth: 0,
        overrideAccess: true,
      }).catch(() => null);

      if (!candidate) return { id, status: "not_found" };
      if ((candidate as any).status !== "pending") return { id, status: "already_processed" };

      return { id, status: "ok", candidate };
    }),
  );

  const toApprove = results
    .filter((r): r is PromiseFulfilledResult<{ id: string; status: string; candidate?: any }> =>
      r.status === "fulfilled" && r.value.status === "ok",
    )
    .map((r) => r.value);

  // Build the full updated keywords array (merge all new keywords)
  const newKws = toApprove.map((item) => ({
    keyword: item.candidate.searchTerm,
    matchType: ((item.candidate.matchType as string) ?? "EXACT").toLowerCase(),
    negatedAt: now,
  }));

  const dedupedMap = new Map<string, any>();
  for (const k of existingKeywords) {
    dedupedMap.set(`${(k.keyword ?? "").toLowerCase()}|${(k.matchType ?? "").toLowerCase()}`, k);
  }
  for (const k of newKws) {
    dedupedMap.set(`${k.keyword.toLowerCase()}|${k.matchType}`, k);
  }
  const mergedKeywords = Array.from(dedupedMap.values()).sort((a: any, b: any) =>
    (a.keyword ?? "").localeCompare(b.keyword ?? ""),
  );

  await payload.update({
    collection: "negative-keyword-lists",
    id: assignedListId,
    data: { keywords: mergedKeywords },
    overrideAccess: true,
  });

  await Promise.allSettled(
    toApprove.map((item) =>
      (payload.update as any)({
        collection: "match-type-violation-candidates",
        id: item.id,
        data: {
          status: "approved",
          approvedAt: now,
          approvedBy: userId,
          assignedListId,
        },
        overrideAccess: true,
      }),
    ),
  );

  const firstCandidate = toApprove[0]?.candidate;
  await logActivity(payload, {
    type: "match_type_violation_approved",
    title: `Bulk approved ${toApprove.length} match type violations`,
    description: `Added ${toApprove.length} terms as negatives to list "${(nkl as any).name}"`,
    user: userId,
    client:
      firstCandidate
        ? typeof firstCandidate.client === "object"
          ? firstCandidate.client?.id
          : firstCandidate.client
        : undefined,
  });

  return NextResponse.json({
    ok: true,
    approved: toApprove.length,
    results: results.map((r) =>
      r.status === "fulfilled" ? r.value : { status: "error", reason: r.status },
    ),
  });
}
