import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("dashboard_token")?.value;
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const clientId = searchParams.get("clientId");

  if (!slug || !clientId || !validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const result = await payload.find({
    collection: "negative-keyword-lists",
    where: { client: { equals: clientId }, source: { equals: "deep_dive" } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0] as unknown as Record<string, unknown> | undefined;
  const keywords: string[] = (
    (doc?.keywords as Array<{ keyword: string }>) ?? []
  ).map((k) => k.keyword);

  return NextResponse.json({ keywords });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("dashboard_token")?.value;
  const body = await req.json();
  const { clientId, slug, selectedTerms } = body;

  if (
    !clientId ||
    !slug ||
    !Array.isArray(selectedTerms) ||
    !validateDashboardToken(token, slug)
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Find existing deep-dive list for this client
  const existing = await payload.find({
    collection: "negative-keyword-lists",
    where: { client: { equals: clientId }, source: { equals: "deep_dive" } },
    limit: 1,
    overrideAccess: true,
  });

  const keywords = selectedTerms.map((term: string) => ({
    keyword: term,
    matchType: "exact" as const,
    flaggedForRemoval: false,
  }));

  if (existing.docs[0]) {
    await payload.update({
      collection: "negative-keyword-lists",
      id: existing.docs[0].id,
      data: { keywords },
      overrideAccess: true,
    });
  } else {
    await payload.create({
      collection: "negative-keyword-lists",
      data: {
        client: clientId,
        name: "Deep Dive Selections",
        scope: "account",
        source: "deep_dive",
        keywords,
        isActive: true,
      },
      overrideAccess: true,
    });
  }

  return NextResponse.json({ success: true, count: selectedTerms.length });
}
