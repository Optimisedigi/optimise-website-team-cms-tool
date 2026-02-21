import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * POST /api/gsc/seed
 * Seeds a realistic GSC snapshot for the "optimise-digital" client so
 * the dashboard and Search Console page can be previewed without a
 * live GSC connection. Auth required.
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
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 27);

  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  const snapshot = await payload.create({
    collection: "gsc-snapshots",
    overrideAccess: true,
    data: {
      client: client.id,
      snapshotDate: now.toISOString(),
      periodStart: formatDate(startDate),
      periodEnd: formatDate(endDate),
      totalClicks: 1847,
      totalImpressions: 42360,
      avgCtr: 4.4,
      avgPosition: 14.2,
      clicksChange: 12,
      impressionsChange: 8,
      positionChange: -1.3,
      topKeywords: [
        { keyword: "seo agency sydney", clicks: 142, impressions: 3200, ctr: 4.4, position: 6.2 },
        { keyword: "digital marketing agency", clicks: 98, impressions: 5100, ctr: 1.9, position: 18.4 },
        { keyword: "local seo services", clicks: 87, impressions: 2800, ctr: 3.1, position: 8.7 },
        { keyword: "google ads management", clicks: 76, impressions: 2400, ctr: 3.2, position: 11.3 },
        { keyword: "website audit tool", clicks: 65, impressions: 1900, ctr: 3.4, position: 9.1 },
        { keyword: "seo audit free", clicks: 54, impressions: 3600, ctr: 1.5, position: 22.1 },
        { keyword: "small business seo", clicks: 48, impressions: 2100, ctr: 2.3, position: 15.6 },
        { keyword: "ecommerce seo agency", clicks: 41, impressions: 1200, ctr: 3.4, position: 7.8 },
        { keyword: "technical seo services", clicks: 38, impressions: 980, ctr: 3.9, position: 5.4 },
        { keyword: "content marketing strategy", clicks: 35, impressions: 1800, ctr: 1.9, position: 19.2 },
        { keyword: "ppc management sydney", clicks: 33, impressions: 890, ctr: 3.7, position: 8.9 },
        { keyword: "conversion rate optimisation", clicks: 29, impressions: 760, ctr: 3.8, position: 10.1 },
        { keyword: "seo consultant near me", clicks: 27, impressions: 1400, ctr: 1.9, position: 16.7 },
        { keyword: "website speed optimisation", clicks: 24, impressions: 680, ctr: 3.5, position: 12.3 },
        { keyword: "link building services", clicks: 22, impressions: 1100, ctr: 2.0, position: 21.5 },
      ],
      topPages: [
        { page: "https://optimisedigital.com.au/", clicks: 320, impressions: 8400, ctr: 3.8, position: 12.1 },
        { page: "https://optimisedigital.com.au/seo-services/", clicks: 245, impressions: 5200, ctr: 4.7, position: 7.3 },
        { page: "https://optimisedigital.com.au/free-seo-audit/", clicks: 189, impressions: 4800, ctr: 3.9, position: 9.8 },
        { page: "https://optimisedigital.com.au/google-ads/", clicks: 156, impressions: 3100, ctr: 5.0, position: 6.5 },
        { page: "https://optimisedigital.com.au/blog/seo-tips-2026/", clicks: 134, impressions: 2900, ctr: 4.6, position: 8.2 },
        { page: "https://optimisedigital.com.au/case-studies/", clicks: 98, impressions: 1800, ctr: 5.4, position: 5.1 },
        { page: "https://optimisedigital.com.au/blog/local-seo-guide/", clicks: 87, impressions: 2200, ctr: 4.0, position: 10.4 },
        { page: "https://optimisedigital.com.au/contact/", clicks: 76, impressions: 1400, ctr: 5.4, position: 4.2 },
        { page: "https://optimisedigital.com.au/web-design/", clicks: 62, impressions: 1600, ctr: 3.9, position: 13.7 },
        { page: "https://optimisedigital.com.au/blog/google-ads-tips/", clicks: 54, impressions: 1200, ctr: 4.5, position: 11.8 },
      ],
      brandedData: {
        clicks: 412,
        impressions: 5800,
        ctr: 7.1,
        position: 2.3,
      },
      nonBrandedData: {
        clicks: 1435,
        impressions: 36560,
        ctr: 3.9,
        position: 16.1,
        topQueries: [
          { query: "seo agency sydney", clicks: 142, impressions: 3200, ctr: 4.4, position: 6.2 },
          { query: "digital marketing agency", clicks: 98, impressions: 5100, ctr: 1.9, position: 18.4 },
          { query: "local seo services", clicks: 87, impressions: 2800, ctr: 3.1, position: 8.7 },
          { query: "google ads management", clicks: 76, impressions: 2400, ctr: 3.2, position: 11.3 },
          { query: "website audit tool", clicks: 65, impressions: 1900, ctr: 3.4, position: 9.1 },
          { query: "seo audit free", clicks: 54, impressions: 3600, ctr: 1.5, position: 22.1 },
          { query: "small business seo", clicks: 48, impressions: 2100, ctr: 2.3, position: 15.6 },
          { query: "ecommerce seo agency", clicks: 41, impressions: 1200, ctr: 3.4, position: 7.8 },
          { query: "technical seo services", clicks: 38, impressions: 980, ctr: 3.9, position: 5.4 },
          { query: "content marketing strategy", clicks: 35, impressions: 1800, ctr: 1.9, position: 19.2 },
        ],
      },
      indexedPages: 156,
      notIndexedPages: 23,
      indexingIssues: [
        { reason: "Crawled - currently not indexed", count: 12, urls: ["https://optimisedigital.com.au/tag/seo/"] },
        { reason: "Discovered - currently not indexed", count: 8, urls: ["https://optimisedigital.com.au/author/admin/"] },
        { reason: "Duplicate without user-selected canonical", count: 3, urls: ["https://optimisedigital.com.au/page/2/"] },
      ],
      cwvMobile: {
        lcp: 2400,
        inp: 180,
        cls: 0.08,
        status: "GOOD",
        source: "field",
      },
      cwvDesktop: {
        lcp: 1200,
        inp: 95,
        cls: 0.02,
        status: "GOOD",
        source: "field",
      },
      previousSnapshot: null,
    },
  });

  // Update client to point to this snapshot and mark as "connected"
  await payload.update({
    collection: "clients",
    id: client.id,
    overrideAccess: true,
    data: {
      latestGscSnapshot: snapshot.id,
      gscConnected: true,
      gscLastSync: now.toISOString(),
      brandKeywords: "optimise digital, optimisedigital, od agency",
    },
  });

  return NextResponse.json({ ok: true, snapshotId: snapshot.id });
}
