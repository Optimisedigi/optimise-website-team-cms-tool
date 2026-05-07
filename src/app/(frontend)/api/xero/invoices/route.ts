import { NextResponse } from "next/server";

interface XeroInvoiceLite {
  invoiceNumber: string;
  date: string;
  [key: string]: unknown;
}

export async function GET() {
  const url = process.env.GROWTH_TOOLS_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    const headers = { "x-internal-key": key };
    const [summaryRes, paidRes] = await Promise.all([
      fetch(`${url}/api/xero/invoices/summary`, {
        headers,
        next: { revalidate: 300 },
      }),
      fetch(`${url}/api/xero/invoices?status=PAID`, {
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
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            )
            .slice(0, 6)
        : [];
    }

    return NextResponse.json({ ...summary, recentPaidInvoices });
  } catch (err) {
    console.error("[xero/invoices]", err);
    return NextResponse.json(
      { error: "Failed to fetch invoice data" },
      { status: 500 }
    );
  }
}
