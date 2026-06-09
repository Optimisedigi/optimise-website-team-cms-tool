import type { Payload } from "payload";

import type { ApplyHandler } from "@/lib/agents/_shared/apply-dispatcher";
import {
  markGoalRunStatus,
  recordGoalRunSnapshot,
  startGoalRun,
} from "@/lib/goal-agents/goal-run-audit";
import { getCampaignSnapshot } from "@/lib/google-ads-snapshots";

const GOAL_KEY = "account-efficiency";

interface AccountEfficiencyGoalRunCreatePayload {
  clientId?: unknown;
  parameters?: unknown;
  reason?: unknown;
}

interface ExistingGoalRunDoc {
  id: number;
}

function readPayload(raw: Record<string, unknown>): {
  clientId: number;
  parameters: Record<string, unknown>;
  reason?: string;
} {
  const input = raw as AccountEfficiencyGoalRunCreatePayload;
  const clientId = Number(input.clientId);
  if (!Number.isFinite(clientId)) {
    throw new Error("account-efficiency-goal-run-create payload missing valid clientId");
  }

  const parameters =
    input.parameters && typeof input.parameters === "object" && !Array.isArray(input.parameters)
      ? (input.parameters as Record<string, unknown>)
      : {};
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  return {
    clientId,
    parameters,
    ...(reason ? { reason } : {}),
  };
}

/**
 * Resolve the supplied monthly-budget prerequisite from the run parameters.
 * Returns null when not supplied (legacy/backward-compatible path). Throws on
 * an invalid (non-numeric / negative) value so the operator gets a clear error
 * rather than silently skipping the overwrite.
 */
function readMonthlyBudget(parameters: Record<string, unknown>): number | null {
  const raw = parameters.monthlyBudget;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    throw new Error(
      "account-efficiency-goal-run-create: parameters.monthlyBudget must be a non-negative finite number.",
    );
  }
  return raw;
}

interface LatestAuditDoc {
  id: number;
  monthlyBudget: number | null;
}

async function resolveLatestAudit(
  payload: Payload,
  clientId: number,
): Promise<LatestAuditDoc | null> {
  const res = await payload.find({
    collection: "google-ads-audits",
    where: { client: { equals: clientId } },
    sort: "-createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = res.docs?.[0] as any;
  if (!doc) return null;
  const id = typeof doc.id === "number" ? doc.id : Number(doc.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    monthlyBudget: typeof doc.monthlyBudget === "number" ? doc.monthlyBudget : null,
  };
}

export const applyAccountEfficiencyGoalRunCreate: ApplyHandler = async (rawPayload, ctx) => {
  const args = readPayload(rawPayload);

  const existing = await ctx.payload.find({
    collection: "goal-runs" as never,
    where: {
      and: [
        { client: { equals: args.clientId } },
        { goal: { equals: GOAL_KEY } },
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
      `An active ${GOAL_KEY} run already exists for this client (id: ${existingDocs[0]?.id}).`,
    );
  }

  const snapshot = await getCampaignSnapshot(ctx.payload, {
    clientId: args.clientId,
    staleAfterMinutes: 1440,
  });
  if (!snapshot || snapshot.rows.length === 0) {
    throw new Error(
      "No campaign snapshot found for this client. The daily google-ads-snapshots cron has not produced data yet (or the client has no google-ads-customer-id configured).",
    );
  }
  const hasImpressionShare = snapshot.rows.some(
    (row) => typeof row.searchImpressionShare === "number",
  );
  if (!hasImpressionShare) {
    throw new Error(
      "Impression-share data (searchImpressionShare) is not yet present in this client's daily snapshots. Without it the budget-shift detector cannot tell budget-bound from rank-bound campaigns.",
    );
  }

  // Monthly-budget prerequisite (REVISED): when supplied, overwrite the
  // client's stored CMS monthly budget on their latest audit. This is the
  // canonical anchor the budget-shift recomputes percentages against. The
  // overwrite is destructive by design — we record the prior value below for
  // auditability and require an existing audit row to write to.
  const monthlyBudget = readMonthlyBudget(args.parameters);
  let monthlyBudgetOverwrite: {
    auditId: number;
    priorMonthlyBudget: number | null;
    newMonthlyBudget: number;
  } | null = null;
  if (monthlyBudget !== null) {
    const audit = await resolveLatestAudit(ctx.payload, args.clientId);
    if (!audit) {
      throw new Error(
        "account-efficiency-goal-run-create: a monthly budget was supplied but no google-ads-audits row exists for this client to write it to. Run a Google Ads audit for the client first.",
      );
    }
    await ctx.payload.update({
      collection: "google-ads-audits",
      id: audit.id,
      data: { monthlyBudget } as never,
      overrideAccess: true,
    });
    monthlyBudgetOverwrite = {
      auditId: audit.id,
      priorMonthlyBudget: audit.monthlyBudget,
      newMonthlyBudget: monthlyBudget,
    };
  }

  const ref = await startGoalRun(ctx.payload, {
    clientId: args.clientId,
    goal: GOAL_KEY,
  });

  await markGoalRunStatus(ctx.payload, {
    goalRunId: ref.id,
    status: "awaiting_data",
  });

  const nextCheckAt = new Date().toISOString();
  await ctx.payload.update({
    collection: "goal-runs",
    id: ref.id,
    data: {
      nextCheckAt,
      parameters: args.parameters,
    } as never,
    overrideAccess: true,
  });

  await recordGoalRunSnapshot(ctx.payload, {
    goalRunId: ref.id,
    step: 1,
    action: "create_account_efficiency_goal_run",
    riskTier: "green",
    status: "approved",
    proposedPayload: {
      ...(args.reason ? { reason: args.reason } : {}),
      parameters: args.parameters,
      createdBy: "agent-approval",
      approvalId: ctx.approvalId,
      appliedByUserId: ctx.userId,
      ...(monthlyBudgetOverwrite ? { monthlyBudgetOverwrite } : {}),
    },
    approvalId: ctx.approvalId,
  });

  return {
    message: monthlyBudgetOverwrite
      ? `Created Account Efficiency goal run #${ref.id}. Overwrote monthly budget on audit #${monthlyBudgetOverwrite.auditId} (was ${monthlyBudgetOverwrite.priorMonthlyBudget ?? "unset"}, now $${monthlyBudgetOverwrite.newMonthlyBudget.toLocaleString()}).`
      : `Created Account Efficiency goal run #${ref.id}.`,
    detail: {
      goalRunId: ref.id,
      goal: GOAL_KEY,
      status: "awaiting_data",
      nextCheckAt,
      parameters: args.parameters,
      ...(monthlyBudgetOverwrite ? { monthlyBudgetOverwrite } : {}),
    },
  };
};
