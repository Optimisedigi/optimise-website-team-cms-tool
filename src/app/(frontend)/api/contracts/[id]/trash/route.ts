import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

/**
 * Soft-delete a contract: stamps `deletedAt = now()`. The contract is
 * hidden from the default list view and auto-purged 30 days later by
 * the trash-sweep cron. Recoverable via /restore until then.
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
    if (doc.deletedAt) {
      return NextResponse.json({ error: "Already in trash" }, { status: 400 });
    }

    const updated = await payload.update({
      collection: "contracts",
      id,
      data: { deletedAt: new Date().toISOString() } as any,
      overrideAccess: true,
    });

    logActivity(payload, {
      type: "contract_client_signed",
      title: `Contract moved to trash: ${doc.contractTitle || `#${id}`}`,
      description: `Trashed by ${user.email}. Auto-purge in 30 days unless restored.`,
      user: user.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true, id: updated.id, deletedAt: (updated as any).deletedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
