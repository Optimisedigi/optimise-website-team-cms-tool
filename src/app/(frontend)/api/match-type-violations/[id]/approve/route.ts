import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { buildNegativeFromViolation, type NegativeMatchType } from "@/lib/match-type-negative";
import { resolveTargetList, parseRouting } from "@/lib/match-type-approve";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    assignedListId,
    routing: rawRouting,
    keyword: keywordOverride,
    matchType: matchTypeOverride,
  } = body as {
    assignedListId?: string;
    routing?: unknown;
    keyword?: string;
    matchType?: NegativeMatchType;
  };
  const routing = parseRouting(rawRouting);

  // A destination is required: explicit list, legacy assignedListId, or auto.
  if (!assignedListId && !routing) {
    return NextResponse.json(
      { error: "assignedListId or routing is required" },
      { status: 400 },
    );
  }

  const candidate = await (payload.findByID as any)({
    collection: "match-type-violation-candidates",
    id,
    depth: 1,
    overrideAccess: true,
  }).catch(() => null);

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  let resolved;
  try {
    resolved = await resolveTargetList(payload, {
      candidate: candidate as any,
      routing,
      assignedListId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to resolve negative keyword list: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
  const targetListId = resolved.listId;

  const nkl = await payload.findByID({
    collection: "negative-keyword-lists",
    id: targetListId,
    depth: 0,
    overrideAccess: true,
  }).catch(() => null);

  if (!nkl) {
    return NextResponse.json({ error: "Negative keyword list not found" }, { status: 404 });
  }

  // Add the search term as a negative keyword to the NKL. The negative honours
  // the agency override if supplied, else the detector recommendation, else the
  // legacy violation-type default.
  const now = new Date().toISOString();
  const existingKeywords = Array.isArray((nkl as any).keywords) ? (nkl as any).keywords : [];
  const negative = buildNegativeFromViolation({
    searchTerm: (candidate as any).searchTerm,
    triggeringKeyword: (candidate as any).triggeringKeyword,
    violationType: (candidate as any).violationType,
    recommendedKeyword: keywordOverride ?? (candidate as any).recommendedKeyword,
    recommendedMatchType: matchTypeOverride ?? (candidate as any).recommendedMatchType,
    nearestKeyword: (candidate as any).nearestKeyword,
  });
  const newKeyword = {
    keyword: negative.keyword,
    matchType: negative.matchType,
    negatedAt: now,
  };

  // Avoid duplicate: only add if not already present
  const alreadyExists = existingKeywords.some(
    (k: any) =>
      (k.keyword ?? "").toLowerCase() === newKeyword.keyword.toLowerCase() &&
      (k.matchType ?? "").toLowerCase() === newKeyword.matchType,
  );

  const updatedKeywords = alreadyExists
    ? existingKeywords
    : [...existingKeywords, newKeyword].sort((a: any, b: any) =>
        (a.keyword ?? "").localeCompare(b.keyword ?? ""),
      );

  await payload.update({
    collection: "negative-keyword-lists",
    id: targetListId,
    data: { keywords: updatedKeywords },
    overrideAccess: true,
  });

  await (payload.update as any)({
    collection: "match-type-violation-candidates",
    id,
    data: {
      status: "approved",
      approvedAt: now,
      approvedBy: typeof user.id === "object" ? (user.id as any).id : user.id,
      assignedListId: targetListId,
    },
    overrideAccess: true,
  });

  await logActivity(payload, {
    type: "match_type_violation_approved",
    title: `Match type violation approved: "${(candidate as any).searchTerm}"`,
    description: `Added as ${newKeyword.matchType} negative to list "${(nkl as any).name}" — ${negative.note}`,
    user: typeof user.id === "object" ? (user.id as any).id : user.id,
    client: typeof (candidate as any).client === "object"
      ? (candidate as any).client?.id
      : (candidate as any).client,
  });

  return NextResponse.json({ ok: true, listId: targetListId, createdList: resolved.created });
}
