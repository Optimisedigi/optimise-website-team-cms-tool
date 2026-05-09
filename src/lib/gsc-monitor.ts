import { getPayload } from "payload";
import config from "@/payload.config";
import { google } from "googleapis";
import {
  refreshAccessToken,
  fetchSearchAnalytics,
  fetchBrandedAnalytics,
  fetchIndexingStatus,
  fetchSitemaps,
  fetchCoreWebVitals,
  compareSnapshots,
  type AlertData,
} from "./gsc-service";
import { parseBrandTerms } from "./brand-terms";

export interface MonitorResult {
  clientId: string;
  clientName: string;
  snapshotId: string;
  alerts: AlertData[];
  error?: string;
}

/**
 * Run GSC monitoring for a single client or all connected clients.
 * Returns a summary of snapshots created and alerts generated.
 */
export async function runGscMonitor(
  singleClientId?: string
): Promise<MonitorResult[]> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Find connected clients
  const where: any = { gscConnected: { equals: true } };
  if (singleClientId) {
    where.id = { equals: singleClientId };
  }

  const clientsResult = await payload.find({
    collection: "clients",
    where,
    limit: 100,
    overrideAccess: true,
  });

  const results: MonitorResult[] = [];

  for (const client of clientsResult.docs) {
    try {
      const result = await monitorClient(payload, client);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[gsc-monitor] Error for client ${client.name}:`, message);
      results.push({
        clientId: String(client.id),
        clientName: client.name,
        snapshotId: "",
        alerts: [],
        error: message,
      });
    }
  }

  return results;
}

/** Get the first day of a month as YYYY-MM-DD */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Get the last day of a month as YYYY-MM-DD */
function monthEnd(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Build list of { year, month } objects going back N months from today */
function getMonthsBack(count: number): Array<{ year: number; month: number }> {
  const now = new Date();
  const months: Array<{ year: number; month: number }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

async function monitorClient(
  payload: any,
  client: any
): Promise<MonitorResult> {
  let accessToken = client.gscAccessToken;
  const refreshToken = client.gscRefreshToken;
  const siteUrl = client.gscPropertyUrl;

  if (!accessToken || !refreshToken || !siteUrl) {
    throw new Error("Missing GSC credentials or property URL");
  }

  // Refresh token if expired
  const tokenExpiry = client.gscTokenExpiry
    ? new Date(client.gscTokenExpiry)
    : null;
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

  // Check how many calendar-month snapshots exist (periodStart ending in "-01").
  // Old rolling 28-day snapshots won't match, so existing clients that haven't
  // been backfilled yet will correctly trigger the historical pull.
  const calendarSnapshots = await payload.find({
    collection: "gsc-snapshots",
    where: {
      client: { equals: client.id },
      periodStart: { like: "%-01" },
    },
    limit: 0,
    overrideAccess: true,
  });

  const needsBackfill = calendarSnapshots.totalDocs < 3;

  // Normal sync: current + previous month. Backfill: up to 16 months.
  // Once backfilled (3+ calendar snapshots), only syncs 2 recent months.
  const monthsToSync = needsBackfill ? getMonthsBack(16) : getMonthsBack(2);

  // Parse brand keywords from client (canonical: clients.brandKeywords)
  const brandTerms = parseBrandTerms(client.brandKeywords);

  let latestSnapshotId = "";
  let allAlerts: AlertData[] = [];

  for (const { year, month } of monthsToSync) {
    const periodStart = monthStart(year, month);
    const periodEnd = monthEnd(year, month);

    // Determine if this is a "recent" month (current or previous) → full snapshot
    const now = new Date();
    const currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const prevMonth = (() => {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    })();
    const isRecent =
      (year === currentMonth.year && month === currentMonth.month) ||
      (year === prevMonth.year && month === prevMonth.month);

    // Check for existing snapshot for this month (dedup)
    const existing = await payload.find({
      collection: "gsc-snapshots",
      where: {
        client: { equals: client.id },
        periodStart: { equals: periodStart },
        periodEnd: { equals: periodEnd },
      },
      limit: 1,
      overrideAccess: true,
    });

    const existingDoc = existing.docs[0] || null;

    // For historical months that already have a snapshot, skip re-pulling
    if (!isRecent && existingDoc) {
      continue;
    }

    // Fetch search analytics (always needed)
    const searchData = await fetchSearchAnalytics(
      accessToken,
      siteUrl,
      periodStart,
      periodEnd
    );

    let snapshotData: any = {
      client: client.id,
      snapshotDate: new Date().toISOString(),
      periodStart,
      periodEnd,
      totalClicks: searchData.totalClicks,
      totalImpressions: searchData.totalImpressions,
      avgCtr: searchData.avgCtr,
      avgPosition: searchData.avgPosition,
      topKeywords: searchData.topKeywords,
      topPages: searchData.topPages,
    };

    // Full snapshot for recent months: include CWV, indexing, sitemaps, branded data
    if (isRecent) {
      const [indexingData, sitemapData, cwvData, brandedAnalytics] =
        await Promise.all([
          fetchIndexingStatus(accessToken, siteUrl),
          fetchSitemaps(accessToken, siteUrl),
          fetchCoreWebVitals(accessToken, siteUrl),
          fetchBrandedAnalytics(
            accessToken,
            siteUrl,
            periodStart,
            periodEnd,
            brandTerms
          ),
        ]);

      snapshotData = {
        ...snapshotData,
        brandedData: brandedAnalytics.brand,
        nonBrandedData: brandedAnalytics.nonBrand,
        indexedPages: indexingData.indexedPages,
        notIndexedPages: indexingData.notIndexedPages,
        indexingIssues: indexingData.indexingIssues,
        sitemaps: sitemapData,
        cwvMobile: cwvData.cwvMobile,
        cwvDesktop: cwvData.cwvDesktop,
      };

      // Find previous month snapshot for comparison
      const prevMonthDate = new Date(year, month - 2, 1);
      const prevPeriodStart = monthStart(
        prevMonthDate.getFullYear(),
        prevMonthDate.getMonth() + 1
      );
      const prevPeriodEnd = monthEnd(
        prevMonthDate.getFullYear(),
        prevMonthDate.getMonth() + 1
      );

      const prevSnapshots = await payload.find({
        collection: "gsc-snapshots",
        where: {
          client: { equals: client.id },
          periodStart: { equals: prevPeriodStart },
          periodEnd: { equals: prevPeriodEnd },
        },
        limit: 1,
        overrideAccess: true,
      });

      const previousSnapshot = prevSnapshots.docs[0] || null;

      // Calculate comparison percentages
      let clicksChange = 0;
      let impressionsChange = 0;
      let positionChange = 0;

      if (previousSnapshot) {
        if (previousSnapshot.totalClicks > 0) {
          clicksChange = Math.round(
            ((searchData.totalClicks - previousSnapshot.totalClicks) /
              previousSnapshot.totalClicks) *
              100
          );
        }
        if (previousSnapshot.totalImpressions > 0) {
          impressionsChange = Math.round(
            ((searchData.totalImpressions -
              previousSnapshot.totalImpressions) /
              previousSnapshot.totalImpressions) *
              100
          );
        }
        positionChange = Math.round(
          ((searchData.avgPosition - (previousSnapshot.avgPosition || 0)) *
            10) /
            10
        );
      }

      snapshotData.clicksChange = clicksChange;
      snapshotData.impressionsChange = impressionsChange;
      snapshotData.positionChange = positionChange;
      snapshotData.previousSnapshot = previousSnapshot?.id || null;

      // Generate alerts only for the most recent month (current month)
      if (year === currentMonth.year && month === currentMonth.month && previousSnapshot) {
        const alerts = compareSnapshots(
          {
            totalClicks: searchData.totalClicks,
            totalImpressions: searchData.totalImpressions,
            avgCtr: searchData.avgCtr,
            avgPosition: searchData.avgPosition,
            indexedPages: indexingData.indexedPages,
            notIndexedPages: indexingData.notIndexedPages,
            cwvMobile: cwvData.cwvMobile,
            cwvDesktop: cwvData.cwvDesktop,
          },
          {
            totalClicks: previousSnapshot.totalClicks || 0,
            totalImpressions: previousSnapshot.totalImpressions || 0,
            avgCtr: previousSnapshot.avgCtr || 0,
            avgPosition: previousSnapshot.avgPosition || 0,
            indexedPages: previousSnapshot.indexedPages || 0,
            notIndexedPages: previousSnapshot.notIndexedPages || 0,
            cwvMobile: previousSnapshot.cwvMobile,
            cwvDesktop: previousSnapshot.cwvDesktop,
          }
        );

        // Check sitemaps for errors
        for (const sitemap of sitemapData) {
          if (sitemap.errors > 0) {
            alerts.push({
              severity: "warning",
              category: "sitemap",
              title: `Sitemap has ${sitemap.errors} error(s)`,
              description: `Sitemap ${sitemap.url} has ${sitemap.errors} error(s) and ${sitemap.warnings} warning(s).`,
              recommendation:
                "Review the sitemap in Google Search Console for specific errors. Ensure all URLs in the sitemap return 200 status codes.",
            });
          }
        }

        allAlerts = alerts;
      }
    }

    // Upsert: update existing or create new
    let snapshot;
    if (existingDoc) {
      snapshot = await payload.update({
        collection: "gsc-snapshots",
        id: existingDoc.id,
        overrideAccess: true,
        data: snapshotData,
      });
      console.log(
        `[gsc-monitor] Updated ${periodStart.slice(0, 7)} snapshot for ${client.name}`
      );
    } else {
      snapshot = await payload.create({
        collection: "gsc-snapshots",
        overrideAccess: true,
        data: snapshotData,
      });
      console.log(
        `[gsc-monitor] Created ${periodStart.slice(0, 7)} snapshot for ${client.name}`
      );
    }

    // Track latest snapshot for updating client record
    if (!latestSnapshotId) {
      latestSnapshotId = String(snapshot.id);
    }
  }

  // Create alert records for current month
  const isActionable = client.websiteType === "built_by_us";
  for (const alert of allAlerts) {
    await payload.create({
      collection: "gsc-alerts",
      overrideAccess: true,
      data: {
        client: client.id,
        snapshot: latestSnapshotId,
        severity: alert.severity,
        category: alert.category,
        title: alert.title,
        description: alert.description,
        actionable: isActionable,
        recommendation: alert.recommendation,
        resolved: false,
      },
    });
  }

  // Update client with latest snapshot and sync time
  if (latestSnapshotId) {
    await payload.update({
      collection: "clients",
      id: client.id,
      overrideAccess: true,
      data: {
        latestGscSnapshot: latestSnapshotId,
        gscLastSync: new Date().toISOString(),
      },
    });
  }

  // Sync daily data (backfill or incremental)
  try {
    await syncDailyData(payload, client, accessToken);
  } catch (err) {
    console.error(`[gsc-monitor] Daily sync error for ${client.name}:`, err);
  }

  return {
    clientId: String(client.id),
    clientName: client.name,
    snapshotId: latestSnapshotId,
    alerts: allAlerts,
  };
}

/**
 * Sync daily GSC metrics into gsc-daily collection.
 * - If < 30 rows exist: backfill 16 months (~480 days)
 * - Otherwise: incremental sync of last 5 days (GSC finalises ~48h after)
 */
async function syncDailyData(
  payload: any,
  client: any,
  accessToken: string,
) {
  const siteUrl = client.gscPropertyUrl;
  if (!siteUrl) return;

  // Check existing row count
  const existingCount = await payload.find({
    collection: "gsc-daily",
    where: { client: { equals: client.id } },
    limit: 0,
    overrideAccess: true,
  });

  const needsBackfill = existingCount.totalDocs < 30;

  const now = new Date();
  let startDate: string;
  let endDate: string;

  if (needsBackfill) {
    // Backfill: 16 months ago to 3 days ago
    const start = new Date(now.getFullYear(), now.getMonth() - 16, now.getDate());
    startDate = start.toISOString().slice(0, 10);
    endDate = new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10);
    console.log(`[gsc-monitor] Backfilling daily data for ${client.name}: ${startDate} to ${endDate}`);
  } else {
    // Incremental: last 5 days
    startDate = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10);
    endDate = new Date(now.getTime() - 1 * 86400000).toISOString().slice(0, 10);
  }

  // Fetch daily data from GSC API
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["date"],
    },
  });

  const rows = res.data.rows || [];
  if (!rows.length) return;

  let upserted = 0;

  for (const row of rows) {
    const date = row.keys?.[0];
    if (!date) continue;

    const dailyData = {
      client: client.id,
      date,
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: Math.round((row.ctr || 0) * 10000) / 100,
      position: Math.round((row.position || 0) * 10) / 10,
    };

    // Check for existing row (dedup by client + date)
    const existing = await payload.find({
      collection: "gsc-daily",
      where: {
        client: { equals: client.id },
        date: { equals: date },
      },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs[0]) {
      await payload.update({
        collection: "gsc-daily",
        id: existing.docs[0].id,
        overrideAccess: true,
        data: dailyData,
      });
    } else {
      await payload.create({
        collection: "gsc-daily",
        overrideAccess: true,
        data: dailyData,
      });
    }
    upserted++;
  }

  console.log(`[gsc-monitor] Daily sync for ${client.name}: ${upserted} rows upserted (${needsBackfill ? "backfill" : "incremental"})`);
}
