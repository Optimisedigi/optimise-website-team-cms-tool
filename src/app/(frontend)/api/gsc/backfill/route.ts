import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  refreshAccessToken,
  fetchSearchAnalytics,
  fetchBrandedAnalytics,
} from "@/lib/gsc-service";

/**
 * Backfill a specific calendar month of GSC data for a client.
 * POST /api/gsc/backfill  { clientId, year, month }
 *
 * month is 1-indexed (1 = January, 12 = December)
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, year, month } = await req.json();
  if (!clientId || !year || !month) {
    return NextResponse.json(
      { error: "clientId, year, and month are required" },
      { status: 400 },
    );
  }

  // Build date range for the full calendar month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of the month
  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  const client = await payload.findByID({
    collection: "clients",
    id: clientId,
    overrideAccess: true,
  });

  if (!client || !client.gscConnected) {
    return NextResponse.json({ error: "Client not found or GSC not connected" }, { status: 404 });
  }

  let accessToken = client.gscAccessToken as string;
  const refreshToken = client.gscRefreshToken as string;
  const siteUrl = client.gscPropertyUrl as string;

  if (!accessToken || !refreshToken || !siteUrl) {
    return NextResponse.json({ error: "Missing GSC credentials" }, { status: 400 });
  }

  // Refresh token if needed
  const tokenExpiry = client.gscTokenExpiry ? new Date(client.gscTokenExpiry as string) : null;
  if (!tokenExpiry || tokenExpiry <= new Date()) {
    const refreshed = await refreshAccessToken(refreshToken);
    accessToken = refreshed.accessToken;
    await payload.update({
      collection: "clients",
      id: client.id,
      overrideAccess: true,
      data: {
        gscAccessToken: refreshed.accessToken,
        gscTokenExpiry: refreshed.expiry,
      },
    });
  }

  // Check if a snapshot already exists for this month
  const existing = await payload.find({
    collection: "gsc-snapshots",
    where: {
      client: { equals: client.id },
      periodEnd: { greater_than_equal: formatDate(startDate) },
      periodStart: { less_than_equal: formatDate(endDate) },
    },
    limit: 1,
    overrideAccess: true,
  });

  // Parse brand keywords
  const brandTerms = ((client.brandKeywords as string) || "")
    .split(",")
    .map((t: string) => t.trim())
    .filter(Boolean);

  // Fetch GSC data for the calendar month
  const [searchData, brandedAnalytics] = await Promise.all([
    fetchSearchAnalytics(accessToken, siteUrl, formatDate(startDate), formatDate(endDate)),
    fetchBrandedAnalytics(accessToken, siteUrl, formatDate(startDate), formatDate(endDate), brandTerms),
  ]);

  const monthLabel = startDate.toLocaleString("en-AU", { month: "long", year: "numeric" });

  // Create snapshot
  const snapshot = await payload.create({
    collection: "gsc-snapshots",
    overrideAccess: true,
    data: {
      client: client.id,
      snapshotDate: new Date(year, month - 1, 15).toISOString(), // Mid-month
      periodStart: formatDate(startDate),
      periodEnd: formatDate(endDate),
      totalClicks: searchData.totalClicks,
      totalImpressions: searchData.totalImpressions,
      avgCtr: searchData.avgCtr,
      avgPosition: searchData.avgPosition,
      topKeywords: searchData.topKeywords,
      topPages: searchData.topPages,
      brandedData: brandedAnalytics.brand,
      nonBrandedData: brandedAnalytics.nonBrand,
      clicksChange: 0,
      impressionsChange: 0,
      positionChange: 0,
    },
  });

  return NextResponse.json({
    ok: true,
    month: monthLabel,
    snapshotId: snapshot.id,
    clicks: searchData.totalClicks,
    impressions: searchData.totalImpressions,
    replaced: existing.docs.length > 0,
  });
}
