/**
 * Tool: create_goal_run
 *
 * Side-effecting. Queues a new autonomous goal-agent run for the current
 * client in `awaiting_data` so the scheduler picks it up on the next hourly
 * tick.
 *
 * Flow:
 *   1. Validate the requested `goal` against the runtime registry
 *      (`GOAL_TYPES`) — never hardcoded.
 *   2. Refuse if no client is linked to the chat context.
 *   3. Refuse if an active (non-terminal) goal-run of the same goal already
 *      exists for this client, surfacing the existing id so the operator can
 *      inspect it via `get_goal_run`.
 *   4. Create the row via `startGoalRun` (status defaults to "analysing"),
 *      then immediately transition to "awaiting_data" (legal per
 *      LEGAL_TRANSITIONS) so the scheduler treats it as a fresh queue entry.
 *   5. Stamp `nextCheckAt = now` so the next tick picks it up.
 *   6. If the caller supplied a `reason`, write step 1 as a proposed snapshot
 *      for audit ("created by optimate-chat").
 */
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import { GOAL_TYPES } from "@/lib/goal-agents/goal-types";
import {
  startGoalRun,
  markGoalRunStatus,
  recordGoalRunSnapshot,
} from "@/lib/goal-agents/goal-run-audit";

const GOAL_KEYS = Object.keys(GOAL_TYPES) as Array<keyof typeof GOAL_TYPES>;

const MAX_REASON_LEN = 500;

export interface CreateGoalRunArgs {
  goal: string;
  reason?: string;
}

interface ExistingGoalRunDoc {
  id: number;
}

export const createGoalRun: CanonicalTool<CreateGoalRunArgs> = {
  name: "create_goal_run",
  description:
    "Queue a new autonomous goal-agent run for the current client. The scheduler picks it up on the next hourly tick. Args: goal (required \u2014 must be a registered goal type; currently 'search-term-waste-reducer'), reason (optional \u2014 short note recorded as the run's first snapshot for audit). Use when the team says 'set up waste-reducer for this client'. Returns the new goal-run id and initial state. Goal type 'search-term-waste-reducer' starts in awaiting_data and waits for a fresh google-ads-snapshots row before doing anything.",
  inputSchema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        enum: GOAL_KEYS as unknown as string[],
        description:
          "Which goal-agent recipe to queue. Must match a registered key in GOAL_TYPES.",
      },
      reason: {
        type: "string",
        maxLength: MAX_REASON_LEN,
        description:
          "Optional short note explaining why the run is being created. Recorded as the run's first snapshot for audit.",
      },
    },
    required: ["goal"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    const g = obj.goal;
    if (g === undefined || g === null || (typeof g === "string" && g.trim() === "")) {
      throw new Error("goal is required");
    }
    if (typeof g !== "string") {
      throw new Error("goal must be a string");
    }
    if (!(g in GOAL_TYPES)) {
      throw new Error(
        `Unknown goal '${g}'. Valid goals: ${GOAL_KEYS.join(", ")}`,
      );
    }

    const out: CreateGoalRunArgs = { goal: g };

    const r = obj.reason;
    if (r !== undefined && r !== null) {
      if (typeof r !== "string") {
        throw new Error("reason must be a string");
      }
      const trimmed = r.trim();
      if (trimmed.length > MAX_REASON_LEN) {
        throw new Error(`reason must be <= ${MAX_REASON_LEN} chars`);
      }
      if (trimmed.length > 0) {
        out.reason = trimmed;
      }
    }

    return out;
  },
  execute: async (args, ctx) => {
    const ctxClientId = ctx.context.clientId;
    if (
      ctxClientId === undefined ||
      ctxClientId === null ||
      ctxClientId === ""
    ) {
      return {
        ok: false,
        error: "No client linked; cannot create a goal run.",
      };
    }

    const clientId = Number(ctxClientId);
    if (!Number.isFinite(clientId)) {
      return {
        ok: false,
        error: "No client linked; cannot create a goal run.",
      };
    }

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    // 1) Refuse if a non-terminal run of the same goal already exists for
    //    this client. We surface the existing id so the operator can use
    //    `get_goal_run` to inspect it instead of double-queuing.
    let existing;
    try {
      existing = await payload.find({
        collection: "goal-runs" as never,
        where: {
          and: [
            { client: { equals: clientId } },
            { goal: { equals: args.goal } },
            { status: { not_in: ["complete", "failed"] } },
          ],
        } as never,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to check existing goal runs: ${(err as Error).message}`,
      };
    }

    const existingDocs = (existing.docs ?? []) as ExistingGoalRunDoc[];
    if (existingDocs.length > 0) {
      const id = existingDocs[0]?.id;
      return {
        ok: false,
        error: `An active ${args.goal} run already exists for this client (id: ${id}). Use get_goal_run to inspect it.`,
      };
    }

    // 2) Create the run. startGoalRun lands it in "analysing"; we then
    //    transition to "awaiting_data" so the scheduler sees a fresh queue
    //    entry on the next tick. The analysing→awaiting_data move is legal
    //    per LEGAL_TRANSITIONS.
    let ref;
    try {
      ref = await startGoalRun(payload, {
        clientId,
        goal: args.goal,
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to create goal run: ${(err as Error).message}`,
      };
    }

    try {
      await markGoalRunStatus(payload, {
        goalRunId: ref.id,
        status: "awaiting_data",
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to set goal-run status to awaiting_data: ${(err as Error).message}`,
      };
    }

    // 3) Stamp nextCheckAt so the next scheduler tick treats this row as due.
    const nextCheckAt = new Date().toISOString();
    try {
      await payload.update({
        collection: "goal-runs",
        id: ref.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { nextCheckAt } as any,
        overrideAccess: true,
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to stamp nextCheckAt on goal run: ${(err as Error).message}`,
      };
    }

    // 4) Optionally record the reason as the first audit snapshot.
    if (args.reason && args.reason.length > 0) {
      try {
        await recordGoalRunSnapshot(payload, {
          goalRunId: ref.id,
          step: 1,
          action: "create_goal_run",
          riskTier: "green",
          status: "proposed",
          proposedPayload: {
            reason: args.reason,
            createdBy: "optimate-chat",
          },
        });
      } catch (err) {
        // The run is already created and queued — don't fail the whole call
        // because the audit snapshot didn't land. Surface it in the message
        // so the operator knows the audit trail is partial.
        return {
          ok: true,
          data: {
            goalRunId: ref.id,
            goal: args.goal,
            status: "awaiting_data" as const,
            nextCheckAt,
            message: `Goal queued. The scheduler will pick it up on the next hourly tick. (Note: failed to record initial audit snapshot: ${(err as Error).message})`,
          },
        };
      }
    }

    return {
      ok: true,
      data: {
        goalRunId: ref.id,
        goal: args.goal,
        status: "awaiting_data" as const,
        nextCheckAt,
        message:
          "Goal queued. The scheduler will pick it up on the next hourly tick.",
      },
    };
  },
};
