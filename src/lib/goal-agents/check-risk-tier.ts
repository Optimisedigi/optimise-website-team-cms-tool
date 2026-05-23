/**
 * checkRiskTier — pure tier classification + preflight gate.
 *
 * Reads the proposed action's metadata (type, spend impact, campaign targets),
 * compares it against the tier definitions from `goal-risk-tiers`, and returns
 * the tier + escalation path.
 *
 * Pure — no LLM, no HTTP, no Payload calls.
 *
 * @see docs/goal-agents-architecture-and-build-plan.md §Layer 4
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskTierLevel = "green" | "yellow" | "red" | "black";

export type EscalationPath =
  | "auto_execute"
  | "queue_for_approval"
  | "blocked";

/**
 * A tier definition from `goal-risk-tiers`.
 *
 * `allowedActionTypes` is optional and narrows the tier to specific handler keys.
 * If omitted or `undefined`, the tier applies to all action types.
 * If present and non-empty, it applies only to those action types.
 * If present and empty (`[]`), it never matches (no-op — lets the next tier win).
 */
export interface TierDefinition {
  tier: RiskTierLevel;
  /** Maximum budget change ($) this tier allows before escalation. Null = no limit. */
  maxBudgetImpactDollars: number | null;
  /**
   * Optional: constrain this tier to specific handler keys.
   * - undefined/omitted → applies to all actions with this tier level
   * - non-empty array   → only applies to those handler keys
   * - empty array       → never matches (used as a no-op passthrough)
   */
  allowedActionTypes?: string[];
  /** Always requires human approval before execution. */
  requiresApproval: boolean;
  /** May auto-execute without human sign-off (only safe for green-tier). */
  autoExecute: boolean;
}

export interface ActionProposal {
  /** Handler key that would be invoked, e.g. "nkl-push-live". */
  actionType: string;
  /** Absolute dollar change to monthly budget, or undefined if no budget impact. */
  budgetImpact?: number;
  /** Campaign IDs this action targets. */
  campaignIds?: string[];
}

export interface TierCheckResult {
  tier: RiskTierLevel;
  autoExecute: boolean;
  requiresApproval: boolean;
  reason: string;
  escalation: EscalationPath;
}

// ─── Pure compute ─────────────────────────────────────────────────────────────

/**
 * Classify a proposed action against the tier definitions and target context.
 *
 * Decision order:
 *   1. Black: brand or protected campaign — always blocked
 *   2. Match a TierDefinition by tier level, optionally narrowed by allowedActionTypes
 *   3. Apply tier-level rules (green auto-executes, yellow gates on budget, red always escalates)
 *   4. No match: default to red / queue_for_approval
 */
export function checkRiskTier(args: {
  proposal: ActionProposal;
  clientTiers: TierDefinition[];
  isBrandCampaign: boolean;
  isProtectedCampaign: boolean;
}): TierCheckResult {
  const { proposal, clientTiers, isBrandCampaign, isProtectedCampaign } = args;

  // ── Step 1: Black — brand/protected/forbidden ──────────────────────────
  if (isBrandCampaign || isProtectedCampaign) {
    const reason = isBrandCampaign
      ? `Campaign ${proposal.campaignIds?.[0] ?? "targeted"} is a brand campaign — black tier, action blocked.`
      : `Campaign ${proposal.campaignIds?.[0] ?? "targeted"} is protected by the Account Health Contract — black tier, action blocked.`;
    return {
      tier: "black",
      autoExecute: false,
      requiresApproval: false,
      reason,
      escalation: "blocked",
    };
  }

  // ── Step 2: Match TierDefinition ───────────────────────────────────────
  // Find the first TierDefinition whose tier matches AND whose allowedActionTypes
  // allows the proposal's actionType:
  //   - allowedActionTypes === undefined  → applies to all
  //   - non-empty array               → actionType must be in the list
  //   - empty array                   → never matches (no-op)
  let matchedTier: TierDefinition | undefined;

  for (const tierDef of clientTiers) {
    // Empty array = no-op (lets next tier definition win)
    if (Array.isArray(tierDef.allowedActionTypes) && tierDef.allowedActionTypes.length === 0) {
      continue; // eslint-disable-line no-continue
    }

    // Tier level matches, and either no action-type constraint or action is in the list
    const hasNoConstraint = tierDef.allowedActionTypes === undefined;
    const actionMatches =
      hasNoConstraint || tierDef.allowedActionTypes!.includes(proposal.actionType);

    if (actionMatches) {
      matchedTier = tierDef;
      break; // first match wins — no need to search further
    }
  }

  // ── Step 3: No match — default to red ─────────────────────────────────
  if (matchedTier === undefined) {
    return {
      tier: "red",
      autoExecute: false,
      requiresApproval: true,
      reason: `No tier definition found for action type "${proposal.actionType}" — defaulting to red (requires approval).`,
      escalation: "queue_for_approval",
    };
  }

  // ── Step 4: Apply tier-level rules ────────────────────────────────────
  const tier = matchedTier.tier;

  if (tier === "green") {
    return {
      tier: "green",
      autoExecute: true,
      requiresApproval: false,
      reason: `Green-tier action "${proposal.actionType}" is fully autonomous.`,
      escalation: "auto_execute",
    };
  }

  if (tier === "red") {
    return {
      tier: "red",
      autoExecute: false,
      requiresApproval: true,
      reason: `Red-tier action "${proposal.actionType}" requires explicit human approval.`,
      escalation: "queue_for_approval",
    };
  }

  // tier === "yellow"
  // Yellow: auto-execute only when the tier explicitly allows it AND
  // the budget impact is known and within the configured limit.
  // undefined budgetImpact means the impact is unknown — require approval.
  const withinBudgetLimit =
    proposal.budgetImpact !== undefined &&
    (matchedTier.maxBudgetImpactDollars === null ||
      Math.abs(proposal.budgetImpact) <= matchedTier.maxBudgetImpactDollars);

  if (matchedTier.autoExecute && withinBudgetLimit) {
    return {
      tier: "yellow",
      autoExecute: true,
      requiresApproval: false,
      reason:
        matchedTier.maxBudgetImpactDollars !== null
          ? `Yellow-tier action "${proposal.actionType}" auto-executed: budget impact $${proposal.budgetImpact} is within the $${matchedTier.maxBudgetImpactDollars} limit.`
          : `Yellow-tier action "${proposal.actionType}" auto-executed (no budget limit configured).`,
      escalation: "auto_execute",
    };
  }

  const reason = !withinBudgetLimit
    ? proposal.budgetImpact === undefined
      ? `Yellow-tier action "${proposal.actionType}" requires approval: budget impact is unknown.`
      : `Yellow-tier action "${proposal.actionType}" requires approval: budget impact $${proposal.budgetImpact} exceeds the $${matchedTier.maxBudgetImpactDollars} limit.`
    : `Yellow-tier action "${proposal.actionType}" requires approval.`;

  return {
    tier: "yellow",
    autoExecute: false,
    requiresApproval: true,
    reason,
    escalation: "queue_for_approval",
  };
}
