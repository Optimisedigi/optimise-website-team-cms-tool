import { describe, it, expect, vi, beforeEach } from "vitest";

import { upsertSnapshot } from "@/lib/google-ads-snapshots/upsert";

// ─── Payload mock factory ─────────────────────────────────────────────────────

function makePayloadFindMock(existingDoc: unknown | null = null) {
  return {
    find: vi.fn().mockResolvedValue({
      docs: existingDoc ? [existingDoc] : [],
    }),
    create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 99,
      ...data,
    })),
    update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 42,
      ...data,
    })),
  } as unknown as import("payload").Payload;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const capturedAt = "2026-05-20T10:00:00.000Z";

const minimalRows = [
  { campaignId: "c1", name: "Camp 1", status: "ENABLED", spend: 100, clicks: 10, impressions: 1000, conversions: 2, ctr: 1, cpa: 50 },
];

const levels = ["campaign", "ad_group", "keyword", "search_term"] as const;

// ─── Happy path — create ─────────────────────────────────────────────────────

describe("create path (no existing doc)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(capturedAt));
  });

  it("creates a new snapshot when no existing doc exists", async () => {
    const payload = makePayloadFindMock(null);
    const result = await upsertSnapshot(payload, {
      clientId: 7,
      level: "campaign",
      customerId: "456",
      rows: minimalRows,
    });
    expect(result.created).toBe(true);
    expect(result.id).toBe(99);
    expect(payload.create).toHaveBeenCalledOnce();
  });

  it("sets capturedAt to now on create", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: minimalRows,
    });
    const call = (payload.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.capturedAt).toBe(capturedAt);
  });

  it("sets rowCount to rows.length", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: minimalRows,
    });
    const call = (payload.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.rowCount).toBe(minimalRows.length);
  });

  it("maps clientId to client field", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 11,
      level: "keyword",
      customerId: "789",
      rows: [],
    });
    const call = (payload.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.client).toBe(11);
  });

  it("includes optional date fields when provided", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: minimalRows,
      dateRangeLabel: "LAST_14_DAYS",
      dateRangeStart: "2026-05-06",
      dateRangeEnd: "2026-05-20",
      sourceEndpoint: "/api/google-ads/campaign-budgets/get-metrics",
      fetchDurationMs: 500,
    });
    const call = (payload.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.dateRangeLabel).toBe("LAST_14_DAYS");
    expect(call.data.dateRangeStart).toBe("2026-05-06");
    expect(call.data.dateRangeEnd).toBe("2026-05-20");
    expect(call.data.sourceEndpoint).toBe("/api/google-ads/campaign-budgets/get-metrics");
    expect(call.data.fetchDurationMs).toBe(500);
  });

  it("sets error field when provided on create", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: [],
      error: "Growth Tools unreachable",
    });
    const call = (payload.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.error).toBe("Growth Tools unreachable");
  });

  it("omits optional fields when not provided", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "search_term",
      customerId: "123",
      rows: [],
    });
    const call = (payload.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect("dateRangeLabel" in call.data).toBe(false);
    expect("sourceEndpoint" in call.data).toBe(false);
    expect("fetchDurationMs" in call.data).toBe(false);
  });

  it("uses overrideAccess:true", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: [],
    });
    const call = (payload.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.overrideAccess).toBe(true);
  });
});

// ─── Happy path — update (existing doc) ──────────────────────────────────────

describe("update path (existing doc found)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(capturedAt));
  });

  it("updates the existing doc when found", async () => {
    const existingDoc = { id: 42, client: 7, level: "campaign" };
    const payload = makePayloadFindMock(existingDoc);
    const result = await upsertSnapshot(payload, {
      clientId: 7,
      level: "campaign",
      customerId: "456",
      rows: minimalRows,
    });
    expect(result.created).toBe(false);
    expect(result.id).toBe(42);
    expect(payload.update).toHaveBeenCalledOnce();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("sets capturedAt to now on update", async () => {
    const payload = makePayloadFindMock({ id: 42, client: 1, level: "ad_group" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "ad_group",
      customerId: "123",
      rows: [],
    });
    const call = (payload.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.capturedAt).toBe(capturedAt);
  });

  it("sets customerId on update", async () => {
    const payload = makePayloadFindMock({ id: 42, client: 1, level: "campaign" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "new-customer-id",
      rows: [],
    });
    const call = (payload.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.customerId).toBe("new-customer-id");
  });

  it("clears error on successful update (rows provided)", async () => {
    const payload = makePayloadFindMock({ id: 42, client: 1, level: "campaign" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: minimalRows,
    });
    const call = (payload.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.error).toBe(null);
  });

  it("includes date fields on update when provided", async () => {
    const payload = makePayloadFindMock({ id: 42, client: 1, level: "campaign" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: minimalRows,
      dateRangeLabel: "LAST_7_DAYS",
      dateRangeStart: "2026-05-13",
      dateRangeEnd: "2026-05-20",
    });
    const call = (payload.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.dateRangeLabel).toBe("LAST_7_DAYS");
    expect(call.data.dateRangeStart).toBe("2026-05-13");
    expect(call.data.dateRangeEnd).toBe("2026-05-20");
  });

  it("uses overrideAccess:true on update", async () => {
    const payload = makePayloadFindMock({ id: 42, client: 1, level: "campaign" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: [],
    });
    const call = (payload.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.overrideAccess).toBe(true);
  });
});

// ─── Error-only upsert (preserve last-good rows) ─────────────────────────────

describe("error-only upsert (preserves previously successful rows)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(capturedAt));
  });

  it("only updates error field on update when rows=[] and error is set", async () => {
    const payload = makePayloadFindMock({ id: 42, client: 1, level: "campaign" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: [],
      error: "Growth Tools returned 503",
    });
    const call = (payload.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.error).toBe("Growth Tools returned 503");
    expect("rows" in call.data).toBe(false);
    expect("rowCount" in call.data).toBe(false);
    expect(call.data.capturedAt).toBe(capturedAt);
  });

  it("preserves previously successful rows on update with rows=[]", async () => {
    const payload = makePayloadFindMock({ id: 42, client: 1, level: "campaign" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: [],
      error: "Transient blip",
    });
    const call = (payload.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.rows).toBeUndefined();
  });

  it("still updates capturedAt and error on error-only update", async () => {
    const payload = makePayloadFindMock({ id: 42, client: 1, level: "campaign" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: [],
      error: "timeout",
    });
    const call = (payload.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.data.capturedAt).toBe(capturedAt);
    expect(call.data.error).toBe("timeout");
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe("idempotency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(capturedAt));
  });

  it("uses find to check existence before deciding create vs update", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 5,
      level: "keyword",
      customerId: "999",
      rows: [],
    });
    expect(payload.find).toHaveBeenCalledOnce();
    const call = (payload.find as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.collection).toBe("google-ads-snapshots");
  });

  it("does not call create when an existing doc is found", async () => {
    const payload = makePayloadFindMock({ id: 1, client: 1, level: "campaign" });
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: [],
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("does not call update when no existing doc is found", async () => {
    const payload = makePayloadFindMock(null);
    await upsertSnapshot(payload, {
      clientId: 1,
      level: "campaign",
      customerId: "123",
      rows: [],
    });
    expect(payload.update).not.toHaveBeenCalled();
  });
});

// ─── All snapshot levels ─────────────────────────────────────────────────────

describe("all snapshot levels", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(capturedAt));
  });

  levels.forEach((level) => {
    it(`upserts for level=${level}`, async () => {
      const payload = makePayloadFindMock(null);
      const result = await upsertSnapshot(payload, {
        clientId: 1,
        level,
        customerId: "123",
        rows: [],
      });
      expect(result.created).toBe(true);
      expect(payload.create).toHaveBeenCalledOnce();
    });
  });
});
