import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/lib/access";
import { applyChangePreview, changePreviewDb } from "@/lib/agents/optimate-google-ads/change-previews";
import { growthToolsRequest } from "@/lib/agents/optimate-google-ads/tools/_growth-tools";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseId(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

/**
 * POST /api/optimate/google-ads-changes/:id/apply
 *
 * The only path that sends a live Google Ads change prepared by OptiMate. The
 * user tapped "Apply live" on the change card; we send the request stored at
 * preview time, once. Admin-only, like applying an approval-queue proposal,
 * and only the user the preview was prepared for can apply it.
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
  if (!isAdmin(user)) {
    return NextResponse.json(
      { error: "Forbidden: admin role required to apply live Google Ads changes." },
      { status: 403 },
    );
  }
  const userId = Number(user.id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const outcome = await applyChangePreview(changePreviewDb(payload), id, userId, {
    now: () => new Date(),
    send: (request) => growthToolsRequest<unknown>({ ...request, timeoutMs: 90_000 }),
  });
  if (outcome.status === "unavailable") return NextResponse.json({ error: outcome.reason }, { status: 409 });
  if (outcome.status === "failed") return NextResponse.json({ error: outcome.error }, { status: 502 });
  return NextResponse.json({ ok: true, result: outcome.result });
}
