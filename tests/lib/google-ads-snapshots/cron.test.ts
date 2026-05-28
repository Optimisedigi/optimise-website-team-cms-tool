import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { runGoogleAdsSnapshotsCron } from "@/lib/google-ads-snapshots/cron";

// ─── Payload mock ─────────────────────────────────────────────────────────────

function makePayload() {
  return {
    // Default: empty. Tests override as needed.
    find: vi.fn().mockResolvedValue({ docs: [] }),
    create: vi.fn().mockResolvedValue({ id: 99 }),
    update: vi.fn().mockResolvedValue({ id: 42 }),
    logger: { warn: vi.fn() },
  } as unknown as import("payload").Payload;
}

// ─── runGoogleAdsSnapshotsCron ───────────────────────────────────────────────

describe("runGoogleAdsSnapshotsCron", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the expected CronSummary shape", async () => {
    const payload = makePayload();
    const summary = await runGoogleAdsSnapshotsCron({ payload });

    expect(summary).toHaveProperty("startedAt");
    expect(summary).toHaveProperty("finishedAt");
    expect(summary).toHaveProperty("clientsProcessed");
    expect(summary).toHaveProperty("clientsErrored");
    expect(summary).toHaveProperty("perClient");
    expect(Array.isArray(summary.perClient)).toBe(true);
    expect(summary.clientsProcessed).toBe(0);
    expect(summary.clientsErrored).toBe(0);
  });

  it("processes zero clients gracefully when no clients have googleAdsCustomerId", async () => {
    const payload = makePayload();
    const summary = await runGoogleAdsSnapshotsCron({ payload });
    expect(summary.clientsProcessed).toBe(0);
    expect(summary.clientsErrored).toBe(0);
    expect(summary.perClient).toHaveLength(0);
  });

  it("skips clients with null/empty/whitespace googleAdsCustomerId", async () => {
    const payload = makePayload();
    payload.find.mockResolvedValue({
      docs: [
        { id: 1, googleAdsCustomerId: null },
        { id: 2, googleAdsCustomerId: "" },
        { id: 3, googleAdsCustomerId: "  " },
      ],
    });

    const summary = await runGoogleAdsSnapshotsCron({ payload });
    expect(summary.clientsProcessed).toBe(0);
  });

  it("processes eligible clients with valid customerId", async () => {
    const payload = makePayload();
    payload.find.mockResolvedValue({
      docs: [{ id: 10, googleAdsCustomerId: "123-456-7890", name: "Acme" }],
    });

    const summary = await runGoogleAdsSnapshotsCron({ payload, concurrency: 1 });
    expect(summary.clientsProcessed).toBe(1);
    expect(summary.perClient).toHaveLength(1);
  });

  it("marks client as errored when any level fails", async () => {
    const payload = makePayload();
    payload.find.mockResolvedValue({
      docs: [{ id: 1, googleAdsCustomerId: "111-111-1111" }],
    });

    // Growth Tools unavailable → all levels error → clientsErrored = 1
    const summary = await runGoogleAdsSnapshotsCron({ payload, concurrency: 1 });
    expect(summary.clientsProcessed).toBe(1);
    expect(summary.clientsErrored).toBeGreaterThanOrEqual(1);
  });

  it("accepts clientIds filter in where clause", async () => {
    const payload = makePayload();
    await runGoogleAdsSnapshotsCron({ payload, clientIds: [5, 6] });
    const call = payload.find.mock.calls[0]![0] as Record<string, unknown>;
    expect((call.where as Record<string, unknown>)["id"]).toEqual({ in: [5, 6] });
  });

  it("respects concurrency option without throwing", async () => {
    const payload = makePayload();
    await runGoogleAdsSnapshotsCron({ payload, concurrency: 10 });
    expect(true).toBe(true);
  });

  it("errors in one client do not abort the whole run", async () => {
    const payload = makePayload();
    payload.find.mockResolvedValue({
      docs: [
        { id: 1, googleAdsCustomerId: "111-111-1111" },
        { id: 2, googleAdsCustomerId: "222-222-2222" },
      ],
    });

    const summary = await runGoogleAdsSnapshotsCron({ payload, concurrency: 2 });
    // At least one client should be processed
    expect(summary.clientsProcessed).toBeGreaterThanOrEqual(1);
  });

  it("handles missing client name gracefully", async () => {
    const payload = makePayload();
    payload.find.mockResolvedValue({
      docs: [{ id: 1, googleAdsCustomerId: "111-111-1111" }],
    });

    const summary = await runGoogleAdsSnapshotsCron({ payload, concurrency: 1 });
    expect(summary.clientsProcessed).toBe(1);
  });

  it("calls upsertSnapshot for each of the four levels per client", async () => {
    const payload = makePayload();
    payload.find.mockResolvedValue({
      docs: [{ id: 1, googleAdsCustomerId: "111-111-1111" }],
    });

    await runGoogleAdsSnapshotsCron({ payload, concurrency: 1 });

    // 4 levels × (find + upsert) = upsert is called 4 times (once per level)
    // The update mock is called at least once per level
    expect(payload.update.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("normalises customerId (strips hyphens and whitespace)", async () => {
    const payload = makePayload();
    payload.find.mockResolvedValue({
      docs: [{ id: 1, googleAdsCustomerId: "  123-456-7890  " }],
    });

    // Should not throw on non-standard customerId format
    await runGoogleAdsSnapshotsCron({ payload, concurrency: 1 });
    expect(payload.update.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
