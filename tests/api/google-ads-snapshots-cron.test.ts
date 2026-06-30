import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// IMPORTANT: cron.ts captures INTERNAL_API_KEY and GROWTH_TOOLS_URL at module
// import time. ESM static imports are hoisted above top-level statements, so
// we set these env vars via vi.hoisted() to ensure they are in place BEFORE
// the cron module is evaluated.
vi.hoisted(() => {
  process.env.INTERNAL_API_KEY = "test-key";
  process.env.GROWTH_TOOLS_URL = "http://growth.test";
});

// ─── Module mocks (must be set up before importing the SUT) ────
const mockPayload = {
  find: vi.fn(),
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

import { completedMonths, monthDateRange, monthRangeLabel, mtdComparisonRanges, runGoogleAdsSnapshotsCron } from "@/lib/google-ads-snapshots/cron";

// Pre-existing monthly snapshot docs — makes captureMonthlyCampaignSnapshots a
// no-op in the concurrency tests so the original level-sequencing contract
// stays observable. The monthly path has its own dedicated test below.
const allMonthlyDocs = completedMonths(13).map(({ year, month }) => ({
  dateRangeLabel: monthRangeLabel(year, month),
}));

function isMonthlyLookup(args: { where?: { and?: Array<Record<string, unknown>> } }): boolean {
  return Boolean(args.where?.and?.some((clause) => (clause as { dateRangeLabel?: { like?: string } }).dateRangeLabel?.like === "MONTH_%"));
}

// ─── Helpers ───────────────────────────────────────────────────
function buildClients(n: number) {
  return Array.from({ length: n }).map((_, i) => ({
    id: `client-${i + 1}`,
    googleAdsCustomerId: String(1_000_000_000 + i + 1),
    name: `Client ${i + 1}`,
  }));
}

interface FetchEvent {
  customerId: string;
  pathBucket: "campaign" | "ad_group" | "keyword" | "search_term" | "keyword_90d" | "ad_group_60d" | "pulse_campaign";
  phase: "start" | "end";
  t: number;
}

function pathBucket(url: string): FetchEvent["pathBucket"] | null {
  if (url.includes("/campaign-budgets/get-metrics")) {
    return new URL(url).searchParams.get("dateRange")?.includes(",") ? "pulse_campaign" : "campaign";
  }
  if (url.includes("/keyword-historical-spend")) {
    return url.includes("LAST_90_DAYS") ? "keyword_90d" : "keyword";
  }
  if (url.includes("/ad-groups/list")) {
    return url.includes("LAST_60_DAYS") ? "ad_group_60d" : "ad_group";
  }
  if (url.includes("/search-terms")) return "search_term";
  return null;
}

function extractCustomerId(url: string): string {
  const u = new URL(url);
  return u.searchParams.get("customerId") ?? "";
}

// ─── Tests ─────────────────────────────────────────────────────
describe("runGoogleAdsSnapshotsCron — concurrency + sequencing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing snapshot, so upsert hits create()
    mockPayload.find.mockImplementation((args: any) => {
      if (args.collection === "clients") {
        return Promise.resolve({ docs: buildClients(12) });
      }
      // Monthly-history lookup: report every month as already captured.
      if (isMonthlyLookup(args)) {
        return Promise.resolve({ docs: allMonthlyDocs });
      }
      // google-ads-snapshots lookup inside upsert
      return Promise.resolve({ docs: [] });
    });
    mockPayload.create.mockResolvedValue({ id: "snap-new" });
    mockPayload.update.mockResolvedValue({ id: "snap-existing" });
  });

  it("caps concurrent clients at the configured limit, sequences levels per client, and isolates per-level failures", async () => {
    const events: FetchEvent[] = [];
    // Tracks customers whose first-level has started and last-level not yet ended.
    const activeCustomers = new Set<string>();
    let maxConcurrent = 0;

    // Pick a victim (client-3) and force its keyword-level fetch to throw.
    const VICTIM_ID = "1000000003";

    globalThis.fetch = vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      const customerId = extractCustomerId(url);
      const bucket = pathBucket(url);
      if (!bucket) throw new Error(`Unexpected URL in test: ${url}`);

      if (bucket === "pulse_campaign") {
        const body = { metrics: [] };
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(body),
          json: async () => body,
        } as unknown as Response;
      }

      // Mark this customer as active if not already.
      const wasActive = activeCustomers.has(customerId);
      if (!wasActive) {
        activeCustomers.add(customerId);
        if (activeCustomers.size > maxConcurrent) {
          maxConcurrent = activeCustomers.size;
        }
      }

      events.push({ customerId, pathBucket: bucket, phase: "start", t: Date.now() });

      // Stagger so concurrency is observable.
      await new Promise((resolve) => setTimeout(resolve, 10));

      events.push({ customerId, pathBucket: bucket, phase: "end", t: Date.now() });

      // After the LAST level completes, remove the customer from active set.
      // The additive long-lookback windows (ad_group_60d) run last.
      if (bucket === "ad_group_60d") {
        activeCustomers.delete(customerId);
      }

      // Inject failure for the victim's primary keyword level.
      if (customerId === VICTIM_ID && bucket === "keyword") {
        throw new Error("simulated upstream failure");
      }

      // Each endpoint expects a different envelope shape — return empty arrays
      // under each known key so the parser produces 0 rows without errors.
      const body =
        bucket === "campaign"
          ? { metrics: [] }
          : bucket === "ad_group"
            ? { adGroups: [] }
            : bucket === "keyword"
              ? { keywords: [] }
              : { searchTerms: [] };

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const summary = await runGoogleAdsSnapshotsCron({
      payload: mockPayload as never,
      concurrency: 5,
    });

    // ─── (a) concurrency cap ──────────────────────────────
    expect(maxConcurrent).toBeGreaterThan(0);
    expect(maxConcurrent).toBeLessThanOrEqual(5);

    // ─── (b) per-client sequence campaign → ad_group → keyword → search_term ───
    const byCustomer = new Map<string, FetchEvent[]>();
    for (const ev of events) {
      if (ev.phase !== "start") continue;
      if (!byCustomer.has(ev.customerId)) byCustomer.set(ev.customerId, []);
      byCustomer.get(ev.customerId)!.push(ev);
    }
    expect(byCustomer.size).toBe(12);

    for (const [, perClient] of byCustomer) {
      const order = perClient.map((e) => e.pathBucket);
      expect(order).toEqual([
        "campaign",
        "ad_group",
        "keyword",
        "search_term",
        "keyword_90d",
        "ad_group_60d",
      ]);
    }

    // Also assert no overlapping fetches WITHIN a single customer (the prior
    // level must END before the next level STARTS).
    for (const cid of byCustomer.keys()) {
      const ordered = events.filter((e) => e.customerId === cid);
      // Walk and assert: start, end, start, end, ... in interleaved order.
      let lastEnd = -1;
      let phase: "start" | "end" = "start";
      for (const e of ordered) {
        expect(e.phase).toBe(phase);
        if (e.phase === "start" && lastEnd !== -1) {
          // Start of next level must be at or after end of previous level.
          expect(e.t).toBeGreaterThanOrEqual(lastEnd);
        }
        if (e.phase === "end") lastEnd = e.t;
        phase = phase === "start" ? "end" : "start";
      }
    }

    // ─── (c) failure isolation ────────────────────────────
    // The victim's keyword level throws, but ad_group (before) and search_term
    // (after) must still execute, AND every other client must finish all four.
    const victimEvents = events.filter((e) => e.customerId === VICTIM_ID);
    const victimStarts = victimEvents
      .filter((e) => e.phase === "start")
      .map((e) => e.pathBucket);
    expect(victimStarts).toEqual([
      "campaign",
      "ad_group",
      "keyword",
      "search_term",
      "keyword_90d",
      "ad_group_60d",
    ]);

    expect(summary.clientsProcessed).toBe(12);
    expect(summary.clientsErrored).toBeGreaterThanOrEqual(1);

    // Every non-victim client should have ok across all four levels.
    for (const r of summary.perClient) {
      if (r.customerId === VICTIM_ID) {
        expect(r.keyword.ok).toBe(false);
        expect(r.campaign.ok).toBe(true);
        expect(r.ad_group.ok).toBe(true);
        expect(r.search_term.ok).toBe(true);
      } else {
        expect(r.campaign.ok).toBe(true);
        expect(r.ad_group.ok).toBe(true);
        expect(r.keyword.ok).toBe(true);
        expect(r.search_term.ok).toBe(true);
      }
    }
  });

  it("backfills only the calendar months that are missing", async () => {
    // First 3 months already captured; the remaining 10 should be fetched.
    const existingMonths = allMonthlyDocs.slice(0, 3);
    mockPayload.find.mockImplementation((args: any) => {
      if (args.collection === "clients") {
        return Promise.resolve({ docs: buildClients(1) });
      }
      if (isMonthlyLookup(args)) {
        return Promise.resolve({ docs: existingMonths });
      }
      return Promise.resolve({ docs: [] });
    });

    const mtdRanges = new Set(mtdComparisonRanges().map((range) => `${range.start},${range.end}`));
    const monthlyFetchRanges: string[] = [];
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      const dateRange = new URL(url).searchParams.get("dateRange") ?? "";
      // Monthly pulls use a comma-span range "YYYY-MM-DD,YYYY-MM-DD".
      if (url.includes("/campaign-budgets/get-metrics") && dateRange.includes(",") && !mtdRanges.has(dateRange)) {
        monthlyFetchRanges.push(dateRange);
      }
      const body = url.includes("/campaign-budgets/get-metrics")
        ? { metrics: [] }
        : url.includes("/ad-groups/list")
          ? { adGroups: [] }
          : url.includes("/keyword-historical-spend")
            ? { keywords: [] }
            : { searchTerms: [] };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await runGoogleAdsSnapshotsCron({ payload: mockPayload as never, concurrency: 1 });

    const expectedMissingRanges = completedMonths(13)
      .slice(3)
      .map(({ year, month }) => monthDateRange(year, month))
      .map((range) => `${range.start},${range.end}`)
      .filter((range) => !mtdRanges.has(range));
    expect(monthlyFetchRanges).toEqual(expectedMissingRanges);
    // Every fetched range is a full calendar month: starts on the 1st.
    for (const range of monthlyFetchRanges) {
      expect(range).toMatch(/^\d{4}-\d{2}-01,\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ─── Route auth ────────────────────────────────────────────────
describe("GET /api/google-ads-snapshots/cron — CRON_SECRET auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 401 when no Authorization header is supplied", async () => {
    vi.resetModules();
    vi.doMock("@/lib/google-ads-snapshots/cron", () => ({
      runGoogleAdsSnapshotsCron: vi.fn(() =>
        Promise.resolve({
          startedAt: "x",
          finishedAt: "y",
          clientsProcessed: 0,
          clientsErrored: 0,
          perClient: [],
        }),
      ),
    }));
    const { GET } = await import(
      "@/app/(frontend)/api/google-ads-snapshots/cron/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3001/api/google-ads-snapshots/cron", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the bearer token is wrong", async () => {
    vi.resetModules();
    vi.doMock("@/lib/google-ads-snapshots/cron", () => ({
      runGoogleAdsSnapshotsCron: vi.fn(() =>
        Promise.resolve({
          startedAt: "x",
          finishedAt: "y",
          clientsProcessed: 0,
          clientsErrored: 0,
          perClient: [],
        }),
      ),
    }));
    const { GET } = await import(
      "@/app/(frontend)/api/google-ads-snapshots/cron/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3001/api/google-ads-snapshots/cron", {
      method: "GET",
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with the cron summary when the bearer token matches CRON_SECRET", async () => {
    vi.resetModules();
    const fakeSummary = {
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:01:00Z",
      clientsProcessed: 3,
      clientsErrored: 0,
      perClient: [],
    };
    vi.doMock("@/lib/google-ads-snapshots/cron", () => ({
      runGoogleAdsSnapshotsCron: vi.fn(() => Promise.resolve(fakeSummary)),
    }));

    const { GET } = await import(
      "@/app/(frontend)/api/google-ads-snapshots/cron/route"
    );
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3001/api/google-ads-snapshots/cron", {
      method: "GET",
      headers: { Authorization: "Bearer test-cron-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.summary).toEqual(fakeSummary);
  });
});
