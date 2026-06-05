import { describe, it, expect } from "vitest";
import {
  orderSlotsByPreference,
  parsePreferredMinutes,
  slotTzParts,
} from "@/lib/meeting-slot-preference";

// All slots below are in Australia/Sydney (UTC+10, no DST in this date window).
// 2026-07-01 is a Wednesday in July (AEST). 09:00 Sydney = 23:00 prev-day UTC.
const TZ = "Australia/Sydney";

function syd(ymd: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  // AEST = UTC+10
  const utcHour = h - 10;
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCHours(utcHour, m, 0, 0);
  return date.toISOString();
}

describe("parsePreferredMinutes", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parsePreferredMinutes("11:00")).toBe(660);
    expect(parsePreferredMinutes("09:30")).toBe(570);
    expect(parsePreferredMinutes("00:00")).toBe(0);
  });

  it("returns null for invalid or empty input", () => {
    expect(parsePreferredMinutes("")).toBeNull();
    expect(parsePreferredMinutes("   ")).toBeNull();
    expect(parsePreferredMinutes("not-a-time")).toBeNull();
    expect(parsePreferredMinutes(undefined)).toBeNull();
    expect(parsePreferredMinutes(123)).toBeNull();
  });
});

describe("slotTzParts", () => {
  it("resolves date and minutes in the target timezone", () => {
    const parts = slotTzParts(syd("2026-07-01", "11:00"), TZ);
    expect(parts.ymd).toBe("2026-07-01");
    expect(parts.minutes).toBe(660);
  });
});

describe("orderSlotsByPreference", () => {
  const day = "2026-07-01";
  // 9:00 .. 16:00 hourly
  const slots = [
    syd(day, "09:00"),
    syd(day, "10:00"),
    syd(day, "11:00"),
    syd(day, "12:00"),
    syd(day, "13:00"),
    syd(day, "14:00"),
    syd(day, "15:00"),
    syd(day, "16:00"),
  ];

  it("keeps chronological order when no preferred time is set", () => {
    const ordered = orderSlotsByPreference(slots, [{ date: day }], TZ);
    expect(ordered).toEqual(slots);
  });

  it("puts the preferred time and later slots first, then earlier ones", () => {
    const ordered = orderSlotsByPreference(
      slots,
      [{ date: day, preferred: "11:00" }],
      TZ
    );
    expect(ordered).toEqual([
      syd(day, "11:00"),
      syd(day, "12:00"),
      syd(day, "13:00"),
      syd(day, "14:00"),
      syd(day, "15:00"),
      syd(day, "16:00"),
      syd(day, "09:00"),
      syd(day, "10:00"),
    ]);
  });

  it("treats the preferred time as inclusive (>=)", () => {
    const ordered = orderSlotsByPreference(
      slots,
      [{ date: day, preferred: "16:00" }],
      TZ
    );
    expect(ordered[0]).toBe(syd(day, "16:00"));
  });

  it("rounds a non-boundary preferred up to the first slot at or after it", () => {
    const ordered = orderSlotsByPreference(
      slots,
      [{ date: day, preferred: "11:15" }],
      TZ
    );
    // 11:00 is before 11:15, so 12:00 is the first at/after preferred
    expect(ordered[0]).toBe(syd(day, "12:00"));
  });

  it("falls back to earliest when preferred is after every slot", () => {
    const ordered = orderSlotsByPreference(
      slots,
      [{ date: day, preferred: "23:00" }],
      TZ
    );
    expect(ordered).toEqual(slots);
  });

  it("keeps earliest date first and applies preference within each day", () => {
    const day2 = "2026-07-02";
    const multi = [
      syd(day, "09:00"),
      syd(day, "11:00"),
      syd(day2, "09:00"),
      syd(day2, "11:00"),
    ];
    const ordered = orderSlotsByPreference(
      multi,
      [
        { date: day, preferred: "11:00" },
        { date: day2, preferred: "11:00" },
      ],
      TZ
    );
    expect(ordered).toEqual([
      syd(day, "11:00"),
      syd(day, "09:00"),
      syd(day2, "11:00"),
      syd(day2, "09:00"),
    ]);
  });
});
