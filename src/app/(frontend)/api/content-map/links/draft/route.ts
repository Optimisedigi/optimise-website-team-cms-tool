import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { draftLinkAction } from "@/lib/content-map/link-action";
import { latestCompleted, loadClientForUser, validClientId } from "@/lib/content-map/state";

export const maxDuration = 180;

/** Draft (or redo) the edit that writes an accepted link into its source page. Never edits the page itself. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = ((await request.json().catch(() => null)) ?? {}) as { clientId?: unknown; key?: unknown; redo?: unknown };
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    if (typeof body.key !== "string" || !body.key || body.key.length > 2000) return NextResponse.json({ error: "key is invalid" }, { status: 400 });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const res = await draftLinkAction(payload, {
      clientId,
      siteUrl: String(client.websiteUrl ?? ""),
      snapshot: await latestCompleted(payload, clientId),
      key: body.key,
      user,
      redo: body.redo === true,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true, key: body.key, action: res.action });
  } catch (err) {
    console.error("[content-map] link draft failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to draft the link" }, { status: 500 });
  }
}
