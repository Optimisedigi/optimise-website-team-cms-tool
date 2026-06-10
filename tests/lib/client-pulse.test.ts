import {
  calculateAdsTrend,
  calculateNeglectRisk,
  calculateOrganicTrend,
  calculateServiceCoverage,
  calculateTargetProgress,
  getClientPulseSummaries,
  groupClientPulseSources,
  type ClientPulseSources,
} from "@/lib/client-pulse";

const emptySources = (clients: Array<Record<string, unknown>>): ClientPulseSources => ({
  clients,
  scheduledTasks: [],
  goalRuns: [],
  activityLog: [],
  ledgerItems: [],
  clientProcesses: [],
  organicSnapshots: [],
  gscMonthlySnapshots: [],
  googleAdsSnapshots: [],
  siteHealthReports: [],
  aiVisibilitySnapshots: [],
});

describe("client-pulse", () => {
  it("calculates increase, decrease and maintain target progress", () => {
    expect(calculateTargetProgress({ metric: "organic_clicks", value: 100, direction: "increase" }, { organic_clicks: 80 })).toMatchObject({ progressPercent: 80, status: "watch" });
    expect(calculateTargetProgress({ metric: "cpa", value: 50, direction: "decrease" }, { cpa: 40 })).toMatchObject({ progressPercent: 100, status: "on_track" });
    expect(calculateTargetProgress({ metric: "roas", value: 4, direction: "maintain" }, { roas: 3.6 })).toMatchObject({ progressPercent: 90, status: "watch" });
  });

  it("returns not_configured and missing_data target states", () => {
    expect(calculateTargetProgress({ metric: "traffic", value: null }, { traffic: 10 }).status).toBe("not_configured");
    expect(calculateTargetProgress({ metric: "traffic", value: 100 }, { traffic: null }).status).toBe("missing_data");
  });

  it("calculates neglect risk thresholds", () => {
    const now = new Date("2026-06-09T00:00:00.000Z");
    expect(calculateNeglectRisk({ lastMeaningfulActivityAt: "2026-06-01T00:00:00.000Z" }, { warningDays: 14, criticalDays: 30 }, now).status).toBe("good");
    expect(calculateNeglectRisk({ lastMeaningfulActivityAt: "2026-05-20T00:00:00.000Z" }, { warningDays: 14, criticalDays: 30 }, now).status).toBe("watch");
    expect(calculateNeglectRisk({ lastMeaningfulActivityAt: "2026-05-01T00:00:00.000Z" }, { warningDays: 14, criticalDays: 30 }, now).status).toBe("risk");
  });

  it("calculates service coverage status", () => {
    expect(calculateServiceCoverage({ activeAutomations: 1, activeScheduledTasks: 1, activeGoalRuns: 0, manualWorkLast30Days: 1, reportCount: 1, servicesTracked: ["organic", "paid_search"] }).status).toBe("good");
    expect(calculateServiceCoverage({ activeAutomations: 0, activeScheduledTasks: 0, activeGoalRuns: 0, manualWorkLast30Days: 0, reportCount: 0, servicesTracked: ["organic", "paid_search"] }).status).toBe("risk");
  });

  it("calculates MoM and YoY organic trend from monthly GSC snapshots", () => {
    const now = new Date("2026-06-09T00:00:00.000Z");
    const snapshots = [
      { periodStart: "2026-06-01", periodEnd: "2026-06-30", totalClicks: 50 }, // current month — ignored
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", totalClicks: 120, totalImpressions: 4000 },
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", totalClicks: 100 },
      { periodStart: "2025-05-01", periodEnd: "2025-05-31", totalClicks: 80 },
    ];
    expect(calculateOrganicTrend(snapshots, now)).toEqual({
      month: "2026-05",
      clicks: 120,
      impressions: 4000,
      momPercent: 20,
      yoyPercent: 50,
    });
  });

  it("returns null trend deltas when comparison months are missing", () => {
    const now = new Date("2026-06-09T00:00:00.000Z");
    expect(calculateOrganicTrend([], now)).toMatchObject({ month: null, momPercent: null, yoyPercent: null });
    expect(calculateOrganicTrend([{ periodStart: "2026-05-01", totalClicks: 10 }], now)).toMatchObject({ month: "2026-05", clicks: 10, momPercent: null, yoyPercent: null });
  });

  it("calculates MoM ads trend from MONTH_ campaign snapshots", () => {
    const now = new Date("2026-06-09T00:00:00.000Z");
    const snapshots = [
      { dateRangeLabel: "LAST_30_DAYS", rows: [{ clicks: 999, conversions: 9, spend: 9 }] }, // rolling — ignored
      { dateRangeLabel: "MONTH_2026-05", rows: [{ clicks: 200, conversions: 10, spend: 500 }, { clicks: 100, conversions: 10, spend: 300 }] },
      { dateRangeLabel: "MONTH_2026-04", rows: [{ clicks: 250, conversions: 16, spend: 640 }] },
    ];
    expect(calculateAdsTrend(snapshots, now)).toEqual({
      month: "2026-05",
      clicks: 300,
      conversions: 20,
      cpa: 40,
      clicksMomPercent: 20,
      conversionsMomPercent: 25,
      cpaMomPercent: 0,
      mtdMonth: null,
      mtdClicks: null,
      mtdConversions: null,
      mtdClicksYoyPercent: null,
      mtdConversionsYoyPercent: null,
    });
  });

  it("calculates MTD ads YoY from MTD campaign snapshots", () => {
    const now = new Date("2026-06-09T00:00:00.000Z");
    expect(calculateAdsTrend([
      { dateRangeLabel: "MTD_2026-06", rows: [{ clicks: 150, conversions: 12, spend: 600 }] },
      { dateRangeLabel: "MTD_LY_2026-06", rows: [{ clicks: 100, conversions: 10, spend: 500 }] },
    ], now)).toMatchObject({
      mtdMonth: "2026-06",
      mtdClicks: 150,
      mtdConversions: 12,
      mtdClicksYoyPercent: 50,
      mtdConversionsYoyPercent: 20,
    });
  });

  it("returns empty ads trend without campaign trend snapshots", () => {
    const now = new Date("2026-06-09T00:00:00.000Z");
    expect(calculateAdsTrend([{ dateRangeLabel: "LAST_30_DAYS", rows: [{ clicks: 10 }] }], now)).toMatchObject({ month: null, clicks: null, mtdMonth: null });
  });

  it("groups records by primary and covered client IDs", () => {
    const grouped = groupClientPulseSources(
      {
        ...emptySources([{ id: 1 }, { id: 2 }]),
        scheduledTasks: [{ id: "a", client: 1, clientsCovered: [{ id: 2 }] }],
        activityLog: [{ id: "b", client: { id: 2 } }],
      },
      ["1", "2"],
    );
    expect(grouped.scheduledTasks.get("1")?.map((item) => item.id)).toEqual(["a"]);
    expect(grouped.scheduledTasks.get("2")?.map((item) => item.id)).toEqual(["a"]);
    expect(grouped.activityLog.get("2")?.map((item) => item.id)).toEqual(["b"]);
  });

  it("returns deterministic summaries and score output", async () => {
    const calls: string[] = [];
    let clientsWhere: unknown;
    const payload = {
      async find(args: Record<string, unknown>) {
        calls.push(String(args.collection));
        if (args.collection === "clients") {
          clientsWhere = args.where;
          return {
            docs: [
              { id: 2, name: "Beta", slug: "beta", isActive: true, services: ["seo"], clientPulse: { enabled: true, targetValue: 100, primaryTarget: "organic_clicks", servicesTracked: ["organic"] } },
              { id: 1, name: "Alpha", slug: "alpha", isActive: true, services: ["google_ads"], googleAdsCustomerId: "123", clientPulse: { enabled: true, targetValue: 10, primaryTarget: "paid_conversions", servicesTracked: ["paid_search"] } },
            ],
          };
        }
        if (args.collection === "quarterly-organic-growth-snapshots") return { docs: [{ id: 10, client: 2, snapshotDate: "2026-06-01", clicks: 120 }] };
        if (args.collection === "client-value-ledger-items") return { docs: [{ id: 20, client: 2, occurredAt: "2026-06-01", title: "SEO work", category: "seo" }, { id: 21, client: 1, occurredAt: "2026-06-01", title: "Paid search work", category: "paid_media" }] };
        if (args.collection === "google-ads-snapshots") return { docs: [{ id: 30, client: 1, capturedAt: "2026-06-01", rows: [{ conversions: 12, costMicros: 120000000 }] }] };
        return { docs: [] };
      },
    };

    const summaries = await getClientPulseSummaries(payload, { now: new Date("2026-06-09T00:00:00.000Z") });
    expect(summaries.map((summary) => summary.client.name)).toEqual(["Alpha", "Beta"]);
    expect(summaries.map((summary) => summary.scores.overall.status)).toEqual(["watch", "watch"]);
    // Pulse page only shows active clients with the pulse toggle on.
    expect(clientsWhere).toEqual({
      and: [{ isActive: { not_equals: false } }, { "clientPulse.enabled": { equals: true } }],
    });
    expect(calls.filter((collection) => collection !== "clients")).toHaveLength(10);
    expect(new Set(calls)).toEqual(new Set(["clients", "scheduled-agent-tasks", "goal-runs", "activity-log", "client-value-ledger-items", "client-processes", "quarterly-organic-growth-snapshots", "gsc-snapshots", "google-ads-snapshots", "site-health-reports", "ai-visibility-snapshots"]));
  });
});
