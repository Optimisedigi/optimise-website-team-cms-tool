import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshStatementSnapshot } from "@/lib/invoice-statement-snapshot";
import type { StatementSnapshot } from "@/lib/invoice-statement-email";

const globalFetch = vi.fn();
vi.stubGlobal("fetch", globalFetch);

const CONTACT_ID = "xero-1";

function row(urls: Array<string | null>): unknown {
  return {
    contactId: CONTACT_ID,
    contactName: "Acme Pty Ltd",
    firstName: "Alex",
    lastName: "Acme",
    emailAddress: "alex@acme.example",
    unpaid: urls.map((url, i) => ({
      invoiceId: `inv-${i + 1}`,
      invoiceNumber: `INV-00${i + 1}`,
      reference: "Retainer",
      date: "2026-03-01",
      dueDate: "2026-03-15",
      total: 1000,
      amountDue: 1000,
      status: "AUTHORISED",
      onlineInvoiceUrl: url,
    })),
    paid: [],
    totalOutstanding: urls.length * 1000,
    totalOverdue: urls.length * 1000,
    unpaidCount: urls.length,
    overdueCount: urls.length,
  };
}

function okJson(payload: unknown): Response {
  return { ok: true, json: () => Promise.resolve(payload) } as Response;
}

function urlFlags(snapshot: StatementSnapshot): string {
  return snapshot.unpaid
    .map((inv) => `${inv.invoiceNumber}=${inv.onlineInvoiceUrl ? "Y" : "N"}`)
    .join(" ");
}

beforeEach(() => {
  // mockReset (not clearAllMocks) so a persistent mockResolvedValue from one
  // test does not leak its implementation into the next.
  globalFetch.mockReset();
  process.env.GROWTH_TOOLS_URL = "https://growth.test";
  process.env.INTERNAL_API_KEY = "internal";
  process.env.STATEMENT_REFRESH_BACKOFF_MS = "0";
});

describe("refreshStatementSnapshot — upstream flapping mitigation", () => {
  it("unions payment links across all attempts so no single flaky call loses a link", async () => {
    // No single call has every URL: call 1 has inv-2, call 2 has inv-1 + inv-3.
    // The union across attempts must yield all three.
    globalFetch
      .mockResolvedValueOnce(okJson([row([null, "https://x/2", null])]))
      .mockResolvedValueOnce(okJson([row(["https://x/1", null, "https://x/3"])]))
      .mockResolvedValueOnce(okJson([row(["https://x/1", null, null])]));

    const result = await refreshStatementSnapshot(CONTACT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(urlFlags(result.value.snapshot)).toBe("INV-001=Y INV-002=Y INV-003=Y");
  });

  it("stops early when a response already has every link populated", async () => {
    globalFetch.mockResolvedValueOnce(
      okJson([row(["https://x/1", "https://x/2"])]),
    );

    const result = await refreshStatementSnapshot(CONTACT_ID);

    expect(result.ok).toBe(true);
    // Only one fetch — no retries needed.
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves a previously-known URL when this fetch returns null (sticky)", async () => {
    const previous: StatementSnapshot = {
      contact: {
        contactId: CONTACT_ID,
        contactName: "Acme Pty Ltd",
        firstName: "Alex",
        lastName: "Acme",
        emailAddress: "alex@acme.example",
      },
      unpaid: [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          reference: "Retainer",
          date: "2026-03-01",
          dueDate: "2026-03-15",
          total: 1000,
          amountDue: 1000,
          status: "AUTHORISED",
          onlineInvoiceUrl: "https://x/sticky-1",
        },
        {
          invoiceId: "inv-2",
          invoiceNumber: "INV-002",
          reference: "Retainer",
          date: "2026-03-01",
          dueDate: "2026-03-15",
          total: 1000,
          amountDue: 1000,
          status: "AUTHORISED",
          onlineInvoiceUrl: "https://x/sticky-2",
        },
      ],
      paid: [],
      totalOutstanding: 2000,
      totalOverdue: 2000,
      unpaidCount: 2,
      overdueCount: 2,
      capturedAt: "2026-05-01T00:00:00.000Z",
    };

    // Upstream flaps: inv-1 keeps its URL, inv-2 comes back null this time.
    globalFetch.mockResolvedValue(okJson([row(["https://x/fresh-1", null])]));

    const result = await refreshStatementSnapshot(CONTACT_ID, previous);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(
      result.value.snapshot.unpaid.map((i) => [i.invoiceId, i.onlineInvoiceUrl]),
    );
    // Fresh link used where present; previous link stuck where upstream nulled.
    expect(byId["inv-1"]).toBe("https://x/fresh-1");
    expect(byId["inv-2"]).toBe("https://x/sticky-2");
  });

  it("returns a 502 result when every attempt fails", async () => {
    globalFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

    const result = await refreshStatementSnapshot(CONTACT_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
    expect(globalFetch).toHaveBeenCalledTimes(3);
  });

  it("reports allPaid only when every successful attempt omits the contact", async () => {
    globalFetch.mockResolvedValue(okJson([]));

    const result = await refreshStatementSnapshot(CONTACT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allPaid).toBe(true);
  });

  it("does NOT zero the statement when the contact only transiently drops out", async () => {
    // attempt 1: contact missing (flaky miss). attempt 2: contact present.
    // We must trust the response that has the contact, not the empty one.
    globalFetch
      .mockResolvedValueOnce(okJson([]))
      .mockResolvedValueOnce(okJson([row(["https://x/1", "https://x/2"])]));

    const result = await refreshStatementSnapshot(CONTACT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allPaid).toBe(false);
    expect(result.value.snapshot.unpaid).toHaveLength(2);
    expect(urlFlags(result.value.snapshot)).toBe("INV-001=Y INV-002=Y");
  });
});
