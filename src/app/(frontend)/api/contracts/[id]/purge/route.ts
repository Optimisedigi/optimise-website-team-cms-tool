import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

/**
 * Hard-delete a trashed contract. Admin only. Sets `allowPurge` on
 * `req.context` so the collection's delete access rule + beforeDelete
 * guard let the operation through.
 *
 * The contract must already be in trash (deletedAt set) \u2014 prevents
 * accidental one-click destruction of active contracts.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await getPayload({ config: await config });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((user as any).role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const doc = (await payload.findByID({
      collection: "contracts",
      id,
      overrideAccess: true,
    })) as any;
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!doc.deletedAt) {
      return NextResponse.json(
        {
          error:
            "Contract must be in trash first. Move it to trash, then delete forever.",
        },
        { status: 400 },
      );
    }

    await payload.delete({
      collection: "contracts",
      id,
      overrideAccess: true,
      context: { allowPurge: true },
    });

    logActivity(payload, {
      type: "contract_client_signed",
      title: `Contract permanently deleted: ${doc.contractTitle || `#${id}`}`,
      description: `Hard-deleted by ${user.email} after being in trash since ${doc.deletedAt}.`,
      user: user.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
