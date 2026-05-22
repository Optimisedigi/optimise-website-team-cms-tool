import { describe, it, expect } from "vitest";

import {
  computeSpendPaceStatus,
  type SpendPaceStatus,
  type ComputeSpendPaceArgs,
} from "@/lib/goal-agents/spend-pacer";

/** Convenience: $X in micros. */
function $m(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}

const STANDARD_ARGS: Omit<ComputeSpendPaceArgs, "mtdSpendMicros"> = {
  monthlyBudgetMicros: $m(10_000),
  pacingMode: "fixed_monthly",
  currentDayOfMonth: 15,
  daysInMonth: 31,
  varianceBandLow: 0.90,
  varianceBandHigh: 1.05,
};

// ─── On-track cases ──────────────────────────────────────────────────────────
describe("on_track", () => {
  it("exactly on pace at mid-month", () => {
    // $10,000 budget / 31 days = $322.58/day. Day 15 → $4,838 target.
    // We spend exactly $4,838.
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: $m(4_838),
    });
    expect(result.state).toBe("on_track");
    expect(result.canReduceSpend).toBe(true);
    expect(result.canIncreaseSpend).toBe(true);
    expect(result.pacePercent).toBe(100);
  });

  it("on track at 95% of target (within 90–105 band)", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: $m(4_596), // 95% of $4,838
    });
    expect(result.state).toBe("on_track");
    expect(result.pacePercent).toBe(95);
  });

  it("on track at 105% of target (exactly at upper band)", () => {
    // target at day 15 of 31 = $10,000 × 15/31 = $4,838.71; 105% × $4,838.71 = $5,080.65
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: 5_080_645_161, // 105% exactly (micros)
    });
    expect(result.state).toBe("on_track");
    expect(result.pacePercent).toBe(105);
  });

  it("on track at 90% of target (exactly at lower band)", () => {
    // target at day 15 of 31 = $10,000 × 15/31 = $4,838.71; 90% × $4,838.71 = $4,354.84
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: 4_354_838_710, // 90% exactly (micros)
    });
    expect(result.state).toBe("on_track");
    expect(result.pacePercent).toBe(90);
  });
});

// ─── Underspending ───────────────────────────────────────────────────────────
describe("underspending", () => {
  it("flags underspending at 70% of target pace", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: 3_387_096_774, // 70% of $4,838.71 (micros)
    });
    expect(result.state).toBe("underspending");
    expect(result.pacePercent).toBe(70);
    expect(result.canReduceSpend).toBe(false); // don't make it worse
    expect(result.canIncreaseSpend).toBe(true);
    expect(result.alertMessage).toBeDefined();
    expect(result.alertMessage).toContain("underspending");
  });

  it("flags underspending at 89% of target pace", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: 4_306_451_613, // 89% of $4,838.71 (micros)
    });
    expect(result.state).toBe("underspending");
    expect(result.pacePercent).toBe(89);
  });

  it("flags underspending at 60% of target pace", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: 2_903_225_806, // 60% of $4,838.71 (micros)
    });
    expect(result.state).toBe("underspending");
    expect(result.pacePercent).toBe(60);
  });
});

// ─── Overspending ─────────────────────────────────────────────────────────────
describe("overspending", () => {
  it("flags overspending at 110% of target pace", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: 5_322_580_645, // 110% of $4,838.71 (micros)
    });
    expect(result.state).toBe("overspending");
    expect(result.pacePercent).toBe(110);
    expect(result.canReduceSpend).toBe(true);
    expect(result.canIncreaseSpend).toBe(false); // don't overspend further
    expect(result.alertMessage).toBeDefined();
    expect(result.alertMessage).toContain("overspending");
  });

  it("flags overspending at 120% of target pace", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: 5_806_451_613, // 120% of $4,838.71 (micros)
    });
    expect(result.state).toBe("overspending");
    expect(result.pacePercent).toBe(120);
  });

  it("flags overspending at 200% of target pace (well over budget)", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: 9_677_419_355, // 200% of $4,838.71 (micros)
    });
    expect(result.state).toBe("overspending");
    expect(result.pacePercent).toBe(200);
    expect(result.canIncreaseSpend).toBe(false);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────
describe("day-1 edge", () => {
  it("zero spend on day 1 is on_track (not 'overspending')", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      currentDayOfMonth: 1,
      daysInMonth: 31,
      mtdSpendMicros: 0,
    });
    expect(result.state).toBe("on_track");
    expect(result.canReduceSpend).toBe(true);
    expect(result.canIncreaseSpend).toBe(true);
  });

  it("spend on day 1 is compared against daily target", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      currentDayOfMonth: 1,
      daysInMonth: 31,
      mtdSpendMicros: $m(500), // $500 on day 1 when daily target is $322
    });
    // Not overspending — day 1 is treated as on_track regardless
    expect(result.state).toBe("on_track");
  });
});

describe("end-of-month edge", () => {
  it("on day 31 of a 31-day month: target = 100% of budget", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      currentDayOfMonth: 31,
      daysInMonth: 31,
      mtdSpendMicros: $m(9_000), // 90% of full $10,000 budget
    });
    expect(result.state).toBe("on_track");
    expect(result.pacePercent).toBe(90);
    expect(result.targetSpendMicros).toBe($m(10_000)); // full budget as target
  });

  it("end of month caps pacePercent to avoid infinity", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      currentDayOfMonth: 31,
      daysInMonth: 31,
      mtdSpendMicros: 25_000_000_000, // $25,000 — well over $10,000 budget
    });
    expect(result.state).toBe("overspending");
    // At end-of-month, pace = actual / monthlyBudget = 250%
    expect(result.pacePercent).toBe(250);
  });

  it("end of February (28 days)", () => {
    // At day 28 of 28 (end-of-month), pace = actual / monthlyBudget.
    // $10,000 spend / $10,000 budget = 100% pace.
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      currentDayOfMonth: 28,
      daysInMonth: 28,
      mtdSpendMicros: $m(10_000),
    });
    expect(result.state).toBe("on_track");
    expect(result.pacePercent).toBe(100);
  });

  it("leap year February (29 days)", () => {
    // At day 29 of 29: pace = $10,000 / $10,000 = 100%
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      currentDayOfMonth: 29,
      daysInMonth: 29,
      mtdSpendMicros: $m(10_000),
    });
    expect(result.state).toBe("on_track");
    expect(result.pacePercent).toBe(100);
  });

  it("30-day month", () => {
    // At day 30 of 30: pace = $10,000 / $10,000 = 100%
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      currentDayOfMonth: 30,
      daysInMonth: 30,
      mtdSpendMicros: $m(10_000),
    });
    expect(result.state).toBe("on_track");
    expect(result.pacePercent).toBe(100);
  });
});

describe("no policy", () => {
  it("zero monthlyBudgetMicros returns on_track with both flags true", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      monthlyBudgetMicros: 0,
      mtdSpendMicros: 0,
    });
    expect(result.state).toBe("on_track");
    expect(result.canReduceSpend).toBe(true);
    expect(result.canIncreaseSpend).toBe(true);
    expect(result.monthlyBudgetMicros).toBe(0);
  });

  it("null-like budget (zero) with high spend still returns on_track", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      monthlyBudgetMicros: 0,
      mtdSpendMicros: $m(50_000),
    });
    expect(result.state).toBe("on_track");
    expect(result.canReduceSpend).toBe(true);
    expect(result.canIncreaseSpend).toBe(true);
  });
});

describe("variance band overrides", () => {
  it("custom wider band (80%–120%) treats 85% as on_track", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: $m(4_112), // 85% of $4,838 target
      varianceBandLow: 0.80,
      varianceBandHigh: 1.20,
    });
    expect(result.state).toBe("on_track");
  });

  it("custom tighter band (95%–105%) treats 90% as underspending", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: $m(4_596), // 95% of target
      varianceBandLow: 0.95,
      varianceBandHigh: 1.05,
    });
    expect(result.state).toBe("underspending");
  });
});

describe("pacing modes", () => {
  it("performance_cap mode: canIncreaseSpend is always false regardless of state", () => {
    // At 70% pace (underspending) — performance_cap ceiling is hard.
    // Underspending already blocks increases; also can't reduce when underspending.
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      pacingMode: "performance_cap",
      mtdSpendMicros: 3_387_096_774, // 70% of $4,838.71 target (micros)
    });
    expect(result.canIncreaseSpend).toBe(false);
    expect(result.canReduceSpend).toBe(false);
  });

  it("performance_cap at overspend: still canReduceSpend but never canIncrease", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      pacingMode: "performance_cap",
      mtdSpendMicros: $m(12_000), // 248% of pace
    });
    expect(result.state).toBe("overspending");
    expect(result.canReduceSpend).toBe(true);
    expect(result.canIncreaseSpend).toBe(false);
  });

  it("roas_target mode: acts like fixed_monthly (no special behaviour)", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      pacingMode: "roas_target",
      mtdSpendMicros: $m(3_387), // 70% → underspending
    });
    expect(result.state).toBe("underspending");
    expect(result.canIncreaseSpend).toBe(true);
    expect(result.canReduceSpend).toBe(false);
  });

  it("seasonal mode: acts like fixed_monthly", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      pacingMode: "seasonal",
      mtdSpendMicros: $m(5_322), // 110% → overspending
    });
    expect(result.state).toBe("overspending");
    expect(result.canReduceSpend).toBe(true);
    expect(result.canIncreaseSpend).toBe(false);
  });
});

describe("null-safety", () => {
  it("negative mtdSpendMicros is treated as zero", () => {
    const result = computeSpendPaceStatus({
      ...STANDARD_ARGS,
      mtdSpendMicros: -500_000_000,
    });
    expect(result.actualSpendMicros).toBe(0);
    // Zero spend → underspending if day > 1
    expect(result.state).toBe("underspending");
    expect(result.canReduceSpend).toBe(false);
  });

  it("undefined varianceBandLow falls back to 0.90", () => {
    // 95% of target is comfortably within the 90–105% band.
    // Testing that omitting varianceBandLow still uses the default 0.90.
    const { varianceBandLow: _vbl, ...argsWithoutLow } = STANDARD_ARGS;
    const result = computeSpendPaceStatus({
      ...argsWithoutLow,
      varianceBandHigh: 1.05,
      mtdSpendMicros: 4_596_774_194, // 95% of $4,838.71 (micros)
    });
    expect(result.state).toBe("on_track");
  });
});

describe("returned shape", () => {
  it("returns all required fields", () => {
    const result = computeSpendPaceStatus({
      monthlyBudgetMicros: $m(10_000),
      pacingMode: "fixed_monthly",
      mtdSpendMicros: $m(5_000),
      currentDayOfMonth: 15,
      daysInMonth: 31,
    });

    expect(result).toHaveProperty("state");
    expect(result).toHaveProperty("actualSpendMicros");
    expect(result).toHaveProperty("targetSpendMicros");
    expect(result).toHaveProperty("paceRatio");
    expect(result).toHaveProperty("pacePercent");
    expect(result).toHaveProperty("monthlyBudgetMicros");
    expect(result).toHaveProperty("currentDayOfMonth");
    expect(result).toHaveProperty("daysInMonth");
    expect(result).toHaveProperty("canReduceSpend");
    expect(result).toHaveProperty("canIncreaseSpend");

    expect(typeof result.state).toBe("string");
    expect(typeof result.canReduceSpend).toBe("boolean");
    expect(typeof result.canIncreaseSpend).toBe("boolean");
    expect(typeof result.pacePercent).toBe("number");
    expect(result.pacePercent).toBeGreaterThan(0);
  });
});
