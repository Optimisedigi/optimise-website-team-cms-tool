import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { normalizeDashboardRange } from "@/lib/dashboard-date-ranges";
import { isAwayDigitalSlug } from "@/lib/away-digital";
import { validateDashboardToken } from "../verify/route";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;
const CACHE_TTL_MS = 15 * 60 * 1000;

type CachedPostClickResponse = {
  expiresAt: number;
  data: unknown;
};

const postClickCache = new Map<string, CachedPostClickResponse>();

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const range = req.nextUrl.searchParams.get("range") || "this_month";
  const clientName = req.nextUrl.searchParams.get("clientName") || "Away Digital Teams";
  const conversionActions = req.nextUrl.searchParams.get("conversionActions") || "";

  if (!isAwayDigitalSlug(slug)) {
    return NextResponse.json({ error: "HubSpot post-click dashboard is only available for Away Digital Teams" }, { status: 404 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    // Same two ways in as the landing report: the client's dashboard token, or
    // an authenticated Payload admin session for the internal dashboard. Read
    // only either way — this route never writes to HubSpot.
    const payloadForAuth = await getPayload({ config });
    const { user } = await payloadForAuth.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // `customerId` arrives from the query string, so it is caller-controlled and
  // cannot be trusted to name the caller's own account. Bind it to the client
  // record this slug resolves to: without this, anyone holding a valid token for
  // their own dashboard could pass another client's customer id and read that
  // account's lead PII. Slugs get reassigned between clients — the Google Ads
  // account is the identity that has to match.
  const payloadForClient = await getPayload({ config });
  const clientLookup = await payloadForClient.find({
    collection: "clients",
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
  });
  const ownCustomerId = String((clientLookup.docs[0] as { googleAdsCustomerId?: string } | undefined)?.googleAdsCustomerId || "").replace(/-/g, "");
  if (!ownCustomerId || ownCustomerId !== customerId.replace(/-/g, "")) {
    return NextResponse.json({ error: "Customer id does not belong to this client" }, { status: 403 });
  }

  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY) {
    return NextResponse.json({ error: "Dashboard service not configured" }, { status: 503 });
  }

  try {
    const normalizedRange = normalizeDashboardRange(range);
    const params = new URLSearchParams({
      customerId: customerId.replace(/-/g, ""),
      range: normalizedRange,
      clientName,
    });
    if (conversionActions) params.set("conversionActions", conversionActions);

    const cacheKey = JSON.stringify({ slug, customerId: customerId.replace(/-/g, ""), range: normalizedRange, clientName, conversionActions });
    const cached = postClickCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data, {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=900",
          "X-Post-Click-Cache": "HIT",
        },
      });
    }

    const url = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}/hubspot-post-click?${params}`;
    const res = await fetch(url, {
      headers: { "x-internal-key": GROWTH_TOOLS_API_KEY },
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[HubSpot Post-Click Dashboard] Growth Tools error:", res.status, text.slice(0, 200));
      return NextResponse.json({ error: `Growth Tools returned ${res.status}` }, { status: res.status });
    }

    if (!contentType.includes("application/json")) {
      const text = await res.text().catch(() => "");
      console.error("[HubSpot Post-Click Dashboard] Non-JSON response:", contentType, text.slice(0, 200));
      return NextResponse.json({ error: "Growth Tools returned non-JSON response" }, { status: 502 });
    }

    const data = await res.json();
    postClickCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=900",
        "X-Post-Click-Cache": "MISS",
      },
    });
  } catch (err) {
    console.error("[HubSpot Post-Click Dashboard] Exception:", err);
    return NextResponse.json({ error: "Failed to fetch HubSpot post-click dashboard" }, { status: 500 });
  }
}
