/**
 * Tool: create_account_efficiency_goal_run
 *
 * Side-effecting only in the approval queue. Queues a human approval row to
 * create a new Account Efficiency goal-agent run for the current client. The
 * goal run is not created until an admin approves and applies the queued
 * proposal.
 *
 * The Account Efficiency runtime can later propose Google Ads changes through
 * the goal-agent approval/escalation flow; creating the run itself is now also
 * gated by the shared human approval queue.
 */
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";

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
  summary?: string;
  supportingNumbers?: string[];
}

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
    observationDays: validateNumber(obj.observationDays, "observationDays", { min: 7, max: 90 }, 28),
    campaignWindowDays: validateNumber(obj.campaignWindowDays, "campaignWindowDays", { min: 1, max: 30 }, 7),
    measurementDays: validateNumber(obj.measurementDays, "measurementDays", { min: 1, max: 60 }, 14),
    maxDonorReductionPercent: validateNumber(obj.maxDonorReductionPercent, "maxDonorReductionPercent", { min: 1, max: 100 }, 30),
    bidUpliftStep: validateNumber(obj.bidUpliftStep, "bidUpliftStep", { min: 1, max: 100 }, 15),
    minDailyBudgetFloor: validateNumber(obj.minDailyBudgetFloor, "minDailyBudgetFloor", { min: 0, max: 10_000 }, 5),
    minAdGroupSpend: validateNumber(obj.minAdGroupSpend, "minAdGroupSpend", { min: 0, max: 1_000_000 }, 200),
    minKeywordSpend: validateNumber(obj.minKeywordSpend, "minKeywordSpend", { min: 0, max: 1_000_000 }, 100),
    minConvertingAdGroupConversions: validateNumber(obj.minConvertingAdGroupConversions, "minConvertingAdGroupConversions", { min: 1, max: 1_000 }, 5),
    maxTargetCpaUpliftPercent: validateNumber(obj.maxTargetCpaUpliftPercent, "maxTargetCpaUpliftPercent", { min: 0, max: 100 }, 15),
    maxTargetRoasReductionPercent: validateNumber(obj.maxTargetRoasReductionPercent, "maxTargetRoasReductionPercent", { min: 0, max: 100 }, 10),
    enabledLevers: validateEnabledLevers(obj.enabledLevers),
    includedCampaignIds: validateCampaignIdList(obj.includedCampaignIds, "includedCampaignIds"),
    excludedCampaignIds: validateCampaignIdList(obj.excludedCampaignIds, "excludedCampaignIds"),
  };
}

export const createAccountEfficiencyGoalRun: CanonicalTool<CreateAccountEfficiencyGoalRunArgs> = {
  name: "create_account_efficiency_goal_run",
  description:
    "Queue human approval to create a new Account Efficiency goal-agent run for the current client. Args: parameters (optional, defaults applied), reason (optional), summary (optional), supportingNumbers (optional). Returns an approval id and URL. The run is not created until approved and applied.",
  inputSchema: {
    type: "object",
    properties: {
      parameters: {
        type: "object",
        description: "Optional per-run knobs. All fields optional; defaults applied for any missing key.",
        properties: {
          optimisationMetric: { type: "string", enum: ["cpa"], description: "Only 'cpa' supported today." },
          targetImprovementPercent: { type: "number", description: "Aspirational improvement target (default 15)." },
          bufferTolerancePercent: { type: "number", description: "Any improvement >= this counts as partial success (default 5). Must be less than targetImprovementPercent." },
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
            description: "Which CPA-mode levers to enable. Pause and bid-strategy levers queue explicit approval.",
          },
          includedCampaignIds: { type: "array", items: { type: "string" }, description: "Optional allow-list of campaign ids." },
          excludedCampaignIds: { type: "array", items: { type: "string" }, description: "Optional deny-list of campaign ids." },
        },
        additionalProperties: false,
      },
      reason: {
        type: "string",
        maxLength: MAX_REASON_LEN,
        description: "Optional short note explaining why the run is being created. Recorded as the run's first audit snapshot.",
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
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = isObject(raw) ? raw : {};
    const out: CreateAccountEfficiencyGoalRunArgs = {
      parameters: validateParameters(obj.parameters ?? {}),
    };

    const r = obj.reason;
    if (r !== undefined && r !== null) {
      if (typeof r !== "string") throw new Error("reason must be a string");
      const trimmed = r.trim();
      if (trimmed.length > MAX_REASON_LEN) throw new Error(`reason must be <= ${MAX_REASON_LEN} chars`);
      if (trimmed.length > 0) out.reason = trimmed;
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
      if (!Array.isArray(supportingNumbers)) throw new Error("supportingNumbers must be an array of strings");
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
    if (ctxClientId === undefined || ctxClientId === null || ctxClientId === "") {
      return { ok: false, error: "No client linked; cannot queue an account efficiency goal run approval." };
    }

    const clientId = Number(ctxClientId);
    if (!Number.isFinite(clientId)) {
      return { ok: false, error: "No client linked; cannot queue an account efficiency goal run approval." };
    }

    const parameters = args.parameters ?? validateParameters({});
    const summary = args.summary ?? "Queue an Account Efficiency goal-agent run for this client.";
    const internalMarkdown = buildInternalMarkdown({
      summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: [
        `**Goal:** ${GOAL_KEY}`,
        args.reason ? `**Reason:** ${args.reason}` : "**Reason:** Not supplied",
        "",
        "**Parameters:**",
        "",
        "```json",
        JSON.stringify(parameters, null, 2),
        "```",
      ].join("\n"),
      applyEffect:
        "Will create an account-efficiency goal-runs row in awaiting_data, persist these parameters, and set nextCheckAt to now. " +
        "The scheduler will pick it up on the next hourly tick. Any Google Ads mutations from the goal runtime still go through the goal-agent approval/escalation flow.",
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "account-efficiency-goal-run-create",
        title: "Create Account Efficiency goal run",
        clientId,
        proposalPayload: {
          clientId,
          goal: GOAL_KEY,
          parameters,
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
        message: "Account Efficiency goal run queued for human approval. It will not start until approved and applied.",
      },
    };
  },
};
