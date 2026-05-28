/**
 * Tool: get_goal_run
 *
 * Read-only. Detail view of a single goal-agent run — the `goal-runs` row
 * plus its ordered `goal-run-snapshots` history. Complements `list_goal_runs`:
 * once the operator (or the agent on their behalf) has identified an
 * interesting run via the list view, this tool fetches the full decision
 * trail so the team can answer "what did the agent actually do on run X?".
 *
 * Scoping: when `ctx.context.clientId` is set, the run must belong to that
 * client; otherwise the call returns ok:false with a cross-client error.
 * If no clientId is set in context (e.g. an admin-style call), no scoping is
 * enforced — same posture as a few other read tools where the caller has
 * already vouched for the request.
 */
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import type { GoalRunStatus } from "@/lib/goal-agents/goal-run-audit";

const SNAPSHOT_LIMIT = 200;

export interface GetGoalRunArgs {
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
}

interface GoalRunSnapshotDocLike {
  id: number;
  step?: number | null;
  action?: string | null;
  riskTier?: string | null;
  status?: string | null;
  blockReason?: string | null;
  measuredResult?: unknown;
  createdAt?: string | null;
}

interface SnapshotRow {
  id: number;
  step: number | null;
  action: string | null;
  riskTier: string | null;
  status: string | null;
  blockReason: string | null;
  measuredResult: unknown;
  createdAt: string | null;
}

interface GoalRunRow {
  id: number;
  goal: string | null;
  status: GoalRunStatus | null;
  tier: "green" | "yellow" | "red" | null;
  iterationsCount: number;
  nextCheckAt: string | null;
  coolingOffUntil: string | null;
  createdAt: string | null;
  completedAt: string | null;
  error: string | null;
}

/** Pull a numeric/string id out of either a flat fk or a depth>0 populated relation. */
function extractRelationId(
  value: GoalRunDocLike["client"],
): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && "id" in value && value.id !== undefined && value.id !== null) {
    return value.id as number | string;
  }
  return null;
}

export const getGoalRun: CanonicalTool<GetGoalRunArgs> = {
  name: "get_goal_run",
  description:
    "Detail view of one goal-agent run, including its full decision history (goal-run-snapshots). Args: goalRunId (integer, required). Returns the goal-runs row plus an ordered list of snapshots (step, action, riskTier, status, blockReason, measuredResult, createdAt). Use after `list_goal_runs` when the team asks 'what did the agent do on run X?'",
  inputSchema: {
    type: "object",
    properties: {
      goalRunId: {
        type: "integer",
        minimum: 1,
        description:
          "The goal-runs row id to fetch. Get this from `list_goal_runs` (the `id` field of each row).",
      },
    },
    required: ["goalRunId"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    const v = obj.goalRunId;
    if (v === undefined || v === null) {
      throw new Error("goalRunId is required");
    }
    let n: number;
    if (typeof v === "number") {
      n = v;
    } else if (typeof v === "string" && v.trim() !== "") {
      n = Number(v);
    } else {
      throw new Error("goalRunId must be a number");
    }
    if (!Number.isFinite(n)) {
      throw new Error("goalRunId must be a finite number");
    }
    const intVal = Math.trunc(n);
    if (intVal < 1) {
      throw new Error("goalRunId must be >= 1");
    }
    return { goalRunId: intVal };
  },
  execute: async (args, ctx) => {
    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    // 1) Fetch the run.
    let doc: GoalRunDocLike;
    try {
      doc = (await payload.findByID({
        collection: "goal-runs" as never,
        id: args.goalRunId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as GoalRunDocLike;
    } catch {
      return { ok: false, error: `goal-run ${args.goalRunId} not found` };
    }

    // 2) Enforce client scoping when the chat context has a client linked.
    const ctxClientId = ctx.context.clientId;
    if (
      ctxClientId !== undefined &&
      ctxClientId !== null &&
      ctxClientId !== ""
    ) {
      const rowClientId = extractRelationId(doc.client);
      if (rowClientId === null) {
        return {
          ok: false,
          error: "goal-run belongs to a different client",
        };
      }
      // Compare loosely: ids in Payload can come back as numbers or
      // numeric strings depending on the adapter. We normalise both sides
      // to string before comparing.
      if (String(rowClientId) !== String(ctxClientId)) {
        return {
          ok: false,
          error: "goal-run belongs to a different client",
        };
      }
    }

    // 3) Fetch the decision history.
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
      return {
        ok: false,
        error: `Failed to load snapshots: ${(err as Error).message}`,
      };
    }

    const snapDocs =
      (snapshotResult.docs as unknown as GoalRunSnapshotDocLike[]) ?? [];
    const snapshots: SnapshotRow[] = snapDocs.map((s) => ({
      id: s.id,
      step: s.step ?? null,
      action: s.action ?? null,
      riskTier: s.riskTier ?? null,
      status: s.status ?? null,
      blockReason: s.blockReason ?? null,
      measuredResult: s.measuredResult ?? null,
      createdAt: s.createdAt ?? null,
    }));

    const goalRun: GoalRunRow = {
      id: doc.id,
      goal: doc.goal ?? null,
      status: doc.status ?? null,
      tier: doc.tier ?? null,
      iterationsCount: doc.iterationsCount ?? 0,
      nextCheckAt: doc.nextCheckAt ?? null,
      coolingOffUntil: doc.coolingOffUntil ?? null,
      createdAt: doc.createdAt ?? null,
      completedAt: doc.completedAt ?? null,
      error: doc.error ?? null,
    };

    return {
      ok: true,
      data: { goalRun, snapshots },
    };
  },
};
