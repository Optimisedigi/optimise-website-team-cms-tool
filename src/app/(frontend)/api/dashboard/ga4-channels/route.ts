import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";
import { fetchGa4Report, ensureValidToken } from "@/lib/ga4-service";

/**
 * GET /api/dashboard/ga4-channels?slug=X&period=30d|90d|12m
 *
 * Public, PIN-gated. Returns the GA4 channel breakdown (one row per
 * sessionDefaultChannelGroup) with conversion counts for the requested
 * period. Backs the Simple stakeholder dashboard's "Conversions by
 * Channel" card.
 *
 * Why a separate route rather than reusing /api/ga4/query: that route
 * requires an admin session. The dashboard pages are PIN-gated and
 * therefore can't reuse admin auth — we validate the dashboard_token
 * cookie instead.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const period = req.nextUrl.searchParams.get("period") || "30d";

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  // PIN-gate via the same dashboard_token cookie the other dashboard
  // routes use.
  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const result = await payload.find({
      collection: "clients",
      where: { slug: { equals: slug }, isActive: { equals: true } },
      limit: 1,
      overrideAccess: true,
    });
    const client = result.docs[0] as any;
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.ga4Connected || !client.ga4PropertyId || !client.ga4RefreshToken) {
      return NextResponse.json({ ga4Connected: false, channels: null }, { status: 200 });
    }

    // Refresh token if needed; persist the new one so we don't burn a
    // refresh on every dashboard load.
    const tokenResult = await ensureValidToken(
      client.ga4AccessToken,
      client.ga4RefreshToken,
      client.ga4TokenExpiry,
    );
    if (tokenResult.refreshed) {
      await payload.update({
        collection: "clients",
        id: client.id,
        overrideAccess: true,
        data: {
          ga4AccessToken: tokenResult.accessToken,
          ga4TokenExpiry: tokenResult.expiry,
        },
      });
    }

    // Period → start/end window. GA4 windows here are intentionally
    // short on the simple view — stakeholders want recent context, not
    // multi-year stretches.
    const now = new Date();
    const endDate = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    let startDate: string;
    if (period === "7d") {
      startDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    } else if (period === "90d") {
      startDate = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    } else if (period === "12m") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      startDate = d.toISOString().slice(0, 10);
    } else {
      startDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    }

    const report = await fetchGa4Report(
      tokenResult.accessToken,
      client.ga4PropertyId,
      startDate,
      endDate,
    );

    // Reduce to just what the simple view needs.
    const channels = report.channels
      .map((c) => ({ channel: c.channel, conversions: c.keyEvents }))
      .filter((c) => c.conversions > 0)
      .sort((a, b) => b.conversions - a.conversions);

    return NextResponse.json({
      ga4Connected: true,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      channels,
    });
  } catch (err) {
    console.error("[ga4-channels] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch GA4 channel data" },
      { status: 500 },
    );
  }
}
