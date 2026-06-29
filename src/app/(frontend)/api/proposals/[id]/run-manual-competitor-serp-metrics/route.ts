import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  buildProposalKeywords,
  classifyManualCompetitors,
  type ManualCompetitorRow,
} from "@/lib/manual-competitor-serp-metrics";

export const maxDuration = 300;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown Growth Tools error";
}

function withUpdatedCompetitor(
  competitors: ManualCompetitorRow[],
  index: number,
  patch: Record<string, any>,
): ManualCompetitorRow[] {
  return competitors.map((competitor, rowIndex) => (rowIndex === index ? { ...competitor, ...patch } : competitor));
}

async function saveCompetitorPatch(
  payload: any,
  id: string,
  fallbackCompetitors: ManualCompetitorRow[],
  index: number,
  originalCompetitor: ManualCompetitorRow,
  patch: Record<string, any>,
) {
  const latestProposal = await payload.findByID({
    collection: "client-proposals",
    id,
    overrideAccess: true,
  });
  const latestCompetitors = Array.isArray(latestProposal?.competitors) ? latestProposal.competitors : fallbackCompetitors;
  const originalRowId = originalCompetitor?.id;
  const targetIndex = originalRowId
    ? latestCompetitors.findIndex((competitor: ManualCompetitorRow) => competitor?.id === originalRowId)
    : index;
  const nextCompetitors = withUpdatedCompetitor(latestCompetitors, targetIndex >= 0 ? targetIndex : index, patch);

  await payload.update({
    collection: "client-proposals",
    id,
    data: { competitors: nextCompetitors } as any,
    overrideAccess: true,
  });
  return nextCompetitors;
}

async function fetchGrowthToolsProfile(websiteUrl: string, keywords: string[], targetLocation?: string | null) {
  const res = await fetch(`${GROWTH_TOOLS_URL}/api/competitor-analysis`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-key": INTERNAL_API_KEY!,
    },
    body: JSON.stringify({
      websiteUrl,
      keywords: keywords.join("\n"),
      location: targetLocation || undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Growth Tools failed (${res.status})`);
  }
  return data?.yourProfile ?? {};
}

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

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
      { status: 500 },
    );
  }

  let proposal: any;
  try {
    proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      overrideAccess: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Proposal not found", detail: err?.message }, { status: 404 });
  }

  const keywords = buildProposalKeywords(proposal);
  if (keywords.length === 0) {
    return NextResponse.json({ error: "Add proposal keywords before filling competitor SERP metrics." }, { status: 400 });
  }

  let competitors: ManualCompetitorRow[] = Array.isArray(proposal.competitors) ? proposal.competitors : [];
  const buckets = classifyManualCompetitors(competitors);
  let updated = 0;
  let failed = 0;

  for (const item of buckets.needsFetch) {
    try {
      competitors = await saveCompetitorPatch(payload, id, competitors, item.index, item.competitor, {
        serpMetricsStatus: "running",
        serpMetricsError: null,
      });

      const profile = await fetchGrowthToolsProfile(item.websiteUrl, keywords, proposal.targetLocation);
      const averagePosition = numericOrNull(profile.avgPosition ?? profile.averagePosition);
      const keywordsFound = numericOrNull(profile.keywordsFound);
      const keywordPositions = Array.isArray(profile.keywordPositions) ? profile.keywordPositions : [];
      const noRankingsFound = (keywordsFound ?? 0) === 0 && averagePosition === null;

      competitors = await saveCompetitorPatch(payload, id, competitors, item.index, item.competitor, {
        serpAveragePosition: averagePosition,
        serpKeywordsFound: keywordsFound,
        serpKeywordPositions: keywordPositions,
        serpMetricsStatus: noRankingsFound ? "skipped" : "completed",
        serpMetricsError: null,
        serpMetricsUpdatedAt: new Date().toISOString(),
      });
      updated++;
    } catch (err) {
      failed++;
      competitors = await saveCompetitorPatch(payload, id, competitors, item.index, item.competitor, {
        serpMetricsStatus: "failed",
        serpMetricsError: errorMessage(err),
        serpMetricsUpdatedAt: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({
    updated,
    alreadyFilled: buckets.alreadyFilled.length,
    skippedNoDomain: buckets.skippedNoDomain.length,
    failed,
    requestedFromGrowthTools: buckets.needsFetch.length,
  });
}
