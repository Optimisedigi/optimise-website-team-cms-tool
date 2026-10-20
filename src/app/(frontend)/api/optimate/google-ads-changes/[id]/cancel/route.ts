import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { cancelChangePreview, changePreviewDb } from "@/lib/agents/optimate-google-ads/change-previews";

export const runtime = "nodejs";

function parseId(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

/**
 * POST /api/optimate/google-ads-changes/:id/cancel
 *
 * Cancels a change OptiMate prepared but nobody applied. Only the user the
 * preview was prepared for can cancel it, and only while it is pending.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "Invalid change id." }, { status: 400 });

  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = Number(user.id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cancelled = await cancelChangePreview(changePreviewDb(payload), id, userId, new Date());
  if (!cancelled) {
    return NextResponse.json({ error: "This change was already applied, cancelled, or is not yours." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
