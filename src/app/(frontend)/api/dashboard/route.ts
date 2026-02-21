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
    gscResult,
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
    // Latest GSC snapshot + client ID for Optimise Digital
    (async () => {
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
        if (client.latestGscSnapshot) {
          const snapshotId =
            typeof client.latestGscSnapshot === "object"
              ? client.latestGscSnapshot.id
              : client.latestGscSnapshot;
          const snapshot = await payload.findByID({
            collection: "gsc-snapshots",
            id: snapshotId,
          });
          return { ...snapshot, ...clientMeta };
        }
        return clientMeta;
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
    } as any),

    // Proposals converted to clients
    payload.count({
      collection: "client-proposals",
      where: { proposalStatus: { equals: "client" } },
    } as any),

    // Total proposals ever
    payload.count({ collection: "client-proposals" }),

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
    gsc: gscResult || null,
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
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
