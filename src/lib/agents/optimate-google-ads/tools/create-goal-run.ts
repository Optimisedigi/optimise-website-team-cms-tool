/**
 * Tool: create_goal_run
 *
 * Side-effecting only in the approval queue. Queues a human approval row to
 * create a new autonomous goal-agent run for the current client. The goal run
 * is not created until an admin approves and applies the queued proposal.
 */
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";
import { GOAL_TYPES } from "@/lib/goal-agents/goal-types";

const GOAL_KEYS = Object.keys(GOAL_TYPES) as Array<keyof typeof GOAL_TYPES>;

const MAX_REASON_LEN = 500;

export interface CreateGoalRunArgs {
  goal: string;
  reason?: string;
  summary?: string;
  supportingNumbers?: string[];
}

export const createGoalRun: CanonicalTool<CreateGoalRunArgs> = {
  name: "create_goal_run",
  description:
    "Queue human approval to create a new autonomous goal-agent run for the current client. Args: goal (required, must be a registered goal type; currently 'search-term-waste-reducer'), reason (optional), summary (optional), supportingNumbers (optional). Use when the team says 'set up waste-reducer for this client'. Returns an approval id and URL. The run is not created until approved and applied.",
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
      summary: {
        type: "string",
        maxLength: 500,
        description: "1 to 3 sentence summary shown to the human approval reviewer.",
      },
      supportingNumbers: {
        type: "array",
        items: { type: "string" },
        description: "Optional evidence from read tools supporting why this goal run should be created.",
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

    const summary = obj.summary;
    if (summary !== undefined && summary !== null) {
      if (typeof summary !== "string") throw new Error("summary must be a string");
      const trimmed = summary.trim();
      if (trimmed.length > 500) throw new Error("summary must be <= 500 chars");
      if (trimmed.length > 0) out.summary = trimmed;
    }

    const supportingNumbers = obj.supportingNumbers;
    if (supportingNumbers !== undefined && supportingNumbers !== null) {
      if (!Array.isArray(supportingNumbers)) {
        throw new Error("supportingNumbers must be an array of strings");
      }
      const cleaned = supportingNumbers
        .map((item) => {
          if (typeof item !== "string") throw new Error("supportingNumbers entries must be strings");
          return item.trim();
        })
        .filter(Boolean)
        .slice(0, 10);
      if (cleaned.length > 0) out.supportingNumbers = cleaned;
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
        error: "No client linked; cannot queue a goal run approval.",
      };
    }

    const clientId = Number(ctxClientId);
    if (!Number.isFinite(clientId)) {
      return {
        ok: false,
        error: "No client linked; cannot queue a goal run approval.",
      };
    }

    const summary = args.summary ?? `Queue a ${args.goal} goal-agent run for this client.`;
    const internalMarkdown = buildInternalMarkdown({
      summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: [
        `**Goal:** ${args.goal}`,
        args.reason ? `**Reason:** ${args.reason}` : "**Reason:** Not supplied",
      ].join("\n"),
      applyEffect:
        "Will create a goal-runs row in awaiting_data and set nextCheckAt to now. " +
        "The scheduler will pick it up on the next hourly tick. No Google Ads changes are applied by this approval itself.",
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "goal-run-create",
        title: `Create goal run: ${args.goal}`,
        clientId,
        proposalPayload: {
          clientId,
          goal: args.goal,
          ...(args.reason ? { reason: args.reason } : {}),
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return {
      ok: true,
      data: {
        approvalId,
        approvalUrl: agentApprovalPath(approvalId),
        message: "Goal run queued for human approval. It will not start until approved and applied.",
      },
    };
  },
};
