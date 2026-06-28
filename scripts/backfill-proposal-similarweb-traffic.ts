import { getPayload } from "payload";
import config from "../src/payload.config";

function idOf(value: any) {
  return value && typeof value === "object" ? value.id : value;
}

function normaliseDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function trafficForProfile(data: any) {
  if (data.status === "unavailable") return data;
  return {
    monthlyVisits: data.averageMonthlyVisits ?? null,
    globalRank: data.globalRank ?? null,
    sources: data.trafficSources ?? null,
    status: "available",
    cacheStatus: data.cacheStatus,
  };
}

async function fetchTraffic(domain: string) {
  const growthToolsUrl = process.env.GROWTH_TOOLS_URL || "http://localhost:5000";
  const response = await fetch(`${growthToolsUrl.replace(/\/$/, "")}/api/traffic?domain=${encodeURIComponent(domain)}`);
  if (!response.ok) throw new Error(`Growth Tools traffic request failed for ${domain}: ${response.status}`);
  return trafficForProfile(await response.json());
}

async function main() {
  const proposalSlug = process.env.PROPOSAL_SLUG;
  const proposalId = process.env.PROPOSAL_ID;
  if (!proposalSlug && !proposalId) throw new Error("Set PROPOSAL_SLUG or PROPOSAL_ID");

  const payload = await getPayload({ config: await config });
  const proposal = proposalId
    ? await payload.findByID({ collection: "client-proposals", id: proposalId, overrideAccess: true, depth: 1 })
    : (await payload.find({ collection: "client-proposals", where: { slug: { equals: proposalSlug } }, limit: 1, overrideAccess: true, depth: 1 })).docs[0];

  if (!proposal) throw new Error(`Missing proposal ${proposalSlug || proposalId}`);
  const competitorAnalysisId = idOf(proposal.competitorAnalysis);
  if (!competitorAnalysisId) throw new Error(`Proposal ${proposal.id} has no linked competitor analysis`);

  const analysis = await payload.findByID({ collection: "competitor-analyses", id: competitorAnalysisId, overrideAccess: true });
  const yourProfile = (analysis.yourProfile && typeof analysis.yourProfile === "object" && !Array.isArray(analysis.yourProfile))
    ? analysis.yourProfile as Record<string, any>
    : {};
  const competitors = Array.isArray(analysis.competitors) ? analysis.competitors as any[] : [];
  const domains = Array.from(new Set([yourProfile.domain, ...competitors.map((competitor: any) => competitor.domain)].filter(Boolean).map(normaliseDomain)));
  const trafficByDomain = new Map<string, any>();

  for (const domain of domains) {
    console.log(`[Traffic] Fetching ${domain}`);
    trafficByDomain.set(domain, await fetchTraffic(domain));
  }

  const updatedYourProfile = yourProfile.domain
    ? { ...yourProfile, traffic: trafficByDomain.get(normaliseDomain(yourProfile.domain)) }
    : yourProfile;
  const updatedCompetitors = competitors.map((competitor: any) => competitor.domain
    ? { ...competitor, traffic: trafficByDomain.get(normaliseDomain(competitor.domain)) }
    : competitor);

  await payload.update({
    collection: "competitor-analyses",
    id: competitorAnalysisId,
    data: { yourProfile: updatedYourProfile, competitors: updatedCompetitors },
    overrideAccess: true,
  });

  console.log(JSON.stringify({
    proposalId: proposal.id,
    proposalSlug: proposal.slug,
    competitorAnalysisId,
    domainsUpdated: domains.length,
    yourProfileTraffic: updatedYourProfile.traffic,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
