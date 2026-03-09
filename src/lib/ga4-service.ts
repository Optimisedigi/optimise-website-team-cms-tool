import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GA4_REDIRECT_URI
  );
}

/**
 * Generate the Google OAuth consent URL for GA4 access.
 * The clientId is stored in the `state` parameter so the callback can identify the client.
 */
export function getGa4OAuthUrl(clientId: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state: clientId,
    prompt: "consent",
  });
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeGa4Code(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiry: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshGa4AccessToken(refreshToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return {
    accessToken: credentials.access_token!,
    expiry: credentials.expiry_date
      ? new Date(credentials.expiry_date).toISOString()
      : null,
  };
}

/**
 * List GA4 properties accessible to the authenticated user.
 */
export async function listGa4Properties(accessToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const analyticsAdmin = google.analyticsadmin({ version: "v1beta", auth: oauth2Client });
  const res = await analyticsAdmin.accountSummaries.list({ pageSize: 200 });

  const properties: { name: string; displayName: string; propertyId: string }[] = [];
  for (const account of res.data.accountSummaries || []) {
    for (const ps of account.propertySummaries || []) {
      properties.push({
        name: ps.property || "",
        displayName: ps.displayName || "",
        propertyId: ps.property?.replace("properties/", "") || "",
      });
    }
  }
  return properties;
}

// ── GA4 Data API Queries ──

interface Ga4OverviewData {
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
  engagementRate: number;
  conversions: number;
}

interface Ga4ChannelData {
  channel: string;
  users: number;
  sessions: number;
  conversions: number;
}

interface Ga4PageData {
  pagePath: string;
  pageTitle: string;
  users: number;
  pageviews: number;
}

interface Ga4DailyData {
  date: string;
  users: number;
  sessions: number;
  pageviews: number;
}

export interface Ga4ReportData {
  overview: Ga4OverviewData;
  channels: Ga4ChannelData[];
  topPages: Ga4PageData[];
  daily: Ga4DailyData[];
  periodStart: string;
  periodEnd: string;
}

/**
 * Fetch a complete GA4 report for a property.
 */
export async function fetchGa4Report(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4ReportData> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const analyticsData = google.analyticsdata({ version: "v1beta", auth: oauth2Client });
  const property = `properties/${propertyId}`;

  // Run all queries in parallel
  const [overviewRes, channelRes, pagesRes, dailyRes] = await Promise.all([
    // 1. Overview metrics
    analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
          { name: "engagementRate" },
          { name: "conversions" },
        ],
      },
    }),

    // 2. Traffic by channel group
    analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "conversions" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "20",
      },
    }),

    // 3. Top pages
    analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: "pagePath" },
          { name: "pageTitle" },
        ],
        metrics: [
          { name: "activeUsers" },
          { name: "screenPageViews" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: "20",
      },
    }),

    // 4. Daily breakdown (for chart)
    analyticsData.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
    }),
  ]);

  // Parse overview
  const ov = overviewRes.data.rows?.[0]?.metricValues || [];
  const overview: Ga4OverviewData = {
    users: parseInt(ov[0]?.value || "0", 10),
    newUsers: parseInt(ov[1]?.value || "0", 10),
    sessions: parseInt(ov[2]?.value || "0", 10),
    pageviews: parseInt(ov[3]?.value || "0", 10),
    bounceRate: parseFloat(ov[4]?.value || "0"),
    avgSessionDuration: parseFloat(ov[5]?.value || "0"),
    engagementRate: parseFloat(ov[6]?.value || "0"),
    conversions: parseInt(ov[7]?.value || "0", 10),
  };

  // Parse channels
  const channels: Ga4ChannelData[] = (channelRes.data.rows || []).map((row) => ({
    channel: row.dimensionValues?.[0]?.value || "Unknown",
    users: parseInt(row.metricValues?.[0]?.value || "0", 10),
    sessions: parseInt(row.metricValues?.[1]?.value || "0", 10),
    conversions: parseInt(row.metricValues?.[2]?.value || "0", 10),
  }));

  // Parse top pages
  const topPages: Ga4PageData[] = (pagesRes.data.rows || []).map((row) => ({
    pagePath: row.dimensionValues?.[0]?.value || "/",
    pageTitle: row.dimensionValues?.[1]?.value || "",
    users: parseInt(row.metricValues?.[0]?.value || "0", 10),
    pageviews: parseInt(row.metricValues?.[1]?.value || "0", 10),
  }));

  // Parse daily
  const daily: Ga4DailyData[] = (dailyRes.data.rows || []).map((row) => {
    const raw = row.dimensionValues?.[0]?.value || "";
    // GA4 returns dates as "YYYYMMDD" — format to "YYYY-MM-DD"
    const date = raw.length === 8
      ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
      : raw;
    return {
      date,
      users: parseInt(row.metricValues?.[0]?.value || "0", 10),
      sessions: parseInt(row.metricValues?.[1]?.value || "0", 10),
      pageviews: parseInt(row.metricValues?.[2]?.value || "0", 10),
    };
  });

  return {
    overview,
    channels,
    topPages,
    daily,
    periodStart: startDate,
    periodEnd: endDate,
  };
}

/**
 * Ensure the access token is valid, refreshing if necessary.
 * Returns the (potentially refreshed) access token.
 */
export async function ensureValidToken(
  accessToken: string,
  refreshToken: string,
  tokenExpiry: string | null,
): Promise<{ accessToken: string; expiry: string | null; refreshed: boolean }> {
  if (!tokenExpiry || new Date(tokenExpiry) <= new Date()) {
    const refreshed = await refreshGa4AccessToken(refreshToken);
    return {
      accessToken: refreshed.accessToken,
      expiry: refreshed.expiry,
      refreshed: true,
    };
  }
  return { accessToken, expiry: tokenExpiry, refreshed: false };
}
