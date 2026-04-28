import { NextRequest, NextResponse } from "next/server";
import { validateDashboardToken } from "../verify/route";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const range = req.nextUrl.searchParams.get("range") || "";

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }

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
    // Strip dashes from customerId — Google Ads API uses dashless format
    const cleanCustomerId = customerId.replace(/-/g, "");
    const params = new URLSearchParams({ customerId: cleanCustomerId });
    if (range) params.set("range", range);
    const url = `${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${encodeURIComponent(slug)}/quality-scores?${params}`;
    const res = await fetch(url, {
      headers: { "x-internal-key": GROWTH_TOOLS_API_KEY },
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      const text = await res.text();
      console.error("[Dashboard Quality Scores] Growth Tools error:", res.status, text.slice(0, 200));
      return NextResponse.json(
        { error: `Growth Tools returned ${res.status}` },
        { status: res.status }
      );
    }

    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error("[Dashboard Quality Scores] Non-JSON response:", contentType, text.slice(0, 200));
      return NextResponse.json(
        { error: "Growth Tools returned non-JSON response" },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Dashboard Quality Scores] Exception:", err);
    return NextResponse.json(
      { error: "Failed to fetch quality score data" },
      { status: 500 }
    );
  }
}
