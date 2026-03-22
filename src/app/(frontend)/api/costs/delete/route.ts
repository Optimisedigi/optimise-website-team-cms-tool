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
    const { ids } = body as { ids: (string | number)[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 },
      );
    }

    let deleted = 0;
    for (const id of ids) {
      try {
        await payload.delete({
          collection: "business-costs",
          id,
          overrideAccess: true,
        });
        deleted++;
      } catch {
        // skip if already deleted
      }
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error("[costs/delete] error:", err);
    return NextResponse.json(
      { error: "Failed to delete", details: String(err) },
      { status: 500 },
    );
  }
}
