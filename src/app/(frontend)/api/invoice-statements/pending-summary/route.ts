import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";

interface DraftRow {
  totalOutstanding?: number | null;
  status?: string;
}

/**
 * GET /api/invoice-statements/pending-summary
 *
 * Lightweight summary for the dashboard widget + queue page header.
 *  - `pendingCount` \u2014 rows in pending status.
 *  - `totalOutstanding` \u2014 sum of pending totalOutstanding.
 *  - `sentThisMonth` \u2014 approved + failed rows in current calendar month.
 *  - `monthlyCap` \u2014 `STATEMENT_MAX_PER_MONTH` (default 1000).
 */
export async function GET(): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const reqHeaders = await getHeaders();
  const { user } = await payload.auth({ headers: reqHeaders });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [pending, sent] = await Promise.all([
    payload.find({
      collection: "invoice-statement-drafts" as never,
      where: { status: { equals: "pending" } } as never,
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: "invoice-statement-drafts" as never,
      where: {
        and: [
          { status: { in: ["approved", "failed"] } },
          { sentAt: { greater_than_equal: monthStart.toISOString() } },
        ],
      } as never,
      limit: 0,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  const totalOutstanding = (pending.docs as DraftRow[]).reduce(
    (sum, doc) => sum + (Number(doc.totalOutstanding) || 0),
    0,
  );

  return NextResponse.json({
    pendingCount: pending.totalDocs ?? pending.docs.length,
    totalOutstanding,
    sentThisMonth: sent.totalDocs ?? 0,
    monthlyCap: Number(process.env.STATEMENT_MAX_PER_MONTH ?? "1000"),
  });
}
