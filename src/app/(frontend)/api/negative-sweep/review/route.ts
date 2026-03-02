import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * POST /api/negative-sweep/review
 * Approve or reject negative sweep candidates.
 * Body: { candidateIds: string[], action: "approve" | "reject", assignedList?: string, matchType?: string }
 */
export async function POST(request: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Check auth via cookie/session
  const { user } = await payload.auth({
    headers: request.headers,
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { candidateIds, action, assignedList, matchType } = body;

  if (
    !candidateIds ||
    !Array.isArray(candidateIds) ||
    candidateIds.length === 0
  ) {
    return NextResponse.json(
      { error: "candidateIds array is required" },
      { status: 400 }
    );
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 }
    );
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const id of candidateIds) {
    try {
      const updateData: Record<string, any> = {
        status: action === "approve" ? "approved" : "rejected",
      };
      if (assignedList) updateData.assignedList = assignedList;
      if (matchType) updateData.matchType = matchType;

      await payload.update({
        collection: "negative-sweep-candidates" as any,
        id,
        data: updateData as any,
        overrideAccess: true,
      });
      results.push({ id, ok: true });
    } catch (err: any) {
      results.push({ id, ok: false, error: err?.message || String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    updated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
