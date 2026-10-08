import { describe, it, expect, vi } from "vitest";

import {
  aggregateCampaignRows,
  baselineWindows,
  captureGoalRunBaseline,
  currentWindows,
  isGoalRunBaseline,
  normaliseScope,
  percentChange,
  windowEndingBefore,
  type CampaignFetcher,
} from "@/lib/goal-agents/baseline";
import type { CampaignSnapshotRow } from "@/lib/google-ads-snapshots/types";

function row(overrides: Partial<CampaignSnapshotRow>): CampaignSnapshotRow {
  return {
    campaignId: "1",
    name: "Campaign 1",
    status: "ENABLED",
    spend: 0,
    clicks: 0,
    impressions: 0,
    conversions: 0,
    ctr: 0,
    cpa: null,
    ...overrides,
  };
}

describe("baselineWindows", () => {
  it("builds three 7-day windows ending the day before the run, 30d earlier and 90d earlier", () => {
    const runStartedAt = new Date("2026-10-01T09:30:00.000Z");
    const windows = baselineWindows(runStartedAt);
    expect(windows.map((w) => [w.key, w.start, w.end])).toEqual([
      ["week", "2026-09-24", "2026-09-30"],
      ["month", "2026-08-25", "2026-08-31"],
      ["quarter", "2026-06-26", "2026-07-02"],
    ]);
  });

  it("never includes the anchor day itself", () => {
    const { end } = windowEndingBefore(new Date("2026-03-01T23:59:59.000Z"), 0);
    expect(end).toBe("2026-02-28");
  });
});

describe("currentWindows", () => {
  it("runs from the run start day to yesterday, with a trailing 7-day window", () => {
    const live = currentWindows(new Date("2026-10-01T09:30:00.000Z"), new Date("2026-10-09T08:00:00.000Z"));
    expect(live.sinceStart).toEqual({ start: "2026-10-01", end: "2026-10-08" });
    expect(live.last7).toEqual({ start: "2026-10-02", end: "2026-10-08" });
  });

  it("falls back to today when the run started today", () => {
    const live = currentWindows(new Date("2026-10-09T01:00:00.000Z"), new Date("2026-10-09T08:00:00.000Z"));
    expect(live.sinceStart).toEqual({ start: "2026-10-09", end: "2026-10-09" });
  });
});

describe("normaliseScope", () => {
  it("returns a sorted, de-duplicated list or null", () => {
    expect(normaliseScope(["b", " a ", "b", ""])).toEqual(["a", "b"]);
    expect(normaliseScope([])).toBeNull();
    expect(normaliseScope(undefined)).toBeNull();
    expect(normaliseScope("x")).toBeNull();
  });
});

describe("aggregateCampaignRows", () => {
  const rows = [
    row({ campaignId: "A", name: "Alpha", spend: 300, clicks: 100, impressions: 1000, conversions: 6 }),
    row({ campaignId: "B", name: "Beta", spend: 100, clicks: 50, impressions: 500, conversions: 0 }),
    row({ campaignId: "C", name: "Gamma", spend: 600, clicks: 200, impressions: 4000, conversions: 12 }),
  ];

  it("totals metrics and derives CPA, CTR and conversion rate", () => {
    const { metrics } = aggregateCampaignRows(rows, null);
    expect(metrics).toEqual({
      spend: 1000,
      clicks: 350,
      impressions: 5500,
      conversions: 18,
      cpa: 55.56,
      ctr: 6.36,
      conversionRate: 5.14,
    });
  });

  it("sorts spend allocation by spend desc with share of total", () => {
    const { campaigns } = aggregateCampaignRows(rows, null);
    expect(campaigns.map((c) => [c.campaignId, c.spendSharePercent, c.cpa])).toEqual([
      ["C", 60, 50],
      ["A", 30, 50],
      ["B", 10, null],
    ]);
  });

  it("filters to the scope allow-list case-insensitively", () => {
    const { metrics, campaigns } = aggregateCampaignRows(rows, ["a", "C"]);
    expect(campaigns.map((c) => c.campaignId)).toEqual(["C", "A"]);
    expect(metrics.spend).toBe(900);
    expect(campaigns[0]?.spendSharePercent).toBeCloseTo(66.67, 2);
  });

  it("handles an empty window without dividing by zero", () => {
    const { metrics, campaigns } = aggregateCampaignRows([], null);
    expect(metrics.cpa).toBeNull();
    expect(metrics.ctr).toBe(0);
    expect(metrics.conversionRate).toBe(0);
    expect(campaigns).toEqual([]);
  });
});

describe("percentChange", () => {
  it("computes signed percent change and nulls out a zero/null baseline", () => {
    expect(percentChange(100, 85)).toBe(-15);
    expect(percentChange(50, 75)).toBe(50);
    expect(percentChange(0, 10)).toBeNull();
    expect(percentChange(null, 10)).toBeNull();
    expect(percentChange(10, null)).toBeNull();
  });
});

describe("captureGoalRunBaseline", () => {
  const runStartedAt = new Date("2026-10-01T09:30:00.000Z");

  it("fetches each window and freezes the baseline on the goal run", async () => {
    const calls: string[] = [];
    const fetchCampaign: CampaignFetcher = async (_customerId, options) => {
      calls.push(options.dateRange);
      return {
        ok: true,
        rows: [row({ campaignId: "A", spend: 70, conversions: 7 }), row({ campaignId: "Z", spend: 999 })],
        sourceEndpoint: "/test",
        dateRangeLabel: options.rangeLabel,
      };
    };
    const update = vi.fn().mockResolvedValue({});
    const payload = { update } as unknown as Parameters<typeof captureGoalRunBaseline>[0]["payload"];

    const result = await captureGoalRunBaseline({
      payload,
      goalRunId: 42,
      customerId: "1234567890",
      runStartedAt,
      includedCampaignIds: ["A"],
      now: new Date("2026-10-09T00:00:00.000Z"),
      fetchCampaign,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toEqual(["2026-09-24,2026-09-30", "2026-08-25,2026-08-31", "2026-06-26,2026-07-02"]);
    expect(result.baseline.anchorDate).toBe("2026-10-01");
    expect(result.baseline.scope.includedCampaignIds).toEqual(["A"]);
    expect(result.baseline.points.map((p) => p.key)).toEqual(["week", "month", "quarter"]);
    // Out-of-scope campaign Z is excluded from the totals.
    expect(result.baseline.points[0]?.metrics.spend).toBe(70);
    expect(result.baseline.points[0]?.metrics.cpa).toBe(10);
    expect(isGoalRunBaseline(result.baseline)).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "goal-runs", id: 42, data: { baseline: result.baseline } }),
    );
  });

  it("does not freeze anything when any window fails", async () => {
    let n = 0;
    const fetchCampaign: CampaignFetcher = async (_customerId, options) => {
      n += 1;
      if (n === 2) {
        return { ok: false, error: "upstream 503", sourceEndpoint: "/test", dateRangeLabel: options.rangeLabel };
      }
      return { ok: true, rows: [], sourceEndpoint: "/test", dateRangeLabel: options.rangeLabel };
    };
    const update = vi.fn();
    const payload = { update } as unknown as Parameters<typeof captureGoalRunBaseline>[0]["payload"];

    const result = await captureGoalRunBaseline({
      payload,
      goalRunId: 42,
      customerId: "1234567890",
      runStartedAt,
      includedCampaignIds: null,
      fetchCampaign,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('"month"');
    expect(result.error).toContain("upstream 503");
    expect(update).not.toHaveBeenCalled();
  });
});
