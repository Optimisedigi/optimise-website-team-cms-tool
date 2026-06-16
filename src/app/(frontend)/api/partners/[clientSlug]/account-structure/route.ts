import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * GET /api/partners/[clientSlug]/account-structure
 *
 * Proxies the growth-tools service (Railway) which returns the full
 * campaign → ad group → keyword hierarchy for the given client.
 *
 * Growth Tools serves LIVE account structure for any client when given the
 * client's Google Ads customer id, so we resolve `googleAdsCustomerId` from the
 * CMS client record (matched by slug) and pass it through as `?customerId=`.
 * Clients without a customer id fall back to the Growth Tools away-digital
 * fixture (the only slug with on-disk demo data). Optional `from`/`to`
 * (`YYYY-MM-DD`) query params are forwarded to scope the date range.
 */

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> },
) {
  const { clientSlug } = await params;

  if (!GROWTH_TOOLS_URL) {
    return NextResponse.json(
      { message: "Server misconfigured: missing GROWTH_TOOLS_URL" },
      { status: 500 },
    );
  }

  // Resolve the client's Google Ads customer id (best-effort) so Growth Tools
  // can serve live data for any client, not just the away-digital fixture.
  let customerId: string | null = null;
  try {
    const payload = await getPayload({ config: await config });
    const found = await payload.find({
      collection: "clients",
      where: { slug: { equals: clientSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const raw = (found.docs[0] as { googleAdsCustomerId?: string | null } | undefined)
      ?.googleAdsCustomerId;
    const digits = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
    if (digits.length === 10) customerId = digits;
  } catch (err) {
    // Non-fatal: fall through to the slug-only (fixture) request.
    console.error(`[partner-account] client lookup failed for ${clientSlug}:`, err);
  }

  const qs = new URLSearchParams();
  if (customerId) qs.set("customerId", customerId);
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const query = qs.toString();

  const url = `${GROWTH_TOOLS_URL.replace(/\/$/, "")}/api/partners/${encodeURIComponent(clientSlug)}/account-structure${query ? `?${query}` : ""}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(INTERNAL_API_KEY ? { "x-internal-key": INTERNAL_API_KEY } : {}),
      },
      // Growth-tools data updates only when the JSON exports are refreshed,
      // so brief caching is safe and reduces Railway load.
      next: { revalidate: 60 },
    });

    const text = await upstream.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text || `Upstream returned non-JSON (HTTP ${upstream.status})` };
    }

    return NextResponse.json(body, { status: upstream.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[partner-account] proxy error for ${clientSlug}:`, msg);
    return NextResponse.json(
      { message: `Failed to reach growth-tools: ${msg}` },
      { status: 502 },
    );
  }
}
