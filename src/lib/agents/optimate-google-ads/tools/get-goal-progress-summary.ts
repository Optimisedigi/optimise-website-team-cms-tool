/**
 * Tool: get_goal_progress_summary
 *
 * Read-only roll-up for one goal-agent run. This gives OptiMate a compact,
 * consistent answer surface for questions like "how is the goal progressing?",
 * "what changes have been made?", and "is it improving against the goal?"
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import type { GoalRunStatus } from "@/lib/goal-agents/goal-run-audit";
import payloadConfig from "@/payload.config";
import { getPayload } from "payload";

const SNAPSHOT_LIMIT = 500;

interface GetGoalProgressSummaryArgs {
  goalRunId: number;
}

interface GoalRunDocLike {
  id: number;
  client?: number | string | { id?: number | string } | null;
  goal?: string | null;
  status?: GoalRunStatus | null;
  tier?: "green" | "yellow" | "red" | null;
  iterationsCount?: number | null;
  nextCheckAt?: string | null;
  coolingOffUntil?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  parameters?: unknown;
}

interface GoalRunSnapshotDocLike {
  id: number;
  step?: number | null;
  action?: string | null;
  riskTier?: string | null;
  status?: string | null;
  blockReason?: string | null;
  campaignIds?: Array<{ campaignId?: string | null }> | null;
  approval?: number | string | { id?: number | string } | null;
  measuredAt?: string | null;
  measuredResult?: unknown;
  proposedPayload?: unknown;
  modifiedPayload?: unknown;
  createdAt?: string | null;
}

interface SnapshotSummary {
  id: number;
  step: number | null;
  action: string | null;
  status: string | null;
  riskTier: string | null;
  blockReason: string | null;
  campaignIds: string[];
  hasApproval: boolean;
  hasMeasuredResult: boolean;
  measuredAt: string | null;
  measuredResult: unknown;
  proposedPayloadKeys: string[];
  modifiedPayloadKeys: string[];
  createdAt: string | null;
}

function extractRelationId(value: GoalRunDocLike["client"]): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && "id" in value && value.id !== undefined && value.id !== null) {
    return value.id;
  }
  return null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "object" && !Array.isArray(value)) return Object.keys(value).length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) {
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

function extractObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

export const getGoalProgressSummary: CanonicalTool<GetGoalProgressSummaryArgs> = {
  name: "get_goal_progress_summary",
  description:
    "Compact progress roll-up for one goal-agent run. Args: goalRunId (integer, required). Returns current status, counts of proposed/applied/approved/rejected/blocked changes, risk-tier counts, action counts, recent changes, measured results, latest blockers, next check time, and summary hints. Use when the team asks how a goal is progressing, what changes have been made, or how it is performing against the goal.",
  inputSchema: {
    type: "object",
    properties: {
      goalRunId: {
        type: "integer",
        minimum: 1,
        description: "The goal-runs row id to summarise. Get this from list_goal_runs if unknown.",
      },
    },
    required: ["goalRunId"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const rawId = obj.goalRunId;
    if (rawId === undefined || rawId === null) throw new Error("goalRunId is required");
    const n = typeof rawId === "number" ? rawId : Number(rawId);
    if (!Number.isFinite(n)) throw new Error("goalRunId must be a finite number");
    const goalRunId = Math.trunc(n);
    if (goalRunId < 1) throw new Error("goalRunId must be >= 1");
    return { goalRunId };
  },
  execute: async (args, ctx) => {
    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    let run: GoalRunDocLike;
    try {
      run = (await payload.findByID({
        collection: "goal-runs" as never,
        id: args.goalRunId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as GoalRunDocLike;
    } catch {
      return { ok: false, error: `goal-run ${args.goalRunId} not found` };
    }

    const ctxClientId = ctx.context.clientId;
    if (ctxClientId !== undefined && ctxClientId !== null && ctxClientId !== "") {
      const runClientId = extractRelationId(run.client);
      if (runClientId === null || String(runClientId) !== String(ctxClientId)) {
        return { ok: false, error: "goal-run belongs to a different client" };
      }
    }

    let snapshotResult;
    try {
      snapshotResult = await payload.find({
        collection: "goal-run-snapshots" as never,
        where: { goalRun: { equals: args.goalRunId } } as never,
        sort: "step",
        limit: SNAPSHOT_LIMIT,
        depth: 0,
        overrideAccess: true,
      });
    } catch (err) {
      return { ok: false, error: `Failed to load snapshots: ${(err as Error).message}` };
    }

    const snapshots = ((snapshotResult.docs as unknown as GoalRunSnapshotDocLike[]) ?? []).map(
      (snapshot): SnapshotSummary => ({
        id: snapshot.id,
        step: snapshot.step ?? null,
        action: snapshot.action ?? null,
        status: snapshot.status ?? null,
        riskTier: snapshot.riskTier ?? null,
        blockReason: snapshot.blockReason ?? null,
        campaignIds: (snapshot.campaignIds ?? [])
          .map((row) => row.campaignId)
          .filter((campaignId): campaignId is string => Boolean(campaignId)),
        hasApproval: snapshot.approval !== null && snapshot.approval !== undefined,
        hasMeasuredResult: hasValue(snapshot.measuredResult),
        measuredAt: snapshot.measuredAt ?? null,
        measuredResult: snapshot.measuredResult ?? null,
        proposedPayloadKeys: extractObjectKeys(snapshot.proposedPayload),
        modifiedPayloadKeys: extractObjectKeys(snapshot.modifiedPayload),
        createdAt: snapshot.createdAt ?? null,
      }),
    );

    const statuses = snapshots.map((snapshot) => snapshot.status).filter((s): s is string => Boolean(s));
    const riskTiers = snapshots.map((snapshot) => snapshot.riskTier).filter((s): s is string => Boolean(s));
    const actions = snapshots.map((snapshot) => snapshot.action).filter((s): s is string => Boolean(s));
    const measuredSnapshots = snapshots.filter((snapshot) => snapshot.hasMeasuredResult);
    const blockedSnapshots = snapshots.filter((snapshot) => snapshot.status?.startsWith("blocked_"));
    const approvalSnapshots = snapshots.filter((snapshot) => snapshot.hasApproval);

    const appliedCount = statuses.filter((status) => status === "applied").length;
    const approvedCount = statuses.filter((status) => status === "approved").length;
    const rejectedCount = statuses.filter((status) => status === "rejected").length;
    const proposedCount = statuses.filter((status) => status === "proposed").length;
    const blockedCount = blockedSnapshots.length;

    const recentChanges = snapshots
      .filter((snapshot) =>
        ["proposed", "approved", "applied", "rejected"].includes(snapshot.status ?? ""),
      )
      .slice(-10)
      .reverse();

    const latestMeasuredResult = measuredSnapshots.at(-1) ?? null;
    const measuredResultKeys = Array.from(
      new Set(measuredSnapshots.flatMap((snapshot) => extractObjectKeys(snapshot.measuredResult))),
    ).sort();

    return {
      ok: true,
      data: {
        goalRun: {
          id: run.id,
          goal: run.goal ?? null,
          status: run.status ?? null,
          tier: run.tier ?? null,
          iterationsCount: run.iterationsCount ?? 0,
          nextCheckAt: run.nextCheckAt ?? null,
          coolingOffUntil: run.coolingOffUntil ?? null,
          createdAt: run.createdAt ?? null,
          completedAt: run.completedAt ?? null,
          error: run.error ?? null,
          parameters: run.parameters ?? null,
        },
        progress: {
          totalSnapshots: snapshots.length,
          totalChangesProposed: proposedCount + approvedCount + appliedCount + rejectedCount,
          proposedCount,
          approvedCount,
          appliedCount,
          rejectedCount,
          blockedCount,
          approvalLinkedCount: approvalSnapshots.length,
          measuredCount: measuredSnapshots.length,
          statusCounts: countBy(statuses),
          riskTierCounts: countBy(riskTiers),
          actionCounts: countBy(actions),
        },
        latest: {
          latestSnapshot: snapshots.at(-1) ?? null,
          latestMeasuredResult,
          latestBlocker: blockedSnapshots.at(-1) ?? null,
        },
        summaryHints: {
          hasAppliedChanges: appliedCount > 0,
          hasPendingApproval: proposedCount > 0 || approvalSnapshots.some((snapshot) => snapshot.status !== "applied"),
          hasMeasuredImpact: measuredSnapshots.length > 0,
          hasBlockers: blockedCount > 0,
          changedCampaignIds: Array.from(
            new Set(snapshots.flatMap((snapshot) => snapshot.campaignIds)),
          ).sort(),
        },
        measuredResultKeys,
        recentChanges,
        blockers: blockedSnapshots.slice(-10).reverse(),
      },
    };
  },
};
