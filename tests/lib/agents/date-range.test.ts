import { describe, it, expect } from "vitest";

// `_client-tokens.ts` imports payload.config which throws if PAYLOAD_SECRET is
// unset. Stub it before importing the helper. Top-level statements are hoisted
// above imports by Vitest's transform.
process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || "test-secret";

import {
  resolveRange,
  resolveRangeWithSegment,
  snapCustomToPreset,
  customRangeForGrowthTools,
} from "@/lib/agents/optimate-google-ads/tools/_date-range";

const { rangeToDates } = await import(
  "@/lib/agents/optimate-google-ads/tools/_client-tokens"
);

describe("resolveRange — presets", () => {
  it("defaults to LAST_30_DAYS when called with nothing", () => {
    const r = resolveRange(undefined);
    expect(r.dateRange).toBe("LAST_30_DAYS");
    expect(r.label).toBe("last 30 days");
    expect(r.coercedFrom).toBeUndefined();
  });

  it("passes supported presets through unchanged", () => {
    const r = resolveRange("LAST_7_DAYS");
    expect(r.dateRange).toBe("LAST_7_DAYS");
    expect(r.coercedFrom).toBeUndefined();
  });

  it("normalises spaces / hyphens to underscores", () => {
    const r = resolveRange("last 7 days");
    expect(r.dateRange).toBe("LAST_7_DAYS");
  });
});

describe("resolveRange — quarter literals resolve to CUSTOM with explicit bounds", () => {
  it("Q1 2026 → 2026-01-01..2026-03-31", () => {
    const r = resolveRange("Q1 2026");
    expect(r.dateRange).toBe("CUSTOM");
    expect(r.startDate).toBe("2026-01-01");
    expect(r.endDate).toBe("2026-03-31");
    expect(r.label).toBe("Q1 2026");
  });

  it("Q4 2025 → 2025-10-01..2025-12-31", () => {
    const r = resolveRange("Q4-2025");
    expect(r.dateRange).toBe("CUSTOM");
    expect(r.startDate).toBe("2025-10-01");
    expect(r.endDate).toBe("2025-12-31");
  });

  it("THIS_QUARTER returns CUSTOM rather than LAST_90_DAYS", () => {
    // Inject a deterministic "now" so the test is stable.
    const now = new Date(Date.UTC(2026, 4, 12)); // 2026-05-12 → Q2
    const r = resolveRange("THIS_QUARTER", now);
    expect(r.dateRange).toBe("CUSTOM");
    expect(r.startDate).toBe("2026-04-01");
    expect(r.endDate).toBe("2026-06-30");
    expect(r.label).toBe("Q2 2026");
  });

  it("LAST_QUARTER from Q1 rolls back to Q4 of previous year", () => {
    const now = new Date(Date.UTC(2026, 1, 15)); // 2026-02-15 → Q1
    const r = resolveRange("LAST_QUARTER", now);
    expect(r.startDate).toBe("2025-10-01");
    expect(r.endDate).toBe("2025-12-31");
    expect(r.label).toBe("Q4 2025");
  });

  it("QTD ends at injected `now`, not end of quarter", () => {
    const now = new Date(Date.UTC(2026, 4, 12)); // 2026-05-12 → Q2
    const r = resolveRange("QTD", now);
    expect(r.startDate).toBe("2026-04-01");
    expect(r.endDate).toBe("2026-05-12");
  });
});

describe("resolveRange — YTD", () => {
  it("YTD spans Jan 1 → today", () => {
    const now = new Date(Date.UTC(2026, 4, 12));
    const r = resolveRange("YTD", now);
    expect(r.dateRange).toBe("CUSTOM");
    expect(r.startDate).toBe("2026-01-01");
    expect(r.endDate).toBe("2026-05-12");
  });
});

describe("resolveRange — ISO custom span", () => {
  it("parses YYYY-MM-DD..YYYY-MM-DD", () => {
    const r = resolveRange("2026-01-01..2026-03-31");
    expect(r.dateRange).toBe("CUSTOM");
    expect(r.startDate).toBe("2026-01-01");
    expect(r.endDate).toBe("2026-03-31");
    expect(r.label).toContain("Jan");
    expect(r.label).toContain("Mar");
  });

  it("falls back to LAST_30_DAYS with a note for unparseable input", () => {
    const r = resolveRange("sometime last spring");
    expect(r.dateRange).toBe("LAST_30_DAYS");
    expect(r.coercedFrom).toBe("sometime last spring");
    expect(r.note).toContain("not recognised");
  });
});

describe("resolveRangeWithSegment", () => {
  it("attaches segment when supplied", () => {
    const r = resolveRangeWithSegment("Q1 2026", "month");
    expect(r.segment).toBe("month");
    expect(r.dateRange).toBe("CUSTOM");
  });

  it("normalises 'monthly' → 'month'", () => {
    const r = resolveRangeWithSegment("LAST_30_DAYS", "monthly");
    expect(r.segment).toBe("month");
  });

  it("drops invalid segment values silently", () => {
    const r = resolveRangeWithSegment("LAST_30_DAYS", "fortnightly");
    expect(r.segment).toBeUndefined();
  });

  it("omits segment field when input was not supplied", () => {
    const r = resolveRangeWithSegment("LAST_30_DAYS", undefined);
    expect(r.segment).toBeUndefined();
  });
});

describe("snapCustomToPreset", () => {
  // The Growth Tools get-metrics endpoint substitutes dateRange into a GAQL
  // DURING clause verbatim and rejects the literal string "CUSTOM", so every
  // tool that hits it has to snap CUSTOM → nearest LAST_N_DAYS preset before
  // calling out. These tests pin that contract so a future refactor doesn't
  // accidentally reintroduce the 500.

  it("passes non-CUSTOM ranges through unchanged", () => {
    const preset = resolveRange("LAST_7_DAYS");
    const snapped = snapCustomToPreset(preset);
    expect(snapped).toEqual(preset);
  });

  it("snaps a 6-week 'since early April' span to LAST_60_DAYS", () => {
    const now = new Date(Date.UTC(2026, 4, 18)); // 2026-05-18
    const requested = resolveRange("2026-04-01..2026-05-18");
    expect(requested.dateRange).toBe("CUSTOM");

    const snapped = snapCustomToPreset(requested, now);
    expect(snapped.dateRange).toBe("LAST_60_DAYS");
    expect(snapped.coercedFrom).toContain("CUSTOM");
    expect(snapped.startDate).toBeUndefined();
    expect(snapped.endDate).toBeUndefined();
    expect(snapped.note).toContain("Growth Tools");
  });

  it("snaps a 1-week span to LAST_7_DAYS", () => {
    const now = new Date(Date.UTC(2026, 4, 18));
    const requested = resolveRange("2026-05-12..2026-05-18");
    const snapped = snapCustomToPreset(requested, now);
    expect(snapped.dateRange).toBe("LAST_7_DAYS");
    expect(snapped.label).toContain("covers");
  });

  it("snaps a quarter (3 months) to LAST_90_DAYS", () => {
    const now = new Date(Date.UTC(2026, 4, 12));
    const requested = resolveRange("THIS_QUARTER", now);
    expect(requested.dateRange).toBe("CUSTOM");

    const snapped = snapCustomToPreset(requested, now);
    expect(snapped.dateRange).toBe("LAST_90_DAYS");
    expect(snapped.coercedFrom).toContain("CUSTOM");
  });

  it("snaps an oversized span to LAST_90_DAYS (largest available preset)", () => {
    const now = new Date(Date.UTC(2026, 4, 18));
    const requested = resolveRange("2025-01-01..2026-05-18"); // 17 months
    const snapped = snapCustomToPreset(requested, now);
    expect(snapped.dateRange).toBe("LAST_90_DAYS");
  });

  it("snaps a back-dated span based on distance from today, not span length", () => {
    // A 3-day span ending 50 days ago should still need a preset that reaches
    // back ~53 days, because Growth Tools presets always end today.
    const now = new Date(Date.UTC(2026, 4, 18));
    const requested = resolveRange("2026-03-26..2026-03-28");
    const snapped = snapCustomToPreset(requested, now);
    // ~53 days back → LAST_60_DAYS
    expect(snapped.dateRange).toBe("LAST_60_DAYS");
    expect(snapped.note).toContain("ends today");
  });

  it("preserves segment on the snapped range", () => {
    const now = new Date(Date.UTC(2026, 4, 18));
    const requested = resolveRangeWithSegment("2026-04-01..2026-05-18", "week");
    const snapped = snapCustomToPreset(requested, now);
    expect(snapped.segment).toBe("week");
  });

  it("is a no-op when CUSTOM is missing startDate/endDate", () => {
    // Defensive: shouldn't happen, but if a hand-crafted CUSTOM range with no
    // bounds slips through, snap returns it unchanged rather than crashing.
    const requested = { dateRange: "CUSTOM" as const, requested: "weird", label: "weird" };
    const snapped = snapCustomToPreset(requested);
    expect(snapped).toEqual(requested);
  });
});

describe("customRangeForGrowthTools", () => {
  it("returns a 'YYYY-MM-DD,YYYY-MM-DD' span for CUSTOM ranges", () => {
    const r = resolveRange("2026-05-04..2026-05-10");
    expect(customRangeForGrowthTools(r)).toBe("2026-05-04,2026-05-10");
  });

  it("passes through preset names unchanged", () => {
    expect(customRangeForGrowthTools(resolveRange("LAST_7_DAYS"))).toBe("LAST_7_DAYS");
    expect(customRangeForGrowthTools(resolveRange("THIS_MONTH"))).toBe("THIS_MONTH");
  });

  it("falls back to the dateRange field when CUSTOM has no bounds (defensive)", () => {
    const weird = { dateRange: "CUSTOM" as const, requested: "weird", label: "weird" };
    expect(customRangeForGrowthTools(weird)).toBe("CUSTOM");
  });

  it("works for quarter literals (resolved to CUSTOM)", () => {
    const q1 = resolveRange("Q1 2026");
    expect(customRangeForGrowthTools(q1)).toBe("2026-01-01,2026-03-31");
  });
});

describe("resolveRange — LAST_WEEK_MON_SUN (agency-default 'last week')", () => {
  // Agency convention: "last week" means the most recently-completed
  // Monday to Sunday block, NOT Sunday to Saturday. The resolver returns a
  // CUSTOM range with explicit bounds so Growth Tools picks it up via the
  // comma-span pass-through (no new upstream preset required).

  it("resolves the bare alias 'LAST_WEEK' to CUSTOM Mon–Sun bounds", () => {
    // Inject Friday 2026-05-22 so "last week" is Mon 2026-05-11 to Sun 2026-05-17.
    const now = new Date(Date.UTC(2026, 4, 22));
    const r = resolveRange("LAST_WEEK", now);
    expect(r.dateRange).toBe("CUSTOM");
    expect(r.startDate).toBe("2026-05-11");
    expect(r.endDate).toBe("2026-05-17");
    expect(r.label).toContain("last week (Mon to Sun");
  });

  it("resolves the explicit 'LAST_WEEK_MON_SUN' preset the same way", () => {
    const now = new Date(Date.UTC(2026, 4, 22));
    const r = resolveRange("LAST_WEEK_MON_SUN", now);
    expect(r.dateRange).toBe("CUSTOM");
    expect(r.startDate).toBe("2026-05-11");
    expect(r.endDate).toBe("2026-05-17");
  });

  it("handles a Monday correctly (last week = previous Mon–Sun, not the seven days before today)", () => {
    // Mon 2026-05-18 → last week is Mon 2026-05-11 to Sun 2026-05-17.
    const now = new Date(Date.UTC(2026, 4, 18));
    const r = resolveRange("LAST_WEEK", now);
    expect(r.startDate).toBe("2026-05-11");
    expect(r.endDate).toBe("2026-05-17");
  });

  it("handles a Sunday correctly (last week ends YESTERDAY, not last Sunday a week ago)", () => {
    // Sun 2026-05-24 → last week is Mon 2026-05-11 to Sun 2026-05-17.
    // (The week-in-progress Mon 18 to today is NOT last week.)
    const now = new Date(Date.UTC(2026, 4, 24));
    const r = resolveRange("LAST_WEEK", now);
    expect(r.startDate).toBe("2026-05-11");
    expect(r.endDate).toBe("2026-05-17");
  });

  it("handles a Tuesday correctly", () => {
    // Tue 2026-05-19 → last week is Mon 2026-05-11 to Sun 2026-05-17.
    const now = new Date(Date.UTC(2026, 4, 19));
    const r = resolveRange("LAST_WEEK", now);
    expect(r.startDate).toBe("2026-05-11");
    expect(r.endDate).toBe("2026-05-17");
  });

  it("keeps LAST_WEEK_SUN_SAT available as an explicit preset (no auto-coerce)", () => {
    const r = resolveRange("LAST_WEEK_SUN_SAT");
    expect(r.dateRange).toBe("LAST_WEEK_SUN_SAT");
    expect(r.coercedFrom).toBeUndefined();
  });

  it("customRangeForGrowthTools forwards a comma-span for LAST_WEEK", () => {
    const now = new Date(Date.UTC(2026, 4, 22));
    const r = resolveRange("LAST_WEEK", now);
    expect(customRangeForGrowthTools(r)).toBe("2026-05-11,2026-05-17");
  });

  it("resolveRangeWithSegment passes segment through alongside the Mon–Sun bounds", () => {
    const now = new Date(Date.UTC(2026, 4, 22));
    const r = resolveRangeWithSegment("LAST_WEEK", "day", now);
    expect(r.dateRange).toBe("CUSTOM");
    expect(r.startDate).toBe("2026-05-11");
    expect(r.endDate).toBe("2026-05-17");
    expect(r.segment).toBe("day");
  });
});

describe("rangeToDates — ISO span pass-through", () => {
  it("returns the bounds verbatim for a literal 'YYYY-MM-DD..YYYY-MM-DD' input", () => {
    const r = rangeToDates("2026-05-04..2026-05-10");
    expect(r).toEqual({ startDate: "2026-05-04", endDate: "2026-05-10" });
  });

  it("still resolves preset names through the existing switch", () => {
    const r = rangeToDates("LAST_7_DAYS");
    expect(r.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ignores malformed span strings and falls through to the default branch", () => {
    // Not a valid YYYY-MM-DD..YYYY-MM-DD shape — must hit the default case.
    const r = rangeToDates("2026/05/04..2026/05/10");
    expect(r.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
