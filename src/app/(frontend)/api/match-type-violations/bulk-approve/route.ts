import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { buildNegativeFromViolation } from "@/lib/match-type-negative";
import { resolveTargetList, parseRouting } from "@/lib/match-type-approve";
import type { NegativeMatchType } from "@/lib/match-type-negative";

/**
 * Parse an untrusted `overrides` body into a map of candidate id → agency edits
 * (keyword text and/or match type). Lets the bulk approve honour negatives the
 * user edited inline per row instead of only the stored detector recommendation.
 */
function parseOverrides(
  raw: unknown,
): Map<string, { keyword?: string; matchType?: NegativeMatchType }> {
  const map = new Map<string, { keyword?: string; matchType?: NegativeMatchType }>();
  if (!raw || typeof raw !== "object") return map;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as { keyword?: unknown; matchType?: unknown };
    const entry: { keyword?: string; matchType?: NegativeMatchType } = {};
    if (typeof v.keyword === "string" && v.keyword.trim()) entry.keyword = v.keyword.trim();
    if (v.matchType === "exact" || v.matchType === "phrase") entry.matchType = v.matchType;
    if (entry.keyword || entry.matchType) map.set(String(id), entry);
  }
  return map;
}

export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { candidateIds, assignedListId, routing: rawRouting, overrides: rawOverrides } = body as {
    candidateIds?: string[];
    assignedListId?: string;
    routing?: unknown;
    overrides?: unknown;
  };
  const routing = parseRouting(rawRouting);
  const overrides = parseOverrides(rawOverrides);

  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds must be a non-empty array" }, { status: 400 });
  }

  if (!assignedListId && !routing) {
    return NextResponse.json(
      { error: "assignedListId or routing is required" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const userId = typeof user.id === "object" ? (user.id as any).id : user.id;

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

  // Resolve each candidate to its destination list and bucket the negatives by
  // list. `existing`/legacy routing collapses to a single list; `auto` routing
  // matches (or creates) an ad-group list per candidate.
  const perList = new Map<string | number, { newKws: any[]; candidateIds: string[] }>();
  let createdLists = 0;
  for (const item of toApprove) {
    const resolved = await resolveTargetList(payload, {
      candidate: item.candidate,
      routing,
      assignedListId,
    });
    if (resolved.created) createdLists++;
    const override = overrides.get(String(item.id));
    const negative = buildNegativeFromViolation({
      searchTerm: item.candidate.searchTerm,
      triggeringKeyword: item.candidate.triggeringKeyword,
      violationType: item.candidate.violationType,
      recommendedKeyword: override?.keyword ?? item.candidate.recommendedKeyword,
      recommendedMatchType: override?.matchType ?? item.candidate.recommendedMatchType,
      nearestKeyword: item.candidate.nearestKeyword,
    });
    const bucket = perList.get(resolved.listId) ?? { newKws: [], candidateIds: [] };
    bucket.newKws.push({ keyword: negative.keyword, matchType: negative.matchType, negatedAt: now });
    bucket.candidateIds.push(item.id);
    perList.set(resolved.listId, bucket);
  }

  const listNames: string[] = [];
  const listSummaries: Array<{
    listId: string | number;
    listName: string;
    added: number;
    keywords: Array<{ keyword: string; matchType: NegativeMatchType }>;
  }> = [];
  let persisted = 0;
  let failedToPersist = 0;
  for (const [listId, bucket] of perList) {
    const nkl = await payload.findByID({
      collection: "negative-keyword-lists",
      id: listId,
      depth: 0,
      overrideAccess: true,
    }).catch(() => null);
    if (!nkl) continue;
    const listName = (nkl as any).name ?? String(listId);
    listNames.push(listName);

    const existingKeywords = Array.isArray((nkl as any).keywords) ? (nkl as any).keywords : [];
    const dedupedMap = new Map<string, any>();
    for (const k of existingKeywords) {
      dedupedMap.set(`${(k.keyword ?? "").toLowerCase()}|${(k.matchType ?? "").toLowerCase()}`, k);
    }
    for (const k of bucket.newKws) {
      dedupedMap.set(`${k.keyword.toLowerCase()}|${k.matchType}`, k);
    }
    const mergedKeywords = Array.from(dedupedMap.values()).sort((a: any, b: any) =>
      (a.keyword ?? "").localeCompare(b.keyword ?? ""),
    );

    await payload.update({
      collection: "negative-keyword-lists",
      id: listId,
      data: { keywords: mergedKeywords },
      overrideAccess: true,
    });

    listSummaries.push({
      listId,
      listName,
      added: bucket.newKws.length,
      keywords: bucket.newKws.map((kw) => ({ keyword: kw.keyword, matchType: kw.matchType })),
    });

    const statusUpdates = await Promise.allSettled(
      bucket.candidateIds.map((id) =>
        (payload.update as any)({
          collection: "match-type-violation-candidates",
          id,
          data: {
            status: "approved",
            approvedAt: now,
            approvedBy: userId,
            assignedListId: listId,
          },
          overrideAccess: true,
        }),
      ),
    );
    // Track whether candidate status actually flipped to `approved`. A failure
    // here (e.g. schema drift) must not be reported as a successful approval,
    // otherwise the row reappears as pending on the next refresh.
    for (const u of statusUpdates) {
      if (u.status === "fulfilled") persisted++;
      else failedToPersist++;
    }
  }

  // The negatives were written to the list(s), but if no candidate status could
  // be persisted the review queue would re-surface them — surface that as an error.
  if (persisted === 0 && failedToPersist > 0) {
    return NextResponse.json(
      { error: "Approved negatives were saved but candidate statuses could not be updated", persisted, failedToPersist },
      { status: 500 },
    );
  }

  const firstCandidate = toApprove[0]?.candidate;
  await logActivity(payload, {
    type: "match_type_violation_approved",
    title: `Bulk approved ${toApprove.length} match type violations`,
    description: `Added ${toApprove.length} terms as negatives to ${listNames.length} list(s): ${listNames.join(", ")}`,
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
    approved: persisted,
    failedToPersist,
    createdLists,
    listSummaries,
    results: results.map((r) =>
      r.status === "fulfilled" ? r.value : { status: "error", reason: r.status },
    ),
  });
}
