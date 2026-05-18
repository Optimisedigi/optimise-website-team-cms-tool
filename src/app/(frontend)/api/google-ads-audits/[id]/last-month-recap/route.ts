import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { hasValidApiKey } from "@/collections/api-key-access";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

interface CampaignMetric {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  avgCpc: number;
  cpl: number;
}

interface SearchTermRow {
  searchTerm: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionsByAction?: Record<string, number>;
  conversionsByCategory?: Record<string, number>;
}

interface CategoryDef {
  label: string;
  color: string;
}

interface Insight {
  severity: "good" | "warning" | "critical";
  title: string;
  body: string;
}

function lastMonthLabel(): { label: string; year: number; month: number } {
  const now = new Date();
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    label: lm.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
    year: lm.getFullYear(),
    month: lm.getMonth() + 1,
  };
}

function buildInsights(
  campaigns: CampaignMetric[],
  topBySpend: SearchTermRow[]
): Insight[] {
  const insights: Insight[] = [];

  const withConversions = campaigns.filter((c) => c.conversions >= 5);
  if (withConversions.length > 0) {
    const best = withConversions.reduce((a, b) => (a.cpl < b.cpl ? a : b));
    insights.push({
      severity: "good",
      title: `Scale up: ${best.campaignName}`,
      body: `Lowest cost-per-lead at $${best.cpl.toFixed(2)} (${best.conversions} conversions on $${best.cost.toFixed(0)} spend). We will look to shift more budget here this month to compound the strongest performer.`,
    });
  }

  // Exclude obvious display/discovery/PMax patterns from the search-focused
  // "review" recommendation — those need different optimisation levers than
  // ad copy / landing page / keyword relevancy.
  const isDisplayLike = (name: string) =>
    /\b(display|discovery|pmax|performance\s*max|video|youtube|shopping)\b/i.test(name);
  const wasters = campaigns.filter(
    (c) => c.cost >= 100 && c.conversions === 0 && !isDisplayLike(c.campaignName)
  );
  for (const c of wasters.slice(0, 2)) {
    insights.push({
      severity: "critical",
      title: `Optimise: ${c.campaignName}`,
      body: `Spent $${c.cost.toFixed(0)} last month with zero conversions. We will review ad copy and headlines, audit the landing page conversion path, tighten keyword relevancy, and reallocate budget toward higher-performing search campaigns.`,
    });
  }

  const wasteTerms = topBySpend.filter(
    (t) => t.cost >= 50 && t.conversions === 0
  );
  if (wasteTerms.length > 0) {
    const sample = wasteTerms.slice(0, 3).map((t) => `"${t.searchTerm}"`).join(", ");
    const totalWaste = wasteTerms.reduce((s, t) => s + t.cost, 0);
    insights.push({
      severity: "warning",
      title: "Review high-spend, no-conversion search terms",
      body: `${wasteTerms.length} search terms spent $${totalWaste.toFixed(0)} last month without converting (e.g. ${sample}). We will review whether any of these fit as negatives to lift conversion rate, and where they're genuinely relevant we will look at improving the landing page and ad copy so the click converts.`,
    });
  }

  const lowCtr = campaigns.filter(
    (c) => c.impressions >= 1000 && c.ctr < 1 && c.cost > 0
  );
  for (const c of lowCtr.slice(0, 2)) {
    insights.push({
      severity: "warning",
      title: `Refresh ad copy: ${c.campaignName}`,
      body: `CTR of ${c.ctr.toFixed(2)}% on ${c.impressions.toLocaleString()} impressions suggests the ad isn't resonating. We will test new headlines, descriptions and CTAs to lift engagement and bring the cost per click down.`,
    });
  }

  return insights;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auditId = Number(id);

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user && !hasValidApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id: auditId,
      depth: 2,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Always prefer the linked client's Google Ads customer ID (the audit's
  // customerId is often the MCC manager ID, which aggregates all child
  // accounts and gives wildly inflated spend totals).
  let linkedClient: any = null;
  if (audit.client) {
    try {
      const clientId =
        typeof audit.client === "object" ? audit.client.id : audit.client;
      linkedClient =
        typeof audit.client === "object"
          ? audit.client
          : await payload.findByID({
              collection: "clients",
              id: clientId,
              overrideAccess: true,
            });
    } catch {
      /* fall through */
    }
  }

  const customerId = linkedClient?.googleAdsCustomerId || audit.customerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "No Google Ads customer ID on linked client or audit" },
      { status: 400 }
    );
  }

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Growth Tools service not configured" },
      { status: 500 }
    );
  }

  // Use the same conversion-action filter the budget tracker uses, so
  // "conversions" reflects the client's actual lead-generating actions
  // (forms, calls etc) rather than the kitchen-sink Google Ads default.
  const conversionActions: string[] = (linkedClient?.dashboardConversionActions || "")
    .split(/[\r\n,]+/)
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Build the conversionActionCategories JSON the dashboard endpoint
  // expects so the recap email can render per-category columns on the
  // Top by Conversions table.
  let categoriesArray: Array<{ label: string; color: string; actions: string[] }> = [];
  const rawCategories = (linkedClient as any)?.conversionActionCategories;
  if (Array.isArray(rawCategories) && rawCategories.length > 0) {
    categoriesArray = rawCategories
      .map((c: any) => ({
        label: String(c?.label || "").trim(),
        color: String(c?.color || "sky"),
        actions: String(c?.actions || "")
          .split(/[\r\n,]+/)
          .map((s: string) => s.trim())
          .filter(Boolean),
      }))
      .filter((c) => c.label && c.actions.length > 0);
  } else {
    const phone = String((linkedClient as any)?.phoneCallConversionActions || "")
      .split(/[\r\n,]+/).map((s: string) => s.trim()).filter(Boolean);
    const form = String((linkedClient as any)?.formSubmitConversionActions || "")
      .split(/[\r\n,]+/).map((s: string) => s.trim()).filter(Boolean);
    if (phone.length > 0) categoriesArray.push({ label: "Phone Calls", color: "sky", actions: phone });
    if (form.length > 0) categoriesArray.push({ label: "Form Submits", color: "violet", actions: form });
  }
  const categoriesParam = categoriesArray.length > 0 ? JSON.stringify(categoriesArray) : "";

  const cleanCustomerId = String(customerId).replace(/-/g, "");
  const { label, year, month } = lastMonthLabel();

  // 1. Campaign metrics for LAST_MONTH
  const metricsUrl = new URL(
    `${GROWTH_TOOLS_URL}/api/google-ads/campaign-budgets/get-metrics`
  );
  metricsUrl.searchParams.set("customerId", cleanCustomerId);
  metricsUrl.searchParams.set("dateRange", "LAST_MONTH");
  if (conversionActions.length > 0) {
    metricsUrl.searchParams.set("conversionActions", conversionActions.join(","));
  }

  let campaignMetrics: CampaignMetric[] = [];
  try {
    const r = await fetch(metricsUrl.toString(), {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      signal: AbortSignal.timeout(45_000),
    });
    if (r.ok) {
      const { metrics } = await r.json();
      campaignMetrics = (metrics || []).map((m: any) => {
        const cost = Number(m.cost ?? m.spend ?? 0);
        const impressions = Number(m.impressions ?? 0);
        const clicks = Number(m.clicks ?? 0);
        const conversions = Number(m.conversions ?? 0);
        return {
          campaignId: String(m.campaignId),
          campaignName: m.campaignName || m.campaignId,
          impressions,
          clicks,
          cost,
          conversions,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          avgCpc: clicks > 0 ? cost / clicks : 0,
          cpl: conversions > 0 ? cost / conversions : 0,
        };
      });
    }
  } catch (e: any) {
    console.error("[last-month-recap] metrics error:", e.message);
  }

  // 2. Search terms — try dedicated endpoint first, fall back to negative-sweep
  let searchTerms: SearchTermRow[] = [];
  try {
    const stUrl = new URL(`${GROWTH_TOOLS_URL}/api/google-ads/search-terms`);
    stUrl.searchParams.set("customerId", cleanCustomerId);
    stUrl.searchParams.set("dateRange", "LAST_MONTH");
    stUrl.searchParams.set("limit", "500");
    if (conversionActions.length > 0) {
      stUrl.searchParams.set("conversionActions", conversionActions.join(","));
    }
    if (categoriesParam) {
      stUrl.searchParams.set("conversionActionCategories", categoriesParam);
    }

    const r = await fetch(stUrl.toString(), {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      signal: AbortSignal.timeout(45_000),
    });
    if (r.ok) {
      const data = await r.json();
      searchTerms = (data.searchTerms || data.terms || []).map((t: any) => ({
        searchTerm: t.searchTerm || t.query || "",
        campaignName: t.campaignName || "",
        impressions: Number(t.impressions ?? 0),
        clicks: Number(t.clicks ?? 0),
        cost: Number(t.cost ?? t.spend ?? 0),
        conversions: Number(t.conversions ?? 0),
        conversionsByAction: t.conversionsByAction,
        conversionsByCategory: t.conversionsByCategory,
      }));
    }
  } catch (e: any) {
    console.error("[last-month-recap] search-terms error:", e.message);
  }

  // Fallback: negative-sweep with relaxed thresholds (still returns search terms with metrics)
  if (searchTerms.length === 0) {
    try {
      const r = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/negative-sweep`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": INTERNAL_API_KEY,
          },
          body: JSON.stringify({
            customerId: cleanCustomerId,
            minSpend: 0,
            minClicks: 0,
            maxCandidates: 500,
            dateRange: "LAST_MONTH",
          }),
          signal: AbortSignal.timeout(60_000),
        }
      );
      if (r.ok) {
        const data = await r.json();
        searchTerms = (data.candidates || []).map((c: any) => ({
          searchTerm: c.searchTerm,
          campaignName: c.campaignName || "",
          impressions: Number(c.impressions ?? 0),
          clicks: Number(c.clicks ?? 0),
          cost: Number(c.cost ?? 0),
          conversions: Number(c.conversions ?? 0),
        }));
      }
    } catch (e: any) {
      console.error("[last-month-recap] negative-sweep fallback error:", e.message);
    }
  }

  const topByClicks = [...searchTerms]
    .filter((t) => t.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);
  const topByConversions = [...searchTerms]
    .filter((t) => t.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 10);
  const topBySpend = [...searchTerms]
    .filter((t) => t.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  const totals = campaignMetrics.reduce(
    (acc, c) => ({
      spend: acc.spend + c.cost,
      clicks: acc.clicks + c.clicks,
      impressions: acc.impressions + c.impressions,
      conversions: acc.conversions + c.conversions,
    }),
    { spend: 0, clicks: 0, impressions: 0, conversions: 0 }
  );

  const insights = buildInsights(campaignMetrics, topBySpend);

  return NextResponse.json({
    success: true,
    monthLabel: label,
    year,
    month,
    monthlyBudget: Number(audit.monthlyBudget || 0),
    customerIdUsed: cleanCustomerId,
    conversionActionsApplied: conversionActions,
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      avgCpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpl: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
    },
    campaigns: campaignMetrics.sort((a, b) => b.cost - a.cost),
    topByClicks,
    topByConversions,
    topBySpend,
    insights,
    searchTermsAvailable: searchTerms.length > 0,
    conversionCategories: categoriesArray.map(({ label, color }) => ({ label, color })),
  });
}
