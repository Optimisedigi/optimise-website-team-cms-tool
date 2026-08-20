import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import {
  MIN_CONVERSIONS_FOR_CALL,
  MIN_SESSIONS_FOR_CALL,
  buildFunnel,
  compareVariants,
  createAccumulator,
  percentile,
  summariseSections,
  summariseVariant,
  twoProportionPValue,
  wilsonInterval,
} from "@/lib/landing-experiment-report";

/**
 * The reporting layer's job is to avoid announcing winners the data cannot
 * support, so these tests focus on the refusal cases as much as the maths.
 */

const drizzleRun = vi.fn(async () => ({ rows: [] as Record<string, unknown>[] }));
// `auth` resolves to no user: these tests exercise the client-token path, and
// an invalid token must stay 401 even though the route now also accepts an
// admin session (covered in landing-report-auth.test.ts).
const payloadMock = { find: vi.fn(), auth: vi.fn(async () => ({ user: null })), db: { drizzle: { run: drizzleRun } } };

vi.mock("payload", () => ({ getPayload: vi.fn(async () => payloadMock) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("../verify/route", () => ({ validateDashboardToken: () => true }));
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: (token: string | undefined) => token === "valid-token",
}));

import {
  ATTRIBUTION_BUCKET,
  GET,
} from "@/app/(frontend)/api/dashboard/landing-experiments/route";

describe("landing experiment statistics", () => {
  it("builds a parseable attribution bucket that includes the landing route", async () => {
    const db = createClient({ url: "file::memory:" });
    try {
      await db.execute("CREATE TABLE landing_events (attribution TEXT, route TEXT)");
      await db.execute({
        sql: "INSERT INTO landing_events VALUES (?, ?)",
        args: [
          JSON.stringify({
            utm_source: "adwords",
            utm_medium: "ppc",
            utm_campaign: "1234567890",
          }),
          "/lp/bpo-services-au",
        ],
      });
      const result = await db.execute(`SELECT ${ATTRIBUTION_BUCKET} AS bucket FROM landing_events`);

      expect(result.rows[0].bucket).toBe(
        "adwords / ppc / 1234567890 / Landing page: /lp/bpo-services-au",
      );
    } finally {
      db.close();
    }
  });
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

describe("funnel drop-off", () => {
  function steps(entries: Record<string, string[]>) {
    return new Map(Object.entries(entries).map(([key, sessions]) => [key, new Set(sessions)]));
  }

  it("counts distinct sessions, so repeated clicks do not inflate a step", () => {
    const funnel = buildFunnel(
      steps({ page_view: ["s1", "s2", "s3"], cta_click: ["s1", "s1", "s2"] })
    );

    expect(funnel[0].sessions).toBe(3);
    expect(funnel[1].sessions).toBe(2);
    expect(funnel[1].droppedFromPrevious).toBe(1);
    expect(funnel[1].dropOffRate).toBeCloseTo(1 / 3);
  });

  it("backfills earlier steps from later ones instead of truncating", () => {
    // A session that demonstrably clicked a CTA on the page did land, even when
    // its page_view never arrived. The funnel therefore counts a session at
    // every step at or before the furthest one it reached, which keeps the
    // funnel non-increasing without discarding evidence.
    const funnel = buildFunnel(
      steps({ page_view: ["s1"], cta_click: ["s1", "s2", "s3"], form_start: ["s1", "s2"] })
    );

    expect(funnel[0].sessions).toBe(3);
    expect(funnel[1].sessions).toBe(3);
    expect(funnel[2].sessions).toBe(2);
    expect(funnel.every((step) => step.dropOffRate >= 0)).toBe(true);
    // Still monotonically non-increasing.
    expect(funnel.every((step, i) => i === 0 || step.sessions <= funnel[i - 1].sessions)).toBe(true);
  });

  it("never reports a completed booking as zero because an earlier event is missing", () => {
    // Reproduces the dashboard showing "Conversions 1" beside "Booked 0": the
    // booking session never fired cta_click, and the old clamp zeroed every
    // later step because of it.
    const funnel = buildFunnel(
      steps({ page_view: ["s1"], booking_complete: ["s1"] })
    );

    const booked = funnel[funnel.length - 1];
    expect(booked.sessions).toBe(1);
    expect(funnel.every((step) => step.sessions === 1)).toBe(true);
  });

  it("keeps steps nobody reached, because an empty step is the finding", () => {
    const funnel = buildFunnel(steps({ page_view: ["s1", "s2"], cta_click: ["s1"] }));

    const booked = funnel.find((step) => step.key === "booking_complete");
    expect(booked).toBeDefined();
    expect(booked!.sessions).toBe(0);
    expect(funnel).toHaveLength(6);
  });

  it("reports no drop-off and no division error when nobody landed", () => {
    const funnel = buildFunnel(new Map());
    expect(funnel.every((step) => step.sessions === 0)).toBe(true);
    expect(funnel.every((step) => Number.isFinite(step.dropOffRate))).toBe(true);
    expect(funnel.every((step) => Number.isFinite(step.shareOfEntry))).toBe(true);
  });
});

describe("time on section", () => {
  it("takes percentiles by nearest rank", () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentile(sorted, 0.5)).toBe(30);
    expect(percentile(sorted, 0.9)).toBe(50);
    expect(percentile([], 0.5)).toBe(0);
  });

  it("reports the median, so a few idle tabs cannot move it", () => {
    // Four ordinary readers and one tab left open. A mean would report about
    // twenty seconds of attention that nobody actually gave.
    const dwell = new Map([["hero", [2000, 3000, 4000, 5000, 600000]]]);
    const [hero] = summariseSections(dwell, new Map(), 5);

    expect(hero.medianSeconds).toBe(4);
    expect(hero.p90Seconds).toBe(600);
    expect(hero.sessions).toBe(5);
  });

  it("ranks sections by time spent and reports where people left", () => {
    const dwell = new Map([
      ["hero", [1000, 1000]],
      ["pricing", [9000, 11000]],
    ]);
    const exits = new Map([
      ["pricing", 3],
      ["hero", 1],
    ]);

    const sections = summariseSections(dwell, exits, 4);

    expect(sections[0].sectionId).toBe("pricing");
    expect(sections[0].exits).toBe(3);
    expect(sections[0].exitRate).toBeCloseTo(0.75);
    expect(sections[1].sectionId).toBe("hero");
  });

  it("does not divide by zero when no session has an exit point", () => {
    const [only] = summariseSections(new Map([["hero", [1000]]]), new Map(), 0);
    expect(only.exitRate).toBe(0);
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
    drizzleRun.mockReset();
    drizzleRun.mockResolvedValue({ rows: [] });
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
      // The property lookup: no reporting baseline set, so the selected range stands.
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
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

    const eventQuery = payloadMock.find.mock.calls[3][0];
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

  it("derives dwell, exits and the funnel from the scanned events", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      // The property lookup: no reporting baseline set, so the selected range stands.
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
      .mockResolvedValueOnce({
        docs: [
          {
            experimentId: "landing-hero-v1",
            name: "Hero test",
            status: "running",
            allocationVersion: "1",
            primaryGoal: "booking_complete",
            variants: [{ variantId: "a" }, { variantId: "b" }],
          },
        ],
      })
      // Newest first, as the route now scans, so a capped scan drops the
      // oldest events rather than the most recent. Read bottom-up for the
      // journey: s1 landed, viewed hero, clicked twice, then reached pricing.
      .mockResolvedValueOnce({
        docs: [
          { eventType: "section_dwell", sessionId: "s2", variantId: "b", properties: { section_id: "hero", active_ms: 4000 } },
          { eventType: "section_view", sessionId: "s2", variantId: "b", properties: { section_id: "hero" } },
          { eventType: "page_view", sessionId: "s2", variantId: "b" },
          // A duplicate dwell for the same session and section must not count twice.
          { eventType: "section_dwell", sessionId: "s1", variantId: "a", properties: { section_id: "hero", active_ms: 9000 } },
          { eventType: "section_dwell", sessionId: "s1", variantId: "a", properties: { section_id: "hero", active_ms: 2000 } },
          { eventType: "section_view", sessionId: "s1", variantId: "a", properties: { section_id: "pricing" } },
          { eventType: "cta_click", sessionId: "s1", variantId: "a" },
          { eventType: "cta_click", sessionId: "s1", variantId: "a" },
          { eventType: "section_view", sessionId: "s1", variantId: "a", properties: { section_id: "hero" } },
          { eventType: "page_view", sessionId: "s1", variantId: "a" },
        ],
        hasNextPage: false,
      });

    const res = await GET(request("slug=away-digital&days=30"));
    const body = await res.json();

    // Two landed, one clicked despite clicking twice.
    expect(body.funnel[0].sessions).toBe(2);
    expect(body.funnel[1].sessions).toBe(1);
    expect(body.funnel[1].dropOffRate).toBeCloseTo(0.5);

    const hero = body.sections.find((s: { sectionId: string }) => s.sectionId === "hero");
    // Only the first dwell per session counts: 2s and 4s, median 4s by rank.
    expect(hero.sessions).toBe(2);

    // s1's last section was pricing; s2's was hero.
    const pricing = body.sections.find((s: { sectionId: string }) => s.sectionId === "pricing");
    expect(pricing?.exits ?? 0).toBe(1);
    expect(hero.exits).toBe(1);

    expect(Object.keys(body.funnelByVariant).sort()).toEqual(["a", "b"]);
  });

  it("scopes the report to one page, and keeps every page selectable", async () => {
    // Pages have different sections, and the scan is capped, so pooling them is
    // both meaningless and inaccurate. Selecting one page must not remove the
    // others from the selector, or there is no way back.
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      // The property lookup: no reporting baseline set, so the selected range stands.
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [], hasNextPage: false });

    drizzleRun.mockResolvedValue({
      rows: [
        { bucket: "offshore-teams-au", sessions: 1296, conversions: 59 },
        { bucket: "offshore-teams-us", sessions: 780, conversions: 30 },
      ],
    });

    const res = await GET(request("slug=away-digital&page=offshore-teams-au"));
    const body = await res.json();

    expect(body.filters.page).toBe("offshore-teams-au");
    expect(body.pages.map((p: { key: string }) => p.key)).toEqual([
      "offshore-teams-au",
      "offshore-teams-us",
    ]);

    // The events query is narrowed to the selected page.
    const eventQuery = payloadMock.find.mock.calls[3][0];
    expect(eventQuery.where.pageId).toEqual({ equals: "offshore-teams-au" });
  });

  it("ignores a filter that is not a plain identifier", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      // The property lookup: no reporting baseline set, so the selected range stands.
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [], hasNextPage: false });

    const res = await GET(request("slug=away-digital&page=' OR 1=1--&device=%3Cscript%3E"));
    const body = await res.json();

    expect(body.filters.page).toBeNull();
    expect(body.filters.device).toBeNull();
    expect(payloadMock.find.mock.calls[3][0].where.pageId).toBeUndefined();
  });

  it("splits by device without letting the filter hide the other devices", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      // The property lookup: no reporting baseline set, so the selected range stands.
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
      .mockResolvedValueOnce({
        docs: [
          {
            experimentId: "landing-hero-v1",
            name: "Hero test",
            status: "running",
            allocationVersion: "1",
            primaryGoal: "booking_complete",
            variants: [{ variantId: "a" }, { variantId: "b" }],
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { eventType: "page_view", sessionId: "m1", variantId: "a", deviceClass: "mobile" },
          { eventType: "page_view", sessionId: "d1", variantId: "a", deviceClass: "desktop" },
          { eventType: "cta_click", sessionId: "d1", variantId: "a", deviceClass: "desktop" },
        ],
        hasNextPage: false,
      });

    drizzleRun.mockResolvedValue({
      rows: [
        { bucket: "mobile", sessions: 819, conversions: 20 },
        { bucket: "desktop", sessions: 393, conversions: 22 },
      ],
    });

    const res = await GET(request("slug=away-digital&device=desktop"));
    const body = await res.json();

    // Only desktop sessions reach the funnel.
    expect(body.funnel[0].sessions).toBe(1);
    expect(body.funnel[1].sessions).toBe(1);

    // The split still lists mobile, so the toggle can be switched back.
    expect(body.devices.map((d: { key: string }) => d.key)).toEqual(["mobile", "desktop"]);
  });

  it("clamps an absurd range rather than scanning everything", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      // The property lookup: no reporting baseline set, so the selected range stands.
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [], hasNextPage: false });

    const res = await GET(request("slug=away-digital&days=99999"));
    const body = await res.json();
    expect(body.rangeDays).toBe(365);
  });

  it("applies both ends of a custom date range", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [], hasNextPage: false });

    const res = await GET(
      request("slug=away-digital&start=2026-08-18&end=2026-08-20"),
    );
    const body = await res.json();

    expect(body.rangeDays).toBe(3);
    expect(payloadMock.find.mock.calls[3][0].where.occurredAt).toEqual({
      greater_than_equal: "2026-08-18T00:00:00.000Z",
      less_than: "2026-08-21T00:00:00.000Z",
    });
  });

  it("clamps the range to the property's reporting baseline and says it did", async () => {
    // The baseline is a filter, never a delete: it moves the start of the scan
    // forward, and the response has to say so or an empty dashboard looks broken.
    const baseline = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      .mockResolvedValueOnce({ docs: [{ dataStartDate: baseline }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [], hasNextPage: false });

    const res = await GET(request("slug=away-digital&days=90"));
    const body = await res.json();

    expect(body.baselineApplied).toBe(true);
    expect(body.dataStartDate).toBe(baseline);
    expect(body.rangeStart).toBe(baseline);
    expect(payloadMock.find.mock.calls[3][0].where.occurredAt.greater_than_equal).toBe(baseline);
  });

  it("leaves the selected range alone when the baseline is older than it", async () => {
    const oldBaseline = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      .mockResolvedValueOnce({ docs: [{ dataStartDate: oldBaseline }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [], hasNextPage: false });

    const res = await GET(request("slug=away-digital&days=30"));
    const body = await res.json();

    expect(body.baselineApplied).toBe(false);
    expect(body.rangeStart > oldBaseline).toBe(true);
  });

  it("counts the readiness checklist goal as a form submit from that form only", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
      .mockResolvedValueOnce({
        docs: [
          {
            experimentId: "landing-hero-v1",
            name: "Hero test",
            status: "running",
            allocationVersion: "1",
            primaryGoal: "readiness_checklist",
            variants: [{ variantId: "a" }],
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { eventType: "page_view", sessionId: "s1", variantId: "a" },
          {
            eventType: "form_submit",
            sessionId: "s1",
            variantId: "a",
            properties: { form_id: "readiness-checklist" },
          },
          { eventType: "page_view", sessionId: "s2", variantId: "a" },
          {
            eventType: "form_submit",
            sessionId: "s2",
            variantId: "a",
            properties: { form_id: "qualification" },
          },
        ],
        hasNextPage: false,
      });

    const body = await (await GET(request("slug=away-digital&days=30"))).json();

    // Only the checklist submit converts; the qualification submit does not.
    expect(body.variants[0].conversions).toBe(1);
    expect(body.variants[0].sessions).toBe(2);
  });

  it("reports time on page from page_dwell, and counts untimed sessions as unmeasured", async () => {
    payloadMock.find
      .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
      .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [
          { eventType: "page_view", sessionId: "s1" },
          {
            eventType: "page_dwell",
            sessionId: "s1",
            pageViewId: "pv1",
            properties: { active_ms: 12000, total_ms: 30000 },
          },
          // A duplicated beacon for the same page view must not double count.
          {
            eventType: "page_dwell",
            sessionId: "s1",
            pageViewId: "pv1",
            properties: { active_ms: 12000, total_ms: 30000 },
          },
          // A session from before page_dwell existed: unmeasured, not zero.
          { eventType: "page_view", sessionId: "s2" },
        ],
        hasNextPage: false,
      });

    const body = await (await GET(request("slug=away-digital&days=30"))).json();

    expect(body.sessionTime.measuredSessions).toBe(1);
    expect(body.sessionTime.unmeasuredSessions).toBe(1);
    expect(body.sessionTime.medianActiveSeconds).toBe(12);
    expect(body.sessionTime.medianTotalSeconds).toBe(30);
  });

  it("returns 404 for a slug with no client record", async () => {
    payloadMock.find.mockResolvedValueOnce({ docs: [] });
    const res = await GET(request("slug=away-digital"));
    expect(res.status).toBe(404);
  });
});
