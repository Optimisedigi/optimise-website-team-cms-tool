import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  fetchSearchAnalytics,
  fetchBrandedAnalytics,
  refreshAccessToken,
} from "@/lib/gsc-service";
import { google } from "googleapis";

/**
 * POST /api/gsc/query
 * Live GSC query endpoint for arbitrary date ranges.
 * Falls back to mock data when GSC is not connected (demo mode).
 *
 * Body: { clientId, startDate, endDate }
 */
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { clientId, startDate, endDate } = body;

  if (!clientId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "clientId, startDate, and endDate are required" },
      { status: 400 },
    );
  }

  const client = await payload.findByID({
    collection: "clients",
    id: clientId,
    overrideAccess: true,
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const brandTerms = ((client as any).brandKeywords || "")
    .split(",")
    .map((t: string) => t.trim())
    .filter(Boolean);

  // If GSC is live-connected, use real API (with stored data hybrid)
  if (
    client.gscConnected &&
    (client as any).gscAccessToken &&
    (client as any).gscPropertyUrl
  ) {
    try {
      return await fetchLiveData(client as any, startDate, endDate, brandTerms, payload);
    } catch (err) {
      console.error("[gsc/query] Live fetch failed, falling back to mock:", err);
    }
  }

  // Demo mode — generate mock data from stored snapshots
  return generateMockData(payload, clientId, startDate, endDate, brandTerms);
}

// ── Live GSC data fetch ──────────────────────────────────

async function fetchLiveData(
  client: any,
  startDate: string,
  endDate: string,
  brandTerms: string[],
  payload: any,
) {
  let accessToken = client.gscAccessToken;
  const siteUrl = client.gscPropertyUrl;

  // Refresh token if needed
  if (client.gscTokenExpiry && new Date(client.gscTokenExpiry) < new Date()) {
    const refreshed = await refreshAccessToken(client.gscRefreshToken);
    accessToken = refreshed.accessToken;
  }

  // Determine which date ranges can use stored data vs live API
  // GSC data finalises ~3 days after, so anything before cutoff is stable
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let storedDaily: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }> = [];
  let liveStartDate = startDate;

  // Try to use stored daily data for the stable portion
  if (startDate < cutoffStr) {
    const storedEnd = endDate <= cutoffStr ? endDate : cutoffStr;
    const storedRows = await payload.find({
      collection: "gsc-daily",
      where: {
        and: [
          { client: { equals: client.id } },
          { date: { greater_than_equal: startDate } },
          { date: { less_than_equal: storedEnd } },
        ],
      },
      limit: 600,
      sort: "date",
      overrideAccess: true,
    });

    // Use stored data if we have reasonable coverage (at least 50% of expected days)
    const expectedDays = Math.round(
      (new Date(storedEnd).getTime() - new Date(startDate).getTime()) / 86400000
    );
    if (storedRows.totalDocs >= expectedDays * 0.5 && storedRows.totalDocs > 0) {
      storedDaily = storedRows.docs.map((row: any) => ({
        date: row.date,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr || 0,
        position: row.position || 0,
      }));
      // Only fetch live data for the recent portion
      if (endDate > cutoffStr) {
        liveStartDate = cutoffStr;
      } else {
        liveStartDate = ""; // all covered by stored data
      }
    }
  }

  // Build parallel fetches - always need summary/keywords/pages/brand from live API
  const fetchPromises: Promise<any>[] = [
    fetchSearchAnalytics(accessToken, siteUrl, startDate, endDate),
    fetchBrandedAnalytics(accessToken, siteUrl, startDate, endDate, brandTerms),
    fetchDailyFiltered(accessToken, siteUrl, startDate, endDate, brandTerms, "brand"),
    fetchDailyFiltered(accessToken, siteUrl, startDate, endDate, brandTerms, "generic"),
  ];

  // Only fetch live daily data if we need it
  if (liveStartDate && liveStartDate < endDate) {
    fetchPromises.push(fetchDailyData(accessToken, siteUrl, liveStartDate, endDate));
  } else if (!storedDaily.length) {
    // No stored data and no live range - fetch everything live
    fetchPromises.push(fetchDailyData(accessToken, siteUrl, startDate, endDate));
  }

  const results = await Promise.all(fetchPromises);
  const [analytics, branded, dailyBrandData, dailyGenericData] = results;
  const liveDailyData = results[4] || [];

  // Merge stored + live daily data
  let dailyData: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>;
  if (storedDaily.length && liveDailyData.length) {
    // Merge: stored data first, then live data for dates not in stored
    const storedDates = new Set(storedDaily.map((d: any) => d.date));
    const liveOnly = liveDailyData.filter((d: any) => !storedDates.has(d.date));
    dailyData = [...storedDaily, ...liveOnly].sort(
      (a: any, b: any) => a.date.localeCompare(b.date)
    );
  } else if (storedDaily.length) {
    dailyData = storedDaily;
  } else {
    dailyData = liveDailyData;
  }

  return NextResponse.json({
    brandTerms,
    summary: {
      totalClicks: analytics.totalClicks,
      totalImpressions: analytics.totalImpressions,
      avgCtr: analytics.avgCtr,
      avgPosition: analytics.avgPosition,
    },
    topKeywords: analytics.topKeywords,
    topPages: analytics.topPages,
    brandedData: branded.brand
      ? { ...branded.brand, keywordCount: 0 }
      : null,
    nonBrandedData: branded.nonBrand
      ? { ...branded.nonBrand, keywordCount: 0 }
      : null,
    daily: dailyData,
    dailyBrand: dailyBrandData,
    dailyGeneric: dailyGenericData,
  });
}

async function fetchDailyData(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: ["date"] },
  });

  return (res.data.rows || []).map((row) => ({
    date: row.keys?.[0] || "",
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: Math.round((row.ctr || 0) * 10000) / 100,
    position: Math.round((row.position || 0) * 10) / 10,
  }));
}

async function fetchDailyFiltered(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  brandTerms: string[],
  type: "brand" | "generic",
) {
  if (!brandTerms.length) return [];

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  const filters =
    type === "brand"
      ? brandTerms.map((t) => ({
          dimension: "query" as const,
          operator: "contains" as const,
          expression: t.toLowerCase(),
        }))
      : brandTerms.map((t) => ({
          dimension: "query" as const,
          operator: "notContains" as const,
          expression: t.toLowerCase(),
        }));

  const groupType = type === "brand" ? "or" : "and";

  try {
    const res = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["date"],
        dimensionFilterGroups: [{ groupType, filters }],
      },
    });

    return (res.data.rows || []).map((row) => ({
      date: row.keys?.[0] || "",
      clicks: row.clicks || 0,
    }));
  } catch {
    return [];
  }
}

// ── Mock data generation (demo mode) ────────────────────

async function generateMockData(
  payload: any,
  clientId: string,
  startDate: string,
  endDate: string,
  brandTerms: string[],
) {
  // Load stored snapshots for this client
  const snapshots = await payload.find({
    collection: "gsc-snapshots",
    where: { client: { equals: clientId } },
    sort: "-snapshotDate",
    limit: 20,
    overrideAccess: true,
  });

  const latest = snapshots.docs[0];
  if (!latest) {
    return NextResponse.json({
      brandTerms,
      summary: { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0 },
      topKeywords: [],
      topPages: [],
      brandedData: null,
      nonBrandedData: null,
      daily: [],
      dailyBrand: [],
      dailyGeneric: [],
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));

  // Scale totals based on date range (snapshot is ~28 days)
  const scaleFactor = dayCount / 28;
  const totalClicks = Math.round((latest.totalClicks || 0) * scaleFactor);
  const totalImpressions = Math.round((latest.totalImpressions || 0) * scaleFactor);

  // Generate daily data by distributing totals across days with random variation
  const daily: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }> = [];
  const dailyBrand: Array<{ date: string; clicks: number }> = [];
  const dailyGeneric: Array<{ date: string; clicks: number }> = [];

  let remainingClicks = totalClicks;
  let remainingImpressions = totalImpressions;

  for (let d = 0; d < dayCount; d++) {
    const dayDate = new Date(start);
    dayDate.setDate(dayDate.getDate() + d);
    const dateStr = dayDate.toISOString().slice(0, 10);

    const isLast = d === dayCount - 1;
    // Vary by day of week (weekdays higher)
    const dow = dayDate.getDay();
    const dowFactor = dow === 0 || dow === 6 ? 0.6 : 1.1;
    const noise = 0.8 + Math.random() * 0.4;
    const weight = dowFactor * noise;

    const dayClicks = isLast ? remainingClicks : Math.round((totalClicks / dayCount) * weight);
    const dayImpressions = isLast ? remainingImpressions : Math.round((totalImpressions / dayCount) * weight);

    remainingClicks -= dayClicks;
    remainingImpressions -= dayImpressions;

    const dayCtr = dayImpressions > 0 ? Math.round((dayClicks / dayImpressions) * 10000) / 100 : 0;
    const dayPosition = Math.round(((latest.avgPosition || 14) + (Math.random() - 0.5) * 2) * 10) / 10;

    daily.push({ date: dateStr, clicks: dayClicks, impressions: dayImpressions, ctr: dayCtr, position: dayPosition });

    // Brand ~22% of clicks, generic ~78%
    const brandClicks = Math.round(dayClicks * 0.22);
    dailyBrand.push({ date: dateStr, clicks: brandClicks });
    dailyGeneric.push({ date: dateStr, clicks: dayClicks - brandClicks });
  }

  // Brand/non-brand totals
  const brandTotalClicks = Math.round(totalClicks * 0.22);
  const brandTotalImpressions = Math.round(totalImpressions * 0.14);

  return NextResponse.json({
    brandTerms,
    summary: {
      totalClicks,
      totalImpressions,
      avgCtr: latest.avgCtr || 0,
      avgPosition: latest.avgPosition || 0,
    },
    topKeywords: latest.topKeywords || [],
    topPages: latest.topPages || [],
    brandedData: {
      clicks: brandTotalClicks,
      impressions: brandTotalImpressions,
      ctr: brandTotalImpressions > 0 ? Math.round((brandTotalClicks / brandTotalImpressions) * 10000) / 100 : 0,
      position: 2.3,
      keywordCount: 5,
    },
    nonBrandedData: {
      clicks: totalClicks - brandTotalClicks,
      impressions: totalImpressions - brandTotalImpressions,
      ctr: (totalImpressions - brandTotalImpressions) > 0
        ? Math.round(((totalClicks - brandTotalClicks) / (totalImpressions - brandTotalImpressions)) * 10000) / 100
        : 0,
      position: latest.avgPosition || 14,
      keywordCount: ((latest.topKeywords as any[]) || []).filter((k: any) => k.clicks > 0).length,
    },
    daily,
    dailyBrand,
    dailyGeneric,
  });
}
