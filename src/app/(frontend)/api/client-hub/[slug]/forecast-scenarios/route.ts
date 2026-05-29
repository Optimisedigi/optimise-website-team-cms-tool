import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { pinFromRequest, verifyClientHubPin } from "@/lib/client-hub-auth";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await getPayload({ config: await config });
  const auth = await verifyClientHubPin(payload, slug, pinFromRequest(request));
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const scenarios = await payload.find({
    collection: "forecast-scenarios" as any,
    where: { and: [{ client: { equals: auth.clientId } }, { status: { equals: "published" } }] },
    sort: "-publishedAt",
    limit: 25,
    depth: 1,
    overrideAccess: true,
  });
  return NextResponse.json({ ok: true, scenarios: scenarios.docs });
}
