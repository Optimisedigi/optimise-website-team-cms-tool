import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { buildUserToContractorMap, resolveEntryContractorId } from "@/lib/contractor-user-link";
import { reimbursementForFortnight } from "@/lib/contractor-reimbursement";

const TOTALS_PAGE_LIMIT = 100;

/**
 * Fortnight schedule anchor. The first tracked fortnight runs
 * 29 Jun 2026 → 12 Jul 2026 (Mon → Sun, 14 days) and every fortnight
 * increments by exactly 14 days from this Monday. Fortnightly payments are
 * derived from this anchor and the contractor's logged time entries — they
 * are not entered by hand.
 */
const FORTNIGHT_ANCHOR_MS = Date.UTC(2026, 5, 29); // 29 Jun 2026 (month is 0-based)
const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Index of the fortnight bucket a weekCommencing date falls into (>= 0 once past the anchor). */
function fortnightIndex(weekCommencing: string): number {
  const weekMs = Date.parse(`${String(weekCommencing).slice(0, 10)}T00:00:00.000Z`);
  return Math.floor((weekMs - FORTNIGHT_ANCHOR_MS) / FORTNIGHT_MS);
}

function fortnightStartMs(index: number): number {
  return FORTNIGHT_ANCHOR_MS + index * FORTNIGHT_MS;
}

function ddmm(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildReference(template: string | null | undefined, startMs: number, endMs: number): string {
  const tmpl = template || "{startShort}-{endShort} Optimise";
  return tmpl
    .replace(/\{startShort\}/g, ddmm(startMs))
    .replace(/\{endShort\}/g, ddmm(endMs))
    .replace(/\{startDate\}/g, isoDay(startMs))
    .replace(/\{endDate\}/g, isoDay(endMs));
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

/** Compact, auto-derived transfer-management data for the Contractor Costs admin page. */
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

  // Bridge internal time-entry users to their contractor record so hours logged
  // through the admin grid (user set, contractor empty) still build payments.
  const users = await findAllDocs(payload, {
    collection: "users",
    depth: 0,
    overrideAccess: true,
  });
  const userToContractor = buildUserToContractorMap(contractors as any[], users as any[]);

  const allEntries = await findAllDocs(payload, {
    collection: "contractor-time-entries",
    where: { or: [{ contractor: { exists: true } }, { user: { exists: true } }] },
    depth: 0,
    overrideAccess: true,
  });
  const entries = allEntries.filter((entry) =>
    contractorIds.has(resolveEntryContractorId(entry, userToContractor) ?? ""),
  );

  // Existing "sent" payment records mark a fortnight as actually transferred.
  const allSentPayments = await findAllDocs(payload, {
    collection: "contractor-payments",
    where: { status: { equals: "sent" } },
    depth: 0,
    overrideAccess: true,
  });
  const sentPaymentsByKey = new Map<string, any>();
  const sentPaymentsByContractor = new Map<string, any[]>();
  for (const payment of allSentPayments) {
    const contractorId = String(typeof payment.contractor === "object" ? payment.contractor?.id : payment.contractor);
    if (!contractorIds.has(contractorId)) continue;
    const startKey = `${contractorId}:${String(payment.fortnightStartDate).slice(0, 10)}`;
    sentPaymentsByKey.set(startKey, payment);
    sentPaymentsByContractor.set(contractorId, [...(sentPaymentsByContractor.get(contractorId) || []), payment]);
  }

  const entriesByContractor = new Map<string, any[]>();
  for (const entry of entries) {
    const contractorId = resolveEntryContractorId(entry, userToContractor);
    if (!contractorId) continue;
    const list = entriesByContractor.get(contractorId);
    if (list) list.push(entry);
    else entriesByContractor.set(contractorId, [entry]);
  }

  // Latest logged week per contractor (depth 2 for client-allocation labels),
  // resolved from the grouped entries so user-logged weeks are included.
  const latestWeekByContractor = new Map<string, any>();
  await Promise.all([...entriesByContractor.entries()].map(async ([contractorId, contractorEntries]) => {
    const latest = contractorEntries.reduce(
      (best, entry) => (best && String(best.weekCommencing) >= String(entry.weekCommencing) ? best : entry),
      null as any,
    );
    if (!latest) return;
    const detailed = await payload.findByID({
      collection: "contractor-time-entries",
      id: latest.id,
      depth: 2,
      overrideAccess: true,
    }).catch(() => latest);
    latestWeekByContractor.set(contractorId, detailed || latest);
  }));

  // ── Derive fortnightly payments from approved/paid time entries ──
  type Bucket = { hours: number; subtotal: number; allPaid: boolean };
  const fortnightlyPayments: any[] = [];

  for (const contractor of contractors) {
    const contractorId = String(contractor.id);
    const rate = Number(contractor.hourlyRate || 0);
    const fee = Number(contractor.transferFeeDefault || 0);
    const currency = contractor.currency || "AUD";
    const buckets = new Map<number, Bucket>();

    for (const entry of entriesByContractor.get(contractorId) || []) {
      if (!["approved", "paid"].includes(String(entry.status))) continue;
      const index = fortnightIndex(entry.weekCommencing);
      if (index < 0) continue;
      const bucket = buckets.get(index) || { hours: 0, subtotal: 0, allPaid: true };
      const hours = Number(entry.hours || 0);
      // User-logged grid entries have no stored `totalFee`; fall back to hours × rate.
      const storedFee = Number(entry.totalFee);
      bucket.hours += hours;
      bucket.subtotal += Number.isFinite(storedFee) && storedFee > 0 ? storedFee : hours * rate;
      if (String(entry.status) !== "paid") bucket.allPaid = false;
      buckets.set(index, bucket);
    }

    for (const [index, bucket] of buckets) {
      const startMs = fortnightStartMs(index);
      const endMs = startMs + 13 * DAY_MS;
      const startIso = isoDay(startMs);
      const sentPayment = sentPaymentsByKey.get(`${contractorId}:${startIso}`);
      const paid = Boolean(sentPayment) || bucket.allPaid;
      const subtotal = round(bucket.subtotal);
      const reimbursement = round(reimbursementForFortnight(contractor, startMs, endMs));
      const amount = sentPayment
        ? Number(sentPayment.transferAmount || 0)
        : round(subtotal + reimbursement + fee);

      fortnightlyPayments.push({
        id: sentPayment ? `payment-${sentPayment.id}` : `${contractorId}-${index}`,
        contractorId: Number(contractor.id),
        contractorName: contractor.name,
        currency,
        fortnightStartDate: startIso,
        fortnightEndDate: isoDay(endMs),
        totalHours: round(bucket.hours),
        subtotal,
        reimbursement,
        fee,
        amount,
        transferReference: sentPayment?.transferReference || buildReference(contractor.transferReferenceTemplate, startMs, endMs),
        status: paid ? "paid" : "unpaid",
        paidDate: sentPayment?.paymentDate || sentPayment?.sentAt || null,
      });
    }
  }

  fortnightlyPayments.sort((a, b) =>
    a.fortnightStartDate === b.fortnightStartDate
      ? a.contractorName.localeCompare(b.contractorName)
      : b.fortnightStartDate.localeCompare(a.fortnightStartDate),
  );

  const contractorsRows = contractors.map((contractor) => {
    const contractorId = String(contractor.id);
    const rate = Number(contractor.hourlyRate || 0);
    const entryFee = (entry: any) => {
      const stored = Number(entry.totalFee);
      return Number.isFinite(stored) && stored > 0 ? stored : Number(entry.hours || 0) * rate;
    };
    const contractorEntries = entriesByContractor.get(contractorId) || [];
    const mtdEntries = contractorEntries.filter((entry) => String(entry.weekCommencing).slice(0, 10) >= monthStart);
    const latestWeek = latestWeekByContractor.get(contractorId);
    const latestWeekAllocations = (latestWeek?.clientAllocations || []).map((allocation: any) => ({
      clientName: typeof allocation.client === "object" ? allocation.client?.name || "Unknown client" : "Unknown client",
      hours: Number(allocation.hours || 0),
    }));
    const totalPaid = (sentPaymentsByContractor.get(contractorId) || []).reduce(
      (sum, payment) => sum + Number(payment.transferAmount || 0),
      0,
    );

    return {
      id: contractor.id,
      name: contractor.name,
      email: contractor.email || null,
      currency: contractor.currency || "AUD",
      hourlyRate: rate,
      reimbursement: {
        amount: contractor.reimbursementRecurrence
          ? Number(contractor.reimbursementAmount || 0)
          : Number(contractor.chatGptReimbursementPerFortnight || 0),
        recurrence: (contractor.reimbursementRecurrence as string) || "per-fortnight",
        startDate: contractor.reimbursementStartDate || null,
      },
      mtd: {
        hours: round(mtdEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)),
        cost: round(mtdEntries.reduce((sum, entry) => sum + entryFee(entry), 0)),
      },
      totalHours: round(contractorEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)),
      totalPaid: round(totalPaid),
      latestWeek: latestWeek
        ? {
            weekCommencing: latestWeek.weekCommencing,
            hours: Number(latestWeek.hours || 0),
            clientAllocations: latestWeekAllocations,
          }
        : null,
    };
  });

  const globals = {
    activeContractors: contractorsRows.length,
    owingNow: round(fortnightlyPayments.filter((p) => p.status === "unpaid").reduce((sum, p) => sum + p.amount, 0)),
    totalPaid: round(contractorsRows.reduce((sum, contractor) => sum + contractor.totalPaid, 0)),
    totalHours: round(contractorsRows.reduce((sum, contractor) => sum + contractor.totalHours, 0)),
  };

  return NextResponse.json({ contractors: contractorsRows, fortnightlyPayments, globals });
}
