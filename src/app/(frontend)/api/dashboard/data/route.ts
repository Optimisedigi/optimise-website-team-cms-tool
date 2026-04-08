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
    const params = new URLSearchParams({ range });
    if (customerId) params.set("customerId", customerId);
    if (clientName) params.set("clientName", clientName);
    if (brandKeywords) params.set("brandKeywords", brandKeywords);
    if (conversionActions) params.set("conversionActions", conversionActions);
    const url = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}?${params}`;
    const res = await fetch(url, {
      headers: { "x-internal-key": GROWTH_TOOLS_API_KEY },
      next: { revalidate: 0 },
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
    // Cache in browser for 15 min, allow stale-while-revalidate for 30 min
    response.headers.set(
      "Cache-Control",
      "private, max-age=900, stale-while-revalidate=1800",
    );
    return response;
  } catch (err) {
    console.error("[Dashboard Data]", err);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
