import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

/**
 * Returns the data for the Contractor Costs admin page:
 *  - one row per active contractor with:
 *      - hourly rate, currency, default weekly hours
 *      - MTD / YTD totals (hours + cost) from approved/paid time entries
 *      - last paid fortnight (date, amount, reference)
 *      - estimated cost for the next scheduled fortnight
 */
function startOfMonthIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().split("T")[0];
}

function startOfYearIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().split("T")[0];
}

export async function GET() {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contractorsRes = await payload.find({
    collection: "contractors",
    where: { isActive: { not_equals: false } },
    limit: 100,
    depth: 0,
    sort: "name",
    overrideAccess: true,
  });

  const monthStart = startOfMonthIso();
  const yearStart = startOfYearIso();
  const todayIso = new Date().toISOString().split("T")[0];

  const rows = await Promise.all(
    (contractorsRes.docs as any[]).map(async (c) => {
      // YTD entries (status approved or paid)
      const ytd = await payload.find({
        collection: "contractor-time-entries",
        where: {
          and: [
            { contractor: { equals: c.id } },
            { status: { in: ["approved", "paid"] } },
            { weekCommencing: { greater_than_equal: yearStart } },
          ],
        },
        limit: 200,
        depth: 0,
        overrideAccess: true,
      });

      const ytdHours = (ytd.docs as any[]).reduce((s, e) => s + Number(e.hours || 0), 0);
      const ytdCost = (ytd.docs as any[]).reduce((s, e) => s + Number(e.totalFee || 0), 0);
      const mtdEntries = (ytd.docs as any[]).filter(
        (e) => String(e.weekCommencing).slice(0, 10) >= monthStart,
      );
      const mtdHours = mtdEntries.reduce((s, e) => s + Number(e.hours || 0), 0);
      const mtdCost = mtdEntries.reduce((s, e) => s + Number(e.totalFee || 0), 0);

      // Last sent payment
      const lastPaid = await payload.find({
        collection: "contractor-payments",
        where: {
          and: [
            { contractor: { equals: c.id } },
            { status: { equals: "sent" } },
          ],
        },
        sort: "-fortnightStartDate",
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      const lastPaidDoc = lastPaid.docs[0] as any;

      // Next scheduled (or upcoming) payment
      const nextScheduled = await payload.find({
        collection: "contractor-payments",
        where: {
          and: [
            { contractor: { equals: c.id } },
            { status: { equals: "scheduled" } },
            { fortnightStartDate: { greater_than_equal: todayIso } },
          ],
        },
        sort: "fortnightStartDate",
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      const nextDoc = nextScheduled.docs[0] as any;

      // If no scheduled record exists, estimate next fortnight cost from
      // default weekly hours so the agency can see what's coming.
      const defaultWeekly = Number(c.defaultWeeklyHours || 0);
      const rate = Number(c.hourlyRate || 0);
      const estimatedFortnightCost =
        Math.round((defaultWeekly * 2 * rate + Number(c.chatGptReimbursementPerFortnight || 0) + Number(c.transferFeeDefault || 0)) * 100) / 100;

      // Pending entries needing approval
      const pending = await payload.find({
        collection: "contractor-time-entries",
        where: {
          and: [
            { contractor: { equals: c.id } },
            { status: { equals: "submitted" } },
          ],
        },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      });

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        currency: c.currency || "AUD",
        hourlyRate: rate,
        defaultWeeklyHours: defaultWeekly,
        portalUrl: c.portalToken ? `/contractor/${c.portalToken}` : null,
        mtd: { hours: mtdHours, cost: Math.round(mtdCost * 100) / 100 },
        ytd: { hours: ytdHours, cost: Math.round(ytdCost * 100) / 100 },
        lastPaid: lastPaidDoc
          ? {
              fortnightStartDate: lastPaidDoc.fortnightStartDate,
              transferAmount: Number(lastPaidDoc.transferAmount || 0),
              transferReference: lastPaidDoc.transferReference || "",
              paymentDate: lastPaidDoc.paymentDate,
            }
          : null,
        next: nextDoc
          ? {
              id: nextDoc.id,
              fortnightStartDate: nextDoc.fortnightStartDate,
              transferAmount: Number(nextDoc.transferAmount || 0),
              transferReference: nextDoc.transferReference || "",
            }
          : null,
        estimatedFortnightCost,
        pendingCount: pending.totalDocs,
      };
    }),
  );

  return NextResponse.json({ contractors: rows });
}
