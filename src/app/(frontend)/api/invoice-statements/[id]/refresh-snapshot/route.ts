import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import type {
  StatementInvoiceSnapshot,
  StatementSnapshot,
} from "@/lib/invoice-statement-email";

interface RouteParams {
  params: Promise<{ id: string }>;
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

/**
 * POST /api/invoice-statements/:id/refresh-snapshot
 *
 * Re-fetches the contact's outstanding from Growth Tools, updates `snapshot`
 * + totals + `lastRefreshedAt`. Used by the freshness banner in the review
 * modal.
 */
export async function POST(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const reqHeaders = await getHeaders();
  const { user } = await payload.auth({ headers: reqHeaders });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const growthUrl = process.env.GROWTH_TOOLS_URL;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!growthUrl || !internalKey) {
    return NextResponse.json(
      { error: "Growth Tools not configured" },
      { status: 500 },
    );
  }

  const { id } = await params;

  let draft: {
    id: number | string;
    xeroContactId: string;
    status: string;
  };
  try {
    draft = (await payload.findByID({
      collection: "invoice-statement-drafts" as never,
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as typeof draft;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (draft.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending drafts can be refreshed" },
      { status: 409 },
    );
  }

  // Fetch the contact-specific list (minCount=1 because we already know they
  // had outstanding; if they've since paid everything, the row will return as
  // empty and we'll surface that to the user).
  const url = new URL(`${growthUrl}/api/xero/contacts/with-outstanding`);
  url.searchParams.set("minCount", "1");
  url.searchParams.set("paidSinceDays", "90");

  let rows: GrowthToolsRow[];
  try {
    const res = await fetch(url.toString(), {
      headers: { "x-internal-key": internalKey },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Growth Tools fetch failed (${res.status})` },
        { status: 502 },
      );
    }
    rows = (await res.json()) as GrowthToolsRow[];
  } catch (err) {
    return NextResponse.json(
      {
        error: "Growth Tools request failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const fresh = rows.find((r) => r.contactId === draft.xeroContactId);

  if (!fresh) {
    // Client has cleared everything since the sweep.
    const empty: StatementSnapshot = {
      contact: {
        contactId: draft.xeroContactId,
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
      capturedAt: new Date().toISOString(),
    };
    await payload.update({
      collection: "invoice-statement-drafts" as never,
      id,
      overrideAccess: true,
      data: {
        snapshot: empty,
        totalOutstanding: 0,
        totalOverdue: 0,
        unpaidCount: 0,
        overdueCount: 0,
        lastRefreshedAt: new Date().toISOString(),
      } as never,
    });
    return NextResponse.json({ allPaid: true });
  }

  const now = new Date().toISOString();
  const snapshot: StatementSnapshot = {
    contact: {
      contactId: fresh.contactId,
      contactName: fresh.contactName,
      firstName: fresh.firstName,
      lastName: fresh.lastName,
      emailAddress: fresh.emailAddress,
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

  await payload.update({
    collection: "invoice-statement-drafts" as never,
    id,
    overrideAccess: true,
    data: {
      snapshot,
      contactName: fresh.contactName,
      recipientEmail: fresh.emailAddress,
      totalOutstanding: fresh.totalOutstanding,
      totalOverdue: fresh.totalOverdue,
      unpaidCount: fresh.unpaidCount,
      overdueCount: fresh.overdueCount,
      lastRefreshedAt: now,
    } as never,
  });

  return NextResponse.json({ snapshot, refreshedAt: now });
}
