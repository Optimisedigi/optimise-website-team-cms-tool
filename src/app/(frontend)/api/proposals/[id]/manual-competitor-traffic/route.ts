import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export const maxDuration = 60;

type ManualTrafficInput = {
  yourProfileMonthlyVisits?: number | null;
  competitors?: Array<{ key: string; domain?: string | null; monthlyVisits?: number | null }>;
};

type TrafficProfile = {
  key: string;
  source: "analysis" | "input";
  sourceIndex: number;
  name?: string | null;
  domain?: string | null;
  manualMonthlyVisits?: number | null;
  traffic?: { monthlyVisits?: number | null; status?: string | null } | null;
};

function relationshipId(value: any): number | string | null {
  if (!value) return null;
  if (typeof value === "object") return value.id ?? null;
  return value;
}

function cleanMonthlyVisits(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return Math.round(numberValue);
}

function normaliseDomain(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function mapInputCompetitor(competitor: any, index: number): TrafficProfile | null {
  const domain = normaliseDomain(competitor?.websiteUrl ?? competitor?.domain);
  const name = typeof competitor?.name === "string" ? competitor.name : null;
  if (!domain && !name) return null;
  return {
    key: `input:${index}`,
    source: "input",
    sourceIndex: index,
    name,
    domain: domain || name || `Competitor ${index + 1}`,
    manualMonthlyVisits: competitor?.manualMonthlyVisits ?? null,
    traffic: typeof competitor?.manualMonthlyVisits === "number"
      ? { monthlyVisits: competitor.manualMonthlyVisits, status: "available" }
      : null,
  };
}

function mapAnalysisCompetitor(profile: any, index: number): TrafficProfile {
  return {
    ...profile,
    key: `analysis:${index}`,
    source: "analysis",
    sourceIndex: index,
  };
}

function buildCompetitorRows(proposal: any, competitorAnalysis: any | null): TrafficProfile[] {
  const allInputRows = Array.isArray(proposal?.competitors)
    ? proposal.competitors
      .map(mapInputCompetitor)
      .filter((row: TrafficProfile | null): row is TrafficProfile => Boolean(row))
    : [];
  const inputManualVisitEntries = allInputRows
    .map((row: TrafficProfile): [string, number | null | undefined] => [normaliseDomain(row.domain), row.manualMonthlyVisits])
    .filter((entry: [string, number | null | undefined]): entry is [string, number] => Boolean(entry[0]) && typeof entry[1] === "number");
  const inputManualVisitsByDomain = new Map(inputManualVisitEntries);
  const analysisRows = Array.isArray(competitorAnalysis?.competitors)
    ? competitorAnalysis.competitors.map((profile: any, index: number) => {
      const row = mapAnalysisCompetitor(profile, index);
      const inputManualVisits = inputManualVisitsByDomain.get(normaliseDomain(row.domain));
      return typeof inputManualVisits === "number"
        ? { ...row, manualMonthlyVisits: inputManualVisits }
        : row;
    })
    : [];
  const seenDomains = new Set(analysisRows.map((row: TrafficProfile) => normaliseDomain(row.domain)).filter(Boolean));
  const inputRows = allInputRows.filter((row: TrafficProfile) => {
    const domain = normaliseDomain(row.domain);
    if (!domain || !seenDomains.has(domain)) return true;
    return false;
  });
  return [...analysisRows, ...inputRows];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const proposal = await payload.findByID({ collection: "client-proposals", id, overrideAccess: true });
  const competitorAnalysisId = relationshipId((proposal as any).competitorAnalysis);
  const competitorAnalysis = competitorAnalysisId == null
    ? null
    : await payload.findByID({
      collection: "competitor-analyses",
      id: competitorAnalysisId as any,
      overrideAccess: true,
    });

  return NextResponse.json({
    ok: true,
    yourProfile: (competitorAnalysis as any)?.yourProfile ?? null,
    competitors: buildCompetitorRows(proposal, competitorAnalysis),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as ManualTrafficInput | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const proposal = await payload.findByID({ collection: "client-proposals", id, overrideAccess: true });
  const competitorAnalysisId = relationshipId((proposal as any).competitorAnalysis);
  const competitorAnalysis = competitorAnalysisId == null
    ? null
    : await payload.findByID({
      collection: "competitor-analyses",
      id: competitorAnalysisId as any,
      overrideAccess: true,
    });

  const submittedCompetitors = body.competitors ?? [];
  const manualByKey = new Map(submittedCompetitors.map((row) => [row.key, cleanMonthlyVisits(row.monthlyVisits)]));
  const manualByDomain = new Map(
    submittedCompetitors
      .map((row): [string, number | null] => [normaliseDomain(row.domain), cleanMonthlyVisits(row.monthlyVisits)])
      .filter((entry): entry is [string, number] => Boolean(entry[0]) && typeof entry[1] === "number"),
  );

  const inputCompetitors = Array.isArray((proposal as any).competitors) ? (proposal as any).competitors : [];
  if (Array.isArray((proposal as any).competitors)) {
    const updatedInputCompetitors = inputCompetitors.map((competitor: any, index: number) => {
      const domain = normaliseDomain(competitor?.websiteUrl ?? competitor?.domain);
      const manualMonthlyVisits = manualByKey.has(`input:${index}`)
        ? manualByKey.get(`input:${index}`)
        : manualByDomain.get(domain) ?? competitor?.manualMonthlyVisits ?? null;
      return { ...competitor, manualMonthlyVisits };
    });

    await payload.update({
      collection: "client-proposals",
      id,
      data: { competitors: updatedInputCompetitors } as any,
      overrideAccess: true,
    });
  }

  if (competitorAnalysisId != null && competitorAnalysis) {
    const updatedYourProfile = (competitorAnalysis as any).yourProfile && typeof (competitorAnalysis as any).yourProfile === "object"
      ? { ...((competitorAnalysis as any).yourProfile as Record<string, any>) }
      : null;

    if (updatedYourProfile) {
      updatedYourProfile.manualMonthlyVisits = cleanMonthlyVisits(body.yourProfileMonthlyVisits);
    }

    const competitors = Array.isArray((competitorAnalysis as any).competitors) ? (competitorAnalysis as any).competitors : [];
    const updatedCompetitors = competitors.map((profile: any, index: number) => ({
      ...profile,
      manualMonthlyVisits: manualByKey.has(`analysis:${index}`) ? manualByKey.get(`analysis:${index}`) : profile?.manualMonthlyVisits ?? null,
    }));

    await payload.update({
      collection: "competitor-analyses",
      id: competitorAnalysisId as any,
      data: {
        yourProfile: updatedYourProfile,
        competitors: updatedCompetitors,
      } as any,
      overrideAccess: true,
    });
  }

  return NextResponse.json({ ok: true });
}
