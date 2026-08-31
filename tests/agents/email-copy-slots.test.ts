import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  CLIENT_EMAIL_COPY_SLOTS,
  copyFieldName,
  EMAIL_COPY_SLOT_KEYS,
  parseCopyLines,
  resolveSlotVariants,
} from "@/lib/agents/optimate-google-ads/tools/_email-copy-slots";
import { buildWeeklyEmailSummary } from "@/lib/agents/optimate-google-ads/tools/_weekly-email-summary";
import { buildMonthlyEmailSummary } from "@/lib/agents/optimate-google-ads/tools/_monthly-email-summary";
import type { WeeklyBucketRow } from "@/lib/google-ads-weekly-metric-table";

const weeklyRows = [
  {
    weekStart: "2026-08-10",
    weekEnd: "2026-08-16",
    label: "10th Aug - 16th Aug",
    partial: false,
    totals: { spend: 1612, conversions: 31, clicks: 0, impressions: 0 },
    metrics: {},
  },
  {
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",
    label: "17th Aug - 23rd Aug",
    partial: false,
    totals: { spend: 1404, conversions: 39, clicks: 0, impressions: 0 },
    metrics: {},
  },
] as unknown as WeeklyBucketRow[];

const monthlyRows = [
  { label: "July", totals: { spend: 6200, conversions: 100 } },
  { label: "August", totals: { spend: 5400, conversions: 120 } },
];

describe("client email copy slots", () => {
  it("keeps every slot's settings field name unique and camelCase", () => {
    const names = EMAIL_COPY_SLOT_KEYS.map(copyFieldName);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-zA-Z]*$/);
  });

  it("only lets a slot's default phrasings use that slot's declared tokens", () => {
    for (const slot of EMAIL_COPY_SLOT_KEYS) {
      const definition = CLIENT_EMAIL_COPY_SLOTS[slot];
      const allowed = new Set<string>(definition.tokens);
      for (const template of definition.defaults) {
        for (const match of template.matchAll(/\{([a-zA-Z]+)\}/g)) {
          expect({ slot, token: match[1] }).toEqual({ slot, token: match[1] });
          expect(allowed.has(match[1]!)).toBe(true);
        }
      }
    }
  });

  it("has a migration column for every slot", async () => {
    // Production runs with `push` disabled, so a slot without a column would
    // break every read of the OptiMate Settings global after deploy.
    const migration = await readFile(
      `${process.cwd()}/src/migrations/20260824_120000_add_client_email_copy_settings.ts`,
      "utf8",
    );
    for (const slot of EMAIL_COPY_SLOT_KEYS) {
      expect(migration).toContain(`client_email_copy_${slot.replace(/-/g, "_")}"`);
    }
  });

  it("has a bundled-runner column for every slot", async () => {
    // Deployed schema changes go through POST /api/migrate, which runs
    // src/lib/run-migrations.ts - NOT the src/migrations files. A slot missing
    // there means saving OptiMate Settings 500s with "no such column".
    const runner = await readFile(`${process.cwd()}/src/lib/run-migrations.ts`, "utf8");
    for (const slot of EMAIL_COPY_SLOT_KEYS) {
      expect(runner).toContain(`"client_email_copy_${slot.replace(/-/g, "_")}"`);
    }
  });

  it("parses a settings textarea into trimmed, non-empty phrasings", () => {
    expect(parseCopyLines("  One line \n\n Two lines  \n")).toEqual(["One line", "Two lines"]);
    expect(parseCopyLines("   ")).toEqual([]);
    expect(parseCopyLines(undefined)).toEqual([]);
  });

  it("uses the shipped defaults when a slot has no override", () => {
    expect(resolveSlotVariants("greeting")).toBe(CLIENT_EMAIL_COPY_SLOTS.greeting.defaults);
    expect(resolveSlotVariants("greeting", { greeting: [] })).toBe(
      CLIENT_EMAIL_COPY_SLOTS.greeting.defaults,
    );
  });

  it("falls back to defaults when every override line uses an unknown token", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveSlotVariants("weekly-budget-under", { "weekly-budget-under": ["{nope} spend"] })).toBe(
      CLIENT_EMAIL_COPY_SLOTS["weekly-budget-under"].defaults,
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("renders an overridden weekly sentence with the real figures", () => {
    const summary = buildWeeklyEmailSummary({
      rows: weeklyRows,
      components: [],
      seed: 7,
      copy: {
        "weekly-performance-up-efficient": ["{period}: {conversions} convs at {cpa}, was {prevCpa}."],
      },
    });
    expect(summary.startsWith("17th Aug - 23rd Aug: 39 convs at $36, was $52.")).toBe(true);
  });

  it("renders an overridden monthly sentence with the real figures", () => {
    const summary = buildMonthlyEmailSummary({
      rows: monthlyRows,
      components: [],
      seed: 3,
      copy: {
        "monthly-performance-up-efficient": ["{period} hit {conversions} conversions at {cpa}."],
      },
    });
    expect(summary.startsWith("August hit 120 conversions at $45.")).toBe(true);
  });

  it("stays deterministic: same seed and overrides reproduce the same copy", () => {
    const copy = { greeting: ["A,", "B,", "C,"] };
    const build = () =>
      buildWeeklyEmailSummary({ rows: weeklyRows, components: [], seed: 42, copy });
    expect(build()).toBe(build());
  });
});
