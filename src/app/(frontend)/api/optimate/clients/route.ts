import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

function extractProvidedKey(request: Request): string {
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) return xApiKey;

  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  if (auth.startsWith("users API-Key ")) return auth.slice("users API-Key ".length).trim();
  return "";
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CMS_API_KEY || process.env.AUDIT_API_KEY || "";
  const provided = extractProvidedKey(request);
  return Boolean(expected && provided && safeEqual(provided, expected));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "clients",
      where: { isActive: { not_equals: false } },
      sort: "name",
      limit: 500,
      select: {
        name: true,
        slug: true,
        websiteUrl: true,
        googleAdsCustomerId: true,
        ga4PropertyId: true,
        gtmContainerId: true,
        isActive: true,
      } as any,
    });

    return NextResponse.json(
      result.docs.map((client: any) => ({
        id: client.id,
        name: client.name,
        slug: client.slug,
        websiteUrl: client.websiteUrl ?? null,
        googleAdsCustomerId: client.googleAdsCustomerId ?? null,
        ga4PropertyId: client.ga4PropertyId ?? null,
        gtmContainerId: client.gtmContainerId ?? null,
        isActive: client.isActive ?? true,
      })),
    );
  } catch (err) {
    console.error("[optimate/clients] error:", err);
    return NextResponse.json({ error: "Failed to load OptiMate clients" }, { status: 500 });
  }
}
