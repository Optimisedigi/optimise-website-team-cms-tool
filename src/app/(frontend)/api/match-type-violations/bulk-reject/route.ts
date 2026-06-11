import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

/**
 * Bulk-dismiss match-type violation candidates. Marks each pending candidate
 * `rejected` so the daily detector keeps refreshing its stats but never
 * re-surfaces it in the pending queue. Used by the review UI's
 * "Dismiss N Selected" action — after approving the keepers, the reviewed-but-
 * unwanted terms are dismissed in one pass so they don't reappear next run.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { candidateIds } = body as { candidateIds?: string[] };

  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return NextResponse.json(
      { error: "candidateIds must be a non-empty array" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const userId = typeof user.id === "object" ? (user.id as any).id : user.id;

  let firstCandidate: any = null;
  let dismissed = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    candidateIds.map(async (id) => {
      const candidate = await (payload.findByID as any)({
        collection: "match-type-violation-candidates",
        id,
        depth: 0,
        overrideAccess: true,
      }).catch(() => null);

      if (!candidate) return { id, status: "not_found" };
      if ((candidate as { status?: string }).status !== "pending") {
        return { id, status: "already_processed" };
      }

      try {
        await (payload.update as any)({
          collection: "match-type-violation-candidates",
          id,
          data: { status: "rejected", rejectedAt: now },
          overrideAccess: true,
        });
      } catch (err) {
        // Surface write failures instead of swallowing them — a silent failure
        // here is exactly what made dismissed rows reappear on refresh.
        failed++;
        return { id, status: "error", reason: err instanceof Error ? err.message : String(err) };
      }

      if (!firstCandidate) firstCandidate = candidate;
      dismissed++;
      return { id, status: "ok" };
    }),
  );

  // If every eligible candidate failed to persist, report an error so the UI
  // doesn't optimistically clear rows that are still pending in the database.
  if (dismissed === 0 && failed > 0) {
    return NextResponse.json(
      { error: "Failed to dismiss any candidates", dismissed, failed },
      { status: 500 },
    );
  }

  if (dismissed > 0) {
    await logActivity(payload, {
      type: "match_type_violation_rejected",
      title: `Bulk dismissed ${dismissed} match type violations`,
      description: `Marked ${dismissed} reviewed terms as dismissed so they no longer surface as pending`,
      user: userId,
      client: firstCandidate
        ? typeof firstCandidate.client === "object"
          ? firstCandidate.client?.id
          : firstCandidate.client
        : undefined,
    });
  }

  return NextResponse.json({
    ok: true,
    dismissed,
    failed,
    results: results.map((r) =>
      r.status === "fulfilled" ? r.value : { status: "error", reason: String(r.reason) },
    ),
  });
}
