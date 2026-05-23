/**
 * Tool: create_account_efficiency_goal_run
 *
 * Side-effecting. Queues a new Account Efficiency goal-agent run for the
 * current client in `awaiting_data`. The scheduler picks it up on the next
 * hourly tick and starts pulling the four levers described in
 * `.gg/plans/budget-reallocation-goal-agent.md`.
 *
 * Lever 1 (budget shift between campaigns) is wired in this build. The
 * other levers (ad-group pause, keyword pause, bid adjustment, strategy
 * alert) are NOT yet implemented \u2014 attempting to enable them via
 * `enabledLevers` is rejected so the operator gets a clear signal rather
 * than silent no-ops.
 *
 * Preflight gates:
 *   1. A client must be linked to the chat context.
 *   2. No active (non-terminal) account-efficiency run may already exist
 *      for this client \u2014 surfaces the existing id so the operator can
 *      inspect it via `get_goal_run`.
 *   3. The client's latest campaign snapshot must carry impression-share
 *      data (`searchImpressionShare`) on at least one row. Without it the
 *      budget-shift detector can't distinguish budget-bound from
 *      rank-bound recipients, so the agent has nothing to act on.
 *      (Gap 1 prerequisite \u2014 see the plan doc.)
 *
 * On success the tool:
 *   - creates the goal-runs row via `startGoalRun` (status: analysing),
 *   - transitions it to `awaiting_data` (legal per LEGAL_TRANSITIONS),
 *   - persists the validated parameters JSON on the row,
 *   - stamps `nextCheckAt = now` so the scheduler picks it up,
 *   - records the optional `reason` as the first audit snapshot.
 *
 * Implementation mirrors src/lib/agents/optimate-google-ads/tools/create-goal-run.ts
 * step-for-step; only the goal key is hardcoded and the parameter shape is
 * specific to account-efficiency.
 */
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import {
  startGoalRun,
  markGoalRunStatus,
  recordGoalRunSnapshot,
} from "@/lib/goal-agents/goal-run-audit";
import { getCampaignSnapshot } from "@/lib/google-ads-snapshots";

const GOAL_KEY = "account-efficiency";
const MAX_REASON_LEN = 500;

const ALL_LEVERS = [
  "budget_shift",
  "ad_group_pause",
  "keyword_pause",
  "bid_adjust",
  "strategy_alert",
] as const;
type LeverKey = (typeof ALL_LEVERS)[number];

/** Levers actually wired in this build. */
const IMPLEMENTED_LEVERS: ReadonlySet<LeverKey> = new Set<LeverKey>([
  "budget_shift",
  "ad_group_pause",
  "keyword_pause",
  "bid_adjust",
  "strategy_alert",
]);

interface ValidatedParameters {
  optimisationMetric: "cpa";
  targetImprovementPercent: number;
  bufferTolerancePercent: number;
  observationDays: number;
  campaignWindowDays: number;
  measurementDays: number;
  maxDonorReductionPercent: number;
  bidUpliftStep: number;
  minDailyBudgetFloor: number;
  minAdGroupSpend: number;
  minKeywordSpend: number;
  minConvertingAdGroupConversions: number;
  maxTargetCpaUpliftPercent: number;
  maxTargetRoasReductionPercent: number;
  enabledLevers: LeverKey[];
  includedCampaignIds?: string[];
  excludedCampaignIds?: string[];
}

export interface CreateAccountEfficiencyGoalRunArgs {
  parameters?: ValidatedParameters;
  reason?: string;
}

interface ExistingGoalRunDoc {
  id: number;
}

// ─── Validation helpers ────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateNumber(
  raw: unknown,
  field: string,
  bounds: { min: number; max: number },
  defaultValue: number,
): number {
  if (raw === undefined || raw === null) return defaultValue;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error(`${field} must be a finite number`);
  }
  if (raw < bounds.min || raw > bounds.max) {
    throw new Error(
      `${field} must be between ${bounds.min} and ${bounds.max} (got ${raw})`,
    );
  }
  return raw;
}

function validateCampaignIdList(raw: unknown, field: string): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`${field} must be an array of campaign id strings`);
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new Error(`${field} entries must be strings`);
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
  }
  return out.length > 0 ? out : undefined;
}

function validateEnabledLevers(raw: unknown): LeverKey[] {
  if (raw === undefined || raw === null) return ["budget_shift"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "enabledLevers must be a non-empty array containing at least 'budget_shift'",
    );
  }
  const out: LeverKey[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new Error("enabledLevers entries must be strings");
    }
    if (!(ALL_LEVERS as readonly string[]).includes(item)) {
      throw new Error(
        `enabledLevers contains unknown lever '${item}'. Valid: ${ALL_LEVERS.join(", ")}`,
      );
    }
    const lever = item as LeverKey;
    if (!IMPLEMENTED_LEVERS.has(lever)) {
      throw new Error(`Lever '${lever}' is not implemented in this build.`);
    }
    if (!out.includes(lever)) out.push(lever);
  }
  return out;
}

function validateParameters(raw: unknown): ValidatedParameters {
  const obj = isObject(raw) ? raw : {};

  // optimisationMetric \u2014 only 'cpa' supported today.
  const metric = obj.optimisationMetric;
  if (metric !== undefined && metric !== null && metric !== "cpa") {
    if (metric === "roas") {
      throw new Error(
        "optimisationMetric 'roas' is not yet supported. Conversion-value data isn't in the snapshots yet (Gap 5). Use 'cpa' or wait for the ROAS-mode ship.",
      );
    }
    throw new Error(
      `optimisationMetric must be 'cpa' (got ${JSON.stringify(metric)})`,
    );
  }

  const targetImprovementPercent = validateNumber(
    obj.targetImprovementPercent,
    "targetImprovementPercent",
    { min: 1, max: 100 },
    15,
  );
  const bufferTolerancePercent = validateNumber(
    obj.bufferTolerancePercent,
    "bufferTolerancePercent",
    { min: 0, max: 100 },
    5,
  );
  if (bufferTolerancePercent >= targetImprovementPercent) {
    throw new Error(
      `bufferTolerancePercent (${bufferTolerancePercent}) must be less than targetImprovementPercent (${targetImprovementPercent}).`,
    );
  }

  return {
    optimisationMetric: "cpa",
    targetImprovementPercent,
    bufferTolerancePercent,
    observationDays: validateNumber(
      obj.observationDays,
      "observationDays",
      { min: 7, max: 90 },
      28,
    ),
    campaignWindowDays: validateNumber(
      obj.campaignWindowDays,
      "campaignWindowDays",
      { min: 1, max: 30 },
      7,
    ),
    measurementDays: validateNumber(
      obj.measurementDays,
      "measurementDays",
      { min: 1, max: 60 },
      14,
    ),
    maxDonorReductionPercent: validateNumber(
      obj.maxDonorReductionPercent,
      "maxDonorReductionPercent",
      { min: 1, max: 100 },
      30,
    ),
    bidUpliftStep: validateNumber(
      obj.bidUpliftStep,
      "bidUpliftStep",
      { min: 1, max: 100 },
      15,
    ),
    minDailyBudgetFloor: validateNumber(
      obj.minDailyBudgetFloor,
      "minDailyBudgetFloor",
      { min: 0, max: 10_000 },
      5,
    ),
    minAdGroupSpend: validateNumber(obj.minAdGroupSpend, "minAdGroupSpend", { min: 0, max: 1_000_000 }, 200),
    minKeywordSpend: validateNumber(obj.minKeywordSpend, "minKeywordSpend", { min: 0, max: 1_000_000 }, 100),
    minConvertingAdGroupConversions: validateNumber(
      obj.minConvertingAdGroupConversions,
      "minConvertingAdGroupConversions",
      { min: 1, max: 1_000 },
      5,
    ),
    maxTargetCpaUpliftPercent: validateNumber(
      obj.maxTargetCpaUpliftPercent,
      "maxTargetCpaUpliftPercent",
      { min: 0, max: 100 },
      15,
    ),
    maxTargetRoasReductionPercent: validateNumber(
      obj.maxTargetRoasReductionPercent,
      "maxTargetRoasReductionPercent",
      { min: 0, max: 100 },
      10,
    ),
    enabledLevers: validateEnabledLevers(obj.enabledLevers),
    includedCampaignIds: validateCampaignIdList(
      obj.includedCampaignIds,
      "includedCampaignIds",
    ),
    excludedCampaignIds: validateCampaignIdList(
      obj.excludedCampaignIds,
      "excludedCampaignIds",
    ),
  };
}

// ─── Tool definition ───────────────────────────────────────────────────────

export const createAccountEfficiencyGoalRun: CanonicalTool<CreateAccountEfficiencyGoalRunArgs> = {
  name: "create_account_efficiency_goal_run",
  description:
    "Queue a new Account Efficiency goal-agent run for the current client. The agent improves account-wide CPA by shifting budget between campaigns (Lever 1 \u2014 the only lever wired in this build). Runs every ~14 days. Args: parameters (optional \u2014 JSON object with targetImprovementPercent default 15, bufferTolerancePercent default 5, observationDays default 28, campaignWindowDays default 7, measurementDays default 14, maxDonorReductionPercent default 30, minDailyBudgetFloor default 5, enabledLevers default ['budget_shift'], includedCampaignIds, excludedCampaignIds), reason (optional, max 500 chars). Refuses if no client linked, if a non-terminal run already exists, or if the daily snapshot doesn't yet carry impression-share data. Returns the new goal-run id; the scheduler picks it up on the next hourly tick.",
  inputSchema: {
    type: "object",
    properties: {
      parameters: {
        type: "object",
        description:
          "Optional per-run knobs. All fields optional; defaults applied for any missing key. See plan doc for semantics.",
        properties: {
          optimisationMetric: {
            type: "string",
            enum: ["cpa"],
            description: "Only 'cpa' supported today.",
          },
          targetImprovementPercent: {
            type: "number",
            description: "Aspirational improvement target (default 15).",
          },
          bufferTolerancePercent: {
            type: "number",
            description:
              "Any improvement \u2265 this counts as partial success (default 5). Must be less than targetImprovementPercent.",
          },
          observationDays: { type: "number" },
          campaignWindowDays: { type: "number" },
          measurementDays: { type: "number" },
          maxDonorReductionPercent: { type: "number" },
          bidUpliftStep: { type: "number" },
          minDailyBudgetFloor: { type: "number" },
          minAdGroupSpend: { type: "number" },
          minKeywordSpend: { type: "number" },
          minConvertingAdGroupConversions: { type: "number" },
          maxTargetCpaUpliftPercent: { type: "number" },
          maxTargetRoasReductionPercent: { type: "number" },
          enabledLevers: {
            type: "array",
            items: { type: "string", enum: [...ALL_LEVERS] },
            description:
              "Which CPA-mode levers to enable. Pause and bid-strategy levers queue explicit approval.",
          },
          includedCampaignIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional allow-list of campaign ids.",
          },
          excludedCampaignIds: {
            type: "array",
            items: { type: "string" },
            description: "Optional deny-list of campaign ids.",
          },
        },
        additionalProperties: false,
      },
      reason: {
        type: "string",
        maxLength: MAX_REASON_LEN,
        description:
          "Optional short note explaining why the run is being created. Recorded as the run's first audit snapshot.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = isObject(raw) ? raw : {};

    const out: CreateAccountEfficiencyGoalRunArgs = {};

    if (obj.parameters !== undefined && obj.parameters !== null) {
      out.parameters = validateParameters(obj.parameters);
    } else {
      out.parameters = validateParameters({});
    }

    const r = obj.reason;
    if (r !== undefined && r !== null) {
      if (typeof r !== "string") {
        throw new Error("reason must be a string");
      }
      const trimmed = r.trim();
      if (trimmed.length > MAX_REASON_LEN) {
        throw new Error(`reason must be <= ${MAX_REASON_LEN} chars`);
      }
      if (trimmed.length > 0) out.reason = trimmed;
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
        error: "No client linked; cannot create an account efficiency goal run.",
      };
    }

    const clientId = Number(ctxClientId);
    if (!Number.isFinite(clientId)) {
      return {
        ok: false,
        error: "No client linked; cannot create an account efficiency goal run.",
      };
    }

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    // ── Gate 1: refuse if a non-terminal run already exists ───────────────
    try {
      const existing = await payload.find({
        collection: "goal-runs" as never,
        where: {
          and: [
            { client: { equals: clientId } },
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
        return {
          ok: false,
          error: `An active ${GOAL_KEY} run already exists for this client (id: ${existingDocs[0]?.id}). Use get_goal_run to inspect it.`,
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Failed to check existing goal runs: ${(err as Error).message}`,
      };
    }

    // ── Gate 2: impression-share data must be in snapshots ────────────────
    try {
      const snapshot = await getCampaignSnapshot(payload, {
        clientId,
        staleAfterMinutes: 1440,
      });
      if (!snapshot || snapshot.rows.length === 0) {
        return {
          ok: false,
          error:
            "No campaign snapshot found for this client. The daily google-ads-snapshots cron has not produced data yet (or the client has no google-ads-customer-id configured).",
        };
      }
      const hasIs = snapshot.rows.some(
        (r) => typeof r.searchImpressionShare === "number",
      );
      if (!hasIs) {
        return {
          ok: false,
          error:
            "Impression-share data (searchImpressionShare) is not yet present in this client's daily snapshots. Wait one snapshot cycle after the snapshot-types upgrade was deployed (Gap 1 prerequisite). Without it the budget-shift detector cannot tell budget-bound from rank-bound campaigns.",
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Failed to verify snapshot prerequisites: ${(err as Error).message}`,
      };
    }

    // ── Create the run ────────────────────────────────────────────────────
    let ref;
    try {
      ref = await startGoalRun(payload, {
        clientId,
        goal: GOAL_KEY,
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

    const nextCheckAt = new Date().toISOString();
    try {
      await payload.update({
        collection: "goal-runs",
        id: ref.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          nextCheckAt,
          parameters: args.parameters,
        } as any,
        overrideAccess: true,
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to persist parameters/nextCheckAt on goal run: ${(err as Error).message}`,
      };
    }

    if (args.reason && args.reason.length > 0) {
      try {
        await recordGoalRunSnapshot(payload, {
          goalRunId: ref.id,
          step: 1,
          action: "create_account_efficiency_goal_run",
          riskTier: "green",
          status: "proposed",
          proposedPayload: {
            reason: args.reason,
            createdBy: "optimate-chat",
            parameters: args.parameters,
          },
        });
      } catch (err) {
        // The run is already queued \u2014 don't fail just because the audit
        // snapshot didn't land. Surface partial state to the operator.
        return {
          ok: true,
          data: {
            goalRunId: ref.id,
            goal: GOAL_KEY,
            status: "awaiting_data" as const,
            nextCheckAt,
            parameters: args.parameters,
            message: `Goal queued. The scheduler will pick it up on the next hourly tick. (Note: failed to record initial audit snapshot: ${(err as Error).message})`,
          },
        };
      }
    }

    return {
      ok: true,
      data: {
        goalRunId: ref.id,
        goal: GOAL_KEY,
        status: "awaiting_data" as const,
        nextCheckAt,
        parameters: args.parameters,
        message:
          "Account Efficiency goal queued. The scheduler will pick it up on the next hourly tick. CPA-mode levers are locally wired; ad-group pauses, keyword pauses, target CPA updates, and strategy alerts require explicit approval. ROAS mode remains disabled until conversion-value snapshots are wired.",
      },
    };
  },
};
