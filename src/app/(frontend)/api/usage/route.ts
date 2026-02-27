import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * GET /api/usage
 * Returns weekly cost breakdown for the usage dashboard.
 * - Current week total
 * - Per-service breakdown (LLM subscriptions + API usage costs)
 * - 12-week history for bar graph
 */
export async function GET(req: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load cost rates and subscriptions
  const rates = await payload.findGlobal({
    slug: "api-cost-rates",
    overrideAccess: true,
  });

  const perUnit = {
    seoAudit: (rates as any).seoAuditCost ?? 0.012,
    croAudit: (rates as any).croAuditCost ?? 0.005,
    keywordSnapshot: (rates as any).keywordSnapshotCost ?? 0.008,
    competitorAnalysis: (rates as any).competitorAnalysisCost ?? 0.01,
    contentResearch: (rates as any).contentResearchCost ?? 0.004,
    blogImage: (rates as any).blogImageCost ?? 0.031,
  };

  const allSubscriptions = ((rates as any).subscriptions || [])
    .filter((s: any) => s.isActive)
    .map((s: any) => ({
      name: s.name,
      category: s.category,
      monthlyCost: s.monthlyCostAud || 0,
      weeklyCost: Math.round(((s.monthlyCostAud || 0) / 4.33) * 100) / 100,
      startDate: s.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : null,
    }));

  // Current active subscriptions (for the summary)
  const subscriptions = allSubscriptions;

  // Build 12 week ranges (Monday to Sunday)
  const now = new Date();
  const weeks: Array<{ start: Date; end: Date; label: string }> = [];
  for (let w = 0; w < 12; w++) {
    const end = new Date(now);
    end.setDate(end.getDate() - (w * 7));
    // Find end of week (Sunday)
    const dayOfWeek = end.getDay();
    const sundayOffset = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    end.setDate(end.getDate() + sundayOffset);
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    // For the current week, cap at today
    if (w === 0) {
      end.setTime(now.getTime());
    }

    weeks.push({
      start,
      end,
      label: start.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    });
  }

  // Count API usage per week
  const weeklyData = await Promise.all(
    weeks.map(async (week) => {
      const startStr = week.start.toISOString();
      const endStr = week.end.toISOString();

      const where = {
        createdAt: {
          greater_than_equal: startStr,
          less_than_equal: endStr,
        },
      };

      const [seo, cro, kw, comp, content, media] = await Promise.all([
        payload.count({ collection: "seo-audits", where, overrideAccess: true }),
        payload.count({ collection: "cro-audits", where, overrideAccess: true }),
        payload.count({ collection: "keyword-snapshots", where, overrideAccess: true }),
        payload.count({ collection: "competitor-analyses", where, overrideAccess: true }),
        payload.count({ collection: "content-researches", where, overrideAccess: true }),
        payload.count({ collection: "media", where, overrideAccess: true }),
      ]);

      const apiCosts = {
        seoAudits: { count: seo.totalDocs, cost: round(seo.totalDocs * perUnit.seoAudit) },
        croAudits: { count: cro.totalDocs, cost: round(cro.totalDocs * perUnit.croAudit) },
        keywordSnapshots: { count: kw.totalDocs, cost: round(kw.totalDocs * perUnit.keywordSnapshot) },
        competitorAnalyses: { count: comp.totalDocs, cost: round(comp.totalDocs * perUnit.competitorAnalysis) },
        contentResearches: { count: content.totalDocs, cost: round(content.totalDocs * perUnit.contentResearch) },
        blogImages: { count: media.totalDocs, cost: round(media.totalDocs * perUnit.blogImage) },
      };

      const totalApiCost = Object.values(apiCosts).reduce((sum, v) => sum + v.cost, 0);
      // Only include subscriptions that had started by this week
      const weekEndStr = week.end.toISOString().slice(0, 10);
      const applicableSubs = allSubscriptions.filter(
        (s: any) => !s.startDate || s.startDate <= weekEndStr
      );
      const totalSubscriptionCost = applicableSubs.reduce((sum: number, s: any) => sum + s.weeklyCost, 0);

      return {
        label: week.label,
        startDate: week.start.toISOString().slice(0, 10),
        endDate: week.end.toISOString().slice(0, 10),
        apiCosts,
        totalApiCost: round(totalApiCost),
        totalSubscriptionCost: round(totalSubscriptionCost),
        totalCost: round(totalApiCost + totalSubscriptionCost),
      };
    })
  );

  // Current week is index 0
  const currentWeek = weeklyData[0];

  return NextResponse.json({
    currentWeek,
    weeklyHistory: weeklyData.reverse(), // oldest first for chart
    subscriptions,
    perUnitRates: perUnit,
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
