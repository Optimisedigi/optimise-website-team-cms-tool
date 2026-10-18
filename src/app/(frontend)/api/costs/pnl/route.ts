import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";
import { buildMonthlyPnl, buildMonthlyPnlFromXero, lastMonthKeys, type PnlClient } from "@/lib/finance/monthly-pnl";
import { fetchXeroMonthlyFinance } from "@/lib/finance/xero-finance";

const ALLOWED_MONTHS = [6, 12, 24] as const;

/**
 * Month-by-month Sales vs Costs with totals.
 * Xero (via Growth Tools) is the source of truth; when it isn't available the
 * response falls back to client records + imported bank statements and says why.
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Agreed sales come from client billing fields: require both finance features.
    if (!userHasFeature(user, "business-costs") || !userHasFeature(user, "clients")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requested = Number(new URL(request.url).searchParams.get("months"));
    const monthCount = ALLOWED_MONTHS.find((m) => m === requested) ?? 12;

    const xero = await fetchXeroMonthlyFinance(monthCount, { signal: request.signal });
    if (xero.ok) {
      const result = buildMonthlyPnlFromXero({
        monthKeys: xero.data.months.map((m) => m.month),
        xeroMonths: xero.data.months,
      });
      return NextResponse.json({ ...result, monthCount, source: "xero", fetchedAt: xero.data.fetchedAt });
    }

    const now = new Date();
    const monthKeys = lastMonthKeys(now, monthCount);

    const [clientsResult, costsResult, receiptsResult] = await Promise.all([
      payload.find({
        collection: "clients",
        where: {
          or: [
            { isAgency: { not_equals: true } },
            { isAgency: { exists: false } },
          ],
        },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: {
          isActive: true,
          clientType: true,
          monthlyRetainer: true,
          setupFee: true,
          revenueSharePercent: true,
          oneOffProjects: true,
          referralCommissions: true,
          clientStartDate: true,
          retainerStartDate: true,
          retainerHistory: true,
        },
      }),
      payload.find({
        collection: "business-costs",
        where: { month: { in: monthKeys } },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { month: true, amount: true },
      }),
      payload.find({
        collection: "bank-receipts",
        where: { month: { in: monthKeys } },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { month: true, amount: true },
      }),
    ]);

    const sumByMonth = (docs: Array<{ month?: string | null; amount?: number | null }>) => {
      const map = new Map<string, number>();
      for (const doc of docs) {
        if (!doc.month) continue;
        map.set(doc.month, (map.get(doc.month) ?? 0) + (Number(doc.amount) || 0));
      }
      return map;
    };

    const result = buildMonthlyPnl({
      monthKeys,
      clients: clientsResult.docs as PnlClient[],
      costsByMonth: sumByMonth(costsResult.docs),
      receivedByMonth: sumByMonth(receiptsResult.docs),
      now,
    });

    return NextResponse.json({ ...result, monthCount, source: "bank", xeroUnavailable: xero.reason });
  } catch (err) {
    console.error("[costs/pnl] error:", err);
    return NextResponse.json({ error: "Failed to load sales vs costs" }, { status: 500 });
  }
}
