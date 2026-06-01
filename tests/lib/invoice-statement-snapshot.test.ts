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
  it("makes a single Growth Tools call (server-side handles retry/cache)", async () => {
    // The CMS no longer multi-fetches: Growth Tools retries + caches the flaky
    // Xero OnlineInvoice calls, so stacking bulk calls here just multiplied
    // load and exhausted Xero's daily limit. One call is enough.
    globalFetch.mockResolvedValue(okJson([row(["https://x/1", "https://x/2"])]));

    const result = await refreshStatementSnapshot(CONTACT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(urlFlags(result.value.snapshot)).toBe("INV-001=Y INV-002=Y");
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

  it("returns a 502 result when the Growth Tools call fails", async () => {
    globalFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

    const result = await refreshStatementSnapshot(CONTACT_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it("reports allPaid only when every successful attempt omits the contact", async () => {
    globalFetch.mockResolvedValue(okJson([]));

    const result = await refreshStatementSnapshot(CONTACT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allPaid).toBe(true);
  });

  it("keeps the previous snapshot's links when this single call returns null (sticky)", async () => {
    // The core protection now that there's no intra-call union: a known-good
    // link from the stored snapshot is never blanked by a flaky null.
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
      ],
      paid: [],
      totalOutstanding: 1000,
      totalOverdue: 1000,
      unpaidCount: 1,
      overdueCount: 1,
      capturedAt: "2026-05-01T00:00:00.000Z",
    };
    globalFetch.mockResolvedValue(okJson([row([null])]));

    const result = await refreshStatementSnapshot(CONTACT_ID, previous);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot.unpaid[0]!.onlineInvoiceUrl).toBe(
      "https://x/sticky-1",
    );
  });

  it("asks Growth Tools to skip the Xero link lookup for invoices we already have", async () => {
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
          onlineInvoiceUrl: null, // missing — must still be resolved
        },
      ],
      paid: [],
      totalOutstanding: 2000,
      totalOverdue: 2000,
      unpaidCount: 2,
      overdueCount: 2,
      capturedAt: "2026-05-01T00:00:00.000Z",
    };
    globalFetch.mockResolvedValue(okJson([row([null, "https://x/fresh-2"])]));

    await refreshStatementSnapshot(CONTACT_ID, previous);

    const calledUrl = String(globalFetch.mock.calls[0]![0]);
    const skip = new URL(calledUrl).searchParams.get("skipUrlInvoiceIds");
    // inv-1 already has a link → skipped; inv-2 has none → not skipped.
    expect(skip).toBe("inv-1");
  });

  it("omits skipUrlInvoiceIds entirely when no links are known yet", async () => {
    globalFetch.mockResolvedValue(okJson([row([null, null])]));

    await refreshStatementSnapshot(CONTACT_ID);

    const calledUrl = String(globalFetch.mock.calls[0]![0]);
    expect(new URL(calledUrl).searchParams.has("skipUrlInvoiceIds")).toBe(false);
  });
});
