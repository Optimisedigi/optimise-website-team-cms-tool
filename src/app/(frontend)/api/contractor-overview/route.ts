import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

const TOTALS_PAGE_LIMIT = 100;
const RECENT_PAYMENT_LIMIT = 100;

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function findAllDocs(payload: any, options: Record<string, unknown>): Promise<any[]> {
  const docs: any[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await payload.find({ ...options, limit: TOTALS_PAGE_LIMIT, page });
    docs.push(...result.docs);
    totalPages = result.totalPages ?? page;
    page += 1;
  } while (page <= totalPages);

  return docs;
}

/** Compact transfer-management data for the authenticated Contractor Costs admin page. */
export async function GET() {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contractorsResult = await payload.find({
    collection: "contractors",
    where: { isActive: { not_equals: false } },
    limit: 100,
    depth: 0,
    sort: "name",
    overrideAccess: true,
  });
  const contractors = contractorsResult.docs as any[];
  const contractorIds = new Set(contractors.map((contractor) => String(contractor.id)));
  const monthStart = startOfMonthIso();

  // Totals intentionally include every logged contractor entry. Detailed weekly data below is bounded.
  const allEntries = await findAllDocs(payload, {
    collection: "contractor-time-entries",
    where: { contractor: { exists: true } },
    depth: 0,
    overrideAccess: true,
  });
  const entries = allEntries.filter((entry) => {
    const contractorId = typeof entry.contractor === "object" ? entry.contractor?.id : entry.contractor;
    return contractorIds.has(String(contractorId));
  });

  // One bounded latest-week lookup per active contractor preserves allocation detail without
  // dropping contractors whose latest entry falls outside a global recent-entry window.
  const recentEntries = (await Promise.all(contractors.map(async (contractor) => {
    const result = await payload.find({
      collection: "contractor-time-entries",
      where: { contractor: { equals: contractor.id } },
      limit: 1,
      depth: 2,
      sort: "-weekCommencing",
      overrideAccess: true,
    });
    return result.docs[0] || null;
  }))).filter(Boolean) as any[];

  const allPaidPayments = await findAllDocs(payload, {
    collection: "contractor-payments",
    where: { status: { equals: "sent" } },
    depth: 0,
    overrideAccess: true,
  });
  const paidPayments = allPaidPayments.filter((payment) => {
    const contractorId = typeof payment.contractor === "object" ? payment.contractor?.id : payment.contractor;
    return contractorIds.has(String(contractorId));
  });

  const paymentsResult = await payload.find({
    collection: "contractor-payments",
    limit: RECENT_PAYMENT_LIMIT,
    depth: 1,
    sort: "-fortnightStartDate",
    overrideAccess: true,
  });
  const payments = (paymentsResult.docs as any[]).filter((payment) => {
    const contractorId = typeof payment.contractor === "object" ? payment.contractor?.id : payment.contractor;
    return contractorIds.has(String(contractorId));
  });

  const entriesByContractor = new Map<string, any[]>();
  const recentEntriesByContractor = new Map<string, any[]>();
  for (const entry of entries) {
    const contractorId = typeof entry.contractor === "object" ? entry.contractor?.id : entry.contractor;
    const key = String(contractorId);
    const contractorEntries = entriesByContractor.get(key);
    if (contractorEntries) contractorEntries.push(entry);
    else entriesByContractor.set(key, [entry]);
  }
  for (const entry of recentEntries) {
    const contractorId = typeof entry.contractor === "object" ? entry.contractor?.id : entry.contractor;
    const key = String(contractorId);
    const contractorEntries = recentEntriesByContractor.get(key);
    if (contractorEntries) contractorEntries.push(entry);
    else recentEntriesByContractor.set(key, [entry]);
  }

  const contractorsRows = contractors.map((contractor) => {
    const contractorEntries = entriesByContractor.get(String(contractor.id)) || [];
    const mtdEntries = contractorEntries.filter((entry) => String(entry.weekCommencing).slice(0, 10) >= monthStart);
    const latestWeek = recentEntriesByContractor.get(String(contractor.id))?.[0];
    const latestWeekAllocations = (latestWeek?.clientAllocations || []).map((allocation: any) => ({
      clientName: typeof allocation.client === "object" ? allocation.client?.name || "Unknown client" : "Unknown client",
      hours: Number(allocation.hours || 0),
    }));
    const sentPayments = paidPayments.filter((payment) => {
      const contractorId = typeof payment.contractor === "object" ? payment.contractor?.id : payment.contractor;
      return String(contractorId) === String(contractor.id) && payment.status === "sent";
    });

    return {
      id: contractor.id,
      name: contractor.name,
      email: contractor.email || null,
      currency: contractor.currency || "AUD",
      hourlyRate: Number(contractor.hourlyRate || 0),
      mtd: {
        hours: round(mtdEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)),
        cost: round(mtdEntries.reduce((sum, entry) => sum + Number(entry.totalFee || 0), 0)),
      },
      totalHours: round(contractorEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)),
      totalPaid: round(sentPayments.reduce((sum, payment) => sum + Number(payment.transferAmount || 0), 0)),
      latestWeek: latestWeek
        ? {
            weekCommencing: latestWeek.weekCommencing,
            hours: Number(latestWeek.hours || 0),
            clientAllocations: latestWeekAllocations,
          }
        : null,
    };
  });

  const recentPayments = payments.map((payment) => {
    const contractor = typeof payment.contractor === "object" ? payment.contractor : null;
    return {
      id: payment.id,
      contractorName: contractor?.name || "Unknown contractor",
      currency: contractor?.currency || "AUD",
      fortnightStartDate: payment.fortnightStartDate,
      fortnightEndDate: payment.fortnightEndDate || null,
      totalHours: Number(payment.totalHours || 0),
      subtotal: Number(payment.subtotal || 0),
      transferAmount: Number(payment.transferAmount || 0),
      transferReference: payment.transferReference || "",
      status: payment.status || "scheduled",
      paidDate: payment.paymentDate || payment.sentAt || null,
    };
  });

  const globals = {
    activeContractors: contractorsRows.length,
    mtdCost: round(contractorsRows.reduce((sum, contractor) => sum + contractor.mtd.cost, 0)),
    totalPaid: round(contractorsRows.reduce((sum, contractor) => sum + contractor.totalPaid, 0)),
    totalHours: round(contractorsRows.reduce((sum, contractor) => sum + contractor.totalHours, 0)),
  };

  return NextResponse.json({ contractors: contractorsRows, recentPayments, globals });
}
