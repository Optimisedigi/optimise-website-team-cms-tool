import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

/**
 * POST /api/client-processes/[id]/share
 *
 * Marks a process as shared with the client.
 * Increments sharedCount and sets lastSharedAt.
 *
 * Auth: Payload session OR x-api-key matching AUDIT_API_KEY.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await getPayload({ config });
    const apiKey = req.headers.get("x-api-key");
    const { user } = await payload.auth({ headers: req.headers });

    if (!user && (!apiKey || apiKey !== process.env.AUDIT_API_KEY)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const now = new Date().toISOString();

    const doc = await payload.findByID({
      collection: "client-processes" as any,
      id,
      depth: 0,
      overrideAccess: true,
    });

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const docAny = doc as any;
    const updated = await payload.update({
      collection: "client-processes" as any,
      id,
      data: {
        lastSharedAt: now,
        sharedCount: (docAny.sharedCount ?? 0) + 1,
      } as any,
      overrideAccess: true,
    });

    const updatedAny = updated as any;
    const clientId =
      typeof updatedAny.client === "object"
        ? updatedAny.client?.id
        : updatedAny.client;

    logActivity(payload, {
      type: "process_shared" as any,
      title: `Process shared: ${updatedAny.processTitle}`,
      user: user?.id,
      client: clientId,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      lastSharedAt: updatedAny.lastSharedAt,
      sharedCount: updatedAny.sharedCount,
    });
  } catch (err) {
    console.error("[client-processes/share] Error:", err);
    return NextResponse.json(
      { error: "Failed to mark as shared", details: String(err) },
      { status: 500 },
    );
  }
}
