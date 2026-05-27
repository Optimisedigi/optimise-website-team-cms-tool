import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!userHasFeature(user, "business-costs")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { date, amount, description, categoryId, notes, clientId } = body;

    if (!date || !amount || !description) {
      return NextResponse.json({ error: "date, amount, and description are required" }, { status: 400 });
    }

    const doc = await payload.create({
      collection: "business-costs",
      data: {
        date,
        amount: Math.abs(parseFloat(amount)),
        description,
        category: categoryId || undefined,
        notes: notes || undefined,
        client: clientId || undefined,
        source: "manual",
      },
      overrideAccess: true,
    });

    return NextResponse.json({ ok: true, id: doc.id });
  } catch (err) {
    console.error("[costs/add] error:", err);
    return NextResponse.json(
      { error: "Failed to add cost", details: String(err) },
      { status: 500 },
    );
  }
}
