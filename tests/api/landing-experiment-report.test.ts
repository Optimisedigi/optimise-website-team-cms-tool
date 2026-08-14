import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MIN_CONVERSIONS_FOR_CALL,
  MIN_SESSIONS_FOR_CALL,
  compareVariants,
  createAccumulator,
  summariseVariant,
  twoProportionPValue,
  wilsonInterval,
} from "@/lib/landing-experiment-report";

/**
 * The reporting layer's job is to avoid announcing winners the data cannot
 * support, so these tests focus on the refusal cases as much as the maths.
 */

const payloadMock = { find: vi.fn() };

vi.mock("payload", () => ({ getPayload: vi.fn(async () => payloadMock) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("../verify/route", () => ({ validateDashboardToken: () => true }));
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: (token: string | undefined) => token === "valid-token",
}));

import { GET } from "@/app/(frontend)/api/dashboard/landing-experiments/route";

describe("landing experiment statistics", () => {
  it("keeps Wilson intervals inside [0, 1] at extremes", () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 0]);

    const [zeroLow, zeroHigh] = wilsonInterval(0, 50);
    expect(zeroLow).toBe(0);
    expect(zeroHigh).toBeGreaterThan(0);
    expect(zeroHigh).toBeLessThan(1);

    const [allLow, allHigh] = wilsonInterval(50, 50);
    expect(allHigh).toBe(1);
    expect(allLow).toBeLessThan(1);
    expect(allLow).toBeGreaterThan(0);
  });

  it("narrows the interval as the sample grows", () => {
    const [smallLow, smallHigh] = wilsonInterval(5, 50);
    const [largeLow, largeHigh] = wilsonInterval(500, 5000);
    expect(largeHigh - largeLow).toBeLessThan(smallHigh - smallLow);
  });

  it("returns no p-value when a variant has no traffic", () => {
    expect(twoProportionPValue(0, 0, 5, 100)).toBeNull();
    expect(twoProportionPValue(5, 100, 0, 0)).toBeNull();
  });

  it("reports a large, clear difference as significant and a tiny one as not", () => {
    const clear = twoProportionPValue(100, 5000, 250, 5000);
    expect(clear).not.toBeNull();
    expect(clear as number).toBeLessThan(0.001);

    const noise = twoProportionPValue(100, 5000, 103, 5000);
    expect(noise as number).toBeGreaterThan(0.05);
  });

  it("counts each session once however many goal events it fires", () => {
    const accumulator = createAccumulator("a");
    accumulator.sessions.add("s1");
    accumulator.convertedSessions.add("s1");
    accumulator.convertedSessions.add("s1");

    const summary = summariseVariant(accumulator);
    expect(summary.sessions).toBe(1);
    expect(summary.conversions).toBe(1);
    expect(summary.conversionRate).toBe(1);
  });

  it("refuses to call a winner on a small sample even when p is low", () => {
    const summaries = [
      {
        variantId: "a",
        sessions: 40,
        conversions: 1,
        conversionRate: 0.025,
        interval: [0, 0] as [number, number],
        eventCounts: {},
      },
      {
        variantId: "b",
        sessions: 40,
        conversions: 12,
        conversionRate: 0.3,
        interval: [0, 0] as [number, number],
        eventCounts: {},
      },
    ];

    const [comparison] = compareVariants(summaries, "a");
    expect(comparison.pValue as number).toBeLessThan(0.05);
    // Sample is below both thresholds, so no call is made.
    expect(comparison.underpowered).toBe(true);
    expect(comparison.significant).toBe(false);
  });

  it("calls a winner once the sample clears both thresholds", () => {
    const sessions = MIN_SESSIONS_FOR_CALL * 20;
    const summaries = [
      {
        variantId: "a",
        sessions,
        conversions: MIN_CONVERSIONS_FOR_CALL * 8,
        conversionRate: (MIN_CONVERSIONS_FOR_CALL * 8) / sessions,
        interval: [0, 0] as [number, number],
        eventCounts: {},
      },
      {
        variantId: "b",
        sessions,
        conversions: MIN_CONVERSIONS_FOR_CALL * 16,
        conversionRate: (MIN_CONVERSIONS_FOR_CALL * 16) / sessions,
        interval: [0, 0] as [number, number],
        eventCounts: {},
      },
    ];

    const [comparison] = compareVariants(summaries, "a");
    expect(comparison.underpowered).toBe(false);
    expect(comparison.significant).toBe(true);
    expect(comparison.upliftPct as number).toBeGreaterThan(90);
  });

  it("produces no comparison when the control is missing", () => {
    expect(compareVariants([], "a")).toEqual([]);
  });
});

describe("landing experiment dashboard route", () => {
  function request(params: string, token: string | null = "valid-token") {
    const headers: Record<string, string> = {};
    if (token) headers.cookie = `dashboard_token=${token}`;
    return new NextRequest(`http://localhost/api/dashboard/landing-experiments?${params}`, { headers });
  }

  beforeEach(() => {
    payloadMock.find.mockReset();
  });

  it("refuses a request without a valid dashboard token", async () => {
    const res = await GET(request("slug=away-digital", "wrong-token"));
    expect(res.status).toBe(401);
    expect(payloadMock.find).not.toHaveBeenCalled();
  });

  it("requires a slug", async () => {
    const res = await GET(request(""));
    expect(res.status).toBe(400);
  });

  it("scopes every event query to the client resolved from the slug", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      .mockResolvedValueOnce({
        docs: [
          {
            experimentId: "landing-hero-v1",
            name: "Hero test",
            status: "running",
            allocationVersion: "3",
            primaryGoal: "booking_complete",
            variants: [{ variantId: "a" }, { variantId: "b" }],
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { eventType: "page_view", sessionId: "s1", variantId: "a" },
          { eventType: "booking_complete", sessionId: "s1", variantId: "a" },
          { eventType: "booking_complete", sessionId: "s1", variantId: "a" },
          { eventType: "page_view", sessionId: "s2", variantId: "b" },
        ],
        hasNextPage: false,
      });

    const res = await GET(request("slug=away-digital&days=30"));
    expect(res.status).toBe(200);

    const eventQuery = payloadMock.find.mock.calls[2][0];
    expect(eventQuery.collection).toBe("landing-events");
    expect(eventQuery.where.client).toEqual({ equals: 42 });

    const body = await res.json();
    expect(body.controlVariantId).toBe("a");

    const variantA = body.variants.find((row: { variantId: string }) => row.variantId === "a");
    // One session, converted once despite two goal events.
    expect(variantA.sessions).toBe(1);
    expect(variantA.conversions).toBe(1);

    expect(body.behaviourTotals.page_view).toBe(2);
    expect(body.behaviourTotals.booking_complete).toBe(2);
  });

  it("clamps an absurd range rather than scanning everything", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [], hasNextPage: false });

    const res = await GET(request("slug=away-digital&days=99999"));
    const body = await res.json();
    expect(body.rangeDays).toBe(365);
  });

  it("returns 404 for a slug with no client record", async () => {
    payloadMock.find.mockResolvedValueOnce({ docs: [] });
    const res = await GET(request("slug=away-digital"));
    expect(res.status).toBe(404);
  });
});
