import { describe, it, expect } from "vitest";

import {
  checkRiskTier,
  type ActionProposal,
  type TierDefinition,
} from "@/lib/goal-agents/check-risk-tier";

// ─── Test data factories ──────────────────────────────────────────────────────

/** Green tier — auto-executes all actions (when it matches). */
function greenTier(overrides?: Partial<TierDefinition>): TierDefinition {
  return {
    tier: "green",
    maxBudgetImpactDollars: null,
    allowedActionTypes: undefined, // applies to all
    requiresApproval: false,
    autoExecute: true,
    ...overrides,
  };
}

/** Yellow tier — requires approval unless autoExecute + within budget. */
function yellowTier(overrides?: Partial<TierDefinition>): TierDefinition {
  return {
    tier: "yellow",
    maxBudgetImpactDollars: 100,
    allowedActionTypes: undefined,
    requiresApproval: true,
    autoExecute: false,
    ...overrides,
  };
}

/** Red tier — always requires approval. */
function redTier(overrides?: Partial<TierDefinition>): TierDefinition {
  return {
    tier: "red",
    maxBudgetImpactDollars: null,
    allowedActionTypes: undefined,
    requiresApproval: true,
    autoExecute: false,
    ...overrides,
  };
}

function proposal(
  actionType: string,
  budgetImpact?: number,
  campaignIds?: string[],
): ActionProposal {
  return { actionType, budgetImpact, campaignIds };
}

// ─── Green ───────────────────────────────────────────────────────────────────
describe("green tier", () => {
  it("auto-executes a green-tier action", () => {
    const result = checkRiskTier({
      proposal: proposal("negative-add"),
      clientTiers: [greenTier()],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("green");
    expect(result.autoExecute).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.escalation).toBe("auto_execute");
  });

  it("auto-executes even with no budget impact", () => {
    const result = checkRiskTier({
      proposal: proposal("nkl-push-live"),
      clientTiers: [greenTier()],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.escalation).toBe("auto_execute");
  });

  it("auto-executes a green-tier action with zero budget impact", () => {
    const result = checkRiskTier({
      proposal: proposal("pause-ad", 0),
      clientTiers: [greenTier()],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.autoExecute).toBe(true);
  });
});

// ─── Red ─────────────────────────────────────────────────────────────────────
describe("red tier", () => {
  it("always requires approval", () => {
    const result = checkRiskTier({
      proposal: proposal("bid-strategy-change", 500),
      clientTiers: [redTier()],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("red");
    expect(result.autoExecute).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.escalation).toBe("queue_for_approval");
  });

  it("requires approval even with zero budget impact", () => {
    const result = checkRiskTier({
      proposal: proposal("pause-campaign", 0),
      clientTiers: [redTier()],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("red");
    expect(result.escalation).toBe("queue_for_approval");
  });
});

// ─── Yellow ─────────────────────────────────────────────────────────────────
describe("yellow tier", () => {
  it("requires approval by default (autoExecute: false)", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate", 50),
      clientTiers: [yellowTier({ autoExecute: false })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("yellow");
    expect(result.autoExecute).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.escalation).toBe("queue_for_approval");
  });

  it("auto-executes when autoExecute: true and budget within limit", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate", 50), // $50 ≤ $100
      clientTiers: [yellowTier({ autoExecute: true, maxBudgetImpactDollars: 100 })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("yellow");
    expect(result.autoExecute).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.escalation).toBe("auto_execute");
    expect(result.reason).toContain("$50");
  });

  it("requires approval when autoExecute: true but budget exceeds limit", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate", 150), // $150 > $100
      clientTiers: [yellowTier({ autoExecute: true, maxBudgetImpactDollars: 100 })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("yellow");
    expect(result.autoExecute).toBe(false);
    expect(result.escalation).toBe("queue_for_approval");
    expect(result.reason).toContain("exceeds");
  });

  it("auto-executes at exactly the budget limit ($100 ≤ $100)", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate", 100),
      clientTiers: [yellowTier({ autoExecute: true, maxBudgetImpactDollars: 100 })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.autoExecute).toBe(true);
    expect(result.escalation).toBe("auto_execute");
  });

  it("requires approval when budgetImpact is undefined (treated as unlimited)", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate", undefined),
      clientTiers: [yellowTier({ autoExecute: true, maxBudgetImpactDollars: 100 })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("yellow");
    expect(result.autoExecute).toBe(false);
    expect(result.escalation).toBe("queue_for_approval");
  });

  it("requires approval when budget impact is negative and exceeds limit", () => {
    // abs(-150) = 150 > $100 → exceeds limit
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate", -150),
      clientTiers: [yellowTier({ autoExecute: true, maxBudgetImpactDollars: 100 })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.autoExecute).toBe(false);
    expect(result.escalation).toBe("queue_for_approval");
  });

  it("auto-executes when maxBudgetImpactDollars is null (no limit)", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate", 10_000),
      clientTiers: [yellowTier({ autoExecute: true, maxBudgetImpactDollars: null })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.autoExecute).toBe(true);
    expect(result.escalation).toBe("auto_execute");
  });

  it("reason includes the budget limit when within limit", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate", 75),
      clientTiers: [yellowTier({ autoExecute: true, maxBudgetImpactDollars: 100 })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.reason).toContain("$75");
    expect(result.reason).toContain("$100");
  });
});

describe("Account Efficiency action-specific tiers", () => {
  const accountEfficiencyTiers: TierDefinition[] = [
    yellowTier({ allowedActionTypes: ["budget-update"], maxBudgetImpactDollars: 500 }),
    yellowTier({ allowedActionTypes: ["budget-push-live"], maxBudgetImpactDollars: 500 }),
    redTier({ allowedActionTypes: ["ad-group-pause"] }),
    yellowTier({ allowedActionTypes: ["keyword-pause"], autoExecute: false }),
    redTier({ allowedActionTypes: ["campaign-target-cpa-update"] }),
    redTier({ allowedActionTypes: ["campaign-target-roas-update"] }),
    redTier({ allowedActionTypes: ["campaign-bid-strategy-change"] }),
  ];

  it.each([
    ["budget-update", "yellow"],
    ["budget-push-live", "yellow"],
    ["ad-group-pause", "red"],
    ["keyword-pause", "yellow"],
    ["campaign-target-cpa-update", "red"],
    ["campaign-target-roas-update", "red"],
    ["campaign-bid-strategy-change", "red"],
  ] as const)("classifies %s as %s and queues for approval", (actionType, tier) => {
    const result = checkRiskTier({
      proposal: proposal(actionType, actionType === "budget-update" ? 100 : 0),
      clientTiers: accountEfficiencyTiers,
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe(tier);
    expect(result.escalation).toBe("queue_for_approval");
    expect(result.requiresApproval).toBe(true);
  });
});

// ─── Black ──────────────────────────────────────────────────────────────────
describe("black tier (brand / protected campaign)", () => {
  it("is blocked when targeting a brand campaign", () => {
    const result = checkRiskTier({
      proposal: proposal("negative-add"),
      clientTiers: [greenTier()],
      isBrandCampaign: true,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("black");
    expect(result.autoExecute).toBe(false);
    expect(result.requiresApproval).toBe(false);
    expect(result.escalation).toBe("blocked");
    expect(result.reason).toContain("brand campaign");
  });

  it("is blocked when targeting a protected campaign", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-increase", 500),
      clientTiers: [greenTier()],
      isBrandCampaign: false,
      isProtectedCampaign: true,
    });
    expect(result.tier).toBe("black");
    expect(result.escalation).toBe("blocked");
    expect(result.reason).toContain("protected by the Account Health Contract");
  });

  it("brand campaign blocks regardless of tier definition", () => {
    const result = checkRiskTier({
      proposal: proposal("nkl-push-live"),
      clientTiers: [greenTier()], // green would auto-execute
      isBrandCampaign: true,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("black");
    expect(result.escalation).toBe("blocked");
  });

  it("blocked even with zero budget impact", () => {
    const result = checkRiskTier({
      proposal: proposal("pause-campaign", 0),
      clientTiers: [greenTier()],
      isBrandCampaign: false,
      isProtectedCampaign: true,
    });
    expect(result.tier).toBe("black");
    expect(result.escalation).toBe("blocked");
  });
});

// ─── allowedActionTypes narrowing ─────────────────────────────────────────────
describe("allowedActionTypes", () => {
  it("non-empty array: tier only applies to those action types", () => {
    const result = checkRiskTier({
      proposal: proposal("budget-reallocate"),
      clientTiers: [greenTier({ allowedActionTypes: ["nkl-push-live"] })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    // greenTier with allowedActionTypes=["nkl-push-live"] does not include "budget-reallocate"
    // → no match → default to red
    expect(result.tier).toBe("red");
    expect(result.escalation).toBe("queue_for_approval");
  });

  it("non-empty array: tier applies when action is in the list", () => {
    const result = checkRiskTier({
      proposal: proposal("nkl-push-live"),
      clientTiers: [greenTier({ allowedActionTypes: ["nkl-push-live"] })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("green");
    expect(result.autoExecute).toBe(true);
  });

  it("empty array: tier never matches (no-op)", () => {
    const result = checkRiskTier({
      proposal: proposal("negative-add"),
      clientTiers: [greenTier({ allowedActionTypes: [] })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    // empty array = no-op → no match → default to red
    expect(result.tier).toBe("red");
    expect(result.escalation).toBe("queue_for_approval");
  });

  it("multiple tiers: first matching tier wins", () => {
    const result = checkRiskTier({
      proposal: proposal("pause-campaign"),
      clientTiers: [
        greenTier({ allowedActionTypes: ["pause-campaign"] }),
        redTier({ allowedActionTypes: ["pause-campaign"] }),
      ],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    // First match is green → auto-execute (green always auto-executes)
    expect(result.tier).toBe("green");
    expect(result.autoExecute).toBe(true);
  });
});

// ─── No matching tier ────────────────────────────────────────────────────────
describe("no matching tier (unknown action type)", () => {
  it("defaults to red / queue_for_approval", () => {
    const result = checkRiskTier({
      proposal: proposal("completely-unknown-action"),
      clientTiers: [greenTier({ allowedActionTypes: ["other-action"] })],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("red");
    expect(result.escalation).toBe("queue_for_approval");
    expect(result.reason).toContain('No tier definition found');
  });

  it("defaults to red when clientTiers is empty", () => {
    const result = checkRiskTier({
      proposal: proposal("any-action"),
      clientTiers: [],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("red");
    expect(result.requiresApproval).toBe(true);
  });

  it("brand campaign blocks before checking tier match", () => {
    const result = checkRiskTier({
      proposal: proposal("any-action"),
      clientTiers: [],
      isBrandCampaign: true,
      isProtectedCampaign: false,
    });
    expect(result.tier).toBe("black");
    expect(result.escalation).toBe("blocked");
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────
describe("return shape", () => {
  it("always returns all required fields", () => {
    const result = checkRiskTier({
      proposal: proposal("nkl-push-live"),
      clientTiers: [greenTier()],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });

    expect(result).toHaveProperty("tier");
    expect(result).toHaveProperty("autoExecute");
    expect(result).toHaveProperty("requiresApproval");
    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("escalation");

    expect(typeof result.tier).toBe("string");
    expect(["green", "yellow", "red", "black"]).toContain(result.tier);
    expect(typeof result.autoExecute).toBe("boolean");
    expect(typeof result.requiresApproval).toBe("boolean");
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
    expect(["auto_execute", "queue_for_approval", "blocked"]).toContain(result.escalation);
  });

  it("green: autoExecute=true, requiresApproval=false", () => {
    const result = checkRiskTier({
      proposal: proposal("test"),
      clientTiers: [greenTier()],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.autoExecute).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it("red: autoExecute=false, requiresApproval=true", () => {
    const result = checkRiskTier({
      proposal: proposal("test"),
      clientTiers: [redTier()],
      isBrandCampaign: false,
      isProtectedCampaign: false,
    });
    expect(result.autoExecute).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it("black: autoExecute=false, requiresApproval=false", () => {
    const result = checkRiskTier({
      proposal: proposal("test"),
      clientTiers: [greenTier()],
      isBrandCampaign: true,
      isProtectedCampaign: false,
    });
    expect(result.autoExecute).toBe(false);
    expect(result.requiresApproval).toBe(false);
  });
});
