import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { fetchMetaAdsForCompetitors } from "@/lib/proposal-meta-ads";

// Meta Ad Library scraping is slow/flaky; give it the full Vercel Pro budget.
export const maxDuration = 300;

// Each Meta Ad Library scrape drives a headless browser (social-link extraction
// + clicking into individual ads) and queues behind the Scrapling service's
// browser-concurrency gate. A 20s cap killed jobs while they were still waiting
// in that queue. Give each item a realistic budget; total runtime stays bounded
// by deadlineAt, which skips remaining competitors once the budget is spent.
const ITEM_TIMEOUT_MS = 50_000;
const DEADLINE_SAFETY_MS = 20_000;

function relationshipId(value: any): number | string | null {
  if (!value) return null;
  if (typeof value === "object") return value.id ?? null;
  return value;
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

  let proposal: any;
  try {
    proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      overrideAccess: true,
    });
  } catch (err: any) {
    console.error(`[refresh-meta-ads] Failed to fetch proposal ${id}:`, err?.message || err);
    return NextResponse.json({ error: "Proposal not found", detail: err?.message }, { status: 404 });
  }

  const competitorAnalysisId = relationshipId(proposal.competitorAnalysis);
  if (competitorAnalysisId == null) {
    return NextResponse.json(
      { error: "No linked competitor analysis found for this proposal. Run the general audit first." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  await payload.update({
    collection: "client-proposals",
    id,
    data: {
      metaAdsStatus: "running",
      metaAdsError: null,
      metaAdsUpdatedAt: now,
    } as any,
    overrideAccess: true,
  });

  const refreshWork = async () => {
    const deadlineAt = Date.now() + maxDuration * 1000 - DEADLINE_SAFETY_MS;
    try {
      const analysis = await payload.findByID({
        collection: "competitor-analyses",
        id: competitorAnalysisId as any,
        overrideAccess: true,
      });

      const competitors = Array.isArray((analysis as any)?.competitors)
        ? (analysis as any).competitors
        : [];

      if (competitors.length === 0) {
        await payload.update({
          collection: "client-proposals",
          id,
          data: {
            metaAdsStatus: "completed",
            metaAdsError: "No competitors to check.",
            metaAdsUpdatedAt: new Date().toISOString(),
          } as any,
          overrideAccess: true,
        });
        return;
      }

      const result = await fetchMetaAdsForCompetitors(competitors, {
        timeoutMs: ITEM_TIMEOUT_MS,
        deadlineAt,
      });

      // Persist merged metaAds/socialLinks back onto the competitor-analyses record.
      await payload.update({
        collection: "competitor-analyses",
        id: competitorAnalysisId as any,
        data: { competitors: result.updated } as any,
        overrideAccess: true,
      });

      const incomplete = result.failed > 0 || result.skipped > 0;
      await payload.update({
        collection: "client-proposals",
        id,
        data: {
          metaAdsStatus: incomplete ? "failed" : "completed",
          metaAdsError: incomplete
            ? `Meta Ads incomplete: ${result.failed} failed, ${result.skipped} skipped (deadline) of ${result.attempted}. Try again.`
            : null,
          metaAdsUpdatedAt: new Date().toISOString(),
        } as any,
        overrideAccess: true,
      });

      console.log(
        `[refresh-meta-ads] Proposal ${id}: attempted=${result.attempted} withAds=${result.withAds} failed=${result.failed} skipped=${result.skipped}`,
      );
    } catch (e: any) {
      console.error("[refresh-meta-ads] Unexpected error:", e?.message || e);
      await payload
        .update({
          collection: "client-proposals",
          id,
          data: {
            metaAdsStatus: "failed",
            metaAdsError: e?.message || "Unexpected error while refreshing Meta Ads.",
            metaAdsUpdatedAt: new Date().toISOString(),
          } as any,
          overrideAccess: true,
        })
        .catch(() => {});
    }
  };

  after(refreshWork);

  return NextResponse.json({ ok: true, status: "running" });
}
