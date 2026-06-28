import { getPayload } from "payload";
import config from "../src/payload.config";

const slug = "futuro-futuro-test-proposal";
const websiteUrl = "https://futurofuturo.com";
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

function idOf(value: any) {
  return value && typeof value === "object" ? value.id : value;
}

async function main() {
  const payload = await getPayload({ config: await config });
  const found = await payload.find({ collection: "client-proposals", where: { slug: { equals: slug } }, limit: 1, overrideAccess: true, depth: 1 });
  if (!found.docs[0]) throw new Error(`Missing proposal ${slug}`);
  const proposal = found.docs[0];
  const traffic = { domain: "futurofuturo.com", monthlyVisits: null, globalRank: null, categoryRank: null, sources: null, status: "unavailable", unavailableReason: "blocked" };
  let competitorAnalysisId = idOf(proposal.competitorAnalysis);
  if (!competitorAnalysisId) {
    const created = await payload.create({
      collection: "competitor-analyses",
      data: {
        websiteUrl,
        keywords,
        location: "us",
        totalCompetitors: 0,
        yourProfile: { domain: "futurofuturo.com", name: "Futuro Futuro", traffic },
        competitors: [],
        proposal: proposal.id,
      },
      overrideAccess: true,
    });
    competitorAnalysisId = created.id;
  } else {
    const existing = await payload.findByID({ collection: "competitor-analyses", id: competitorAnalysisId, overrideAccess: true });
    const existingYourProfile = (existing.yourProfile && typeof existing.yourProfile === "object" && !Array.isArray(existing.yourProfile))
      ? existing.yourProfile as Record<string, any>
      : {};
    const existingCompetitors = Array.isArray(existing.competitors) ? existing.competitors as any[] : [];
    await payload.update({
      collection: "competitor-analyses",
      id: competitorAnalysisId,
      data: {
        yourProfile: { ...existingYourProfile, domain: existingYourProfile.domain || "futurofuturo.com", traffic },
        competitors: existingCompetitors,
      },
      overrideAccess: true,
    });
  }
  await payload.update({
    collection: "client-proposals",
    id: proposal.id,
    data: {
      competitorAnalysis: competitorAnalysisId,
      keywordCategories: [{ categoryName: "range hood", keywords: keywords.join("\n") }],
      auditStatus: "completed",
      auditProgress: "Traffic unavailable — Similarweb blocked|100",
      auditCompletedAt: new Date().toISOString(),
      auditError: "Growth Tools traffic endpoint returned status=unavailable, unavailableReason=blocked for futurofuturo.com. Full SEO audit crawl also failed with 400: Failed to fetch the website.",
    } as any,
    overrideAccess: true,
  });
  const saved = await payload.findByID({ collection: "competitor-analyses", id: competitorAnalysisId, overrideAccess: true });
  const savedYourProfile = (saved.yourProfile && typeof saved.yourProfile === "object" && !Array.isArray(saved.yourProfile))
    ? saved.yourProfile as Record<string, any>
    : {};
  const savedCompetitors = Array.isArray(saved.competitors) ? saved.competitors as any[] : [];
  console.log(JSON.stringify({ proposalId: proposal.id, slug, keywordCategory: "range hood", competitorAnalysisId, yourProfileTraffic: savedYourProfile.traffic, competitorTrafficCount: savedCompetitors.filter((c: any) => c.traffic?.status || typeof c.traffic?.monthlyVisits === "number").length, totalCompetitors: savedCompetitors.length, deckUrl: `${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3004"}/proposals/${slug}/v2` }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
