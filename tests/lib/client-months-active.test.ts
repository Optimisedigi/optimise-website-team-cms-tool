import { describe, it, expect } from "vitest";
import { monthsActiveFrom } from "@/lib/client-months-active";

describe("monthsActiveFrom", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("returns null when no start date is given", () => {
    expect(monthsActiveFrom(null, now)).toBeNull();
    expect(monthsActiveFrom(undefined, now)).toBeNull();
    expect(monthsActiveFrom("", now)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(monthsActiveFrom("not-a-date", now)).toBeNull();
  });

  it("counts whole months between start and now", () => {
    // 2025-06-01 -> 2026-06-01 = exactly 12 months
    expect(monthsActiveFrom("2025-06-01T00:00:00Z", now)).toBe(12);
  });

  it("subtracts a month when the day-of-month anniversary hasn't been reached", () => {
    // 2025-06-15 -> 2026-06-01: 12 calendar-month diff, but day 1 < day 15
    expect(monthsActiveFrom("2025-06-15T00:00:00Z", now)).toBe(11);
  });

  it("returns 0 for a start date in the same month", () => {
    expect(monthsActiveFrom("2026-06-01T00:00:00Z", now)).toBe(0);
  });

  it("returns 0 for a future start date", () => {
    expect(monthsActiveFrom("2027-01-01T00:00:00Z", now)).toBe(0);
  });

  it("accepts a Date instance as well as a string", () => {
    expect(monthsActiveFrom(new Date("2024-06-01T00:00:00Z"), now)).toBe(24);
  });
});
