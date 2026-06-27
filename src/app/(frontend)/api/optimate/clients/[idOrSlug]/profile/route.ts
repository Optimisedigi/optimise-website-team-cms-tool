import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import {
  buildOptimateClientProfile,
  type OptimateClientProfileFieldGroup,
} from "@/lib/optimate-client-profile";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ idOrSlug: string }>;
};

const VALID_FIELD_GROUPS = new Set<OptimateClientProfileFieldGroup>([
  "identity",
  "contact",
  "commercial",
  "tracking",
  "business",
  "goals",
  "locations",
  "contracts",
  "invoices",
  "notes",
  "timeline",
  "all",
]);

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

function isInternalApiKeyAuthorized(request: Request): boolean {
  const expected = process.env.CMS_API_KEY || process.env.AUDIT_API_KEY || "";
  const provided = extractProvidedKey(request);
  return Boolean(expected && provided && safeEqual(provided, expected));
}

function parseFields(searchParams: URLSearchParams): OptimateClientProfileFieldGroup[] | undefined {
  const rawFields = [
    ...searchParams.getAll("fields"),
    ...searchParams.getAll("field"),
  ];
  const fields = rawFields
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is OptimateClientProfileFieldGroup =>
      VALID_FIELD_GROUPS.has(value as OptimateClientProfileFieldGroup),
    );

  return fields.length > 0 ? Array.from(new Set(fields)) : undefined;
}

function parseLimit(searchParams: URLSearchParams): number | undefined {
  const rawLimit = searchParams.get("limit");
  if (!rawLimit) return undefined;

  const limit = Number(rawLimit);
  return Number.isFinite(limit) ? limit : undefined;
}

export async function GET(request: Request, { params }: RouteContext): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const hasInternalApiKey = isInternalApiKeyAuthorized(request);

    if (!hasInternalApiKey) {
      const { user } = await payload.auth({ headers: request.headers });
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!userHasFeature(user, "clients")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { idOrSlug } = await params;
    const url = new URL(request.url);
    const profile = await buildOptimateClientProfile(payload, {
      idOrSlug,
      fields: parseFields(url.searchParams),
      limit: parseLimit(url.searchParams),
    });

    if (!profile) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (err) {
    console.error("[optimate/clients/profile] error:", err);
    return NextResponse.json(
      { error: "Failed to load OptiMate client profile" },
      { status: 500 },
    );
  }
}
