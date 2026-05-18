import { describe, it, expect } from "vitest";
import {
  resolveRange,
  resolveRangeWithSegment,
  snapCustomToPreset,
} from "@/lib/agents/optimate-google-ads/tools/_date-range";

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
