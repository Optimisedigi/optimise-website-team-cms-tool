import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { transactionId, categoryId, saveRule } = body;

    if (!transactionId || !categoryId) {
      return NextResponse.json({ error: "transactionId and categoryId are required" }, { status: 400 });
    }

    // Update the transaction's category
    const updated = await payload.update({
      collection: "business-costs",
      id: transactionId,
      data: { category: categoryId },
      overrideAccess: true,
    });

    // If saveRule is true, create a cost-rule from the description
    let ruleSaved = false;
    if (saveRule && updated.description) {
      const description = updated.description as string;
      // Check if a rule with this pattern already exists
      const existing = await payload.find({
        collection: "cost-rules",
        where: { pattern: { equals: description } },
        limit: 1,
        overrideAccess: true,
      });

      if (existing.totalDocs === 0) {
        await payload.create({
          collection: "cost-rules",
          data: {
            pattern: description,
            category: categoryId,
          },
          overrideAccess: true,
        });
        ruleSaved = true;
      }
    }

    return NextResponse.json({ ok: true, ruleSaved });
  } catch (err) {
    console.error("[costs/categorise] error:", err);
    return NextResponse.json(
      { error: "Failed to categorise", details: String(err) },
      { status: 500 },
    );
  }
}
