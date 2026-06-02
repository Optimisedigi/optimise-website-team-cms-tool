import { describe, expect, it } from "vitest";
import {
  buildCronFromFriendlySchedule,
  computeNextRun,
  selectedBudgetAuditIds,
} from "../../src/lib/scheduled-task-schedule";

describe("scheduled task friendly schedule", () => {
  it("builds a monthly cron from day and time fields", () => {
    expect(
      buildCronFromFriendlySchedule({
        scheduleMode: "monthly",
        monthlyDay: 1,
        timeOfDay: "09:00",
      }),
    ).toBe("0 9 1 * *");
  });

  it("leaves manual cron schedules unchanged", () => {
    expect(
      buildCronFromFriendlySchedule({
        scheduleMode: "manual_cron",
        monthlyDay: 1,
        timeOfDay: "09:00",
      }),
    ).toBeNull();
  });

  it("rejects invalid monthly schedule inputs", () => {
    expect(() =>
      buildCronFromFriendlySchedule({
        scheduleMode: "monthly",
        monthlyDay: 32,
        timeOfDay: "09:00",
      }),
    ).toThrow("Monthly schedule day must be between 1 and 31");

    expect(() =>
      buildCronFromFriendlySchedule({
        scheduleMode: "monthly",
        monthlyDay: 1,
        timeOfDay: "9am",
      }),
    ).toThrow("Schedule time must be in HH:mm 24-hour format");
  });

  it("computes the next run from generated cron and timezone", () => {
    expect(
      computeNextRun("0 9 1 * *", "Australia/Brisbane", new Date("2026-06-02T00:00:00.000Z")).toISOString(),
    ).toBe("2026-06-30T23:00:00.000Z");
  });

  it("dedupes the primary audit and additional audits while preserving separate accounts", () => {
    expect(
      selectedBudgetAuditIds([123, { id: 456 }, 123, { id: 789 }], 123),
    ).toEqual([123, 456, 789]);
  });
});
