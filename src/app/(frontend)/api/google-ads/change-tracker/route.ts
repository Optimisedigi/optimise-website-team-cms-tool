import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { userHasFeature } from "@/lib/access";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_API_KEY = process.env.INTERNAL_API_KEY;

const DEFAULT_CUSTOMER_ID = "3425353766";
const DEFAULT_WEEKS = 8;
const DEFAULT_DAYS = 45;

const TRACKED_CAMPAIGNS = [
  "Search - Vietnam - AU - Exact (Target IS 100%)",
  "Search - Vietnam - AU - Phrase (Target IS 100%)",
  "Search - Vietnam - US - Exact (Target IS 100%)",
  "Search - Vietnam - US - Phrase (Target IS 100%)",
  "Search - Non-Brand - Developer/IT - AU",
  "Search - Non-Brand - Developer/IT - US",
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startDateForWeeks(weeks: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - weeks * 7 + 1);
  return isoDate(date);
}

function startDateForDays(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return isoDate(date);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!userHasFeature(user, "nav:google-ads")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_API_KEY) {
      return NextResponse.json({ error: "Growth Tools service is not configured" }, { status: 503 });
    }

    const customerId = (req.nextUrl.searchParams.get("customerId") || DEFAULT_CUSTOMER_ID).replace(/-/g, "");
    const view = req.nextUrl.searchParams.get("view") === "daily" ? "daily" : "weekly";
    const weeks = Math.max(4, Math.min(52, Number(req.nextUrl.searchParams.get("weeks") || DEFAULT_WEEKS)));
    const days = Math.max(14, Math.min(180, Number(req.nextUrl.searchParams.get("days") || DEFAULT_DAYS)));
    const end = req.nextUrl.searchParams.get("end") || isoDate(new Date());
    const start = req.nextUrl.searchParams.get("start") || (view === "daily" ? startDateForDays(days) : startDateForWeeks(weeks));

    const params = new URLSearchParams({
      customerId,
      dateRange: `${start},${end}`,
      segment: view === "daily" ? "day" : "week",
    });

    const [upstream, campaignsUpstream] = await Promise.all([
      fetch(`${GROWTH_TOOLS_URL}/api/google-ads/campaign-budgets/get-metrics?${params}`, {
        headers: { "x-internal-key": GROWTH_TOOLS_API_KEY },
        cache: "no-store",
      }),
      fetch(`${GROWTH_TOOLS_URL}/api/google-ads/campaigns?customerId=${customerId}`, {
        headers: { "x-internal-key": GROWTH_TOOLS_API_KEY },
        cache: "no-store",
      }).catch(() => null),
    ]);

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json({ error: `Growth Tools returned ${upstream.status}: ${text}` }, { status: upstream.status });
    }

    const data = await upstream.json();
    const campaignData = campaignsUpstream?.ok ? await campaignsUpstream.json() : null;
    const activeCampaignNames = new Set(
      (Array.isArray(campaignData?.campaigns) ? campaignData.campaigns : [])
        .filter((campaign: any) => String(campaign.status || "").toUpperCase() === "ENABLED")
        .map((campaign: any) => String(campaign.name || ""))
        .filter(Boolean),
    );
    const rawRows = Array.isArray(data.metrics) ? data.metrics : [];
    const activeRows = rawRows.filter((row: any) => {
      const status = String(row.status || "").toUpperCase();
      const campaignName = String(row.campaignName || "");
      if (activeCampaignNames.size > 0) return activeCampaignNames.has(campaignName);
      return status === "ENABLED";
    });
    const availableCampaigns = Array.from(activeCampaignNames.size > 0
      ? activeCampaignNames
      : new Set(activeRows.map((row: any) => String(row.campaignName || "")).filter(Boolean)),
    ).sort();

    const rows = activeRows
      .map((row: any) => {
        const segment = row.segment || {};
        const bucket = view === "daily"
          ? (segment.date || segment.day || segment.segments?.date || "")
          : (segment.week || segment.week_start || segment.segments?.week || "");
        const cost = num(row.cost ?? row.spend);
        const conversions = num(row.conversions);
        const clicks = num(row.clicks);
        return {
          date: String(bucket).slice(0, 10),
          campaignId: String(row.campaignId || ""),
          campaignName: String(row.campaignName || ""),
          status: String(row.status || ""),
          impressions: num(row.impressions),
          clicks,
          cost,
          conversions,
          cpa: conversions > 0 ? cost / conversions : null,
          cpc: clicks > 0 ? cost / clicks : null,
        };
      })
      .filter((row: any) => row.date);

    const response = NextResponse.json({
      customerId,
      start,
      end,
      view,
      weeks,
      days,
      changeDate: req.nextUrl.searchParams.get("changeDate") || "2026-06-17",
      trackedCampaigns: TRACKED_CAMPAIGNS,
      availableCampaigns,
      rows,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[google-ads/change-tracker]", error);
    return NextResponse.json({ error: "Failed to load change tracker data" }, { status: 500 });
  }
}
