import { getPayload } from "payload";
import config from "../src/payload.config";

const slug = "futuro-futuro-test-proposal";
const websiteUrl = "https://futurofuturo.com";
const businessType = "ecommerce";
const conversionGoal = "e-commerce";
const targetLocation = "us";
const keywords = [
  "range hood",
  "kitchen range hood",
  "island range hood",
  "wall mount range hood",
  "ductless range hood",
  "stainless steel range hood",
  "modern range hood",
  "custom range hood",
  "range hood insert",
  "vent hood for kitchen",
];

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function idOf(value: any): number | string | undefined {
  if (!value) return undefined;
  return typeof value === "object" ? value.id : value;
}

function trafficSummary(profile: any) {
  const traffic = profile?.traffic;
  if (!traffic) return { status: "missing" };
  return {
    status: traffic.status ?? (typeof traffic.monthlyVisits === "number" ? "available" : "unknown"),
    monthlyVisits: traffic.monthlyVisits ?? null,
    unavailableReason: traffic.unavailableReason ?? null,
  };
}

async function postJson(path: string, body: Record<string, unknown>) {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    throw new Error("Missing GROWTH_TOOLS_URL or INTERNAL_API_KEY");
  }

  const res = await fetch(`${GROWTH_TOOLS_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} failed: ${res.status} ${text.slice(0, 500)}`);
  }

  return res.json();
}

async function main() {
  const payload = await getPayload({ config: await config });
  const keywordText = keywords.join("\n");

  const existing = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });

  const proposalData = {
    businessName: "Futuro Futuro Test Proposal",
    slug,
    websiteUrl,
    businessType,
    conversionGoal,
    targetLocation,
    keywordCategories: [{ categoryName: "range hood", keywords: keywordText }],
    keywords: keywordText,
    auditStatus: "running",
    auditProgress: "Starting one-off Futuro audit|0",
    auditStartedAt: new Date().toISOString(),
    auditCompletedAt: null,
    auditError: null,
  } as any;

  const proposal = existing.docs[0]
    ? await payload.update({ collection: "client-proposals", id: existing.docs[0].id, data: proposalData, overrideAccess: true })
    : await payload.create({ collection: "client-proposals", data: proposalData, overrideAccess: true });

  console.log(`[DONE:1] proposal=${proposal.id} slug=${proposal.slug}`);

  const [seoSettled, croSettled, kwSettled, compSettled, contentSettled] = await Promise.allSettled([
    postJson("/api/seo-audits", { websiteUrl, businessType }),
    postJson("/api/audits", { websiteUrl, conversionGoal, businessType }),
    postJson("/api/track-keywords", { website: websiteUrl, keywords: keywordText, location: targetLocation }),
    postJson("/api/competitor-analysis", { websiteUrl, keywords: keywords.join(","), location: targetLocation }),
    Promise.allSettled(keywords.slice(0, 5).map((keyword) => postJson("/api/content-research", { keyword, location: targetLocation }))),
  ]);
  const errors: string[] = [];
  if (seoSettled.status === "rejected") errors.push(seoSettled.reason?.message || "SEO audit failed");
  if (croSettled.status === "rejected") errors.push(croSettled.reason?.message || "CRO audit failed");
  if (kwSettled.status === "rejected") errors.push(kwSettled.reason?.message || "Keyword tracking failed");
  if (compSettled.status === "rejected") errors.push(compSettled.reason?.message || "Competitor analysis failed");
  const contentResults = contentSettled.status === "fulfilled"
    ? contentSettled.value.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled").map((r) => r.value)
    : [];
  if (contentSettled.status === "rejected") errors.push(contentSettled.reason?.message || "Content research failed");
  console.log(`[DONE:2] growth-tools endpoints completed with ${errors.length} error(s)`);

  const proposalId = Number(proposal.id);
  const auditIds: Record<string, any> = {};
  if (seoSettled.status === "fulfilled") {
    const seoResult = seoSettled.value;
    const seoAudit = await payload.create({ collection: "seo-audits", data: { ...seoResult, websiteUrl: seoResult.websiteUrl || websiteUrl, businessType: seoResult.businessType || businessType, proposal: proposalId }, overrideAccess: true });
    auditIds.seoAudit = seoAudit.id;
  }
  if (croSettled.status === "fulfilled") {
    const croResult = croSettled.value;
    const croAudit = await payload.create({ collection: "cro-audits", data: { ...croResult, websiteUrl: croResult.websiteUrl || websiteUrl, conversionGoal: croResult.conversionGoal || conversionGoal, proposal: proposalId }, overrideAccess: true });
    auditIds.croAudit = croAudit.id;
  }
  const kwResult = kwSettled.status === "fulfilled" ? kwSettled.value : { keywords: [] };
  const kwData = Array.isArray(kwResult.keywords) ? kwResult.keywords : Array.isArray(kwResult.results) ? kwResult.results : [];
  const ranked = kwData.filter((k: any) => k.position != null && k.position > 0);
  if (kwSettled.status === "fulfilled") {
    const keywordSnapshot = await payload.create({
      collection: "keyword-snapshots",
      data: {
        websiteUrl,
        totalKeywords: kwData.length,
        top10: ranked.filter((k: any) => k.position <= 10).length,
        avgPosition: ranked.length ? Math.round((ranked.reduce((sum: number, k: any) => sum + k.position, 0) / ranked.length) * 10) / 10 : null,
        opportunities: kwData.filter((k: any) => k.opportunity === "high" || k.opportunity === "medium").length,
        keywords: kwData.map((k: any) => ({ ...k, searchVolume: k.searchVolume ?? k.search_volume ?? k.volume ?? k.monthlySearches ?? 0 })),
        rankingDistribution: {
          top10: ranked.filter((k: any) => k.position <= 10).length,
          top20: ranked.filter((k: any) => k.position <= 20).length,
          top50: ranked.filter((k: any) => k.position <= 50).length,
          notFound: kwData.length - ranked.length,
        },
        proposal: proposalId,
      },
      overrideAccess: true,
    });
    auditIds.keywordSnapshot = keywordSnapshot.id;
  }
  if (compSettled.status === "fulfilled") {
    const compResult = compSettled.value;
    const competitorAnalysis = await payload.create({ collection: "competitor-analyses", data: { websiteUrl, keywords, location: targetLocation, totalCompetitors: compResult.competitors?.length || 0, yourProfile: compResult.yourProfile || null, competitors: compResult.competitors || [], proposal: proposalId }, overrideAccess: true });
    auditIds.competitorAnalysis = competitorAnalysis.id;
  }
  const contentResearch = await Promise.all(contentResults.map((cr: any) => payload.create({ collection: "content-researches", data: { keyword: cr.keyword, location: cr.location || targetLocation, totalQuestions: cr.totalQuestions || 0, clusters: cr.clusters || [], externalId: cr.id || null, proposal: proposalId }, overrideAccess: true })));
  if (contentResearch.length > 0) auditIds.contentResearch = contentResearch.map((cr) => cr.id);
  await payload.update({ collection: "client-proposals", id: proposal.id, data: { ...auditIds, auditStatus: auditIds.competitorAnalysis ? "completed" : "failed", auditProgress: auditIds.competitorAnalysis ? "Complete|100" : "Failed|100", auditCompletedAt: new Date().toISOString(), auditError: errors.length ? errors.join("\n") : null, keywordCategories: [{ categoryName: "range hood", keywords: keywordText }] } as any, overrideAccess: true });
  console.log("[DONE:3] audit records persisted");

  const savedProposal = await payload.findByID({ collection: "client-proposals", id: proposal.id, overrideAccess: true, depth: 1 });
  const savedCompId = idOf(savedProposal.competitorAnalysis);
  const savedComp = savedCompId ? await payload.findByID({ collection: "competitor-analyses", id: savedCompId, overrideAccess: true }) : null;
  const savedCompetitors = Array.isArray(savedComp?.competitors) ? savedComp.competitors as any[] : [];
  const competitorTrafficCount = savedCompetitors.filter((c: any) => c.traffic?.status || typeof c.traffic?.monthlyVisits === "number").length;
  console.log("[DONE:4]", JSON.stringify({ categoryName: savedProposal.keywordCategories?.[0]?.categoryName, yourProfileTraffic: trafficSummary(savedComp?.yourProfile), competitorTrafficCount, totalCompetitors: savedCompetitors.length }, null, 2));

  const deckBase = process.env.NEXT_PUBLIC_SERVER_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || "http://localhost:3004";
  console.log(`[DONE:5] deckUrl=${deckBase}/proposals/${slug}/v2`);
}

main().catch((error) => {
  console.error("[FAILED]", error);
  process.exit(1);
});
