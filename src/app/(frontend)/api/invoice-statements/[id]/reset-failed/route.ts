import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/invoice-statements/:id/reset-failed
 *
 * Takes a `failed` draft back to `pending` and clears the send error so the
 * team can start fresh (refresh + retry) instead of being stuck. Only `failed`
 * drafts can be reset — pending is already clean, and approved/rejected/expired
 * are terminal records that must not be revived.
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

  const { id } = await params;

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

  if (draft.status !== "failed") {
    return NextResponse.json(
      { error: `Draft is ${draft.status}; only failed drafts can be reset.` },
      { status: 409 },
    );
  }

  await payload.update({
    collection: "invoice-statement-drafts" as never,
    id,
    overrideAccess: true,
    data: {
      status: "pending",
      sendError: null,
    } as never,
  });

  logActivity(payload, {
    type: "invoice_statement_reset",
    title: `Statement reset to pending`,
    description: `${draft.contactName}: cleared failed state by ${user.email ?? user.id}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, status: "pending" });
}
