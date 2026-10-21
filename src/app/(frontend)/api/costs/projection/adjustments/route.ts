import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { z } from "zod";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

const adjustmentSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
  kind: z.enum(["invoiced", "cost"]),
  amount: z
    .number()
    .finite()
    .refine((n) => n !== 0, "amount can't be 0")
    .refine((n) => Math.abs(n) <= 10_000_000, "amount is too large"),
  description: z.string().trim().min(1, "description is required").max(200),
  account: z.string().trim().max(120).nullish(),
});

/**
 * Add a manual estimated invoice or cost to one month of the year-end
 * estimate. Amounts are ex-GST; negative reduces the month.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Same access as the estimate itself.
    if (!userHasFeature(user, "business-costs") || !userHasFeature(user, "clients")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = adjustmentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid adjustment" }, { status: 400 });
    }
    const { month, kind, amount, description, account } = parsed.data;

    const doc = await payload.create({
      collection: "estimate-adjustments",
      data: {
        month,
        kind,
        amount: Math.round(amount * 100) / 100,
        description,
        account: kind === "cost" && account ? account : null,
      },
      overrideAccess: true,
    });

    return NextResponse.json({ ok: true, id: doc.id });
  } catch (err) {
    console.error("[costs/projection/adjustments] error:", err);
    return NextResponse.json({ error: "Failed to add the estimate" }, { status: 500 });
  }
}
