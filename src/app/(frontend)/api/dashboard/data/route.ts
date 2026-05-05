import { NextRequest, NextResponse } from "next/server";
import { validateDashboardToken } from "../verify/route";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const range = req.nextUrl.searchParams.get("range") || "last_month";
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const clientName = req.nextUrl.searchParams.get("clientName") || "";
  const brandKeywords = req.nextUrl.searchParams.get("brandKeywords") || "";
  const conversionActions = req.nextUrl.searchParams.get("conversionActions") || "";
  const phoneCallActions = req.nextUrl.searchParams.get("phoneCallActions") || "";
  const formSubmitActions = req.nextUrl.searchParams.get("formSubmitActions") || "";

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
    // Strip dashes from customerId — Google Ads API uses dashless format (e.g. 9554935739)
    const cleanCustomerId = customerId.replace(/-/g, "");
    const params = new URLSearchParams({ range });
    if (cleanCustomerId) params.set("customerId", cleanCustomerId);
    if (clientName) params.set("clientName", clientName);
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    if (conversionActions) params.set("conversionActions", conversionActions);
    if (phoneCallActions) params.set("phoneCallActions", phoneCallActions);
    if (formSubmitActions) params.set("formSubmitActions", formSubmitActions);
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
