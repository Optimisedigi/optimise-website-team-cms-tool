import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";
import { fetchXeroMonthlyFinance } from "@/lib/finance/xero-finance";
import { addMonths, isMonthKey, monthKeyOf, monthKeysBetween, periodContaining } from "@/lib/finance/periods";
import { buildYearProjection, type ProjectionClient } from "@/lib/finance/year-projection";

const MAX_RANGE_MONTHS = 24;
/** Complete months behind the cost run rate. */
const AVERAGE_MONTHS = 6;

/**
 * Year-end estimate for a financial or calendar year: Xero so far, plus
 * expected retainers (with start dates and scheduled changes) and costs at
 * the recent monthly average for the rest of the period.
 *
 * ?from=YYYY-MM&to=YYYY-MM is the whole period, including future months.
 * Defaults to the current financial year. Needs Xero; when it's unavailable
 * the response says why instead of guessing from bank statements.
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Uses client retainers and business costs: require both finance features.
    if (!userHasFeature(user, "business-costs") || !userHasFeature(user, "clients")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const currentMonth = monthKeyOf(now);
    const params = new URL(request.url).searchParams;
    const rawFrom = params.get("from");
    const rawTo = params.get("to");
    let from: string;
    let to: string;
    if (rawFrom !== null || rawTo !== null) {
      if (!isMonthKey(rawFrom) || !isMonthKey(rawTo) || rawFrom > rawTo) {
        return NextResponse.json({ error: "from and to must be YYYY-MM with from <= to" }, { status: 400 });
      }
      from = rawFrom;
      to = rawTo;
    } else {
      from = `${periodContaining("fy", currentMonth).startYear}-07`;
      to = addMonths(from, 11);
    }
    const monthKeys = monthKeysBetween(from, to);
    if (monthKeys.length > MAX_RANGE_MONTHS) {
      return NextResponse.json({ error: `range is limited to ${MAX_RANGE_MONTHS} months` }, { status: 400 });
    }
    if (from > currentMonth) {
      return NextResponse.json({ error: "from is in the future" }, { status: 400 });
    }

    // A finished period is all actuals; a running one also needs the recent
    // complete months for the cost run rate.
    const running = to >= currentMonth;
    const averageMonths = running
      ? monthKeysBetween(addMonths(currentMonth, -AVERAGE_MONTHS), addMonths(currentMonth, -1))
      : [];
    const fetchFrom = running && averageMonths[0] && averageMonths[0] < from ? averageMonths[0] : from;
    const fetchTo = running ? currentMonth : to;

    const [xero, clientsResult] = await Promise.all([
      fetchXeroMonthlyFinance({ from: fetchFrom, to: fetchTo }, { signal: request.signal }),
      payload.find({
        collection: "clients",
        where: {
          and: [
            {
              or: [
                { isActive: { equals: true } },
                { retainerChangeAction: { equals: "end" } },
              ],
            },
            {
              or: [
                { isAgency: { not_equals: true } },
                { isAgency: { exists: false } },
              ],
            },
          ],
        },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: {
          name: true,
          isActive: true,
          clientType: true,
          monthlyRetainer: true,
          clientStartDate: true,
          retainerStartDate: true,
          retainerHistory: true,
          retainerChangeDate: true,
          retainerChangeAction: true,
          retainerChangeAmount: true,
        },
      }),
    ]);

    if (!xero.ok) {
      return NextResponse.json({ available: false, reason: xero.reason, from, to, currentMonth });
    }

    const projection = buildYearProjection({
      monthKeys,
      currentMonth,
      actual: xero.data.months,
      averageMonths,
      clients: clientsResult.docs as ProjectionClient[],
    });

    return NextResponse.json({
      available: true,
      ...projection,
      from,
      to,
      currentMonth,
      fetchedAt: xero.data.fetchedAt,
    });
  } catch (err) {
    console.error("[costs/projection] error:", err);
    return NextResponse.json({ error: "Failed to load the year-end estimate" }, { status: 500 });
  }
}
