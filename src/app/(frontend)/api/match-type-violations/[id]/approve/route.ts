import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

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
  const { assignedListId } = body as { assignedListId?: string };

  if (!assignedListId) {
    return NextResponse.json({ error: "assignedListId is required" }, { status: 400 });
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

  const nkl = await payload.findByID({
    collection: "negative-keyword-lists",
    id: assignedListId,
    depth: 0,
    overrideAccess: true,
  }).catch(() => null);

  if (!nkl) {
    return NextResponse.json({ error: "Negative keyword list not found" }, { status: 404 });
  }

  // Add the search term as a negative keyword to the NKL.
  // The negative's match type mirrors the violation's match type.
  const now = new Date().toISOString();
  const existingKeywords = Array.isArray((nkl as any).keywords) ? (nkl as any).keywords : [];
  const newKeyword = {
    keyword: (candidate as any).searchTerm,
    matchType: ((candidate as any).matchType ?? "EXACT").toLowerCase(),
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
    id: assignedListId,
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
      assignedListId,
    },
    overrideAccess: true,
  });

  await logActivity(payload, {
    type: "match_type_violation_approved",
    title: `Match type violation approved: "${(candidate as any).searchTerm}"`,
    description: `Added as ${newKeyword.matchType} negative to list "${(nkl as any).name}"`,
    user: typeof user.id === "object" ? (user.id as any).id : user.id,
    client: typeof (candidate as any).client === "object"
      ? (candidate as any).client?.id
      : (candidate as any).client,
  });

  return NextResponse.json({ ok: true });
}
