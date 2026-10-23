import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { applyLinkAction } from "@/lib/content-map/link-action";
import { loadClientForUser, validClientId } from "@/lib/content-map/state";

/** A person approved the drafted edit: write it into the CMS article (or record a pasted live-page edit as done). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = ((await request.json().catch(() => null)) ?? {}) as { clientId?: unknown; key?: unknown };
    const clientId = typeof body.clientId === "number" ? String(body.clientId) : body.clientId;
    if (!validClientId(clientId)) return NextResponse.json({ error: "clientId is invalid" }, { status: 400 });
    if (typeof body.key !== "string" || !body.key || body.key.length > 2000) return NextResponse.json({ error: "key is invalid" }, { status: 400 });
    const client = await loadClientForUser(payload, clientId, user);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const res = await applyLinkAction(payload, { clientId, siteUrl: String(client.websiteUrl ?? ""), key: body.key, user });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true, key: body.key, action: res.action });
  } catch (err) {
    console.error("[content-map] link apply failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to apply the link" }, { status: 500 });
  }
}
