import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

// Xero invoice IDs are GUIDs (8-4-4-4-12 hex). We accept any 36-char
// hex/hyphen string to stay robust against minor formatting variations
// upstream while still rejecting path-traversal payloads, query-string
// hoists, and other URL-meaningful characters.
const GUID_REGEX = /^[0-9a-fA-F-]{36}$/;

// Per-action whitelist of body fields that should be forwarded to Growth
// Tools. Anything not listed is dropped — protects downstream endpoints
// from unexpected fields and limits the attack surface.
const ALLOWED_PARAMS: Record<string, readonly string[]> = {
  approve: [],
  send: [],
  delete: [],
  "schedule-send": ["sendDate"],
  update: [
    "contactId",
    "dueDate",
    "lineItems",
    "reference",
    "status",
    "invoiceNumber",
  ],
  "create-drafts": ["mailchimpAmount"],
};

function pickAllowed(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in source) out[k] = source[k];
  }
  return out;
}

/**
 * POST /api/xero/actions
 *
 * Proxies invoice actions to Growth Tools. Avoids needing one CMS route per action.
 *
 * Auth: requires a logged-in CMS session with the `nav:invoices` feature.
 *
 * Body: { action: string, invoiceId?: string, ...params }
 *
 * Supported actions:
 *   - approve       → POST /api/xero/invoices/:id/approve
 *   - send          → POST /api/xero/invoices/:id/send
 *   - delete        → DELETE /api/xero/invoices/:id
 *   - schedule-send → POST /api/xero/invoices/:id/schedule-send  { sendDate }
 *   - update        → PUT /api/xero/invoices/:id                 { ...fields }
 *   - create-drafts → POST /api/xero/recurring/create-drafts     { mailchimpAmount? }
 */
export async function POST(req: NextRequest) {
  // ── Auth gate ──
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!userHasFeature(user, "nav:invoices")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // ── Validate invoiceId shape BEFORE the switch — every action that takes
  // an ID must see a well-formed GUID. Path-traversal payloads like
  // "../../admin/foo" or query-string hoists like "x?leak=" are rejected here.
  if (invoiceId !== undefined) {
    if (typeof invoiceId !== "string" || !GUID_REGEX.test(invoiceId)) {
      return NextResponse.json(
        { error: "Invalid invoiceId format" },
        { status: 400 },
      );
    }
  }

  let endpoint: string;
  let method = "POST";

  switch (action) {
    case "approve":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${encodeURIComponent(invoiceId)}/approve`;
      break;
    case "send":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${encodeURIComponent(invoiceId)}/send`;
      break;
    case "delete":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${encodeURIComponent(invoiceId)}`;
      method = "DELETE";
      break;
    case "schedule-send":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${encodeURIComponent(invoiceId)}/schedule-send`;
      break;
    case "update":
      if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      endpoint = `/api/xero/invoices/${encodeURIComponent(invoiceId)}`;
      method = "PUT";
      break;
    case "create-drafts":
      endpoint = `/api/xero/recurring/create-drafts`;
      break;
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // Whitelist forwarded body fields per action.
  const allowedKeys = ALLOWED_PARAMS[action] ?? [];
  const forwardedParams = pickAllowed(params, allowedKeys);

  try {
    const res = await fetch(`${url}${endpoint}`, {
      method,
      headers: {
        "x-internal-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(forwardedParams),
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
