/**
 * GET /api/goal-agents/changes?clientId=&goalRunId=
 *
 * Read-only Change-Review feed for goal-agent runs. Joins goal-run-snapshots
 * with their linked agent-approval-queue rows (for rendered markdown) and
 * returns two partitions:
 *   - approved   (status ∈ approved | applied) — the default view
 *   - disapproved (status ∈ rejected | blocked_by_*) — shown behind a toggle
 *
 * Each row carries the reason it was approved/flagged/blocked. No mutations.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

import config from "@/payload.config";
import {
  partitionChangeReview,
  type ChangeReviewSnapshotInput,
} from "@/lib/goal-agents/change-review";

interface RawSnapshotDoc {
  id: number | string;
  step?: number | null;
  action?: string | null;
  status?: string | null;
  riskTier?: string | null;
  campaignIds?: Array<{ campaignId?: string }> | null;
  blockReason?: string | null;
  proposedPayload?: Record<string, unknown> | null;
  modifiedPayload?: Record<string, unknown> | null;
  measuredResult?: Record<string, unknown> | null;
  createdAt?: string | null;
  approval?: number | { id?: number; rendered?: { internalMarkdown?: string } } | null;
}

interface RawGoalRunDoc {
  id: number | string;
  goal?: string;
  status?: string;
  client?: number | string | { id?: number | string };
}

function toClientId(raw: RawGoalRunDoc["client"]): string {
  if (typeof raw === "number" || typeof raw === "string") return String(raw);
  if (raw && typeof raw === "object" && raw.id !== undefined) return String(raw.id);
  return "";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clientIdParam = searchParams.get("clientId");
  const goalRunIdParam = searchParams.get("goalRunId");

  if (!clientIdParam && !goalRunIdParam) {
    return NextResponse.json(
      { error: "Provide clientId or goalRunId" },
      { status: 400 },
    );
  }

  // Resolve the goal-run scope. When only clientId is given, gather all of the
  // client's runs; when goalRunId is given, scope to it (and verify it belongs
  // to the client if both are supplied).
  const runWhere: Record<string, unknown> = {};
  if (goalRunIdParam) {
    runWhere.id = { equals: Number(goalRunIdParam) };
  } else if (clientIdParam) {
    runWhere.client = { equals: Number(clientIdParam) };
  }

  const runsResult = await payload.find({
    collection: "goal-runs" as never,
    where: runWhere as never,
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });
  const runs = runsResult.docs as unknown as RawGoalRunDoc[];

  const scopedRuns = clientIdParam
    ? runs.filter((r) => toClientId(r.client) === String(Number(clientIdParam)))
    : runs;

  if (scopedRuns.length === 0) {
    return NextResponse.json({
      goalRuns: [],
      approved: [],
      disapproved: [],
    });
  }

  const runIds = scopedRuns.map((r) => Number(r.id));

  const snapsResult = await payload.find({
    collection: "goal-run-snapshots",
    where: { goalRun: { in: runIds } } as never,
    sort: "step",
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  });
  const snaps = snapsResult.docs as unknown as RawSnapshotDoc[];

  const inputs: ChangeReviewSnapshotInput[] = snaps.map((s) => {
    const approvalMarkdown =
      s.approval && typeof s.approval === "object"
        ? s.approval.rendered?.internalMarkdown ?? null
        : null;
    return {
      id: Number(s.id),
      step: s.step ?? null,
      action: s.action ?? null,
      status: s.status ?? null,
      riskTier: s.riskTier ?? null,
      campaignIds: Array.isArray(s.campaignIds)
        ? s.campaignIds
            .map((c) => c?.campaignId)
            .filter((c): c is string => typeof c === "string")
        : [],
      blockReason: s.blockReason ?? null,
      proposedPayload: s.proposedPayload ?? null,
      modifiedPayload: s.modifiedPayload ?? null,
      measuredResult: s.measuredResult ?? null,
      createdAt: s.createdAt ?? null,
      approvalMarkdown,
    };
  });

  const partition = partitionChangeReview(inputs);

  return NextResponse.json({
    goalRuns: scopedRuns.map((r) => ({
      id: Number(r.id),
      goal: r.goal ?? null,
      status: r.status ?? null,
    })),
    approved: partition.approved,
    disapproved: partition.disapproved,
  });
}
