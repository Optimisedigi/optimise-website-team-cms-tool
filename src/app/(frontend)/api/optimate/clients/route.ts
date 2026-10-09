import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { latestIdealClientByClient, resolveTargetCustomer } from "@/lib/optimate-target-customer";

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

/** Collapse whitespace and trim; blank strings become null so OptiMate skips the line. */
function normaliseText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
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
        metaAdAccountId: true,
        ga4PropertyId: true,
        gtmContainerId: true,
        isActive: true,
        businessType: true,
        targetLocation: true,
        conversionGoal: true,
        targetCustomer: true,
        gadsAuto: { triageIdealCustomer: true },
      } as any,
    });

    // Fallback source for targetCustomer: newest Discovery Briefing answer per client.
    // A failure here must not take down the whole clients list; the other two
    // sources (Business tab, Google Ads triage) still resolve.
    let idealClientByClient = new Map<string, string>();
    const clientIds = result.docs.map((client: any) => client.id);
    if (clientIds.length > 0) {
      try {
        const briefings = await payload.find({
          collection: "client-discovery-briefings",
          where: { client: { in: clientIds } },
          sort: "-updatedAt",
          depth: 0,
          pagination: false,
          select: { client: true, data: true } as any,
        });
        idealClientByClient = latestIdealClientByClient(briefings.docs as any);
      } catch (err) {
        console.error("[optimate/clients] discovery briefing lookup failed:", err);
      }
    }

    return NextResponse.json(
      result.docs.map((client: any) => ({
        id: client.id,
        name: client.name,
        slug: client.slug,
        websiteUrl: client.websiteUrl ?? null,
        googleAdsCustomerId: client.googleAdsCustomerId ?? null,
        metaAdAccountId: client.metaAdAccountId ?? null,
        ga4PropertyId: client.ga4PropertyId ?? null,
        gtmContainerId: client.gtmContainerId ?? null,
        isActive: client.isActive ?? true,
        businessType: client.businessType ?? null,
        targetLocation: normaliseText(client.targetLocation),
        conversionGoal: client.conversionGoal ?? null,
        targetCustomer: resolveTargetCustomer({
          businessTab: client.targetCustomer,
          discoveryBriefing: idealClientByClient.get(String(client.id)),
          googleAdsTriage: client.gadsAuto?.triageIdealCustomer,
        }),
      })),
    );
  } catch (err) {
    console.error("[optimate/clients] error:", err);
    return NextResponse.json({ error: "Failed to load OptiMate clients" }, { status: 500 });
  }
}
