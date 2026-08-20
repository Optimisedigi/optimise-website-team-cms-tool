import { describe, expect, it } from "vitest";
import {
  landingDateRangeParams,
  resolveLandingDateRange,
} from "@/lib/landing-date-range";

describe("landing date ranges", () => {
  const now = new Date("2026-08-20T16:00:00.000Z");

  it("sends this week as explicit Monday-to-today dates", () => {
    const params = landingDateRangeParams({ mode: "this_week" }, now);
    const range = resolveLandingDateRange(params, now);

    expect(Object.fromEntries(params)).toEqual({ start: "2026-08-17", end: "2026-08-20" });
    expect(range).toMatchObject({
      since: "2026-08-17T00:00:00.000Z",
      until: "2026-08-21T00:00:00.000Z",
      days: 4,
      googleAdsRange: "2026-08-17,2026-08-20",
    });
  });

  it("resolves an explicit this-week period as Monday through Sunday", () => {
    const range = resolveLandingDateRange(new URLSearchParams({ period: "this_week" }), now);

    expect(range).toMatchObject({
      since: "2026-08-17T00:00:00.000Z",
      until: "2026-08-24T00:00:00.000Z",
      days: 7,
      googleAdsRange: "2026-08-17,2026-08-23",
      label: "This week",
    });
  });

  it("resolves today as one inclusive calendar day", () => {
    const params = landingDateRangeParams({ mode: "today" }, now);
    const range = resolveLandingDateRange(params, now);

    expect(range).toMatchObject({
      since: "2026-08-20T00:00:00.000Z",
      until: "2026-08-21T00:00:00.000Z",
      days: 1,
      googleAdsRange: "2026-08-20,2026-08-20",
    });
  });

  it("resolves a custom inclusive range for analytics and Google Ads", () => {
    const range = resolveLandingDateRange(
      new URLSearchParams({ start: "2026-08-10", end: "2026-08-12" }),
      now,
    );

    expect(range).toMatchObject({
      since: "2026-08-10T00:00:00.000Z",
      until: "2026-08-13T00:00:00.000Z",
      days: 3,
      googleAdsRange: "2026-08-10,2026-08-12",
    });
  });

  it("rejects future, reversed, partial, and overlong ranges", () => {
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2026-08-21", end: "2026-08-21" }), now)).toBeNull();
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2026-08-12", end: "2026-08-10" }), now)).toBeNull();
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2026-08-10" }), now)).toBeNull();
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2025-01-01", end: "2026-08-20" }), now)).toBeNull();
  });
});
