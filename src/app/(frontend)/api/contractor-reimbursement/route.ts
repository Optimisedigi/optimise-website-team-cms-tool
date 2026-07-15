import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

const RECURRENCES = ["none", "weekly", "per-fortnight", "monthly", "one-off"] as const;
type Recurrence = (typeof RECURRENCES)[number];

/**
 * Inline editor for a contractor's reimbursement (and hourly rate) from the
 * Contractor Costs page, so the agency never has to leave that surface.
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    contractorId?: number;
    hourlyRate?: number;
    reimbursementAmount?: number;
    reimbursementRecurrence?: string;
    reimbursementStartDate?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contractorId = Number(body.contractorId);
  if (!contractorId) {
    return NextResponse.json({ error: "contractorId is required" }, { status: 400 });
  }

  const recurrence = String(body.reimbursementRecurrence || "") as Recurrence;
  if (!RECURRENCES.includes(recurrence)) {
    return NextResponse.json({ error: `reimbursementRecurrence must be one of: ${RECURRENCES.join(", ")}` }, { status: 400 });
  }

  const startDate = body.reimbursementStartDate ? String(body.reimbursementStartDate).slice(0, 10) : null;
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "reimbursementStartDate must be YYYY-MM-DD" }, { status: 400 });
  }

  const data: Record<string, unknown> = {
    reimbursementAmount: Math.max(0, Number(body.reimbursementAmount || 0)),
    reimbursementRecurrence: recurrence,
    reimbursementStartDate: startDate,
  };
  if (body.hourlyRate != null) data.hourlyRate = Math.max(0, Number(body.hourlyRate));

  try {
    await payload.update({
      collection: "contractors",
      id: contractorId,
      data,
      overrideAccess: true,
      user,
    });
  } catch {
    return NextResponse.json({ error: "Could not update contractor" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
