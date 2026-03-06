import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
      { status: 500 }
    );
  }

  let client: any;
  try {
    client = await payload.findByID({
      collection: "clients",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const customerId = client.googleAdsCustomerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "Client has no Google Ads Customer ID" },
      { status: 400 }
    );
  }

  // Accept optional year/month from request body, default to previous month
  let year: number;
  let month: number;
  try {
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    year = body.year ?? prevMonth.getFullYear();
    month = body.month ?? prevMonth.getMonth() + 1;
  } catch {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    year = prevMonth.getFullYear();
    month = prevMonth.getMonth() + 1;
  }

  try {
    const response = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/performance-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        customerId: customerId.replace(/-/g, ""),
        clientName: client.name || undefined,
        year,
        month,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Growth Tools returned ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e: any) {
    console.error(`[PerformanceReport] Failed for client ${id}:`, e.message);
    return NextResponse.json(
      { error: e.message || "Failed to generate performance report" },
      { status: 500 }
    );
  }
}
