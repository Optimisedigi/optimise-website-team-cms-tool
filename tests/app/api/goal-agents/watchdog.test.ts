import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Module mocks (set up before any SUT import) ───────────────────────────
const mockPayload = {
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────
interface CampaignRow {
  campaignId: string;
  name: string;
  status: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpa: number | null;
}

function campaignRow(
  partial: Partial<CampaignRow> & { spend?: number; conversions?: number },
): CampaignRow {
  return {
    campaignId: partial.campaignId ?? "c1",
    name: partial.name ?? "Campaign",
    status: partial.status ?? "ENABLED",
    spend: partial.spend ?? 0,
    clicks: partial.clicks ?? 0,
    impressions: partial.impressions ?? 0,
    conversions: partial.conversions ?? 0,
    ctr: partial.ctr ?? 0,
    cpa: partial.cpa ?? null,
  };
}

function clientDoc(opts: { id: number | string; customerId?: string }) {
  return {
    id: opts.id,
    googleAdsCustomerId: opts.customerId ?? "123-456-7890",
  };
}

function snapshotDoc(opts: {
  id: number | string;
  clientId: number | string;
  capturedAt: string;
  rows: CampaignRow[];
}) {
  return {
    id: opts.id,
    client: opts.clientId,
    level: "campaign",
    capturedAt: opts.capturedAt,
    customerId: "123-456-7890",
    rows: opts.rows,
  };
}

/**
 * Builds a `payload.find` mock for runWatchdog that responds in the right
 * order:
 *  1. clients lookup (collection: 'clients')
 *  2. for each client: a recent-snapshot existence check
 *  3. for each eligible client: the two-most-recent campaign snapshots
 */
function programFind(
  clients: ReturnType<typeof clientDoc>[],
  perClient: Array<{
    /** Recent snapshot existence — non-empty array means eligible. */
    recent: unknown[];
    /** Two most-recent campaign snapshots, newest first. */
    snapshots: ReturnType<typeof snapshotDoc>[];
  }>,
) {
  // Pre-flatten the per-client sequence: existence-check, then 2-most-recent,
  // for each client in order.
  const sequence: unknown[][] = [];
  for (const slot of perClient) {
    sequence.push(slot.recent);
    sequence.push(slot.snapshots);
  }

  mockPayload.find.mockImplementation(async (args: { collection: string }) => {
    if (args.collection === "clients") {
      return { docs: clients };
    }
    if (args.collection === "google-ads-snapshots") {
      const next = sequence.shift();
      if (!next) return { docs: [] };
      return { docs: next };
    }
    return { docs: [] };
  });
}

// ─── runWatchdog unit tests ────────────────────────────────────────────────
describe("runWatchdog — anomaly detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns anomaliesFound:0 when both snapshots are within ±10%", async () => {
    const client = clientDoc({ id: 1 });
    const today = snapshotDoc({
      id: "snap-today",
      clientId: 1,
      capturedAt: "2024-06-02T04:00:00.000Z",
      rows: [campaignRow({ spend: 105, conversions: 11 })],
    });
    const yesterday = snapshotDoc({
      id: "snap-yesterday",
      clientId: 1,
      capturedAt: "2024-06-01T04:00:00.000Z",
      rows: [campaignRow({ spend: 100, conversions: 10 })],
    });
    programFind(
      [client],
      [{ recent: [today], snapshots: [today, yesterday] }],
    );

    const { runWatchdog } = await import("@/lib/goal-agents/watchdog");
    const summary = await runWatchdog(
      mockPayload as never,
      new Date("2024-06-02T05:00:00.000Z"),
    );

    expect(summary.clientsChecked).toBe(1);
    expect(summary.anomaliesFound).toBe(0);
    expect(summary.details).toEqual([]);
    expect(mockPayload.create).not.toHaveBeenCalled();
  });

  it("flags +50% spend as a warning and writes one activity-log row", async () => {
    const client = clientDoc({ id: 1 });
    const today = snapshotDoc({
      id: "snap-today",
      clientId: 1,
      capturedAt: "2024-06-02T04:00:00.000Z",
      rows: [campaignRow({ spend: 150, conversions: 10 })],
    });
    const yesterday = snapshotDoc({
      id: "snap-yesterday",
      clientId: 1,
      capturedAt: "2024-06-01T04:00:00.000Z",
      rows: [campaignRow({ spend: 100, conversions: 10 })],
    });
    programFind(
      [client],
      [{ recent: [today], snapshots: [today, yesterday] }],
    );

    const { runWatchdog } = await import("@/lib/goal-agents/watchdog");
    const summary = await runWatchdog(
      mockPayload as never,
      new Date("2024-06-02T05:00:00.000Z"),
    );

    expect(summary.clientsChecked).toBe(1);
    expect(summary.anomaliesFound).toBe(1);
    expect(summary.details[0]).toMatchObject({
      clientId: "1",
      metric: "totalSpend",
      severity: "warning",
    });
    expect(summary.details[0].deltaPct).toBeCloseTo(50, 2);

    // Exactly one activity-log row was created.
    const activityCalls = mockPayload.create.mock.calls.filter(
      (c) => c[0]?.collection === "activity-log",
    );
    expect(activityCalls.length).toBe(1);
    const data = activityCalls[0]?.[0]?.data;
    expect(data?.type).toBe("google_ads_anomaly_detected");
    expect(data?.client).toBe(1);
    expect(String(data?.title ?? "")).toMatch(/warning/i);
    expect(String(data?.title ?? "")).toMatch(/totalSpend/);
  });

  it("flags a -80% conversions collapse as critical", async () => {
    const client = clientDoc({ id: 7 });
    // Spend held flat so we only see the conversions anomaly.
    const today = snapshotDoc({
      id: "snap-today",
      clientId: 7,
      capturedAt: "2024-06-02T04:00:00.000Z",
      rows: [campaignRow({ spend: 100, conversions: 2 })],
    });
    const yesterday = snapshotDoc({
      id: "snap-yesterday",
      clientId: 7,
      capturedAt: "2024-06-01T04:00:00.000Z",
      rows: [campaignRow({ spend: 100, conversions: 10 })],
    });
    programFind(
      [client],
      [{ recent: [today], snapshots: [today, yesterday] }],
    );

    const { runWatchdog } = await import("@/lib/goal-agents/watchdog");
    const summary = await runWatchdog(
      mockPayload as never,
      new Date("2024-06-02T05:00:00.000Z"),
    );

    expect(summary.clientsChecked).toBe(1);
    expect(summary.anomaliesFound).toBe(1);
    expect(summary.details[0]).toMatchObject({
      clientId: "7",
      metric: "totalConversions",
      severity: "critical",
    });
    expect(summary.details[0].deltaPct).toBeCloseTo(-80, 2);

    const activityCalls = mockPayload.create.mock.calls.filter(
      (c) => c[0]?.collection === "activity-log",
    );
    expect(activityCalls.length).toBe(1);
    expect(activityCalls[0]?.[0]?.data?.type).toBe(
      "google_ads_anomaly_detected",
    );
    expect(String(activityCalls[0]?.[0]?.data?.title ?? "")).toMatch(
      /critical/i,
    );
  });

  it("skips clients that lack a yesterday snapshot and writes no log", async () => {
    const client = clientDoc({ id: 99 });
    const today = snapshotDoc({
      id: "snap-today",
      clientId: 99,
      capturedAt: "2024-06-02T04:00:00.000Z",
      rows: [campaignRow({ spend: 500, conversions: 0 })],
    });
    // Only one snapshot returned — no historical comparison possible.
    programFind([client], [{ recent: [today], snapshots: [today] }]);

    const { runWatchdog } = await import("@/lib/goal-agents/watchdog");
    const summary = await runWatchdog(
      mockPayload as never,
      new Date("2024-06-02T05:00:00.000Z"),
    );

    expect(summary.clientsChecked).toBe(1);
    expect(summary.anomaliesFound).toBe(0);
    expect(summary.details).toEqual([]);
    const activityCalls = mockPayload.create.mock.calls.filter(
      (c) => c[0]?.collection === "activity-log",
    );
    expect(activityCalls.length).toBe(0);
  });

  it("selects eligible clients from recent campaign snapshots and compares the two newest snapshots only", async () => {
    const client = clientDoc({ id: 12 });
    const latest = snapshotDoc({
      id: "latest",
      clientId: 12,
      capturedAt: "2024-06-03T04:00:00.000Z",
      rows: [campaignRow({ spend: 200, conversions: 10 })],
    });
    const previous = snapshotDoc({
      id: "previous",
      clientId: 12,
      capturedAt: "2024-06-02T04:00:00.000Z",
      rows: [campaignRow({ spend: 100, conversions: 10 })],
    });
    const older = snapshotDoc({
      id: "older-should-not-be-used",
      clientId: 12,
      capturedAt: "2024-05-01T04:00:00.000Z",
      rows: [campaignRow({ spend: 9999, conversions: 0 })],
    });

    mockPayload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === "clients") return { docs: [client] };
      if (args.collection === "google-ads-snapshots") {
        const sort = (args as { sort?: string }).sort;
        if (sort === "-capturedAt") return { docs: [latest, previous, older] };
        return { docs: [latest] };
      }
      return { docs: [] };
    });

    const { runWatchdog } = await import("@/lib/goal-agents/watchdog");
    const summary = await runWatchdog(
      mockPayload as never,
      new Date("2024-06-03T05:00:00.000Z"),
    );

    const snapshotCalls = mockPayload.find.mock.calls.filter(
      (c) => c[0]?.collection === "google-ads-snapshots",
    );
    expect(snapshotCalls[0]?.[0]).toMatchObject({
      where: {
        and: expect.arrayContaining([
          { client: { equals: 12 } },
          { level: { equals: "campaign" } },
          {
            capturedAt: {
              greater_than_equal: "2024-05-27T05:00:00.000Z",
            },
          },
        ]),
      },
      limit: 1,
    });
    expect(snapshotCalls[1]?.[0]).toMatchObject({
      sort: "-capturedAt",
      limit: 2,
      where: {
        and: expect.arrayContaining([
          { client: { equals: 12 } },
          { level: { equals: "campaign" } },
        ]),
      },
    });
    expect(summary.details).toEqual([
      {
        clientId: "12",
        metric: "totalSpend",
        deltaPct: 100,
        severity: "critical",
      },
    ]);
  });

  it("logs and continues when one eligible client's snapshot comparison fails", async () => {
    const brokenClient = clientDoc({ id: 1 });
    const healthyClient = clientDoc({ id: 2 });
    const recent = snapshotDoc({
      id: "recent",
      clientId: 1,
      capturedAt: "2024-06-02T04:00:00.000Z",
      rows: [campaignRow({ spend: 100, conversions: 10 })],
    });
    const latest = snapshotDoc({
      id: "latest-2",
      clientId: 2,
      capturedAt: "2024-06-02T04:00:00.000Z",
      rows: [campaignRow({ spend: 50, conversions: 1 })],
    });
    const previous = snapshotDoc({
      id: "previous-2",
      clientId: 2,
      capturedAt: "2024-06-01T04:00:00.000Z",
      rows: [campaignRow({ spend: 50, conversions: 5 })],
    });

    mockPayload.find.mockImplementation(async (args: { collection: string; sort?: string; where?: { and?: Array<Record<string, unknown>> } }) => {
      if (args.collection === "clients") return { docs: [brokenClient, healthyClient] };
      if (args.collection !== "google-ads-snapshots") return { docs: [] };
      const clientFilter = args.where?.and?.find((part) => "client" in part) as
        | { client?: { equals?: number } }
        | undefined;
      if (!args.sort) return { docs: [recent] };
      if (clientFilter?.client?.equals === 1) throw new Error("snapshot read failed");
      return { docs: [latest, previous] };
    });

    const { runWatchdog } = await import("@/lib/goal-agents/watchdog");
    const summary = await runWatchdog(
      mockPayload as never,
      new Date("2024-06-02T05:00:00.000Z"),
    );

    expect(summary.clientsChecked).toBe(2);
    expect(summary.anomaliesFound).toBe(1);
    expect(summary.details[0]).toMatchObject({
      clientId: "2",
      metric: "totalConversions",
      severity: "critical",
      deltaPct: -80,
    });
    expect(mockPayload.logger.warn).toHaveBeenCalledWith(
      "[goal-agents/watchdog] client 1 check failed: snapshot read failed",
    );
  });
});

// ─── Route auth tests ──────────────────────────────────────────────────────
describe("GET /api/goal-agents/watchdog — CRON_SECRET auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 500 when CRON_SECRET is missing from env", async () => {
    delete process.env.CRON_SECRET;

    vi.doMock("@/lib/goal-agents/watchdog", () => ({
      runWatchdog: vi.fn(),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/watchdog/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest(
      "http://localhost:3001/api/goal-agents/watchdog",
      {
        method: "GET",
        headers: { Authorization: "Bearer anything" },
      },
    );
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/CRON_SECRET/);
  });

  it("returns 401 when no Authorization header is supplied", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    vi.doMock("@/lib/goal-agents/watchdog", () => ({
      runWatchdog: vi.fn(),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/watchdog/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest(
      "http://localhost:3001/api/goal-agents/watchdog",
      { method: "GET" },
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the bearer token is wrong", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    vi.doMock("@/lib/goal-agents/watchdog", () => ({
      runWatchdog: vi.fn(),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/watchdog/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest(
      "http://localhost:3001/api/goal-agents/watchdog",
      {
        method: "GET",
        headers: { Authorization: "Bearer wrong-token" },
      },
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with the watchdog summary when the bearer token matches CRON_SECRET", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const fakeSummary = {
      clientsChecked: 3,
      anomaliesFound: 0,
      details: [],
    };
    vi.doMock("@/lib/goal-agents/watchdog", () => ({
      runWatchdog: vi.fn(() => Promise.resolve(fakeSummary)),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/watchdog/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest(
      "http://localhost:3001/api/goal-agents/watchdog",
      {
        method: "GET",
        headers: { Authorization: "Bearer test-cron-secret" },
      },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.summary).toEqual(fakeSummary);
  });

  it("returns 500 when runWatchdog throws after auth succeeds", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.doMock("@/lib/goal-agents/watchdog", () => ({
      runWatchdog: vi.fn(async () => {
        throw new Error("watchdog database unavailable");
      }),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/goal-agents/watchdog/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest(
      "http://localhost:3001/api/goal-agents/watchdog",
      {
        method: "GET",
        headers: { Authorization: "Bearer test-cron-secret" },
      },
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("watchdog database unavailable");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[goal-agents-watchdog]",
      "watchdog database unavailable",
    );
    consoleErrorSpy.mockRestore();
  });
});
