import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { markApplied, markFailed } from "@/lib/agents/_shared/approval-queue";
import { dispatchApply } from "@/lib/agents/_shared/apply-dispatcher";
import { registerOptimateApplyHandlers } from "@/lib/agents/optimate-google-ads/apply-handlers";

// Side-effect: register all Optimate apply handlers on module load.
registerOptimateApplyHandlers();

/**
 * POST /api/agent-approvals/[id]/apply
 *
 * Runs the apply-handler matching the row's proposalType. On success the row
 * flips to "applied" + appliedAt; on failure the row flips to "failed" with
 * the error written to applyError so the human can retry or escalate.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
  }

  let payload: Awaited<ReturnType<typeof getPayload>>;
  try {
    payload = await getPayload({ config });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to init Payload: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let row: { status?: string; proposalType?: string; proposalPayload?: unknown };
  try {
    row = (await payload.findByID({
      collection: "agent-approval-queue" as never,
      id: numericId,
      overrideAccess: true,
    })) as typeof row;
  } catch (err) {
    return NextResponse.json(
      { error: `Approval row not found: ${(err as Error).message}` },
      { status: 404 },
    );
  }

  if (row.status !== "approved") {
    return NextResponse.json(
      { error: `Cannot apply from status="${row.status}". Approve the proposal first.` },
      { status: 400 },
    );
  }
  if (!row.proposalType) {
    return NextResponse.json(
      { error: "Approval row has no proposalType — cannot dispatch" },
      { status: 400 },
    );
  }

  const proposalPayload = (row.proposalPayload && typeof row.proposalPayload === "object")
    ? (row.proposalPayload as Record<string, unknown>)
    : {};

  try {
    const result = await dispatchApply(row.proposalType, proposalPayload, {
      payload,
      approvalId: numericId,
      userId: (user as { id: number }).id,
    });
    await markApplied(numericId);
    return NextResponse.json({
      ok: true,
      message: result.message ?? "Applied.",
      detail: result.detail,
    });
  } catch (err) {
    const errMsg = (err as Error).message || "Apply failed";
    console.error(`[agent-approvals/apply] proposalType=${row.proposalType} id=${numericId}:`, err);
    try {
      await markFailed(numericId, errMsg);
    } catch (markErr) {
      console.error("[agent-approvals/apply] failed to mark row as failed:", markErr);
    }
    return NextResponse.json(
      { error: errMsg },
      { status: 500 },
    );
  }
}
