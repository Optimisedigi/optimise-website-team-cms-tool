import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

/**
 * Restore a trashed contract by clearing `deletedAt`. No-op if already
 * active.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await getPayload({ config: await config });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const doc = (await payload.findByID({
      collection: "contracts",
      id,
      overrideAccess: true,
    })) as any;
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!doc.deletedAt) {
      return NextResponse.json({ error: "Not in trash" }, { status: 400 });
    }

    const updated = await payload.update({
      collection: "contracts",
      id,
      data: { deletedAt: null } as any,
      overrideAccess: true,
    });

    logActivity(payload, {
      type: "contract_client_signed",
      title: `Contract restored from trash: ${doc.contractTitle || `#${id}`}`,
      description: `Restored by ${user.email}.`,
      user: user.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true, id: updated.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
