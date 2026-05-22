import { NextRequest, NextResponse } from "next/server";
import { validateDashboardToken } from "../verify/route";

/**
 * Dashboard data proxy.
 *
 * The Growth Tools `/api/google-ads/dashboard/:slug` endpoint speaks the CMS
 * dashboard's own range vocabulary natively: snake_case preset slugs
 * (`this_month`, `last_month`, `last_30_days`, `last_60_days`, `last_3_months`,
 * `last_6_months`, `this_year`, `last_year`, `all_time`) plus a literal
 * `custom:YYYY-MM-DD,YYYY-MM-DD` span. See Growth Tools' `parseCustomRange` /
 * `dashboardRangeToGaql` in server/routes.ts.
 *
 * This route forwards the user's `range` query-string param through verbatim
 * — NO normalisation, NO uppercasing, NO conversion to the agent-side
 * resolver's vocabulary (which uses uppercase enums and `YYYY-MM-DD..YYYY-MM-DD`
 * with two dots). It only validates the shape and falls back to `last_month`
 * (the route's documented default) for unrecognised input, so malformed values
 * never reach Growth Tools.
 */

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

const DEFAULT_RANGE = "last_month";

const VALID_PRESETS = new Set<string>([
  "this_month",
  "last_month",
  "last_30_days",
  "last_60_days",
  "last_3_months",
  "last_6_months",
  "this_year",
  "last_year",
  "all_time",
]);

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a CMS dashboard range string. Accepts the known preset slugs and
 * `custom:YYYY-MM-DD,YYYY-MM-DD` where both dates are well-formed ISO dates
 * and `end >= start`. Returns `DEFAULT_RANGE` for anything else, matching the
 * existing fallback behaviour on the empty path.
 */
function validateRange(raw: string): string {
  if (!raw) return DEFAULT_RANGE;
  if (VALID_PRESETS.has(raw)) return raw;
  if (raw.startsWith("custom:")) {
    const body = raw.slice("custom:".length);
    const parts = body.split(",");
    if (parts.length !== 2) return DEFAULT_RANGE;
    const start = parts[0].trim();
    const end = parts[1].trim();
    if (!YMD.test(start) || !YMD.test(end)) return DEFAULT_RANGE;
    // Ensure the dates actually parse (rejects things like 2026-13-40).
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return DEFAULT_RANGE;
    if (end < start) return DEFAULT_RANGE;
    return `custom:${start},${end}`;
  }
  return DEFAULT_RANGE;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const rawRange = req.nextUrl.searchParams.get("range") || DEFAULT_RANGE;
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const clientName = req.nextUrl.searchParams.get("clientName") || "";
  const brandKeywords = req.nextUrl.searchParams.get("brandKeywords") || "";
  const conversionActions = req.nextUrl.searchParams.get("conversionActions") || "";
  const phoneCallActions = req.nextUrl.searchParams.get("phoneCallActions") || "";
  const formSubmitActions = req.nextUrl.searchParams.get("formSubmitActions") || "";
  const conversionActionCategories = req.nextUrl.searchParams.get("conversionActionCategories") || "";

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  // Verify dashboard session
  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY) {
    return NextResponse.json(
      { error: "Dashboard service not configured" },
      { status: 503 }
    );
  }

  try {
    // Forward the CMS range vocabulary through verbatim to Growth Tools'
    // `dashboardRangeToGaql`. Only validate shape; do NOT translate.
    const range = validateRange(rawRange);

    // Strip dashes from customerId — Google Ads API uses dashless format (e.g. 9554935739)
    const cleanCustomerId = customerId.replace(/-/g, "");
    const params = new URLSearchParams({ range });
    if (cleanCustomerId) params.set("customerId", cleanCustomerId);
    if (clientName) params.set("clientName", clientName);
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    if (conversionActions) params.set("conversionActions", conversionActions);
    if (phoneCallActions) params.set("phoneCallActions", phoneCallActions);
    if (formSubmitActions) params.set("formSubmitActions", formSubmitActions);
    if (conversionActionCategories) params.set("conversionActionCategories", conversionActionCategories);
    const url = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}?${params}`;
    const res = await fetch(url, {
      headers: { "x-internal-key": GROWTH_TOOLS_API_KEY },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Growth Tools returned ${res.status}: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const response = NextResponse.json(data);
    // No browser caching — always fetch fresh data from Growth Tools
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err) {
    console.error("[Dashboard Data]", err);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
