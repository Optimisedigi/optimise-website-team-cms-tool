import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";
import {
  warmMonthlyWasteRelevancyForClient,
  buildMonthlyWasteRelevancyResponse,
} from "@/lib/monthly-waste-relevancy-warmer";

/**
 * Per-month waste / relevancy figures for the Progress tab's Monthly Trend
 * chart. Read-through cache pattern (mirrors avoided-spend):
 *   1. Read cache rows for client.
 *   2. Compute misses (any month not in cache, or current month older than 1h).
 *   3. If misses, fetch from Growth Tools and upsert.
 *   4. Build response from cache.
 *
 * Nightly /api/dashboard/prewarm cron keeps the cache warm so the on-demand
 * path is almost always a fresh cache hit.
 *
 * Auth: dashboard_token cookie (same pattern as the other dashboard routes).
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const clientIdParam = req.nextUrl.searchParams.get("clientId");
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const monthsBack = Math.min(
    36,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("monthsBack") || "12", 10) || 12),
  );

  if (!slug || !clientIdParam) {
    return NextResponse.json({ error: "Missing slug or clientId" }, { status: 400 });
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = parseInt(clientIdParam, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const result = await warmMonthlyWasteRelevancyForClient(
    payload,
    clientId,
    customerId,
    slug,
    monthsBack,
  );

  // If the upstream config is missing entirely, return the empty shape so
  // the dashboard falls back gracefully (matches the pre-cache behaviour).
  if (result.error === "missing upstream config" && result.cache.size === 0) {
    return NextResponse.json({ success: false, monthsBack, monthly: [] });
  }

  const built = buildMonthlyWasteRelevancyResponse(result);
  const out = NextResponse.json({
    success: !result.error,
    monthsBack: built.monthsBack,
    monthly: built.monthly,
    irrelevantTermCount: built.irrelevantTermCount,
  });
  out.headers.set("Cache-Control", "no-store");
  return out;
}
