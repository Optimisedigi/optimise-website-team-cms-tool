import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  getLatestSnapshot,
  getCampaignSnapshot,
  getAdGroupSnapshot,
  getKeywordSnapshot,
  getSearchTermSnapshot,
  getAllLatestForClient,
} from "@/lib/google-ads-snapshots";
import { upsertSnapshot } from "@/lib/google-ads-snapshots/upsert";

interface MockPayload {
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makePayload(): MockPayload {
  return {
    find: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: "new-id" }),
    update: vi.fn().mockResolvedValue({ id: "existing-id" }),
  };
}

// ─── getLatestSnapshot ─────────────────────────────────────────
describe("getLatestSnapshot", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("returns null when no doc found", async () => {
    payload.find.mockResolvedValue({ docs: [] });

    const result = await getLatestSnapshot(payload as never, {
      clientId: 1,
      level: "campaign",
    });

    expect(result).toBeNull();
    // The default (no-window) reader pages a few rows and picks the primary,
    // skipping the additive long-lookback windows.
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-snapshots",
        limit: 10,
      }),
    );
    const whereArg = payload.find.mock.calls[0][0].where;
    expect(whereArg.and).toEqual([
      { client: { equals: 1 } },
      { level: { equals: "campaign" } },
    ]);
  });

  it("returns a hydrated SnapshotRecord with computed isStale=false at default threshold", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    payload.find.mockResolvedValue({
      docs: [
        {
          id: "abc",
          client: 42,
          level: "campaign",
          capturedAt: threeHoursAgo,
          customerId: "1234567890",
          rowCount: 2,
          rows: [
            { campaignId: "c1" },
            { campaignId: "c2" },
          ],
        },
      ],
    });

    const result = await getLatestSnapshot(payload as never, {
      clientId: 42,
      level: "campaign",
    });

    expect(result).not.toBeNull();
    expect(result!.level).toBe("campaign");
    expect(result!.clientId).toBe("42");
    expect(result!.customerId).toBe("1234567890");
    expect(result!.rowCount).toBe(2);
    expect(result!.rows).toHaveLength(2);
    expect(result!.isStale).toBe(false);
    // 3 hours ≈ 180 minutes
    expect(result!.ageMinutes).toBeGreaterThanOrEqual(179);
    expect(result!.ageMinutes).toBeLessThanOrEqual(181);
  });

  it("returns isStale=true when staleAfterMinutes is below the snapshot age", async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    payload.find.mockResolvedValue({
      docs: [
        {
          id: "abc",
          client: 42,
          level: "campaign",
          capturedAt: threeHoursAgo,
          customerId: "1234567890",
          rowCount: 0,
          rows: [],
        },
      ],
    });

    const result = await getLatestSnapshot(payload as never, {
      clientId: 42,
      level: "campaign",
      staleAfterMinutes: 60,
    });

    expect(result!.isStale).toBe(true);
  });
});

// ─── per-level wrappers ────────────────────────────────────────
describe("per-level wrappers route to the correct level", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
    payload.find.mockResolvedValue({ docs: [] });
  });

  it("getCampaignSnapshot queries where.level.equals = campaign", async () => {
    await getCampaignSnapshot(payload as never, { clientId: 1 });
    const where = payload.find.mock.calls[0][0].where;
    expect(where.and).toContainEqual({ level: { equals: "campaign" } });
  });

  it("getAdGroupSnapshot queries where.level.equals = ad_group", async () => {
    await getAdGroupSnapshot(payload as never, { clientId: 1 });
    const where = payload.find.mock.calls[0][0].where;
    expect(where.and).toContainEqual({ level: { equals: "ad_group" } });
  });

  it("getKeywordSnapshot queries where.level.equals = keyword", async () => {
    await getKeywordSnapshot(payload as never, { clientId: 1 });
    const where = payload.find.mock.calls[0][0].where;
    expect(where.and).toContainEqual({ level: { equals: "keyword" } });
  });

  it("getSearchTermSnapshot queries where.level.equals = search_term", async () => {
    await getSearchTermSnapshot(payload as never, { clientId: 1 });
    const where = payload.find.mock.calls[0][0].where;
    expect(where.and).toContainEqual({ level: { equals: "search_term" } });
  });
});

// ─── getAllLatestForClient ─────────────────────────────────────
describe("getAllLatestForClient", () => {
  it("returns all four keys, mixing nulls and hydrated records", async () => {
    const payload = makePayload();
    const now = new Date().toISOString();

    payload.find.mockImplementation((args: any) => {
      // The where shape is { and: [ { client: ... }, { level: { equals: L } } ] }
      const levelClause = args.where.and.find((c: any) => "level" in c);
      const level = levelClause.level.equals;

      if (level === "campaign" || level === "keyword") {
        return Promise.resolve({
          docs: [
            {
              id: `id-${level}`,
              client: 7,
              level,
              capturedAt: now,
              customerId: "9999",
              rowCount: 1,
              rows: [{}],
            },
          ],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    const result = await getAllLatestForClient(payload as never, { clientId: 7 });

    expect(Object.keys(result).sort()).toEqual([
      "ad_group",
      "campaign",
      "keyword",
      "search_term",
    ]);
    expect(result.campaign).not.toBeNull();
    expect(result.keyword).not.toBeNull();
    expect(result.ad_group).toBeNull();
    expect(result.search_term).toBeNull();
    expect(result.campaign!.level).toBe("campaign");
    expect(result.keyword!.level).toBe("keyword");
  });
});

// ─── upsertSnapshot ────────────────────────────────────────────
describe("upsertSnapshot", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("creates a new doc with rowCount=rows.length and capturedAt set when none exists", async () => {
    payload.find.mockResolvedValue({ docs: [] });
    payload.create.mockResolvedValue({ id: "new-1" });

    const before = Date.now();
    const result = await upsertSnapshot(payload as never, {
      clientId: 5,
      level: "campaign",
      customerId: "111",
      rows: [{ campaignId: "a" }, { campaignId: "b" }, { campaignId: "c" }],
      sourceEndpoint: "/api/google-ads/campaign-budgets/get-metrics",
      dateRangeLabel: "LAST_30_DAYS",
      fetchDurationMs: 1234,
    });
    const after = Date.now();

    expect(result).toEqual({ id: "new-1", created: true });
    expect(payload.create).toHaveBeenCalledTimes(1);
    expect(payload.update).not.toHaveBeenCalled();

    const createArg = payload.create.mock.calls[0][0];
    expect(createArg.collection).toBe("google-ads-snapshots");
    expect(createArg.data.client).toBe(5);
    expect(createArg.data.level).toBe("campaign");
    expect(createArg.data.customerId).toBe("111");
    expect(createArg.data.rowCount).toBe(3);
    expect(Array.isArray(createArg.data.rows)).toBe(true);
    expect((createArg.data.rows as unknown[]).length).toBe(3);
    expect(createArg.data.sourceEndpoint).toBe(
      "/api/google-ads/campaign-budgets/get-metrics",
    );
    expect(createArg.data.dateRangeLabel).toBe("LAST_30_DAYS");
    expect(createArg.data.fetchDurationMs).toBe(1234);

    // capturedAt should be an ISO string within (before, after)
    const ts = new Date(createArg.data.capturedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("updates existing doc and writes rows + cleared error on success", async () => {
    payload.find.mockResolvedValue({ docs: [{ id: "existing-1" }] });
    payload.update.mockResolvedValue({ id: "existing-1" });

    const result = await upsertSnapshot(payload as never, {
      clientId: 5,
      level: "ad_group",
      customerId: "222",
      rows: [{ adGroupId: "ag1" }],
      sourceEndpoint: "/api/google-ads/ad-groups/list",
      dateRangeLabel: "STRUCTURAL",
      fetchDurationMs: 99,
    });

    expect(result).toEqual({ id: "existing-1", created: false });
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).toHaveBeenCalledTimes(1);

    const updateArg = payload.update.mock.calls[0][0];
    expect(updateArg.collection).toBe("google-ads-snapshots");
    expect(updateArg.id).toBe("existing-1");
    expect(updateArg.data.rowCount).toBe(1);
    expect((updateArg.data.rows as unknown[]).length).toBe(1);
    // Success — error should be explicitly cleared.
    expect(updateArg.data.error).toBeNull();
    expect(updateArg.data.fetchDurationMs).toBe(99);
  });

  it("preserves prior rows when error-only refresh (existing doc + empty rows + error)", async () => {
    payload.find.mockResolvedValue({ docs: [{ id: "existing-9" }] });
    payload.update.mockResolvedValue({ id: "existing-9" });

    await upsertSnapshot(payload as never, {
      clientId: 5,
      level: "keyword",
      customerId: "333",
      rows: [],
      error: "Growth Tools 503: temporary outage",
      fetchDurationMs: 42,
    });

    expect(payload.update).toHaveBeenCalledTimes(1);
    const updateArg = payload.update.mock.calls[0][0];

    // Critically: NO `rows` key (we keep last-good rows in place).
    expect("rows" in updateArg.data).toBe(false);
    expect("rowCount" in updateArg.data).toBe(false);
    expect(updateArg.data.error).toBe("Growth Tools 503: temporary outage");
    expect(updateArg.data.fetchDurationMs).toBe(42);
    expect(typeof updateArg.data.capturedAt).toBe("string");
    expect(updateArg.data.customerId).toBe("333");
  });
});
