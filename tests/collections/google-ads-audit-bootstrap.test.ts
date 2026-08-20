import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Saving a client's first Google Ads customer ID must not depend on Google Ads.
 *
 * Production evidence for client 13: the audit row committed carrying the typed
 * ID (4894896666) and failed with "metadata lookup failed (502) / GAQL 403 the
 * caller does not have permission", while clients.google_ads_customer_id stayed
 * NULL. The save was awaiting that Google Ads round-trip. Two properties keep
 * the save independent of it:
 *   1. no bootstrap DB call joins the caller's transaction. Payload's
 *      killTransaction rolls back and deletes `req.transactionID` as soon as a
 *      sub-operation throws, so a failing audit joined to the save would
 *      silently discard that save while still reporting success, and
 *   2. the snapshot's API call is scheduled, never awaited, and never throws.
 */

const createSnapshotForAudit = vi.fn();
vi.mock("@/lib/google-ads-audit-snapshots", () => ({
  createSnapshotForAudit: (...args: unknown[]) => createSnapshotForAudit(...args),
}));

import {
  ensureGoogleAdsAudit,
  startInitialGoogleAdsSnapshot,
} from "@/lib/google-ads-audit-bootstrap";

const GOOGLE_ADS_403 = new Error(
  "Google Ads metadata lookup failed (502): Google Ads GAQL error (403): The caller does not have permission",
);

const client = { id: 13, name: "Away Digital", googleAdsCustomerId: "4894896666" };

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    find: vi.fn(async () => ({ docs: [] })),
    create: vi.fn(async () => ({ id: 9 })),
    update: vi.fn(async () => ({ id: 9 })),
    logger: { error: vi.fn(), warn: vi.fn() },
    ...overrides,
  } as never;
}

const calls = (payload: never, method: "find" | "create" | "update") =>
  (payload as unknown as Record<string, ReturnType<typeof vi.fn>>)[method];

describe("ensureGoogleAdsAudit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never joins the caller's transaction, so a failed audit cannot roll back the save", async () => {
    const payload = makePayload();

    await ensureGoogleAdsAudit(payload, client);

    expect(calls(payload, "find")).toHaveBeenCalledWith(
      expect.not.objectContaining({ req: expect.anything() }),
    );
    expect(calls(payload, "create")).toHaveBeenCalledWith(
      expect.not.objectContaining({ req: expect.anything() }),
    );
    expect(calls(payload, "create")).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: "4894896666" }) }),
    );
  });

  it("reuses an existing audit for the same customer id instead of duplicating", async () => {
    const payload = makePayload({ find: vi.fn(async () => ({ docs: [{ id: 42 }] })) });

    const audit = await ensureGoogleAdsAudit(payload, client);

    expect(audit?.id).toBe(42);
    expect(calls(payload, "create")).not.toHaveBeenCalled();
  });

  it("does nothing without a customer id", async () => {
    const payload = makePayload();

    expect(await ensureGoogleAdsAudit(payload, { id: 13, googleAdsCustomerId: "" })).toBeNull();
    expect(calls(payload, "find")).not.toHaveBeenCalled();
  });
});

describe("startInitialGoogleAdsSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSnapshotForAudit.mockResolvedValue({ id: 1 });
  });

  it("never rejects when Google Ads rejects the account", async () => {
    createSnapshotForAudit.mockRejectedValue(GOOGLE_ADS_403);
    const payload = makePayload();

    await expect(startInitialGoogleAdsSnapshot(payload, 9, 13)).resolves.toBeUndefined();
  });

  it("marks the audit failed so the failure stays visible", async () => {
    createSnapshotForAudit.mockRejectedValue(GOOGLE_ADS_403);
    const payload = makePayload();

    await startInitialGoogleAdsSnapshot(payload, 9, 13);

    expect(calls(payload, "update")).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "google-ads-audits",
        id: 9,
        data: expect.objectContaining({ auditStatus: "failed", snapshotState: "failed" }),
      }),
    );
  });

  it("does not run the snapshot on the caller's transaction", async () => {
    createSnapshotForAudit.mockRejectedValue(GOOGLE_ADS_403);
    const payload = makePayload();

    await startInitialGoogleAdsSnapshot(payload, 9, 13);

    // The failure bookkeeping must not join a transaction that has already
    // committed — it runs after the save, on its own connection.
    expect(calls(payload, "update")).toHaveBeenCalledWith(
      expect.not.objectContaining({ req: expect.anything() }),
    );
  });
});

describe("Clients afterChange hook", () => {
  it("schedules the Google Ads API call instead of awaiting it in the save", async () => {
    const { Clients } = await import("@/collections/Clients");
    const hook = (Clients.hooks?.afterChange ?? []).find((h: unknown) =>
      /startInitialGoogleAdsSnapshot/.test(String(h)),
    );
    expect(hook).toBeDefined();

    const source = String(hook);
    expect(source).toMatch(/setTimeout/);
    expect(source).not.toMatch(/await\s+startInitialGoogleAdsSnapshot/);
    // The audit row is awaited, but without `req` — isolated from the save.
    // (Vitest's SSR transform rewrites the imported name, so match loosely.)
    expect(source).toMatch(/await[\s\S]{0,80}ensureGoogleAdsAudit\)?\(payload, doc\)/);
  });

  it("keeps every swallowed afterChange sub-operation off the request transaction", async () => {
    const { Clients } = await import("@/collections/Clients");
    // A payload call that passes `req` inside a hook that swallows its error is
    // the silent-data-loss pattern: killTransaction rolls the save back, the
    // catch hides it, and the outer commit no-ops on the dead transaction.
    for (const hook of Clients.hooks?.afterChange ?? []) {
      const source = String(hook);
      if (!/catch\s*\(/.test(source)) continue;
      expect(source).not.toMatch(/overrideAccess:\s*(?:!0|true),\s*req\b/);
    }
  });
});
