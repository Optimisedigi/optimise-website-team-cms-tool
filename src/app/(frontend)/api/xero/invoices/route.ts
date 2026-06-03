import { NextResponse } from "next/server";

interface XeroInvoiceLite {
  invoiceId?: string;
  invoiceNumber: string;
  date?: string;
  contact?: { name?: string };
  description?: string;
  reference?: string;
  lineItems?: Array<{ description?: string }>;
  amountDue?: number;
  total?: number;
  status?: string;
  [key: string]: unknown;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeDraftInvoice(invoice: XeroInvoiceLite): XeroInvoiceLite {
  const firstLineDescription = Array.isArray(invoice.lineItems)
    ? stringValue(invoice.lineItems[0]?.description)
    : undefined;

  return {
    ...invoice,
    invoiceId: stringValue(invoice.invoiceId) || stringValue(invoice.invoiceID),
    invoiceNumber: stringValue(invoice.invoiceNumber) || "Draft",
    contact: {
      name: stringValue(invoice.contact?.name) || stringValue(invoice.contactName) || "Unknown client",
    },
    description:
      stringValue(invoice.description) ||
      stringValue(invoice.reference) ||
      firstLineDescription ||
      "Draft invoice",
    amountDue: numberValue(invoice.amountDue) || numberValue(invoice.total),
    total: numberValue(invoice.total) || numberValue(invoice.amountDue),
    status: "DRAFT",
  };
}

export async function GET() {
  const url = process.env.GROWTH_TOOLS_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    const headers = { "x-internal-key": key };
    const [summaryRes, paidRes, draftRes] = await Promise.all([
      fetch(`${url}/api/xero/invoices/summary`, {
        headers,
        next: { revalidate: 300 },
      }),
      fetch(`${url}/api/xero/invoices?status=PAID`, {
        headers,
        next: { revalidate: 300 },
      }),
      fetch(`${url}/api/xero/invoices?status=DRAFT`, {
        headers,
        next: { revalidate: 300 },
      }),
    ]);

    if (!summaryRes.ok)
      return NextResponse.json(
        { error: "Failed to fetch from Growth Tools" },
        { status: summaryRes.status }
      );

    const summary = await summaryRes.json();

    // Most recent 6 paid invoices by issue date (newest first)
    let recentPaidInvoices: XeroInvoiceLite[] = [];
    if (paidRes.ok) {
      const paid = (await paidRes.json()) as XeroInvoiceLite[];
      recentPaidInvoices = Array.isArray(paid)
        ? [...paid]
            .sort(
              (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
            )
            .slice(0, 6)
        : [];
    }

    let draftInvoices: XeroInvoiceLite[] = [];
    if (draftRes.ok) {
      const drafts = (await draftRes.json()) as XeroInvoiceLite[];
      draftInvoices = Array.isArray(drafts) ? drafts.map(normalizeDraftInvoice) : [];
    }

    return NextResponse.json({ ...summary, recentPaidInvoices, draftInvoices });
  } catch (err) {
    console.error("[xero/invoices]", err);
    return NextResponse.json(
      { error: "Failed to fetch invoice data" },
      { status: 500 }
    );
  }
}
