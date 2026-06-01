import type {
  StatementInvoiceSnapshot,
  StatementSnapshot,
} from "@/lib/invoice-statement-email";

/**
 * Shared snapshot refresh logic for invoice statement drafts.
 *
 * The CMS never talks to Xero directly — it reads outstanding-invoice data
 * (including each invoice's `onlineInvoiceUrl`, which powers the "View & pay"
 * link) from Growth Tools' `/api/xero/contacts/with-outstanding` endpoint,
 * which proxies the Xero API.
 *
 * Observed upstream behaviour: that endpoint is flaky for `onlineInvoiceUrl`.
 * Xero only returns `OnlineInvoiceUrl` on a single-invoice GET (not the bulk
 * list call), so Growth Tools fetches each invoice's URL individually. Under
 * Xero rate limits those per-invoice calls intermittently fail, so the SAME
 * invoice comes back with a URL on one request and `null` on the next — the
 * link appears/disappears/moves between invoices on every refresh, and the
 * endpoint occasionally 500s outright.
 *
 * To make the team-facing UI stable regardless of upstream flapping this
 * module:
 *   1. Retries the fetch with backoff and keeps the BEST response (the one
 *      with the most non-null URLs).
 *   2. Merges "sticky" URLs from the previous snapshot — a known-good
 *      `onlineInvoiceUrl` is never overwritten with `null`. Once we've seen a
 *      payment link for an invoice it stays put.
 *
 * It is the single source of truth shared by the manual refresh route and the
 * auto-refresh performed on preview/approve-send.
 *
 * NOTE: the real fix belongs upstream in Growth Tools (retry + cache the
 * per-invoice URL so it never returns null for an invoice that has one). This
 * is the defensive CMS-side mitigation.
 */

/** Total attempts for the outstanding fetch (1 initial + retries). */
const FETCH_ATTEMPTS = 3;
/**
 * Base backoff in ms between attempts (scales linearly per retry). Overridable
 * via `STATEMENT_REFRESH_BACKOFF_MS` so tests can disable the delay.
 */
function backoffMs(): number {
  const raw = process.env.STATEMENT_REFRESH_BACKOFF_MS;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : 400;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}



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
 *
 * @param xeroContactId  Xero contact to refresh.
 * @param previousSnapshot  The draft's currently-stored snapshot, if any. Used
 *   to preserve ("stick") known-good `onlineInvoiceUrl` values so the flaky
 *   upstream endpoint can't blank out a link we've already seen.
 */
export async function refreshStatementSnapshot(
  xeroContactId: string,
  previousSnapshot?: StatementSnapshot | null,
): Promise<RefreshSnapshotResult> {
  const growthUrl = process.env.GROWTH_TOOLS_URL;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!growthUrl || !internalKey) {
    return { ok: false, error: "Growth Tools not configured", status: 500 };
  }

  const url = new URL(`${growthUrl}/api/xero/contacts/with-outstanding`);
  url.searchParams.set("minCount", "1");
  url.searchParams.set("paidSinceDays", "90");

  // Build a lookup of previously-known payment links, keyed by invoiceId, so
  // we can re-apply them when this fetch returns null for the same invoice.
  const knownUrls = new Map<string, string>();
  for (const inv of previousSnapshot?.unpaid ?? []) {
    if (inv.onlineInvoiceUrl) knownUrls.set(inv.invoiceId, inv.onlineInvoiceUrl);
  }

  // The endpoint flaps: the same invoice's URL is present on one call and null
  // on the next, the contact can transiently drop out of the response, and it
  // sometimes 500s. No single call reliably returns every URL, so instead of
  // picking one "best" response we UNION the URLs seen across all attempts
  // into `knownUrls` (seeded above with previously-known links). The shape of
  // the statement (which invoices, amounts) comes from the latest response
  // that actually contained the contact.
  //
  // A response that omits the contact is NOT treated as terminal "all paid":
  // under flapping that can be a transient miss, and acting on it would wrongly
  // zero out the whole statement. We only conclude all-paid if EVERY successful
  // attempt omitted the contact (`sawContact` stays false).
  let latest: GrowthToolsRow | null = null;
  let sawSuccess = false;
  let sawContact = false;
  let lastError = "";
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(backoffMs() * attempt);
    try {
      const res = await fetch(url.toString(), {
        headers: { "x-internal-key": internalKey },
      });
      if (!res.ok) {
        lastError = `Growth Tools fetch failed (${res.status})`;
        continue;
      }
      const rows = (await res.json()) as GrowthToolsRow[];
      sawSuccess = true;
      const row = rows.find((r) => r.contactId === xeroContactId);
      if (!row) continue;
      sawContact = true;
      latest = row;
      // Accumulate every URL this attempt exposed.
      for (const inv of row.unpaid) {
        if (inv.onlineInvoiceUrl) knownUrls.set(inv.invoiceId, inv.onlineInvoiceUrl);
      }
      // Every unpaid invoice now has a known URL — can't do better, stop early.
      if (row.unpaid.every((inv) => knownUrls.has(inv.invoiceId))) break;
    } catch (err) {
      lastError = `Growth Tools request failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  // No successful response at all → upstream is down; surface the error so
  // callers keep the stored snapshot rather than zeroing it.
  if (!sawSuccess) {
    return {
      ok: false,
      error: lastError || "Growth Tools request failed",
      status: 502,
    };
  }

  const now = new Date().toISOString();
  const fresh = latest;

  if (!sawContact || !fresh) {
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
      // Sticky URL: prefer the freshly-fetched link, but never downgrade a
      // previously-known link to null when upstream flaps.
      onlineInvoiceUrl:
        inv.onlineInvoiceUrl ?? knownUrls.get(inv.invoiceId) ?? null,
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
