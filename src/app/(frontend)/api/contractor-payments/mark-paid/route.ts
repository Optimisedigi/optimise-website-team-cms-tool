import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { buildUserToContractorMap, resolveEntryContractorId } from "@/lib/contractor-user-link";

function addDaysIso(dateIso: string, days: number): string {
  const ms = Date.parse(`${dateIso}T00:00:00.000Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Marks a derived fortnight as paid by creating (or updating) a sent
 * ContractorPayment for that contractor + fortnight start. The
 * ContractorPayments hooks roll up the fortnight's approved time entries,
 * compute the transfer amount, and flip those entries to `paid`.
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { contractorId?: number; fortnightStartDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contractorId = Number(body.contractorId);
  const fortnightStartDate = String(body.fortnightStartDate || "").slice(0, 10);
  if (!contractorId || !/^\d{4}-\d{2}-\d{2}$/.test(fortnightStartDate)) {
    return NextResponse.json({ error: "contractorId and fortnightStartDate are required" }, { status: 400 });
  }

  // Backfill the `contractor` link on this fortnight's user-logged entries so
  // the ContractorPayments rollup hook can pick them up and flip them to paid.
  const fortnightEndDate = addDaysIso(fortnightStartDate, 13);
  const [contractor, usersResult, fortnightEntries] = await Promise.all([
    payload.findByID({ collection: "contractors", id: contractorId, depth: 0, overrideAccess: true }).catch(() => null),
    payload.find({ collection: "users", limit: 1000, depth: 0, overrideAccess: true }),
    payload.find({
      collection: "contractor-time-entries",
      where: {
        and: [
          { contractor: { exists: false } },
          { weekCommencing: { greater_than_equal: fortnightStartDate } },
          { weekCommencing: { less_than_equal: fortnightEndDate } },
          { status: { in: ["approved", "submitted"] } },
        ],
      },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  if (contractor) {
    const userToContractor = buildUserToContractorMap([contractor as any], (usersResult.docs as any[]));
    for (const entry of fortnightEntries.docs as any[]) {
      if (resolveEntryContractorId(entry, userToContractor) === String(contractorId)) {
        await payload.update({
          collection: "contractor-time-entries",
          id: entry.id,
          data: { contractor: contractorId },
          overrideAccess: true,
        });
      }
    }
  }

  const existing = await payload.find({
    collection: "contractor-payments",
    where: {
      and: [
        { contractor: { equals: contractorId } },
        { fortnightStartDate: { equals: fortnightStartDate } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const today = new Date().toISOString().slice(0, 10);
  const existingPayment = existing.docs[0] as any;

  const payment = existingPayment
    ? await payload.update({
        collection: "contractor-payments",
        id: existingPayment.id,
        data: { status: "sent", paymentDate: existingPayment.paymentDate || today },
        overrideAccess: true,
        user,
      })
    : await payload.create({
        collection: "contractor-payments",
        data: { contractor: contractorId, fortnightStartDate, status: "sent", paymentDate: today },
        overrideAccess: true,
        user,
      });

  return NextResponse.json({ ok: true, paymentId: (payment as any).id });
}
