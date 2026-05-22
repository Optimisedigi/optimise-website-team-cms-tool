import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import configPromise from "@/payload.config";

/**
 * GET /api/client/[slug]/google-ads/account-structure?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Resolves the client by slug via Payload, then proxies the growth-tools
 * service endpoint:
 *   GET ${GROWTH_TOOLS_URL}/api/google-ads/account-structure/:customerId?from=&to=
 *
 * Returns the upstream JSON + status verbatim. Mirrors the proxy pattern in
 * `/api/partners/[clientSlug]/account-structure/route.ts` and the client
 * lookup pattern in `src/app/(frontend)/google-dashboard/[slug]/page.tsx`.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // ── Validate query params ────────────────────────────────────────────────
  const fromRaw = req.nextUrl.searchParams.get("from");
  const toRaw = req.nextUrl.searchParams.get("to");
  if (fromRaw !== null && !ISO_DATE_RE.test(fromRaw)) {
    return NextResponse.json(
      { message: "Invalid 'from' — expected YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (toRaw !== null && !ISO_DATE_RE.test(toRaw)) {
    return NextResponse.json(
      { message: "Invalid 'to' — expected YYYY-MM-DD" },
      { status: 400 },
    );
  }

  // ── Env config ───────────────────────────────────────────────────────────
  const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      {
        message: `Server misconfigured: missing ${!GROWTH_TOOLS_URL ? "GROWTH_TOOLS_URL" : ""}${
          !GROWTH_TOOLS_URL && !INTERNAL_API_KEY ? " and " : ""
        }${!INTERNAL_API_KEY ? "INTERNAL_API_KEY" : ""}`,
      },
      { status: 500 },
    );
  }

  // ── Resolve client by slug ───────────────────────────────────────────────
  const payload = await getPayload({ config: configPromise });
  const result = await payload.find({
    collection: "clients",
    where: {
      slug: { equals: slug },
      isActive: { equals: true },
    },
    limit: 1,
    overrideAccess: true,
    select: {
      id: true,
      name: true,
      googleAdsCustomerId: true,
    },
  });

  const client = result.docs[0] as
    | { id: string | number; name?: string; googleAdsCustomerId?: string }
    | undefined;
  if (!client) {
    return NextResponse.json(
      { message: `No active client found for slug "${slug}"` },
      { status: 404 },
    );
  }
  if (!client.googleAdsCustomerId) {
    return NextResponse.json(
      { message: `Client "${slug}" has no Google Ads Customer ID configured` },
      { status: 404 },
    );
  }

  // Strip dashes — Google Ads API uses dashless 10-digit format.
  const cleanCid = client.googleAdsCustomerId.replace(/[-\s]/g, "");

  // Forward from/to verbatim only when provided.
  const forwardParams = new URLSearchParams();
  if (fromRaw) forwardParams.set("from", fromRaw);
  if (toRaw) forwardParams.set("to", toRaw);
  const qs = forwardParams.toString();
  const upstreamUrl = `${GROWTH_TOOLS_URL.replace(/\/$/, "")}/api/google-ads/account-structure/${cleanCid}${
    qs ? `?${qs}` : ""
  }`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      cache: "no-store",
    });

    const text = await upstream.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = {
        message:
          text || `Upstream returned non-JSON (HTTP ${upstream.status})`,
      };
    }

    return NextResponse.json(body, { status: upstream.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[client-account-structure] proxy error for ${slug} (${cleanCid}):`,
      msg,
    );
    return NextResponse.json(
      { message: `Failed to reach growth-tools: ${msg}` },
      { status: 502 },
    );
  }
}
