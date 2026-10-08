import { describe, it, expect, vi } from "vitest";

import {
  buildCpaChartSeries,
  formatDuration,
  groupByHour,
  progressDateFor,
  recordGoalRunProgress,
  runTimeline,
  shouldRecordProgress,
  upsertProgressPoint,
  emptyProgress,
  PROGRESS_MAX_DAYS,
  type ProgressPoint,
} from "@/lib/goal-agents/progress";
import type { CampaignFetcher } from "@/lib/goal-agents/baseline";
import type { BaselineMetrics } from "@/lib/goal-agents/baseline-shared";

const metrics = (cpa: number | null, conversions = 1): BaselineMetrics => ({
  spend: cpa === null ? 0 : cpa * conversions,
  clicks: 10,
  impressions: 100,
  conversions: cpa === null ? 0 : conversions,
  cpa,
  ctr: 10,
  conversionRate: 10,
});

const point = (date: string, trailing: number | null, day: number | null = trailing): ProgressPoint => ({
  date,
  day: metrics(day),
  trailing7: metrics(trailing),
  recordedAt: `${date}T04:00:00.000Z`,
});

describe("progressDateFor / upsertProgressPoint", () => {
  it("records yesterday (UTC)", () => {
    expect(progressDateFor(new Date("2026-10-09T04:00:00.000Z"))).toBe("2026-10-08");
    expect(progressDateFor(new Date("2026-10-09T00:30:00.000Z"))).toBe("2026-10-08");
  });

  it("replaces an existing date, keeps the series sorted and capped", () => {
    let p = emptyProgress();
    p = upsertProgressPoint(p, point("2026-10-03", 50));
    p = upsertProgressPoint(p, point("2026-10-01", 60));
    p = upsertProgressPoint(p, point("2026-10-03", 45));
    expect(p.points.map((x) => [x.date, x.trailing7.cpa])).toEqual([["2026-10-01", 60], ["2026-10-03", 45]]);

    for (let i = 0; i < PROGRESS_MAX_DAYS + 10; i += 1) {
      const d = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      p = upsertProgressPoint(p, point(d, 40));
    }
    expect(p.points).toHaveLength(PROGRESS_MAX_DAYS);
    // Oldest January points are dropped; the October ones survive as the newest.
    expect(p.points[0]?.date).toBe("2026-01-13");
    expect(p.points[p.points.length - 1]?.date).toBe("2026-10-03");
  });
});

describe("shouldRecordProgress", () => {
  const now = new Date("2026-10-20T04:00:00.000Z");
  it("records active runs that are at least a day old", () => {
    expect(shouldRecordProgress({ status: "analysing", completedAt: null, createdAt: "2026-10-10T00:00:00.000Z", now })).toBe(true);
    expect(shouldRecordProgress({ status: "analysing", completedAt: null, createdAt: "2026-10-19T20:00:00.000Z", now })).toBe(false);
  });
  it("keeps recording finished runs for 14 days, then stops", () => {
    expect(shouldRecordProgress({ status: "complete", completedAt: "2026-10-15T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z", now })).toBe(true);
    expect(shouldRecordProgress({ status: "complete", completedAt: "2026-09-30T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z", now })).toBe(false);
    expect(shouldRecordProgress({ status: "failed", completedAt: null, createdAt: "2026-10-01T00:00:00.000Z", now })).toBe(false);
  });
});

describe("runTimeline / formatDuration", () => {
  it("computes elapsed, remaining and percent of the measurement cycle", () => {
    const t = runTimeline({
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
      status: "analysing",
      measurementDays: 14,
      now: new Date("2026-10-08T00:00:00.000Z"),
    });
    expect(t.percentComplete).toBe(50);
    expect(t.cycleEndsAt).toBe("2026-10-15T00:00:00.000Z");
    expect(formatDuration(t.elapsedMs)).toBe("7d 0h");
    expect(formatDuration(t.remainingMs)).toBe("7d 0h");
    expect(t.isFinished).toBe(false);
  });
  it("clamps to 100% after the cycle and flags finished runs", () => {
    const t = runTimeline({
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: "2026-10-02T00:00:00.000Z",
      status: "complete",
      measurementDays: 14,
      now: new Date("2026-12-01T00:00:00.000Z"),
    });
    expect(t.percentComplete).toBe(100);
    expect(t.remainingMs).toBe(0);
    expect(t.isFinished).toBe(true);
  });
  it("formats short durations", () => {
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
    expect(formatDuration(5 * 60_000)).toBe("5m");
  });
});

describe("buildCpaChartSeries", () => {
  it("derives target, latest and change vs baseline, skipping null CPAs", () => {
    const s = buildCpaChartSeries({
      progress: { version: 1, points: [point("2026-10-02", 60), point("2026-10-03", null), point("2026-10-04", 51)] },
      baselineCpa: 60,
      targetImprovementPercent: 15,
    });
    expect(s.targetCpa).toBe(51);
    expect(s.latestCpa).toBe(51);
    expect(s.changePercent).toBe(-15);
    expect(s.trailing.map((p) => p.cpa)).toEqual([60, null, 51]);
    expect(s.yMax).toBeCloseTo(69, 5);
  });
  it("handles no data", () => {
    const s = buildCpaChartSeries({ progress: null, baselineCpa: null, targetImprovementPercent: null });
    expect(s.trailing).toEqual([]);
    expect(s.latestCpa).toBeNull();
    expect(s.yMax).toBe(100);
  });
});

describe("groupByHour", () => {
  it("buckets rows into UTC hours, newest bucket first, items oldest first", () => {
    const rows = [
      { id: 1, createdAt: "2026-10-08T13:00:18.000Z" },
      { id: 2, createdAt: "2026-10-08T11:22:21.000Z" },
      { id: 3, createdAt: "2026-10-08T13:45:00.000Z" },
      { id: 4, createdAt: null },
    ];
    const buckets = groupByHour(rows);
    expect(buckets.map((b) => [b.hour, b.items.map((i) => i.id)])).toEqual([
      ["2026-10-08T13:00:00.000Z", [1, 3]],
      ["2026-10-08T11:00:00.000Z", [2]],
    ]);
  });
});

describe("recordGoalRunProgress", () => {
  const now = new Date("2026-10-09T04:05:00.000Z");

  function fakePayload(runs: Array<Record<string, unknown>>) {
    const updates: Array<{ id: number; data: Record<string, unknown> }> = [];
    const payload = {
      find: vi.fn(async () => ({ docs: runs })),
      findByID: vi.fn(async ({ id }: { id: number }) => ({ id, googleAdsCustomerId: id === 7 ? "123-456-7890" : null })),
      update: vi.fn(async (args: { id: number; data: Record<string, unknown> }) => {
        updates.push(args);
        return {};
      }),
    };
    return { payload: payload as unknown as Parameters<typeof recordGoalRunProgress>[0], updates };
  }

  it("fetches yesterday + trailing 7 per tracked run and appends to the series", async () => {
    const ranges: string[] = [];
    const fetchCampaign: CampaignFetcher = async (customerId, o) => {
      ranges.push(`${customerId}:${o.dateRange}`);
      return {
        ok: true,
        rows: [{ campaignId: "A", name: "A", status: "ENABLED", spend: 100, clicks: 10, impressions: 100, conversions: 2, ctr: 10, cpa: 50 }],
        sourceEndpoint: "/t",
        dateRangeLabel: o.rangeLabel,
      };
    };
    const { payload, updates } = fakePayload([
      { id: 1, status: "analysing", client: 7, parameters: { includedCampaignIds: ["A"] }, createdAt: "2026-10-01T00:00:00.000Z", progress: { version: 1, points: [point("2026-10-07", 55)] } },
      { id: 2, status: "analysing", client: 9, parameters: {}, createdAt: "2026-10-01T00:00:00.000Z" }, // no customer id → skipped
      { id: 3, status: "complete", client: 7, completedAt: "2026-09-01T00:00:00.000Z", createdAt: "2026-08-01T00:00:00.000Z" }, // too old → skipped
    ]);

    const summary = await recordGoalRunProgress(payload, { now, fetchCampaign });

    expect(summary).toMatchObject({ date: "2026-10-08", runsConsidered: 3, runsRecorded: 1, runsSkipped: 2, errors: [] });
    expect(ranges).toEqual(["1234567890:2026-10-08,2026-10-08", "1234567890:2026-10-02,2026-10-08"]);
    const progress = updates[0]?.data.progress as { points: ProgressPoint[] };
    expect(progress.points.map((p) => p.date)).toEqual(["2026-10-07", "2026-10-08"]);
    expect(progress.points[1]?.day.cpa).toBe(50);
  });

  it("isolates a Growth Tools failure to the one run", async () => {
    const fetchCampaign: CampaignFetcher = async (_c, o) => ({ ok: false, error: "503", sourceEndpoint: "/t", dateRangeLabel: o.rangeLabel });
    const { payload, updates } = fakePayload([
      { id: 1, status: "analysing", client: 7, parameters: {}, createdAt: "2026-10-01T00:00:00.000Z" },
    ]);
    const summary = await recordGoalRunProgress(payload, { now, fetchCampaign });
    expect(summary.runsRecorded).toBe(0);
    expect(summary.errors).toEqual([{ goalRunId: 1, error: "day window: 503" }]);
    expect(updates).toEqual([]);
  });
});
