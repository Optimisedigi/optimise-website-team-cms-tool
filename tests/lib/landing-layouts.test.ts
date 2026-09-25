import { describe, expect, it } from "vitest";
import { AWAY_LAYOUT_CUTOVER, clampToLayout, hasLayouts, layoutAdsDateRange, parseLayout } from "@/lib/landing-layouts";

const BEFORE = "2026-09-01T00:00:00.000Z";
const AFTER = "2026-09-30T00:00:00.000Z";

describe("parseLayout", () => {
  it.each([
    [null, "current"],
    ["", "current"],
    ["current", "current"],
    ["original", "original"],
    ["ORIGINAL", "current"],
    ["anything", "current"],
  ])("%s -> %s", (value, expected) => {
    expect(parseLayout(value)).toBe(expected);
  });
});

describe("hasLayouts", () => {
  it("is limited to Away Digital", () => {
    expect(hasLayouts("away-digital-teams")).toBe(true);
    expect(hasLayouts("away-digital")).toBe(false);
    expect(hasLayouts("some-other-client")).toBe(false);
  });
});

describe("clampToLayout", () => {
  it("starts the current layout at the cutover", () => {
    expect(clampToLayout("current", BEFORE, AFTER)).toEqual({ since: AWAY_LAYOUT_CUTOVER, until: AFTER, empty: false });
  });

  it("ends the original layout at the cutover", () => {
    expect(clampToLayout("original", BEFORE, AFTER)).toEqual({ since: BEFORE, until: AWAY_LAYOUT_CUTOVER, empty: false });
  });

  it("never widens a range that already sits inside the layout", () => {
    const lateSince = "2026-09-26T00:00:00.000Z";
    expect(clampToLayout("current", lateSince, AFTER)).toEqual({ since: lateSince, until: AFTER, empty: false });
    const earlyUntil = "2026-09-10T00:00:00.000Z";
    expect(clampToLayout("original", BEFORE, earlyUntil)).toEqual({ since: BEFORE, until: earlyUntil, empty: false });
  });

  it("reports an empty window instead of an inverted one", () => {
    expect(clampToLayout("current", BEFORE, "2026-09-10T00:00:00.000Z")).toEqual({
      since: "2026-09-10T00:00:00.000Z",
      until: "2026-09-10T00:00:00.000Z",
      empty: true,
    });
    expect(clampToLayout("original", "2026-09-26T00:00:00.000Z", AFTER)).toEqual({
      since: "2026-09-26T00:00:00.000Z",
      until: "2026-09-26T00:00:00.000Z",
      empty: true,
    });
  });
});

describe("layoutAdsDateRange", () => {
  const requested = { since: "2026-08-31T14:00:00.000Z", until: "2026-09-29T14:00:00.000Z" };

  it("keeps the requested ads range when the layout did not narrow it", () => {
    const inside = { since: "2026-09-25T14:00:00.000Z", until: "2026-09-29T14:00:00.000Z" };
    expect(layoutAdsDateRange("current", inside, clampToLayout("current", inside.since, inside.until), "LAST_7_DAYS")).toBe(
      "LAST_7_DAYS",
    );
  });

  it("starts the current layout's ads on the cutover day", () => {
    const window = clampToLayout("current", requested.since, requested.until);
    expect(layoutAdsDateRange("current", requested, window, "x")).toBe("2026-09-25,2026-09-29");
  });

  it("ends the original layout's ads the day before the cutover day", () => {
    const window = clampToLayout("original", requested.since, requested.until);
    expect(layoutAdsDateRange("original", requested, window, "x")).toBe("2026-09-01,2026-09-24");
  });

  it("skips ads entirely for an empty window", () => {
    const early = { since: "2026-08-01T00:00:00.000Z", until: "2026-08-31T00:00:00.000Z" };
    expect(layoutAdsDateRange("current", early, clampToLayout("current", early.since, early.until), "x")).toBeNull();
  });
});
