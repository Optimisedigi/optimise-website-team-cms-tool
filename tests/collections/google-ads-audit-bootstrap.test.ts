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
  deferPostCommit,
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

describe("deferPostCommit", () => {
  it("runs the work on a later macrotask, never synchronously with the save", async () => {
    const payload = makePayload();
    let ran = false;

    deferPostCommit(payload, "probe", async () => {
      ran = true;
    });

    expect(ran).toBe(false); // still inside the save's tick — must not have run
    await new Promise((r) => setTimeout(r, 5));
    expect(ran).toBe(true);
  });

  it("contains a rejecting effect instead of surfacing an unhandled rejection", async () => {
    const payload = makePayload();

    deferPostCommit(payload, "probe", async () => {
      throw new Error("boom");
    });
    await new Promise((r) => setTimeout(r, 5));

    expect(
      (payload as unknown as { logger: { warn: ReturnType<typeof vi.fn> } }).logger.warn,
    ).toHaveBeenCalledWith(expect.stringContaining("probe failed"));
  });
});

describe("Clients afterChange hook", () => {
  it("defers every gads-triggered DB effect — nothing runs inside the save", async () => {
    const { Clients } = await import("@/collections/Clients");
    const hook = (Clients.hooks?.afterChange ?? []).find((h: unknown) =>
      /ensureGoogleAdsAudit/.test(String(h)),
    );
    expect(hook).toBeDefined();

    const source = String(hook);
    // The whole bootstrap (audit row + snapshot) lives behind deferPostCommit;
    // any await BEFORE the deferral runs inside the save's transaction window
    // and re-opens the SQLITE_BUSY self-deadlock. Awaits inside the deferred
    // callback are fine — the save has committed by then.
    // (Vitest's SSR transform rewrites imported names, so match loosely.)
    expect(source).toMatch(/deferPostCommit\)?\(/);
    const beforeDeferral = source.slice(0, source.search(/deferPostCommit\)?\(/));
    expect(beforeDeferral).not.toMatch(/\bawait\b/);
  });

  it("keeps every afterChange hook from awaiting second-connection writes in the save", async () => {
    const { Clients } = await import("@/collections/Clients");
    // `await payload.delete/create/update` without `req` inside afterChange
    // opens a second connection while the save's single-writer transaction is
    // still live — the save's own COMMIT then fails with SQLITE_BUSY and
    // Payload swallows it ("Saved", but rolled back). Passing `req` instead is
    // the other trap: killTransaction + a catch silently discards the save.
    // Everything must go through deferPostCommit.
    for (const hook of Clients.hooks?.afterChange ?? []) {
      const source = String(hook);
      // Only the part that executes inside the save matters: everything before
      // the first deferPostCommit. Awaits inside deferred callbacks are safe.
      const deferralAt = source.search(/deferPostCommit\)?\(/);
      const insideSave = deferralAt === -1 ? source : source.slice(0, deferralAt);
      expect(insideSave).not.toMatch(/await\s+(?:req\.)?payload\.(?:delete|create|update)\)?\(/);
      expect(source).not.toMatch(/overrideAccess:\s*(?:!0|true),\s*req\b/);
    }
  });
});
