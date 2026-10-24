import { describe, expect, it } from "vitest";
import { needsDailyGsc, sydneyDay } from "@/lib/content-map/gsc";

// 2026-10-24 01:00 UTC = 12:00 Sydney (AEDT, UTC+11).
const NOON_SYD = Date.UTC(2026, 9, 24, 1, 0);

describe("free daily Search Console refresh", () => {
  it("uses Sydney days, not UTC days", () => {
    expect(sydneyDay(NOON_SYD)).toBe("2026-10-24");
    // 2026-10-23 13:30 UTC is already 00:30 on the 24th in Sydney.
    expect(sydneyDay(Date.UTC(2026, 9, 23, 13, 30))).toBe("2026-10-24");
    expect(sydneyDay(Date.UTC(2026, 9, 23, 12, 30))).toBe("2026-10-23");
  });

  it("pulls on the first open of a new Sydney day only", () => {
    const connected = { gscConnected: true };
    expect(needsDailyGsc(connected, null, NOON_SYD)).toBe(true);
    expect(needsDailyGsc(connected, { pulledAt: new Date(NOON_SYD - 3 * 3600_000).toISOString() }, NOON_SYD)).toBe(false);
    expect(needsDailyGsc(connected, { pulledAt: new Date(Date.UTC(2026, 9, 23, 12, 30)).toISOString() }, NOON_SYD)).toBe(true);
  });

  it("never for clients without Search Console connected", () => {
    expect(needsDailyGsc({ gscConnected: false }, null, NOON_SYD)).toBe(false);
    expect(needsDailyGsc({}, null, NOON_SYD)).toBe(false);
  });
});
