/**
 * Tool: list_goal_runs
 *
 * Read-only. Returns goal-agent runs scoped to the client the OptiMate chat is
 * currently audit-linked to, so the agent can answer "what goals are running
 * for this client?" without forcing the human to dig through the goal-runs
 * collection. Mirrors the read-only payload-find pattern of list_scheduled_tasks
 * but scopes by `client` (audit-linked) instead of `createdBy` (CMS user).
 *
 * For each row it also fetches the most recent `goal-run-snapshots.action`
 * (highest `step`) so the agent can summarise "what did this run just do?"
 * without a second tool round-trip.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import type { GoalRunStatus } from "@/lib/goal-agents/goal-run-audit";

const ALL_STATUSES: readonly GoalRunStatus[] = [
  "awaiting_data",
  "analysing",
  "pending_approval",
  "executing",
  "measuring",
  "complete",
  "failed",
  "blocked",
];

const TERMINAL_STATUSES: readonly GoalRunStatus[] = ["complete", "failed"];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListGoalRunsArgs {
  status?: GoalRunStatus;
  limit?: number;
  includeCompleted?: boolean;
}

interface GoalRunDocLike {
  id: number;
  goal: string;
  status: GoalRunStatus;
  tier?: "green" | "yellow" | "red" | null;
  iterationsCount?: number | null;
  nextCheckAt?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
}

interface GoalRunSnapshotDocLike {
  id: number;
  step: number;
  action: string;
}

interface GoalRunRow {
  id: number;
  goal: string;
  status: GoalRunStatus;
  tier: "green" | "yellow" | "red" | null;
  iterationsCount: number;
  nextCheckAt: string | null;
  createdAt: string | null;
  completedAt: string | null;
  latestSnapshotAction: string | null;
}

export const listGoalRuns: CanonicalTool<ListGoalRunsArgs> = {
  name: "list_goal_runs",
  description:
    "List goal-agent runs for the current client. Args: status (optional — filter to one of awaiting_data, analysing, pending_approval, executing, measuring, complete, failed, blocked), limit (default 20, max 100), includeCompleted (default false — hides complete/failed unless status filter is set). Returns id, goal, status, tier, iterationsCount, nextCheckAt, createdAt, completedAt, latestSnapshotAction. Use to answer 'what goals are running for this client?'",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: [...ALL_STATUSES],
        description:
          "Filter to a single status. When set, includeCompleted is ignored.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: MAX_LIMIT,
        description: `Max rows to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
      },
      includeCompleted: {
        type: "boolean",
        description:
          "If true, also includes runs in `complete` or `failed`. Defaults to false so the agent sees in-flight work first.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    // status
    let status: GoalRunStatus | undefined;
    if (obj.status !== undefined && obj.status !== null) {
      if (typeof obj.status !== "string") {
        throw new Error("status must be a string");
      }
      if (!ALL_STATUSES.includes(obj.status as GoalRunStatus)) {
        throw new Error(
          `status must be one of: ${ALL_STATUSES.join(", ")}`,
        );
      }
      status = obj.status as GoalRunStatus;
    }

    // limit
    let limit = DEFAULT_LIMIT;
    if (obj.limit !== undefined && obj.limit !== null) {
      if (typeof obj.limit !== "number" || !Number.isFinite(obj.limit)) {
        throw new Error("limit must be a finite number");
      }
      const intLimit = Math.trunc(obj.limit);
      if (intLimit < 1) {
        throw new Error("limit must be >= 1");
      }
      limit = Math.min(intLimit, MAX_LIMIT);
    }

    // includeCompleted
    const includeCompleted =
      typeof obj.includeCompleted === "boolean" ? obj.includeCompleted : false;

    return { status, limit, includeCompleted };
  },
  execute: async (args, ctx) => {
    const clientIdRaw = ctx.context.clientId;
    if (
      clientIdRaw === undefined ||
      clientIdRaw === null ||
      clientIdRaw === ""
    ) {
      return {
        ok: false,
        error: "No client linked to this audit; cannot list goal runs.",
      };
    }

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    const andClauses: Array<Record<string, unknown>> = [
      { client: { equals: clientIdRaw } },
    ];
    if (args.status) {
      andClauses.push({ status: { equals: args.status } });
    } else if (!args.includeCompleted) {
      andClauses.push({ status: { not_in: [...TERMINAL_STATUSES] } });
    }

    let result;
    try {
      result = await payload.find({
        collection: "goal-runs" as never,
        where: { and: andClauses } as never,
        sort: "-createdAt",
        limit: args.limit ?? DEFAULT_LIMIT,
        depth: 0,
        overrideAccess: true,
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to list goal runs: ${(err as Error).message}`,
      };
    }

    const docs = (result.docs as unknown as GoalRunDocLike[]) ?? [];

    const rows: GoalRunRow[] = [];
    for (const doc of docs) {
      let latestSnapshotAction: string | null = null;
      try {
        const snapResult = await payload.find({
          collection: "goal-run-snapshots" as never,
          where: { goalRun: { equals: doc.id } } as never,
          sort: "-step",
          limit: 1,
          depth: 0,
          overrideAccess: true,
        });
        const snapDocs =
          (snapResult.docs as unknown as GoalRunSnapshotDocLike[]) ?? [];
        if (snapDocs.length > 0 && typeof snapDocs[0]?.action === "string") {
          latestSnapshotAction = snapDocs[0].action;
        }
      } catch {
        // Best-effort — a snapshot lookup failure shouldn't kill the whole list.
        latestSnapshotAction = null;
      }

      rows.push({
        id: doc.id,
        goal: doc.goal,
        status: doc.status,
        tier: doc.tier ?? null,
        iterationsCount: doc.iterationsCount ?? 0,
        nextCheckAt: doc.nextCheckAt ?? null,
        createdAt: doc.createdAt ?? null,
        completedAt: doc.completedAt ?? null,
        latestSnapshotAction,
      });
    }

    return {
      ok: true,
      data: { rows },
    };
  },
};
