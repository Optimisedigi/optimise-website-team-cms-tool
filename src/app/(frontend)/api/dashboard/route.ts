import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

// ── Real per-unit API costs in AUD (researched Feb 2026) ──
const COST_PER_AUD = {
  seoAudit: 0.012,
  croAudit: 0.005,
  keywordSnapshot: 0.008,
  competitorAnalysis: 0.01,
  contentResearch: 0.004,
  blogImage: 0.031,
};

// ── Monthly fixed infrastructure costs in AUD ──
const INFRA_MONTHLY_AUD = {
  vercel: 31.0,       // Vercel Pro (~$20 USD)
  railway: 7.75,      // Railway Hobby ($5 USD)
  turso: 0.0,         // Free Starter tier
  blobStorage: 0.5,   // Vercel Blob (small usage)
  screenshotOne: 0.0, // Free tier 100/mo
  sendGrid: 0.0,      // Free tier
  domain: 3.5,        // ~$42 AUD/yr ÷ 12
};

// ── Monthly LLM subscription costs in AUD (manually tracked) ──
const LLM_MONTHLY_AUD = {
  claudeCode: 0.0,    // Update when subscribed
  chatGPT: 0.0,       // Update when subscribed
  kimi: 0.0,          // Update when subscribed
};

export async function GET() {
  try {
  const payload = await getPayload({ config });

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Build date ranges for last 6 months (for chart)
  const monthRanges: { label: string; start: string; end: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    monthRanges.push({
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      start: d.toISOString(),
      end: nextMonth.toISOString(),
    });
  }

  const [
    gscBundle,
    clientCount,
    clientsForRetainer,
    activityResult,
    seoCount,
    croCount,
    kwCount,
    compCount,
    contentCount,
    mediaCount,
    activeProposals,
    convertedProposals,
    totalProposals,
    ...historicalCounts
  ] = await Promise.all([
    // Latest GSC snapshot + 13-month history for Optimise Digital
    (async (): Promise<{ gsc: any; gscMonthly: any[] } | null> => {
      try {
        const odClient = await payload.find({
          collection: "clients",
          where: { slug: { equals: "optimise-digital" } },
          limit: 1,
        });
        const client = odClient.docs[0];
        if (!client) return null;
        const clientMeta = {
          clientId: client.id,
          gscConnected: client.gscConnected || false,
        };

        // Query last 13 months of snapshots
        const snapshots = await payload.find({
          collection: "gsc-snapshots",
          where: { client: { equals: client.id } },
          sort: "-snapshotDate",
          limit: 100,
          overrideAccess: true,
        });

        // Group by year-month, pick latest snapshot per month
        const byMonth = new Map<string, any>();
        for (const snap of snapshots.docs) {
          const d = new Date(snap.snapshotDate as string);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!byMonth.has(key)) byMonth.set(key, snap);
        }

        // Build gscMonthly array (12 entries, chronological)
        const sortedKeys = Array.from(byMonth.keys()).sort();
        // Take last 12 entries for the chart
        const chartKeys = sortedKeys.slice(-12);
        const gscMonthly = chartKeys.map((key) => {
          const snap = byMonth.get(key)!;
          const [y, m] = key.split("-");
          const d = new Date(Number(y), Number(m) - 1);
          return {
            month: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
            clicks: (snap.totalClicks as number) || 0,
            impressions: (snap.totalImpressions as number) || 0,
          };
        });

        // Get the latest snapshot for current stats
        const latestSnap = snapshots.docs[0];
        if (!latestSnap) return { gsc: clientMeta, gscMonthly };

        // Compute unique keywords (clicks > 0) and unique pages (clicks > 0)
        const topKeywords = (latestSnap.topKeywords as any[]) || [];
        const topPages = (latestSnap.topPages as any[]) || [];
        const uniqueKeywords = topKeywords.filter((k: any) => k.clicks > 0).length;
        const uniquePages = topPages.filter((p: any) => p.clicks > 0).length;

        // Compute YoY: compare latest month to same month last year
        const latestDate = new Date(latestSnap.snapshotDate as string);
        const yoyKey = `${latestDate.getFullYear() - 1}-${String(latestDate.getMonth() + 1).padStart(2, "0")}`;
        const yoySnap = byMonth.get(yoyKey);

        let clicksChange = latestSnap.clicksChange as number | undefined;
        let impressionsChange = latestSnap.impressionsChange as number | undefined;
        let positionChange = latestSnap.positionChange as number | undefined;
        let ctrChange: number | undefined;

        if (yoySnap) {
          const oldClicks = (yoySnap.totalClicks as number) || 1;
          const oldImpressions = (yoySnap.totalImpressions as number) || 1;
          const oldCtr = (yoySnap.avgCtr as number) || 0;
          const oldPosition = (yoySnap.avgPosition as number) || 0;
          clicksChange = round(((((latestSnap.totalClicks as number) || 0) - oldClicks) / oldClicks) * 100);
          impressionsChange = round(((((latestSnap.totalImpressions as number) || 0) - oldImpressions) / oldImpressions) * 100);
          ctrChange = oldCtr > 0 ? round(((((latestSnap.avgCtr as number) || 0) - oldCtr) / oldCtr) * 100) : 0;
          positionChange = oldPosition > 0 ? round(((((latestSnap.avgPosition as number) || 0) - oldPosition) / oldPosition) * 100) : 0;
        }

        const gsc = {
          ...latestSnap,
          ...clientMeta,
          uniqueKeywords,
          uniquePages,
          clicksChange,
          impressionsChange,
          positionChange,
          ctrChange,
        };

        return { gsc, gscMonthly };
      } catch {
        return null;
      }
    })(),

    payload.count({
      collection: "clients",
      where: { isActive: { equals: true } },
    }),

    payload.find({
      collection: "clients",
      where: { isActive: { equals: true } },
      limit: 500,
      select: { monthlyRetainer: true } as any,
    }),

    payload.find({
      collection: "activity-log" as any,
      limit: 20,
      sort: "-createdAt",
      depth: 1,
    }),

    // This month's counts
    payload.count({ collection: "seo-audits", where: { createdAt: { greater_than: monthStart } } }),
    payload.count({ collection: "cro-audits", where: { createdAt: { greater_than: monthStart } } }),
    payload.count({ collection: "keyword-snapshots", where: { createdAt: { greater_than: monthStart } } }),
    payload.count({ collection: "competitor-analyses", where: { createdAt: { greater_than: monthStart } } }),
    payload.count({ collection: "content-researches", where: { createdAt: { greater_than: monthStart } } }),
    payload.count({ collection: "media", where: { createdAt: { greater_than: monthStart } } }),

    // Proposals — active (not declined, not converted)
    payload.count({
      collection: "client-proposals",
      where: {
        or: [
          { proposalStatus: { not_equals: "declined" } },
          { proposalStatus: { exists: false } },
        ],
      },
    } as any).catch(() => ({ totalDocs: 0 })),

    // Proposals converted to clients
    payload.count({
      collection: "client-proposals",
      where: { proposalStatus: { equals: "client" } },
    } as any).catch(() => ({ totalDocs: 0 })),

    // Total proposals ever
    payload.count({ collection: "client-proposals" }).catch(() => ({ totalDocs: 0 })),

    // Historical counts per month (for chart) — count all auditable collections per month
    ...monthRanges.map(async (range) => {
      const where = {
        createdAt: {
          greater_than: range.start,
          less_than: range.end,
        },
      };
      const [seo, cro, kw, comp, content, media] = await Promise.all([
        payload.count({ collection: "seo-audits", where }),
        payload.count({ collection: "cro-audits", where }),
        payload.count({ collection: "keyword-snapshots", where }),
        payload.count({ collection: "competitor-analyses", where }),
        payload.count({ collection: "content-researches", where }),
        payload.count({ collection: "media", where }),
      ]);
      const apiCost =
        seo.totalDocs * COST_PER_AUD.seoAudit +
        cro.totalDocs * COST_PER_AUD.croAudit +
        kw.totalDocs * COST_PER_AUD.keywordSnapshot +
        comp.totalDocs * COST_PER_AUD.competitorAnalysis +
        content.totalDocs * COST_PER_AUD.contentResearch +
        media.totalDocs * COST_PER_AUD.blogImage;

      return {
        label: range.label,
        infrastructure: round(Object.values(INFRA_MONTHLY_AUD).reduce((a, b) => a + b, 0)),
        api: round(apiCost),
        llm: round(Object.values(LLM_MONTHLY_AUD).reduce((a, b) => a + b, 0)),
      };
    }),
  ]);

  const totalRetainer = clientsForRetainer.docs.reduce(
    (sum: number, c: any) => sum + (c.monthlyRetainer || 0),
    0,
  );

  const usage = {
    seoAudits: seoCount.totalDocs,
    croAudits: croCount.totalDocs,
    keywordSnapshots: kwCount.totalDocs,
    competitorAnalyses: compCount.totalDocs,
    contentResearches: contentCount.totalDocs,
    mediaUploads: mediaCount.totalDocs,
  };

  const apiCosts = {
    seoAudits: round(usage.seoAudits * COST_PER_AUD.seoAudit),
    croAudits: round(usage.croAudits * COST_PER_AUD.croAudit),
    keywords: round(usage.keywordSnapshots * COST_PER_AUD.keywordSnapshot),
    competitors: round(usage.competitorAnalyses * COST_PER_AUD.competitorAnalysis),
    content: round(usage.contentResearches * COST_PER_AUD.contentResearch),
    blogImages: round(usage.mediaUploads * COST_PER_AUD.blogImage),
  };

  const infraTotal = round(Object.values(INFRA_MONTHLY_AUD).reduce((a, b) => a + b, 0));
  const apiTotal = round(Object.values(apiCosts).reduce((a, b) => a + b, 0));
  const llmTotal = round(Object.values(LLM_MONTHLY_AUD).reduce((a, b) => a + b, 0));
  const totalCost = round(infraTotal + apiTotal + llmTotal);

  // Proposal conversion: converted / total
  const conversionRate = totalProposals.totalDocs > 0
    ? round((convertedProposals.totalDocs / totalProposals.totalDocs) * 100)
    : 0;

  return NextResponse.json({
    gsc: gscBundle?.gsc || null,
    gscMonthly: gscBundle?.gscMonthly || [],
    activeClients: clientCount.totalDocs,
    totalRetainer,
    activity: activityResult.docs,
    userRole: user.role,
    userName: user.name || user.email,
    proposals: {
      active: activeProposals.totalDocs,
      converted: convertedProposals.totalDocs,
      total: totalProposals.totalDocs,
      conversionRate,
    },
    usage,
    costs: {
      api: apiCosts,
      apiTotal,
      infrastructure: INFRA_MONTHLY_AUD,
      infraTotal,
      llm: LLM_MONTHLY_AUD,
      llmTotal,
      total: totalCost,
    },
    costHistory: historicalCounts,
    month: now.toLocaleString("en-AU", { month: "long", year: "numeric" }),
  });
  } catch (err) {
    console.error("[dashboard] API error:", err);
    return NextResponse.json(
      { error: "Failed to load dashboard data", details: String(err) },
      { status: 500 },
    );
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
