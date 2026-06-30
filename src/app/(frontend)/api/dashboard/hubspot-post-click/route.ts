import { NextRequest, NextResponse } from "next/server";
import { normalizeDashboardRange } from "@/lib/dashboard-date-ranges";
import { validateDashboardToken } from "../verify/route";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const range = req.nextUrl.searchParams.get("range") || "this_month";
  const clientName = req.nextUrl.searchParams.get("clientName") || "Away Digital Teams";
  const conversionActions = req.nextUrl.searchParams.get("conversionActions") || "";

  if (slug !== "away-digital") {
    return NextResponse.json({ error: "HubSpot post-click dashboard is only available for Away Digital Teams" }, { status: 404 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY) {
    return NextResponse.json({ error: "Dashboard service not configured" }, { status: 503 });
  }

  try {
    const params = new URLSearchParams({
      customerId: customerId.replace(/-/g, ""),
      range: normalizeDashboardRange(range),
      clientName,
    });
    if (conversionActions) params.set("conversionActions", conversionActions);
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
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[HubSpot Post-Click Dashboard] Exception:", err);
    return NextResponse.json({ error: "Failed to fetch HubSpot post-click dashboard" }, { status: 500 });
  }
}
