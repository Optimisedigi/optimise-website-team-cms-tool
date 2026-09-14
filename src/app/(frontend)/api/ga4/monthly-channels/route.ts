import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import {
  fetchGa4MonthlySessionsByChannel,
  fetchGa4UnassignedSources,
  ensureValidToken,
  GA4_UNASSIGNED_CHANNEL,
} from "@/lib/ga4-service";

const MONTHS = 12;

/**
 * GET /api/ga4/monthly-channels?clientId=X
 *
 * Sessions for the last 12 calendar months, broken out by the property's
 * primary channel group — the same grouping GA4's standard reports use, so
 * channel-group changes made in GA4 Admin flow through to this chart.
 *
 * Backs the dashboard's stacked monthly column chart, which always shows a
 * fixed 12-month window (unlike the main GA4 card's period toggle).
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = req.nextUrl.searchParams.get("clientId");

    let client: any;
    if (clientId) {
      client = await payload.findByID({
        collection: "clients",
        id: clientId,
        overrideAccess: true,
      });
    } else {
      // Default to Optimise Digital
      const result = await payload.find({
        collection: "clients",
        where: { slug: { equals: "optimise-digital" } },
        limit: 1,
        overrideAccess: true,
      });
      client = result.docs[0];
    }

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.ga4Connected || !client.ga4PropertyId || !client.ga4RefreshToken) {
      return NextResponse.json(
        { ga4Connected: false, months: [], channels: [], unassignedSources: [] },
        { status: 200 },
      );
    }

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

    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);
    const startDate = toIsoDate(rangeStart);
    const endDate = toIsoDate(now);

    const rows = await fetchGa4MonthlySessionsByChannel(
      tokenResult.accessToken,
      client.ga4PropertyId,
      startDate,
      endDate,
    );

    // Fixed 12-month skeleton so months with no data still render a slot.
    const months = Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
      return {
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
        total: 0,
        sessions: {} as Record<string, number>,
      };
    });
    const byMonth = new Map(months.map((m) => [m.month, m]));

    const channelTotals = new Map<string, number>();
    for (const row of rows) {
      const bucket = byMonth.get(row.month);
      if (!bucket) continue;
      bucket.sessions[row.channel] = (bucket.sessions[row.channel] || 0) + row.sessions;
      bucket.total += row.sessions;
      channelTotals.set(row.channel, (channelTotals.get(row.channel) || 0) + row.sessions);
    }

    // Largest channel first so stacks are ordered consistently across months.
    const channels = [...channelTotals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([channel, sessions]) => ({ channel, sessions }));

    // Only worth a second report when the property actually has Unassigned
    // traffic to explain.
    let unassignedSources: Awaited<ReturnType<typeof fetchGa4UnassignedSources>> = [];
    if ((channelTotals.get(GA4_UNASSIGNED_CHANNEL) || 0) > 0) {
      try {
        unassignedSources = await fetchGa4UnassignedSources(
          tokenResult.accessToken,
          client.ga4PropertyId,
          startDate,
          endDate,
        );
      } catch (err) {
        // The breakdown is diagnostic extra — never fail the whole chart for it.
        console.error("[ga4/monthly-channels] unassigned breakdown failed:", err);
      }
    }

    return NextResponse.json({
      ga4Connected: true,
      clientId: client.id,
      clientName: client.name,
      periodStart: startDate,
      periodEnd: endDate,
      channels,
      months,
      unassignedSources,
    });
  } catch (err) {
    console.error("[ga4/monthly-channels] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch GA4 monthly channel data" },
      { status: 500 },
    );
  }
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
