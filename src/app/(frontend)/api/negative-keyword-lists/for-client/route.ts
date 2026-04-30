import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const result = await payload.find({
    collection: "negative-keyword-lists",
    where: {
      client: { equals: clientId },
      isActive: { equals: true },
    },
    sort: "name",
    limit: 100,
    overrideAccess: true,
  });

  const nkls = result.docs.map((doc) => {
    const d = doc as unknown as Record<string, unknown>;
    return {
      id: doc.id,
      name: d.name as string,
      keywordCount: (d.keywordCount as number) ?? 0,
    };
  });

  return NextResponse.json({ nkls });
}
