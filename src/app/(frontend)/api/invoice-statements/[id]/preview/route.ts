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
 * Rebuilds `{ subject, html, text }` from current `snapshot` + `customMessage`
 * + global templates. Used by the modal iframe so the preview always matches
 * exactly what would be sent.
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

  const { templates, signatureHtml } = await loadStatementTemplates(payload);

  const result = buildStatementEmail({
    snapshot: draft.snapshot,
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
