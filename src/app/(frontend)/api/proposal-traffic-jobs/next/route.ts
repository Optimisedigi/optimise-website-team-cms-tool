import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export const maxDuration = 60;

function internalKeyMatches(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  const provided = req.headers.get("x-internal-key");
  return Boolean(expected && provided && provided === expected);
}

function relationshipId(value: any): number | string | null {
  if (!value) return null;
  if (typeof value === "object") return value.id ?? null;
  return value;
}

export async function GET(req: NextRequest) {
  if (!internalKeyMatches(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const jobs = await payload.find({
    collection: "client-proposals",
    where: {
      or: [
        { competitorTrafficJobStatus: { equals: "queued" } },
        { competitorTrafficJobStatus: { equals: "running" } },
      ],
    },
    sort: "competitorTrafficJobUpdatedAt",
    limit: 1,
    overrideAccess: true,
  });

  const proposal = jobs.docs[0] as any;
  if (!proposal) {
    return NextResponse.json({ ok: true, job: null });
  }

  const jobId = proposal.competitorTrafficJobId;
  const domains = Array.isArray(proposal.competitorTrafficJobDomains) ? proposal.competitorTrafficJobDomains : [];
  const competitorAnalysisId = relationshipId(proposal.competitorAnalysis);
  const now = new Date().toISOString();

  await payload.update({
    collection: "client-proposals",
    id: proposal.id,
    data: {
      auditProgress: "Local helper fetching competitor monthly visits|25",
      competitorTrafficJobStatus: "running",
      competitorTrafficJobUpdatedAt: now,
    } as any,
    overrideAccess: true,
  });

  return NextResponse.json({
    ok: true,
    job: {
      proposalId: proposal.id,
      competitorAnalysisId,
      jobId,
      domains,
    },
  });
}
