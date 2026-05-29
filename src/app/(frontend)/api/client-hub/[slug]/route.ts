import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildClientHubPayload } from "@/lib/client-hub";
import { pinFromRequest, verifyClientHubPin } from "@/lib/client-hub-auth";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await getPayload({ config: await config });
  const auth = await verifyClientHubPin(payload, slug, pinFromRequest(request));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const hub = await buildClientHubPayload(payload, slug);
  if (!hub) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
  return NextResponse.json({ ok: true, hub });
}
