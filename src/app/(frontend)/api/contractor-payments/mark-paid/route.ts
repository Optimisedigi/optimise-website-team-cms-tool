import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

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
