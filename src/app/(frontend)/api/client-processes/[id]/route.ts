import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * GET /api/client-processes/[id]
 *
 * Returns the full client process document with depth 2
 * (populates client, template, assignedTo, step assignees).
 *
 * Auth: Payload session OR x-api-key matching AUDIT_API_KEY.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await getPayload({ config });

    // Auth: require Payload session or API key
    const apiKey = req.headers.get("x-api-key");
    const { user } = await payload.auth({ headers: req.headers });

    if (!user && (!apiKey || apiKey !== process.env.AUDIT_API_KEY)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let doc: any;
    try {
      doc = await payload.findByID({
        collection: "client-processes" as any,
        id,
        depth: 2,
        overrideAccess: true,
      });
    } catch {
      return NextResponse.json(
        { error: "Client process not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(doc);
  } catch (err) {
    console.error("[client-processes/[id]] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch client process", details: String(err) },
      { status: 500 },
    );
  }
}
