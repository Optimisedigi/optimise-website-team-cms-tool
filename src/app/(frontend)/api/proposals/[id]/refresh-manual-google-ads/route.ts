import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  normaliseManualCompetitorDomain,
  type ManualCompetitorRow,
} from "@/lib/manual-competitor-serp-metrics";

export const maxDuration = 300;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown Growth Tools error";
}

function usableCompetitorUrl(competitor: ManualCompetitorRow): string {
  const websiteUrl = typeof competitor.websiteUrl === "string" ? competitor.websiteUrl.trim() : "";
  if (normaliseManualCompetitorDomain(websiteUrl)) return websiteUrl;

  const name = typeof competitor.name === "string" ? competitor.name.trim() : "";
  const normalisedName = normaliseManualCompetitorDomain(name);
  if (normalisedName.includes(".")) return name;

  return "";
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

async function fetchGrowthToolsGoogleAds(websiteUrl: string) {
  const res = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads-transparency`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-key": INTERNAL_API_KEY!,
    },
    body: JSON.stringify({ domain: websiteUrl }),
    signal: AbortSignal.timeout(45_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Growth Tools failed (${res.status})`);
  }
  return data?.googleAds ?? null;
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

  let competitors: ManualCompetitorRow[] = Array.isArray(proposal.competitors) ? proposal.competitors : [];
  const candidates = competitors
    .map((competitor, index) => ({ competitor, index, websiteUrl: usableCompetitorUrl(competitor) }))
    .filter((item) => item.websiteUrl);

  let checked = 0;
  let runningAds = 0;
  let notRunningAds = 0;
  let failed = 0;

  for (const item of candidates) {
    try {
      const googleAds = await fetchGrowthToolsGoogleAds(item.websiteUrl);
      const isRunningAds = Boolean(googleAds?.isRunningAds);
      const adCount = Number.isFinite(Number(googleAds?.adCount)) ? Number(googleAds.adCount) : null;

      competitors = await saveCompetitorPatch(payload, id, competitors, item.index, item.competitor, {
        hasGoogleAds: isRunningAds,
        googleAdCountOverride: adCount,
      });

      checked++;
      if (isRunningAds) runningAds++;
      else notRunningAds++;
    } catch (err) {
      console.warn(`[manual-google-ads] Failed for proposal ${id} competitor ${item.websiteUrl}: ${errorMessage(err)}`);
      failed++;
    }
  }

  return NextResponse.json({
    checked,
    runningAds,
    notRunningAds,
    skippedNoDomain: competitors.length - candidates.length,
    failed,
  });
}
