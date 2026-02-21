import { getPayload } from "payload";
import config from "@/payload.config";
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

    // Update tokens on client
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

  // Determine date range: last 28 days
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // Yesterday (GSC data has ~2 day lag)
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 27); // 28-day window

  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  // Parse brand keywords from client
  const brandTerms = (client.brandKeywords || "")
    .split(",")
    .map((t: string) => t.trim())
    .filter(Boolean);

  // Fetch all GSC data in parallel
  const [searchData, indexingData, sitemapData, cwvData, brandedAnalytics] = await Promise.all([
    fetchSearchAnalytics(accessToken, siteUrl, formatDate(startDate), formatDate(endDate)),
    fetchIndexingStatus(accessToken, siteUrl),
    fetchSitemaps(accessToken, siteUrl),
    fetchCoreWebVitals(accessToken, siteUrl),
    fetchBrandedAnalytics(accessToken, siteUrl, formatDate(startDate), formatDate(endDate), brandTerms),
  ]);

  // Find previous snapshot for comparison
  const prevSnapshots = await payload.find({
    collection: "gsc-snapshots",
    where: {
      client: { equals: client.id },
    },
    sort: "-snapshotDate",
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
        ((searchData.totalImpressions - previousSnapshot.totalImpressions) /
          previousSnapshot.totalImpressions) *
          100
      );
    }
    positionChange = Math.round(
      ((searchData.avgPosition - (previousSnapshot.avgPosition || 0)) * 10) / 10
    );
  }

  // Create snapshot record
  const snapshot = await payload.create({
    collection: "gsc-snapshots",
    overrideAccess: true,
    data: {
      client: client.id,
      snapshotDate: new Date().toISOString(),
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
      indexedPages: indexingData.indexedPages,
      notIndexedPages: indexingData.notIndexedPages,
      indexingIssues: indexingData.indexingIssues,
      sitemaps: sitemapData,
      cwvMobile: cwvData.cwvMobile,
      cwvDesktop: cwvData.cwvDesktop,
      clicksChange,
      impressionsChange,
      positionChange,
      previousSnapshot: previousSnapshot?.id || null,
    },
  });

  // Compare snapshots and generate alerts
  let alerts: AlertData[] = [];
  if (previousSnapshot) {
    alerts = compareSnapshots(
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
  }

  // Check sitemaps for errors (no previous snapshot needed)
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

  // Create alert records
  const isActionable = client.websiteType === "built_by_us";
  for (const alert of alerts) {
    await payload.create({
      collection: "gsc-alerts",
      overrideAccess: true,
      data: {
        client: client.id,
        snapshot: snapshot.id,
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
  await payload.update({
    collection: "clients",
    id: client.id,
    overrideAccess: true,
    data: {
      latestGscSnapshot: snapshot.id,
      gscLastSync: new Date().toISOString(),
    },
  });

  return {
    clientId: String(client.id),
    clientName: client.name,
    snapshotId: String(snapshot.id),
    alerts,
  };
}
