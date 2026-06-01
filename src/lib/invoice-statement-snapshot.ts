import type {
  StatementInvoiceSnapshot,
  StatementSnapshot,
} from "@/lib/invoice-statement-email";

/**
 * Shared snapshot refresh logic for invoice statement drafts.
 *
 * The CMS never talks to Xero directly — it reads outstanding-invoice data
 * (including each invoice's `onlineInvoiceUrl`, which powers the "View & pay"
 * link) from Growth Tools' `/api/xero/contacts/with-outstanding` endpoint.
 *
 * Drafts persist a point-in-time `snapshot`. Xero only populates
 * `OnlineInvoiceUrl` once an invoice is approved/sent and its online-payment
 * portal link is live, so a freshly-issued invoice initially returns `null`.
 * That means a stored snapshot can show a `—` dash for the newest invoice
 * even though the link exists by the time the statement is previewed/sent.
 *
 * This module rebuilds a draft's snapshot from the live Growth Tools response
 * so preview + send always reflect the latest payment links. It is the single
 * source of truth shared by the manual refresh route and the auto-refresh
 * performed on preview/approve-send.
 */

interface GrowthToolsRow {
  contactId: string;
  contactName: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  unpaid: Array<StatementInvoiceSnapshot>;
  paid: Array<Omit<StatementInvoiceSnapshot, "onlineInvoiceUrl">>;
  totalOutstanding: number;
  totalOverdue: number;
  unpaidCount: number;
  overdueCount: number;
}

interface XeroContactRow {
  contactId: string;
  name: string;
  emailAddress: string;
}

export interface RefreshedSnapshot {
  snapshot: StatementSnapshot;
  contactName: string;
  recipientEmail: string;
  totalOutstanding: number;
  totalOverdue: number;
  unpaidCount: number;
  overdueCount: number;
  refreshedAt: string;
  /** True when the contact has cleared every outstanding invoice. */
  allPaid: boolean;
}

export type RefreshSnapshotResult =
  | { ok: true; value: RefreshedSnapshot }
  | { ok: false; error: string; status: number };

/**
 * Fallback email lookup for a Xero contactId.
 *
 * Growth Tools' `/api/xero/contacts/with-outstanding` endpoint sometimes
 * returns `emailAddress: ""` for contacts that do have an email set in Xero
 * (the join differs from the general `/api/xero/contacts` endpoint). When the
 * primary endpoint reports an empty email we fetch the contact directly to
 * recover the canonical value. Returns "" if anything fails.
 */
async function fetchXeroContactEmail(
  growthUrl: string,
  internalKey: string,
  contactId: string,
): Promise<string> {
  try {
    const res = await fetch(`${growthUrl}/api/xero/contacts`, {
      headers: { "x-internal-key": internalKey },
    });
    if (!res.ok) return "";
    const rows = (await res.json()) as XeroContactRow[];
    const match = rows.find((r) => r.contactId === contactId);
    return match?.emailAddress ?? "";
  } catch {
    return "";
  }
}

/**
 * Re-fetch a contact's outstanding invoices from Growth Tools and build a
 * fresh {@link StatementSnapshot}. Does not persist — callers decide whether
 * to write the result. Returns a discriminated-union result so callers can
 * degrade gracefully (e.g. preview/send fall back to the stored snapshot
 * rather than blocking the team on a transient Growth Tools failure).
 */
export async function refreshStatementSnapshot(
  xeroContactId: string,
): Promise<RefreshSnapshotResult> {
  const growthUrl = process.env.GROWTH_TOOLS_URL;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!growthUrl || !internalKey) {
    return { ok: false, error: "Growth Tools not configured", status: 500 };
  }

  const url = new URL(`${growthUrl}/api/xero/contacts/with-outstanding`);
  url.searchParams.set("minCount", "1");
  url.searchParams.set("paidSinceDays", "90");

  let rows: GrowthToolsRow[];
  try {
    const res = await fetch(url.toString(), {
      headers: { "x-internal-key": internalKey },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Growth Tools fetch failed (${res.status})`,
        status: 502,
      };
    }
    rows = (await res.json()) as GrowthToolsRow[];
  } catch (err) {
    return {
      ok: false,
      error: `Growth Tools request failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      status: 502,
    };
  }

  const now = new Date().toISOString();
  const fresh = rows.find((r) => r.contactId === xeroContactId);

  if (!fresh) {
    // Client has cleared everything since the sweep.
    const empty: StatementSnapshot = {
      contact: {
        contactId: xeroContactId,
        contactName: "",
        firstName: "",
        lastName: "",
        emailAddress: "",
      },
      unpaid: [],
      paid: [],
      totalOutstanding: 0,
      totalOverdue: 0,
      unpaidCount: 0,
      overdueCount: 0,
      capturedAt: now,
    };
    return {
      ok: true,
      value: {
        snapshot: empty,
        contactName: "",
        recipientEmail: "",
        totalOutstanding: 0,
        totalOverdue: 0,
        unpaidCount: 0,
        overdueCount: 0,
        refreshedAt: now,
        allPaid: true,
      },
    };
  }

  let resolvedEmail = fresh.emailAddress;
  if (!resolvedEmail) {
    resolvedEmail = await fetchXeroContactEmail(
      growthUrl,
      internalKey,
      fresh.contactId,
    );
  }

  const snapshot: StatementSnapshot = {
    contact: {
      contactId: fresh.contactId,
      contactName: fresh.contactName,
      firstName: fresh.firstName,
      lastName: fresh.lastName,
      emailAddress: resolvedEmail,
    },
    unpaid: fresh.unpaid.map((inv) => ({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      reference: inv.reference,
      date: inv.date,
      dueDate: inv.dueDate,
      total: inv.total,
      amountDue: inv.amountDue,
      status: inv.status,
      onlineInvoiceUrl: inv.onlineInvoiceUrl,
    })),
    paid: fresh.paid.map((inv) => ({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      reference: inv.reference,
      date: inv.date,
      dueDate: inv.dueDate,
      total: inv.total,
      amountDue: inv.amountDue,
      status: inv.status,
      onlineInvoiceUrl: null,
    })),
    totalOutstanding: fresh.totalOutstanding,
    totalOverdue: fresh.totalOverdue,
    unpaidCount: fresh.unpaidCount,
    overdueCount: fresh.overdueCount,
    capturedAt: now,
  };

  return {
    ok: true,
    value: {
      snapshot,
      contactName: fresh.contactName,
      recipientEmail: resolvedEmail,
      totalOutstanding: fresh.totalOutstanding,
      totalOverdue: fresh.totalOverdue,
      unpaidCount: fresh.unpaidCount,
      overdueCount: fresh.overdueCount,
      refreshedAt: now,
      allPaid: false,
    },
  };
}
