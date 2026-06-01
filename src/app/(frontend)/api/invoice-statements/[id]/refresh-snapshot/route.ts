import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import { refreshStatementSnapshot } from "@/lib/invoice-statement-snapshot";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/invoice-statements/:id/refresh-snapshot
 *
 * Re-fetches the contact's outstanding from Growth Tools, updates `snapshot`
 * + totals + `lastRefreshedAt`. Used by the freshness banner in the review
 * modal. Shares its rebuild logic with the auto-refresh performed on
 * preview/approve-send via {@link refreshStatementSnapshot}.
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

  const result = await refreshStatementSnapshot(draft.xeroContactId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const fresh = result.value;

  await payload.update({
    collection: "invoice-statement-drafts" as never,
    id,
    overrideAccess: true,
    data: {
      snapshot: fresh.snapshot,
      ...(fresh.allPaid
        ? {}
        : {
            contactName: fresh.contactName,
            recipientEmail: fresh.recipientEmail,
          }),
      totalOutstanding: fresh.totalOutstanding,
      totalOverdue: fresh.totalOverdue,
      unpaidCount: fresh.unpaidCount,
      overdueCount: fresh.overdueCount,
      lastRefreshedAt: fresh.refreshedAt,
    } as never,
  });

  if (fresh.allPaid) {
    return NextResponse.json({ allPaid: true });
  }
  return NextResponse.json({
    snapshot: fresh.snapshot,
    refreshedAt: fresh.refreshedAt,
  });
}
