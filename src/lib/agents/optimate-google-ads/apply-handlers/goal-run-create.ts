import type { ApplyHandler } from "@/lib/agents/_shared/apply-dispatcher";
import {
  markGoalRunStatus,
  recordGoalRunSnapshot,
  startGoalRun,
} from "@/lib/goal-agents/goal-run-audit";
import { GOAL_TYPES } from "@/lib/goal-agents/goal-types";

interface GoalRunCreatePayload {
  clientId?: unknown;
  goal?: unknown;
  reason?: unknown;
}

interface ExistingGoalRunDoc {
  id: number;
}

function readPayload(raw: Record<string, unknown>): {
  clientId: number;
  goal: string;
  reason?: string;
} {
  const input = raw as GoalRunCreatePayload;
  const clientId = Number(input.clientId);
  if (!Number.isFinite(clientId)) {
    throw new Error("goal-run-create payload missing valid clientId");
  }

  const goal = typeof input.goal === "string" ? input.goal.trim() : "";
  if (!goal || !(goal in GOAL_TYPES)) {
    throw new Error(
      `goal-run-create payload has invalid goal. Valid goals: ${Object.keys(GOAL_TYPES).join(", ")}`,
    );
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  return {
    clientId,
    goal,
    ...(reason ? { reason } : {}),
  };
}

export const applyGoalRunCreate: ApplyHandler = async (rawPayload, ctx) => {
  const args = readPayload(rawPayload);

  const existing = await ctx.payload.find({
    collection: "goal-runs" as never,
    where: {
      and: [
        { client: { equals: args.clientId } },
        { goal: { equals: args.goal } },
        { status: { not_in: ["complete", "failed"] } },
      ],
    } as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const existingDocs = (existing.docs ?? []) as ExistingGoalRunDoc[];
  if (existingDocs.length > 0) {
    throw new Error(
      `An active ${args.goal} run already exists for this client (id: ${existingDocs[0]?.id}).`,
    );
  }

  const ref = await startGoalRun(ctx.payload, {
    clientId: args.clientId,
    goal: args.goal,
  });

  await markGoalRunStatus(ctx.payload, {
    goalRunId: ref.id,
    status: "awaiting_data",
  });

  const nextCheckAt = new Date().toISOString();
  await ctx.payload.update({
    collection: "goal-runs",
    id: ref.id,
    data: { nextCheckAt } as never,
    overrideAccess: true,
  });

  await recordGoalRunSnapshot(ctx.payload, {
    goalRunId: ref.id,
    step: 1,
    action: "create_goal_run",
    riskTier: "green",
    status: "approved",
    proposedPayload: {
      ...(args.reason ? { reason: args.reason } : {}),
      createdBy: "agent-approval",
      approvalId: ctx.approvalId,
      appliedByUserId: ctx.userId,
    },
    approvalId: ctx.approvalId,
  });

  return {
    message: `Created ${args.goal} goal run #${ref.id}.`,
    detail: {
      goalRunId: ref.id,
      goal: args.goal,
      status: "awaiting_data",
      nextCheckAt,
    },
  };
};
