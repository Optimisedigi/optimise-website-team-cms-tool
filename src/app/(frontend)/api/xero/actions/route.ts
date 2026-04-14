import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/xero/actions
 *
 * Proxies invoice actions to Growth Tools. Avoids needing one CMS route per action.
 *
 * Body: { action: string, invoiceId?: string, ...params }
 *
 * Supported actions:
 *   - approve       → POST /api/xero/invoices/:id/approve
 *   - send          → POST /api/xero/invoices/:id/send
 *   - delete        → DELETE /api/xero/invoices/:id
 *   - schedule-send → POST /api/xero/invoices/:id/schedule-send  { sendDate }
 *   - create-drafts → POST /api/xero/recurring/create-drafts     { mailchimpAmount? }
 */
export async function POST(req: NextRequest) {
  const url = process.env.GROWTH_TOOLS_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "Not configured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, invoiceId, ...params } = body;

  if (!action || typeof action !== "string")
    return NextResponse.json({ error: "action is required" }, { status: 400 });

  let endpoint: string;
  let method = "POST";

  switch (action) {
    case "approve":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${invoiceId}/approve`;
      break;
    case "send":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${invoiceId}/send`;
      break;
    case "delete":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${invoiceId}`;
      method = "DELETE";
      break;
    case "schedule-send":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${invoiceId}/schedule-send`;
      break;
    case "update":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${invoiceId}`;
      method = "PUT";
      break;
    case "create-drafts":
      endpoint = `/api/xero/recurring/create-drafts`;
      break;
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  try {
    const res = await fetch(`${url}${endpoint}`, {
      method,
      headers: {
        "x-internal-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || `Action failed (${res.status})` },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error(`[xero/actions] ${action} error:`, err);
    return NextResponse.json(
      { error: "Failed to execute action" },
      { status: 500 }
    );
  }
}
