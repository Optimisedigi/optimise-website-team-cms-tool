import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/partners/[clientSlug]/account-structure
 *
 * Proxies the growth-tools service (Railway) which returns the full
 * campaign → ad group → keyword hierarchy for the given client slug.
 *
 * Today only `away-digital` has data in growth-tools; other slugs return
 * the growth-tools response verbatim (typically 500 on missing fixtures).
 */

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> },
) {
  const { clientSlug } = await params;

  if (!GROWTH_TOOLS_URL) {
    return NextResponse.json(
      { message: "Server misconfigured: missing GROWTH_TOOLS_URL" },
      { status: 500 },
    );
  }

  const url = `${GROWTH_TOOLS_URL.replace(/\/$/, "")}/api/partners/${encodeURIComponent(clientSlug)}/account-structure`;

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
