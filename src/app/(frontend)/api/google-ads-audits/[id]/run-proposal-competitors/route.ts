import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { extractManualCompetitorDomains, extractProposalKeywords } from "@/lib/proposalCompetitors";
import { explicitUnavailableTraffic, extractRootDomain, formatTraffic, hasTrafficCoverage } from "@/lib/proposal-audit-backfill";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const TRAFFIC_FETCH_TIMEOUT_MS = 20_000;

async function fetchMonthlyVisits(rootDomain: string) {
  try {
    const res = await fetch(`${GROWTH_TOOLS_URL}/api/traffic?domain=${encodeURIComponent(rootDomain)}`, {
      headers: { "x-internal-key": INTERNAL_API_KEY! },
      signal: AbortSignal.timeout(TRAFFIC_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Traffic API failed: ${res.status}`);
    return formatTraffic(await res.json());
  } catch (err: any) {
    const reason = err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : "failed";
    return explicitUnavailableTraffic(reason);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    let user: any;
    try {
      const authResult = await payload.auth({ headers: req.headers });
      user = authResult.user;
    } catch (authErr) {
      console.error(`[run-proposal-competitors] Auth error:`, authErr);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
        { status: 500 }
      );
    }

    let audit: any;
    try {
      audit = await payload.findByID({
        collection: "google-ads-audits",
        id,
        overrideAccess: true,
      });
    } catch {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    if (!audit?.campaignProposal) {
      return NextResponse.json({ error: "Campaign proposal must exist before fetching competitor monthly visits" }, { status: 400 });
    }

    const existingCompetitors = Array.isArray(audit.campaignProposalCompetitors)
      ? audit.campaignProposalCompetitors
      : [];
    if (existingCompetitors.length === 0) {
      return NextResponse.json({ error: "No stored proposal competitors found. Run competitor discovery first, then fetch monthly visits." }, { status: 400 });
    }

    const keywords = extractProposalKeywords(audit.campaignProposal);
    const manualCompetitors = extractManualCompetitorDomains(audit.campaignProposalManualCompetitors);

    try {
      const dbClient = (payload.db as any).client;
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET campaign_proposal_competitor_status = ? WHERE id = ?",
        args: ["pending", id],
      });
    } catch (err) {
      console.error(`[run-proposal-competitors] Failed to set pending status:`, err);
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Failed to update audit status: ${detail}` }, { status: 500 });
    }

    after(async () => {
      try {
        const dbClient = (payload.db as any).client;
        await dbClient.execute({
          sql: "UPDATE google_ads_audits SET campaign_proposal_competitor_status = ? WHERE id = ?",
          args: ["running", id],
        });

        const competitorsWithTraffic = await Promise.all(existingCompetitors.map(async (competitor: any) => {
          if (hasTrafficCoverage(competitor)) return competitor;
          const domain = typeof competitor?.domain === "string" ? competitor.domain : "";
          const rootDomain = domain ? extractRootDomain(domain) : "";
          const traffic = rootDomain ? await fetchMonthlyVisits(rootDomain) : explicitUnavailableTraffic("invalid_domain");
          return { ...competitor, traffic };
        }));

        await payload.update({
          collection: "google-ads-audits",
          id,
          data: {
            campaignProposalCompetitorStatus: "completed",
            campaignProposalCompetitors: competitorsWithTraffic,
            campaignProposalCompetitorKeywordsUsed: keywords,
            campaignProposalCompetitorsGeneratedAt: new Date().toISOString(),
            campaignProposalCompetitorError: null,
          } as any,
          overrideAccess: true,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[run-proposal-competitors] after() error:`, errMsg);
        await payload.update({
          collection: "google-ads-audits",
          id,
          data: {
            campaignProposalCompetitorStatus: "failed",
            campaignProposalCompetitorError: errMsg,
          } as any,
          overrideAccess: true,
        }).catch(() => {});
      }
    });

    return NextResponse.json({ success: true, competitorCount: existingCompetitors.length, keywordCount: keywords.length, manualCompetitorCount: manualCompetitors.length });
  } catch (err) {
    console.error(`[run-proposal-competitors] Unhandled error:`, err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
