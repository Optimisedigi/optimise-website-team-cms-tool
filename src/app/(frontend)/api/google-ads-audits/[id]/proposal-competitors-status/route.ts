import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const audit = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
    });

    const a = audit as any;
    const competitors = Array.isArray(a.campaignProposalCompetitors) ? a.campaignProposalCompetitors : [];
    const keywords = Array.isArray(a.campaignProposalCompetitorKeywordsUsed) ? a.campaignProposalCompetitorKeywordsUsed : [];

    return NextResponse.json({
      status: a.campaignProposalCompetitorStatus || null,
      generatedAt: a.campaignProposalCompetitorsGeneratedAt || null,
      competitorCount: competitors.length,
      keywordCount: keywords.length,
      error: a.campaignProposalCompetitorError || null,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
