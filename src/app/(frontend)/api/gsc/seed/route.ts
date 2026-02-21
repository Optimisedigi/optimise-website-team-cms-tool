import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * POST /api/gsc/seed
 * Seeds 13 months of realistic GSC snapshots for the "optimise-digital" client
 * so the dashboard and Search Console page can be previewed without a live GSC
 * connection. Auth required.
 */
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find OD client
  const clients = await payload.find({
    collection: "clients",
    where: { slug: { equals: "optimise-digital" } },
    limit: 1,
    overrideAccess: true,
  });

  if (!clients.docs[0]) {
    return NextResponse.json({ error: "optimise-digital client not found" }, { status: 404 });
  }

  const client = clients.docs[0];

  // Delete existing snapshots for this client to avoid duplicates on re-seed
  const existing = await payload.find({
    collection: "gsc-snapshots",
    where: { client: { equals: client.id } },
    limit: 200,
    overrideAccess: true,
  });

  for (const doc of existing.docs) {
    await payload.delete({
      collection: "gsc-snapshots",
      id: doc.id,
      overrideAccess: true,
    });
  }

  const now = new Date();
  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  // Base metrics that grow over 13 months
  const baseClicks = 1100;
  const baseImpressions = 28000;
  const basePosition = 16.8;
  const baseCtr = 3.2;

  const allKeywords = [
    "seo agency sydney", "digital marketing agency", "local seo services",
    "google ads management", "website audit tool", "seo audit free",
    "small business seo", "ecommerce seo agency", "technical seo services",
    "content marketing strategy", "ppc management sydney", "conversion rate optimisation",
    "seo consultant near me", "website speed optimisation", "link building services",
  ];

  const allPages = [
    "https://optimisedigital.com.au/",
    "https://optimisedigital.com.au/seo-services/",
    "https://optimisedigital.com.au/free-seo-audit/",
    "https://optimisedigital.com.au/google-ads/",
    "https://optimisedigital.com.au/blog/seo-tips-2026/",
    "https://optimisedigital.com.au/case-studies/",
    "https://optimisedigital.com.au/blog/local-seo-guide/",
    "https://optimisedigital.com.au/contact/",
    "https://optimisedigital.com.au/web-design/",
    "https://optimisedigital.com.au/blog/google-ads-tips/",
  ];

  let previousSnapshotId: number | null = null;
  let latestSnapshotId: number | null = null;

  // Create 13 monthly snapshots: oldest first (12 months ago → current month)
  for (let i = 12; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const startDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);

    // Growth factor: 0.0 → 1.0 over 13 months with slight seasonality
    const progress = (12 - i) / 12;
    const seasonality = 1 + 0.08 * Math.sin((monthDate.getMonth() / 12) * Math.PI * 2);
    const growthFactor = (1 + progress * 0.65) * seasonality;

    const clicks = Math.round(baseClicks * growthFactor + (Math.random() - 0.5) * 120);
    const impressions = Math.round(baseImpressions * growthFactor + (Math.random() - 0.5) * 2000);
    const position = Math.round((basePosition - progress * 2.8 + (Math.random() - 0.5) * 0.6) * 10) / 10;
    const ctr = Math.round((baseCtr + progress * 1.2 + (Math.random() - 0.5) * 0.3) * 10) / 10;

    // Compute YoY change for this month (compared to 12 months prior — only available for most recent month)
    let clicksChange: number | null = null;
    let impressionsChange: number | null = null;
    let positionChange: number | null = null;

    if (i === 0) {
      // Current month: compare to 12-months-ago baseline
      const oldClicks = baseClicks * seasonality;
      const oldImpressions = baseImpressions * seasonality;
      clicksChange = Math.round(((clicks - oldClicks) / oldClicks) * 1000) / 10;
      impressionsChange = Math.round(((impressions - oldImpressions) / oldImpressions) * 1000) / 10;
      positionChange = Math.round((position - basePosition) * 10) / 10;
    }

    // Generate keyword data — vary per month, some with 0 clicks
    const topKeywords = allKeywords.map((keyword, ki) => {
      const kwGrowth = growthFactor * (1 - ki * 0.05);
      const kwClicks = Math.max(0, Math.round((150 - ki * 12) * kwGrowth + (Math.random() - 0.5) * 15));
      // Every 3rd keyword in early months has 0 clicks (tests unique keyword count)
      const zeroOut = i > 8 && ki % 3 === 2;
      return {
        keyword,
        clicks: zeroOut ? 0 : kwClicks,
        impressions: Math.round((3200 - ki * 180) * growthFactor + Math.random() * 200),
        ctr: zeroOut ? 0 : Math.round((4.5 - ki * 0.2 + Math.random() * 0.5) * 10) / 10,
        position: Math.round((6 + ki * 1.2 - progress * 0.8 + Math.random() * 2) * 10) / 10,
      };
    });

    // Generate page data — vary per month, some with 0 clicks
    const topPages = allPages.map((page, pi) => {
      const pageGrowth = growthFactor * (1 - pi * 0.04);
      const pageClicks = Math.max(0, Math.round((320 - pi * 28) * pageGrowth + (Math.random() - 0.5) * 20));
      const zeroOut = i > 9 && pi % 4 === 3;
      return {
        page,
        clicks: zeroOut ? 0 : pageClicks,
        impressions: Math.round((8400 - pi * 700) * pageGrowth + Math.random() * 300),
        ctr: zeroOut ? 0 : Math.round((3.8 + Math.random() * 1.5) * 10) / 10,
        position: Math.round((5 + pi * 1.1 + Math.random() * 3) * 10) / 10,
      };
    });

    // Brand / non-brand split
    const brandClicks = Math.round(clicks * 0.22);
    const brandImpressions = Math.round(impressions * 0.14);
    const nbClicks = clicks - brandClicks;
    const nbImpressions = impressions - brandImpressions;

    const snapshotData: Record<string, any> = {
      client: client.id,
      snapshotDate: new Date(monthDate.getFullYear(), monthDate.getMonth(), 15).toISOString(),
      periodStart: formatDate(startDate),
      periodEnd: formatDate(endDate),
      totalClicks: clicks,
      totalImpressions: impressions,
      avgCtr: ctr,
      avgPosition: position,
      clicksChange: clicksChange ?? undefined,
      impressionsChange: impressionsChange ?? undefined,
      positionChange: positionChange ?? undefined,
      topKeywords,
      topPages,
      brandedData: {
        clicks: brandClicks,
        impressions: brandImpressions,
        ctr: Math.round((brandClicks / Math.max(brandImpressions, 1)) * 10000) / 100,
        position: Math.round((2.1 + Math.random() * 0.5) * 10) / 10,
      },
      nonBrandedData: {
        clicks: nbClicks,
        impressions: nbImpressions,
        ctr: Math.round((nbClicks / Math.max(nbImpressions, 1)) * 10000) / 100,
        position: Math.round((position + 2 + Math.random()) * 10) / 10,
        topQueries: topKeywords.slice(0, 10).map((kw) => ({
          query: kw.keyword,
          clicks: kw.clicks,
          impressions: kw.impressions,
          ctr: kw.ctr,
          position: kw.position,
        })),
      },
      indexedPages: Math.round(130 + progress * 30 + Math.random() * 5),
      notIndexedPages: Math.round(25 - progress * 5 + Math.random() * 3),
      indexingIssues: [
        { reason: "Crawled - currently not indexed", count: Math.round(12 - progress * 4), urls: ["https://optimisedigital.com.au/tag/seo/"] },
        { reason: "Discovered - currently not indexed", count: Math.round(8 - progress * 2), urls: ["https://optimisedigital.com.au/author/admin/"] },
        { reason: "Duplicate without user-selected canonical", count: 3, urls: ["https://optimisedigital.com.au/page/2/"] },
      ],
      cwvMobile: {
        lcp: Math.round(2400 - progress * 300 + Math.random() * 100),
        inp: Math.round(180 - progress * 30 + Math.random() * 20),
        cls: Math.round((0.08 - progress * 0.02 + Math.random() * 0.01) * 100) / 100,
        status: "GOOD",
        source: "field",
      },
      cwvDesktop: {
        lcp: Math.round(1200 - progress * 150 + Math.random() * 50),
        inp: Math.round(95 - progress * 15 + Math.random() * 10),
        cls: Math.round((0.02 + Math.random() * 0.005) * 1000) / 1000,
        status: "GOOD",
        source: "field",
      },
      previousSnapshot: previousSnapshotId,
    };

    const snapshot = await payload.create({
      collection: "gsc-snapshots",
      overrideAccess: true,
      data: snapshotData as any,
    });

    previousSnapshotId = snapshot.id;
    latestSnapshotId = snapshot.id;
  }

  // Update client to point to the most recent snapshot
  await payload.update({
    collection: "clients",
    id: client.id,
    overrideAccess: true,
    data: {
      latestGscSnapshot: latestSnapshotId as any,
      gscConnected: true,
      gscLastSync: now.toISOString(),
      brandKeywords: "optimise digital, optimisedigital, od agency",
    },
  });

  return NextResponse.json({ ok: true, snapshotsCreated: 13, latestSnapshotId });
}
