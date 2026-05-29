import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });

  const payload = await getPayload({ config: await config });
  const result = await payload.find({
    collection: "gsc-snapshots" as any,
    where: { client: { equals: clientId } },
    sort: "-periodEnd",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const snapshot = result.docs[0] ?? null;
  return NextResponse.json({ ok: true, snapshot });
}
