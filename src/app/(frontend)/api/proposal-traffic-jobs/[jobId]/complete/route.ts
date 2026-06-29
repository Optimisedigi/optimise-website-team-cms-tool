import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { explicitUnavailableTraffic, formatTraffic, type FormattedTraffic } from "@/lib/proposal-audit-backfill";

export const maxDuration = 120;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

type IncomingTrafficResult = {
  key: string;
  domain: string;
  payload?: unknown;
  traffic?: unknown;
  status?: "available" | "unavailable" | "failed" | string;
  unavailableReason?: string;
};

function internalKeyMatches(req: NextRequest): boolean {
  const provided = req.headers.get("x-internal-key");
  return Boolean(INTERNAL_API_KEY && provided && provided === INTERNAL_API_KEY);
}

function relationshipId(value: any): number | string | null {
  if (!value) return null;
  if (typeof value === "object") return value.id ?? null;
  return value;
}

async function importToGrowthTools(domain: string, rawPayload: unknown): Promise<FormattedTraffic | null> {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY || !rawPayload) return null;
  try {
    const res = await fetch(`${GROWTH_TOOLS_URL}/api/traffic/import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({ domain, payload: rawPayload }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return formatTraffic(data?.traffic ?? data);
  } catch {
    return null;
  }
}

async function normaliseResult(result: IncomingTrafficResult): Promise<FormattedTraffic> {
  if (result.status === "unavailable" || result.status === "failed") {
    return explicitUnavailableTraffic(result.unavailableReason ?? result.status ?? "failed");
  }

  const imported = await importToGrowthTools(result.domain, result.payload);
  if (imported?.status === "available" || typeof imported?.monthlyVisits === "number") return imported;

  if (result.traffic) return formatTraffic(result.traffic);
  if (result.payload) return formatTraffic(result.payload);

  return explicitUnavailableTraffic(result.unavailableReason ?? "failed");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!internalKeyMatches(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const body = await req.json().catch(() => null) as { results?: IncomingTrafficResult[] } | null;
  const results = Array.isArray(body?.results) ? body.results : [];
  if (results.length === 0) {
    return NextResponse.json({ error: "No results supplied" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const proposals = await payload.find({
    collection: "client-proposals",
    where: { competitorTrafficJobId: { equals: jobId } },
    limit: 1,
    overrideAccess: true,
  });
  const proposal = proposals.docs[0] as any;
  if (!proposal) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const competitorAnalysisId = relationshipId(proposal.competitorAnalysis);
  if (competitorAnalysisId == null) {
    return NextResponse.json({ error: "No linked competitor analysis found for this job" }, { status: 400 });
  }

  const competitorAnalysis = await payload.findByID({
    collection: "competitor-analyses",
    id: competitorAnalysisId as any,
    overrideAccess: true,
  });

  const trafficEntries = await Promise.all(results.map(async (result) => ({
    key: result.key,
    domain: result.domain,
    traffic: await normaliseResult(result),
  })));

  const trafficMap = new Map(trafficEntries.map((entry) => [entry.key, entry.traffic]));
  const competitors = Array.isArray((competitorAnalysis as any)?.competitors) ? (competitorAnalysis as any).competitors : [];
  const updatedYourProfile = (competitorAnalysis as any)?.yourProfile && typeof (competitorAnalysis as any).yourProfile === "object"
    ? { ...((competitorAnalysis as any).yourProfile as Record<string, any>) }
    : null;

  if (updatedYourProfile && trafficMap.has("yourProfile")) {
    updatedYourProfile.traffic = trafficMap.get("yourProfile");
  }

  const updatedCompetitors = competitors.map((profile: any, index: number) => {
    const key = String(index);
    if (!trafficMap.has(key)) return profile;
    return { ...profile, traffic: trafficMap.get(key) };
  });

  await payload.update({
    collection: "competitor-analyses",
    id: competitorAnalysisId as any,
    data: {
      yourProfile: updatedYourProfile,
      competitors: updatedCompetitors,
    } as any,
    overrideAccess: true,
  });

  const warnings = trafficEntries
    .filter((entry) => entry.traffic.status === "unavailable")
    .map((entry) => `Traffic unavailable for ${entry.domain}: ${entry.traffic.unavailableReason ?? "failed"}`);
  const now = new Date().toISOString();
  const hasAvailable = trafficEntries.some((entry) => entry.traffic.status === "available" || typeof entry.traffic.monthlyVisits === "number");
  const jobStatus = hasAvailable || warnings.length < trafficEntries.length ? "completed" : "failed";

  await payload.update({
    collection: "client-proposals",
    id: proposal.id,
    data: {
      auditStatus: jobStatus === "completed" ? "completed" : "failed",
      auditProgress: warnings.length > 0
        ? "Competitor monthly visits refreshed with warnings|100"
        : "Competitor monthly visits refreshed|100",
      auditCompletedAt: now,
      auditError: warnings.length > 0 ? warnings.join("\n") : null,
      competitorTrafficJobStatus: jobStatus,
      competitorTrafficJobResults: Object.fromEntries(trafficEntries.map((entry) => [entry.key, { domain: entry.domain, traffic: entry.traffic }])),
      competitorTrafficJobError: warnings.length > 0 ? warnings.join("\n") : null,
      competitorTrafficJobUpdatedAt: now,
    } as any,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true, status: jobStatus, warnings });
}
