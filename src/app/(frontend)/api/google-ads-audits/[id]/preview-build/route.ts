import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

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
    } catch {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    let audit: any;
    try {
      audit = await payload.findByID({ collection: "google-ads-audits", id, overrideAccess: true });
    } catch {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    const { customerId, businessName, websiteUrl, campaignProposalStatus, campaignProposal } = audit;

    if (!customerId) {
      return NextResponse.json({ error: "Customer ID is not set" }, { status: 400 });
    }
    if (campaignProposalStatus !== "approved") {
      return NextResponse.json({ error: "Campaign proposal must be approved first" }, { status: 400 });
    }

    const proposalData = typeof campaignProposal === "string" ? JSON.parse(campaignProposal) : campaignProposal;
    const proposedCampaigns = proposalData?.proposedCampaigns;

    if (!Array.isArray(proposedCampaigns) || proposedCampaigns.length === 0) {
      return NextResponse.json({ error: "No approved campaign structure found" }, { status: 400 });
    }

    // Build payload matching the build-campaigns route
    const adCopyRaw = audit.generatedAdCopy;
    const adCopy = adCopyRaw && typeof adCopyRaw === "object" ? adCopyRaw : {};

    const normalizeId = (v: string) => v.replace(/[-\s]/g, "");

    const campaigns = proposedCampaigns.map((camp: any) => ({
      name: camp.name,
      campaignType: camp.campaignType || "generic",
      channelType: camp.channelType || "SEARCH",
      status: "PAUSED" as const,
      adGroups: (camp.adGroups || []).map((ag: any) => ({
        name: ag.name,
        theme: ag.theme || ag.name,
        keywords: (ag.keywords || []).map((kw: any) => ({
          text: kw.text,
          matchType: kw.matchType || "PHRASE",
          ...(kw.existingCampaign ? { existingCampaign: kw.existingCampaign } : {}),
          ...(kw.existingAdGroup ? { existingAdGroup: kw.existingAdGroup } : {}),
        })),
        landingPage: ag.landingPage || { url: null, status: "exists" },
        adCopy: adCopy[camp.name]?.[ag.name] || { headlines: [], descriptions: [] },
      })),
    }));

    // Call Growth Tools preview endpoint (synchronous, read-only)
    const res = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/campaign-builder/cms-preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_API_KEY ?? "",
      },
      body: JSON.stringify({
        auditDocId: id,
        customerId: normalizeId(customerId),
        businessName,
        websiteUrl,
        mergeStrategy: "hybrid",
        campaigns,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return NextResponse.json({ error: `Growth Tools error (${res.status}): ${errBody}` }, { status: 502 });
    }

    const preview = await res.json();
    return NextResponse.json(preview);
  } catch (err) {
    console.error("[preview-build] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
