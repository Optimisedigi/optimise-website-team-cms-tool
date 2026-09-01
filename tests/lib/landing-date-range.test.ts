import { describe, expect, it } from "vitest";
import {
  landingDateRangeCaption,
  landingDateRangeParams,
  resolveLandingDateRange,
} from "@/lib/landing-date-range";

/*
 * Days are cut in Australia/Sydney, not UTC. The clock below is 20 Aug 16:00
 * UTC, which is already 2am on Friday 21 Aug in Sydney - inside the ten-hour
 * window where the two calendars disagree, so every case here would pass
 * trivially against a UTC cut and fails against the wrong one.
 */
describe("landing date ranges", () => {
  const now = new Date("2026-08-20T16:00:00.000Z");

  it("sends this week as explicit Monday-to-today dates", () => {
    const params = landingDateRangeParams({ mode: "this_week" }, now);
    const range = resolveLandingDateRange(params, now);

    expect(Object.fromEntries(params)).toEqual({ start: "2026-08-17", end: "2026-08-21" });
    expect(range).toMatchObject({
      since: "2026-08-16T14:00:00.000Z",
      until: "2026-08-21T14:00:00.000Z",
      days: 5,
      googleAdsRange: "2026-08-17,2026-08-21",
    });
  });

  it("resolves an explicit this-week period as Monday through Sunday", () => {
    const range = resolveLandingDateRange(new URLSearchParams({ period: "this_week" }), now);

    expect(range).toMatchObject({
      since: "2026-08-16T14:00:00.000Z",
      until: "2026-08-23T14:00:00.000Z",
      days: 7,
      googleAdsRange: "2026-08-17,2026-08-23",
      label: "This week",
    });
  });

  it("sends last week as the completed Monday-to-Sunday week", () => {
    const params = landingDateRangeParams({ mode: "last_week" }, now);
    const range = resolveLandingDateRange(params, now);

    expect(Object.fromEntries(params)).toEqual({ start: "2026-08-10", end: "2026-08-16" });
    expect(range).toMatchObject({ days: 7, googleAdsRange: "2026-08-10,2026-08-16" });
  });

  it("sends this month as the first of the month through today", () => {
    const params = landingDateRangeParams({ mode: "this_month" }, now);
    const range = resolveLandingDateRange(params, now);

    expect(Object.fromEntries(params)).toEqual({ start: "2026-08-01", end: "2026-08-21" });
    expect(range).toMatchObject({ days: 21, googleAdsRange: "2026-08-01,2026-08-21" });
  });

  it("sends last month as the completed calendar month", () => {
    const params = landingDateRangeParams({ mode: "last_month" }, now);
    const range = resolveLandingDateRange(params, now);

    expect(Object.fromEntries(params)).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(range).toMatchObject({ days: 31, googleAdsRange: "2026-07-01,2026-07-31" });
  });

  it("captions each range with the dates it covers", () => {
    expect(landingDateRangeCaption({ mode: "last_week" }, now)).toBe("10 Aug 2026 \u2013 16 Aug 2026");
    expect(landingDateRangeCaption({ mode: "today" }, now)).toBe("21 Aug 2026");
    expect(landingDateRangeCaption({ mode: "30" }, now)).toBe("22 Jul 2026 \u2013 21 Aug 2026");
  });

  it("resolves today as one inclusive calendar day", () => {
    const params = landingDateRangeParams({ mode: "today" }, now);
    const range = resolveLandingDateRange(params, now);

    expect(Object.fromEntries(params)).toEqual({ start: "2026-08-21", end: "2026-08-21" });
    expect(range).toMatchObject({
      since: "2026-08-20T14:00:00.000Z",
      until: "2026-08-21T14:00:00.000Z",
      days: 1,
      googleAdsRange: "2026-08-21,2026-08-21",
    });
  });

  it("resolves a custom inclusive range for analytics and Google Ads", () => {
    const range = resolveLandingDateRange(
      new URLSearchParams({ start: "2026-08-10", end: "2026-08-12" }),
      now,
    );

    expect(range).toMatchObject({
      since: "2026-08-09T14:00:00.000Z",
      until: "2026-08-12T14:00:00.000Z",
      days: 3,
      googleAdsRange: "2026-08-10,2026-08-12",
    });
  });

  /*
   * The mismatch this file exists for. A sign-up at 8am Sydney is 22:00 UTC the
   * previous day: under a UTC cut it fell outside "today" and outside the start
   * of "this week", which is how HubSpot could show a paid sign-up against a
   * dashboard reading zero.
   */
  it("keeps an early-morning Sydney event inside today and this week", () => {
    const morning = new Date("2026-08-16T22:00:00.000Z"); // 8am Mon 17 Aug in Sydney
    const clock = new Date("2026-08-17T02:00:00.000Z"); // noon the same Sydney day

    const today = resolveLandingDateRange(landingDateRangeParams({ mode: "today" }, clock), clock);
    expect(today?.since <= morning.toISOString()).toBe(true);
    expect(today?.until > morning.toISOString()).toBe(true);

    const week = resolveLandingDateRange(landingDateRangeParams({ mode: "this_week" }, clock), clock);
    expect(week?.since).toBe("2026-08-16T14:00:00.000Z");
    expect(week?.since <= morning.toISOString()).toBe(true);
  });

  it("cuts days in Sydney time across a daylight-saving change", () => {
    // Sydney leaves daylight saving on 5 Apr 2026: +11 before, +10 after.
    const summer = resolveLandingDateRange(
      new URLSearchParams({ start: "2026-04-03", end: "2026-04-03" }),
      new Date("2026-06-01T00:00:00.000Z"),
    );
    expect(summer).toMatchObject({
      since: "2026-04-02T13:00:00.000Z",
      until: "2026-04-03T13:00:00.000Z",
      days: 1,
    });

    const winter = resolveLandingDateRange(
      new URLSearchParams({ start: "2026-04-06", end: "2026-04-06" }),
      new Date("2026-06-01T00:00:00.000Z"),
    );
    expect(winter).toMatchObject({
      since: "2026-04-05T14:00:00.000Z",
      until: "2026-04-06T14:00:00.000Z",
      days: 1,
    });
  });

  it("rejects future, reversed, partial, and overlong ranges", () => {
    // 22 Aug has not begun in Sydney when it is 2am on the 21st there.
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2026-08-22", end: "2026-08-22" }), now)).toBeNull();
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2026-08-12", end: "2026-08-10" }), now)).toBeNull();
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2026-08-10" }), now)).toBeNull();
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2025-01-01", end: "2026-08-20" }), now)).toBeNull();
    expect(resolveLandingDateRange(new URLSearchParams({ start: "2026-02-31", end: "2026-02-31" }), now)).toBeNull();
  });
});
