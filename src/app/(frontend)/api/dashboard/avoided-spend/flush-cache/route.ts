import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Admin-only manual cache flush. Useful when Growth Tools data ever looks
 * wrong and we need to force a refetch on the next dashboard load.
 *
 * Body: { clientId: number }
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const headersList = await headers();
  const { user } = await payload.auth({ headers: headersList });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { clientId?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? parseInt(body.clientId, 10) : body.clientId;
  if (!clientId || Number.isNaN(clientId)) {
    return NextResponse.json({ error: "Missing or invalid clientId" }, { status: 400 });
  }

  try {
    const result = await payload.delete({
      collection: "negative-keyword-avoided-spend-cache",
      where: { client: { equals: clientId } },
      overrideAccess: true,
    });
    return NextResponse.json({ ok: true, deleted: result.docs?.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: `Flush failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
