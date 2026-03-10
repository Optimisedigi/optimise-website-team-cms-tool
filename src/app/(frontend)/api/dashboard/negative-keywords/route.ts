import { NextRequest, NextResponse } from "next/server";
import { validateDashboardToken } from "../verify/route";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, customerId, keywords } = body;

  if (!slug || !customerId || !Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json(
      { error: "Missing slug, customerId, or keywords" },
      { status: 400 },
    );
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY) {
    return NextResponse.json(
      { error: "Dashboard service not configured" },
      { status: 503 },
    );
  }

  try {
    const url = `${GROWTH_TOOLS_URL}/api/google-ads/negative-sweep/apply`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": GROWTH_TOOLS_API_KEY,
      },
      body: JSON.stringify({ customerId, keywords }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Growth Tools returned ${res.status}: ${text}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[Dashboard Negative Keywords]", err);
    return NextResponse.json(
      { error: "Failed to apply negative keywords" },
      { status: 500 },
    );
  }
}
