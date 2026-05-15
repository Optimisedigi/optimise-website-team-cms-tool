import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/invoice-statements/:id/reject
 *
 * Body: `{ reason?: string }`
 *
 * Marks the draft `rejected` with optional reason + reviewer. No email sent.
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
  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }

  let draft: { id: number | string; status: string; contactName: string };
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

  if (draft.status !== "pending" && draft.status !== "failed") {
    return NextResponse.json(
      { error: `Draft is ${draft.status}; cannot reject.` },
      { status: 409 },
    );
  }

  await payload.update({
    collection: "invoice-statement-drafts" as never,
    id,
    overrideAccess: true,
    data: {
      status: "rejected",
      reviewedBy: user.id,
      reviewedAt: new Date().toISOString(),
      rejectionReason:
        typeof body.reason === "string" ? body.reason.slice(0, 2000) : null,
    } as never,
  });

  logActivity(payload, {
    type: "invoice_statement_rejected",
    title: `Statement rejected`,
    description: `${draft.contactName}: ${body.reason?.slice(0, 200) ?? "(no reason given)"}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
