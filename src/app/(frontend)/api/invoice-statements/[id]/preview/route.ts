import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import {
  buildStatementEmail,
  type StatementSnapshot,
} from "@/lib/invoice-statement-email";
import { loadStatementTemplates } from "@/lib/invoice-statement-templates";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/invoice-statements/:id/preview
 *
 * Rebuilds `{ subject, html, text }` from current stored `snapshot` +
 * `customMessage` + global templates. Used by the modal iframe so the preview
 * matches exactly what would be sent.
 *
 * Read-only and cheap: this fires on every debounced keystroke in the modal,
 * so it never hits Xero or writes to the DB. Live freshness (re-pull, URL
 * union + sticky merge, persistence) happens once on modal open via
 * /refresh-snapshot and again on approve-send.
 *
 * Body: `{ customMessage?: string }` \u2014 client may pass an unsaved override.
 */
export async function POST(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const reqHeaders = await getHeaders();
  const { user } = await payload.auth({ headers: reqHeaders });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let bodyJson: { customMessage?: string; greetingOverride?: string } = {};
  try {
    bodyJson = await req.json();
  } catch {
    /* preview body is optional */
  }

  let draft: {
    id: number | string;
    snapshot: StatementSnapshot;
    customMessage: string | null;
    greetingOverride: string | null;
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

  // Read-only: preview renders purely from the stored snapshot and fires on
  // every debounced keystroke, so it must NOT hit Xero or write to the DB.
  // Freshness (live Xero re-pull, URL union + sticky merge, persistence) is
  // handled once when the modal opens via the explicit /refresh-snapshot
  // route, and again on approve-send. See InvoiceStatementsPage modal.
  const snapshot = draft.snapshot;

  const { templates, signatureHtml } = await loadStatementTemplates(payload);

  const result = buildStatementEmail({
    snapshot,
    customMessage:
      typeof bodyJson.customMessage === "string"
        ? bodyJson.customMessage
        : draft.customMessage ?? "",
    greetingOverride:
      typeof bodyJson.greetingOverride === "string"
        ? bodyJson.greetingOverride
        : draft.greetingOverride ?? "",
    templates,
    signatureHtml,
    attachmentsAttached: true,
  });

  return NextResponse.json(result);
}
