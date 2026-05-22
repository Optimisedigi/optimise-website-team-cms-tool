/**
 * Goal Run Audit Trail — write helpers for goal agents.
 *
 * Thin wrappers around Payload create/update calls. No LLM, no external HTTP.
 *
 * Lifecycle:
 *   1. startGoalRun    → creates the goal-runs row, status: "analysing"
 *   2. recordGoalRunSnapshot  → for each decision step
 *   3. markGoalRunStatus       → transitions the run through awaiting_data /
 *                                 pending_approval / executing / measuring /
 *                                 complete / failed / blocked
 *   4. attachMeasurement      → records post-action results on a snapshot
 *
 * See docs/goal-agents-architecture-and-build-plan.md §New: Goal Run Audit Trail.
 */

import type { Payload } from "payload";

// ─── Types ─────────────────────────────────────────────────────────────────

export type GoalRunStatus =
  | "awaiting_data"
  | "analysing"
  | "pending_approval"
  | "executing"
  | "measuring"
  | "complete"
  | "failed"
  | "blocked";

/** Tier on goal-runs (client-level) — excludes 'black' which is snapshot-only. */
export type GoalTier = "green" | "yellow" | "red";

/** Full risk tier on goal-run-snapshots — includes 'black' for no-auto-execute actions. */
export type RiskTier = "green" | "yellow" | "red" | "black";

export type SnapshotStatus =
  | "proposed"
  | "approved"
  | "blocked_by_contract"
  | "blocked_by_pacer"
  | "blocked_by_scope"
  | "applied"
  | "rejected";

/** Return type for startGoalRun and markGoalRunStatus. */
export interface GoalRunRef {
  id: number;
  status: GoalRunStatus;
}

/** Return type for recordGoalRunSnapshot and attachMeasurement. */
export interface SnapshotRef {
  id: number;
  goalRunId: number;
  measuredAt?: string;
}

export interface StartGoalRunArgs {
  clientId: number;
  goal: string;
  tier?: GoalTier;
}

export interface RecordSnapshotArgs {
  goalRunId: number;
  step: number;
  action: string;
  riskTier: RiskTier;
  status: SnapshotStatus;
  campaignIds?: string[];
  proposedPayload: Record<string, unknown>;
  modifiedPayload?: Record<string, unknown> | null;
  blockReason?: string;
  approvalId?: number;
}

export interface MarkStatusArgs {
  goalRunId: number;
  status: GoalRunStatus;
  error?: string;
  completedAt?: string;
}

export interface AttachMeasurementArgs {
  snapshotId: number;
  measuredAt: string;
  measuredResult: Record<string, unknown>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a goal-runs row with status: "analysing".
 * The tier is set separately via markGoalRunTier (future) or left null
 * to be updated as snapshots are recorded.
 */
export async function startGoalRun(
  payload: Payload,
  args: StartGoalRunArgs,
): Promise<GoalRunRef> {
  const doc = await payload.create({
    collection: "goal-runs",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      client: args.clientId,
      goal: args.goal,
      status: "analysing",
      ...(args.tier ? { tier: args.tier } : {}),
    } as any,
    overrideAccess: true,
  });
  return { id: doc.id, status: doc.status as GoalRunStatus };
}

/**
 * Record one decision step within a goal run.
 *
 * Call this BEFORE calling any handler. Pass the full proposedPayload;
 * if a guardrail modifies it, set modifiedPayload to the allowed version.
 * If fully blocked, set modifiedPayload = null and blockReason accordingly.
 *
 * campaignIds is optional — omit or pass empty array if not applicable.
 */
export async function recordGoalRunSnapshot(
  payload: Payload,
  args: RecordSnapshotArgs,
): Promise<SnapshotRef> {
  const data: Record<string, unknown> = {
    goalRun: args.goalRunId,
    step: args.step,
    action: args.action,
    riskTier: args.riskTier,
    status: args.status,
    proposedPayload: args.proposedPayload,
    modifiedPayload: args.modifiedPayload ?? null,
    blockReason: args.blockReason ?? null,
  };

  if (args.campaignIds && args.campaignIds.length > 0) {
    data.campaignIds = args.campaignIds.map((id) => ({ campaignId: id }));
  }

  if (args.approvalId) {
    data.approval = args.approvalId;
  }

  const doc = await payload.create({
    collection: "goal-run-snapshots",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
    overrideAccess: true,
  });
  return { id: doc.id, goalRunId: args.goalRunId };
}

/**
 * Transition a goal run to a new status.
 *
 * Set completedAt when moving to complete / failed / blocked.
 * Set error when moving to failed.
 */
export async function markGoalRunStatus(
  payload: Payload,
  args: MarkStatusArgs,
): Promise<GoalRunRef> {
  const update: Record<string, unknown> = { status: args.status };

  if (args.error !== undefined) update.error = args.error;
  if (args.completedAt !== undefined) update.completedAt = args.completedAt;

  const doc = await payload.update({
    collection: "goal-runs",
    id: args.goalRunId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: update as any,
    overrideAccess: true,
  });
  return { id: doc.id, status: doc.status as GoalRunStatus };
}

/**
 * Record the outcome of an applied action — called after the measurement
 * window closes. Sets measuredAt and measuredResult on the snapshot.
 *
 * measuredResult is a free-form object, e.g.:
 *   { wastedSpendReduction: -0.31, impressionsGained: 14200 }
 */
export async function attachMeasurement(
  payload: Payload,
  args: AttachMeasurementArgs,
): Promise<SnapshotRef> {
  const doc = await payload.update({
    collection: "goal-run-snapshots",
    id: args.snapshotId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      measuredAt: args.measuredAt,
      measuredResult: args.measuredResult,
    } as any,
    overrideAccess: true,
  });
  return {
    id: doc.id,
    goalRunId: (doc.goalRun as { id: number } | number) as number,
    measuredAt: args.measuredAt,
  };
}
