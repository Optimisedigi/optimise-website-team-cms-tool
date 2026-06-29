import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { extractRootDomain } from "@/lib/proposal-audit-backfill";

export const maxDuration = 60;

function relationshipId(value: any): number | string | null {
  if (!value) return null;
  if (typeof value === "object") return value.id ?? null;
  return value;
}

type TrafficDomainWorkItem = {
  key: string;
  domain: string;
  source: "yourProfile" | "competitor";
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let proposal: any;
  try {
    proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      overrideAccess: true,
    });
  } catch (err: any) {
    console.error(`[refresh-competitor-traffic] Failed to fetch proposal ${id}:`, err?.message || err);
    return NextResponse.json({ error: "Proposal not found", detail: err?.message }, { status: 404 });
  }

  const competitorAnalysisId = relationshipId(proposal.competitorAnalysis);
  if (competitorAnalysisId == null) {
    return NextResponse.json({ error: "No linked competitor analysis found for this proposal" }, { status: 400 });
  }

  const competitorAnalysis = await payload.findByID({
    collection: "competitor-analyses",
    id: competitorAnalysisId as any,
    overrideAccess: true,
  });

  const competitors = Array.isArray((competitorAnalysis as any)?.competitors) ? (competitorAnalysis as any).competitors : [];
  const domains: TrafficDomainWorkItem[] = [];
  const yourProfileDomain = (competitorAnalysis as any)?.yourProfile?.domain || (competitorAnalysis as any)?.yourProfile?.website || (competitorAnalysis as any)?.yourProfile?.url;
  const yourRootDomain = typeof yourProfileDomain === "string" ? extractRootDomain(yourProfileDomain) : "";
  if (yourRootDomain) domains.push({ key: "yourProfile", domain: yourRootDomain, source: "yourProfile" });

  competitors.forEach((profile: any, index: number) => {
    const rawDomain = profile?.domain || profile?.website || profile?.url;
    const rootDomain = typeof rawDomain === "string" ? extractRootDomain(rawDomain) : "";
    if (rootDomain) domains.push({ key: String(index), domain: rootDomain, source: "competitor" });
  });

  if (domains.length === 0) {
    return NextResponse.json({ error: "No competitor domains found for this proposal" }, { status: 400 });
  }

  const jobId = `proposal-${id}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  await payload.update({
    collection: "client-proposals",
    id,
    data: {
      auditStatus: "running",
      auditProgress: "Queued local competitor monthly visits fetch|5",
      auditStartedAt: now,
      auditCompletedAt: null,
      auditError: null,
      competitorTrafficJobStatus: "queued",
      competitorTrafficJobId: jobId,
      competitorTrafficJobDomains: domains,
      competitorTrafficJobResults: null,
      competitorTrafficJobError: null,
      competitorTrafficJobUpdatedAt: now,
    } as any,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true, status: "queued", jobId, domains });
}
