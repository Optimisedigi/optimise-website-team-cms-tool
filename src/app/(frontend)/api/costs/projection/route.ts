import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";
import { fetchXeroMonthlyFinance } from "@/lib/finance/xero-finance";
import { addMonths, isMonthKey, monthKeyOf, monthKeysBetween, periodContaining } from "@/lib/finance/periods";
import {
  buildYearProjection,
  type ProjectionAdjustment,
  type ProjectionClient,
  type RetainerOverride,
} from "@/lib/finance/year-projection";

const MAX_RANGE_MONTHS = 24;
/** Complete months behind the cost run rate. */
const AVERAGE_MONTHS = 6;

type PayloadClient = Awaited<ReturnType<typeof getPayload>>;

/**
 * Manual estimated invoices/costs for the period. A missing table (migration
 * not run yet) shouldn't take the whole estimate down, so it reads as none.
 */
async function loadAdjustments(
  payload: PayloadClient,
  monthKeys: string[],
): Promise<{ adjustments: ProjectionAdjustment[]; retainerOverrides: RetainerOverride[] }> {
  try {
    const result = await payload.find({
      collection: "estimate-adjustments",
      where: {
        or: [
          { and: [{ month: { in: monthKeys } }, { kind: { in: ["invoiced", "cost"] } }] },
          { kind: { equals: "retainer" } },
        ],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      sort: "createdAt",
    });
    const adjustments: ProjectionAdjustment[] = [];
    const retainerOverrides: RetainerOverride[] = [];
    for (const d of result.docs) {
      if (d.kind === "retainer") {
        if (d.clientId != null) retainerOverrides.push({ id: d.id, clientId: d.clientId, amount: Number(d.amount) || 0 });
        continue;
      }
      adjustments.push({
        id: d.id,
        month: d.month,
        kind: d.kind === "cost" ? "cost" : "invoiced",
        amount: Number(d.amount) || 0,
        description: d.description,
        account: d.account ?? null,
      });
    }
    return { adjustments, retainerOverrides };
  } catch (err) {
    console.warn("[costs/projection] could not load estimate adjustments:", err instanceof Error ? err.message : err);
    return { adjustments: [], retainerOverrides: [] };
  }
}

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

    const [xero, clientsResult, { adjustments, retainerOverrides }] = await Promise.all([
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
          setupFee: true,
        },
      }),
      loadAdjustments(payload, monthKeys),
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
      adjustments,
      retainerOverrides,
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
