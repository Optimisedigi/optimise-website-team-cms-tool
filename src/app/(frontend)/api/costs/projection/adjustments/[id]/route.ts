import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

/** Remove a manual estimated invoice or cost from the year-end estimate. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!userHasFeature(user, "business-costs") || !userHasFeature(user, "clients")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await payload.find({
      collection: "estimate-adjustments",
      where: { id: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existing.docs.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await payload.delete({ collection: "estimate-adjustments", id, overrideAccess: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[costs/projection/adjustments/:id] error:", err);
    return NextResponse.json({ error: "Failed to remove the estimate" }, { status: 500 });
  }
}
