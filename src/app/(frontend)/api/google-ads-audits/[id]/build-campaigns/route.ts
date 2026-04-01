import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
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
    } catch (authErr) {
      console.error(`[build-campaigns] Auth error:`, authErr);
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

    // Parse request body
    let body: { confirmedCustomerId?: string; adCopy?: Record<string, Record<string, { headlines: string[]; descriptions: string[] }>> };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Fetch the audit record
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

    const { customerId, businessName, websiteUrl, campaignProposalStatus, campaignProposal } = audit;

    // Validate required fields
    if (!customerId) {
      return NextResponse.json({ error: "Customer ID is not set on this audit" }, { status: 400 });
    }

    if (campaignProposalStatus !== "approved") {
      return NextResponse.json(
        { error: "Campaign proposal must be approved before building. Current status: " + (campaignProposalStatus || "none") },
        { status: 400 }
      );
    }

    // Customer ID verification — prevent building in wrong account
    const normalizeId = (id: string) => id.replace(/[-\s]/g, "");
    if (!body.confirmedCustomerId || normalizeId(body.confirmedCustomerId) !== normalizeId(customerId)) {
      return NextResponse.json(
        { error: "Customer ID verification failed. Please confirm the correct Customer ID." },
        { status: 400 }
      );
    }

    // Get campaign structure from the proposal
    const proposalData = typeof campaignProposal === "string" ? JSON.parse(campaignProposal) : campaignProposal;
    const proposedCampaigns = proposalData?.proposedCampaigns;

    if (!Array.isArray(proposedCampaigns) || proposedCampaigns.length === 0) {
      return NextResponse.json(
        { error: "No approved campaign structure found. Import an approved CSV first." },
        { status: 400 }
      );
    }

    // Build the payload for Growth Tools
    const adCopy = body.adCopy || {};
    const campaigns = proposedCampaigns.map((camp: any) => ({
      name: camp.name,
      campaignType: camp.campaignType || "generic",
      channelType: camp.channelType || "SEARCH",
      status: "PAUSED",
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

    // Set build status to "building" via direct DB update
    try {
      const dbClient = (payload.db as any).client;
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET campaign_build_status = ?, campaign_build_started_at = ?, campaign_build_error = NULL WHERE id = ?",
        args: ["building", new Date().toISOString(), id],
      });
    } catch (err) {
      console.error(`[build-campaigns] Failed to set building status:`, err);
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Failed to update build status: ${detail}` },
        { status: 500 }
      );
    }

    // Fire-and-forget: Growth Tools processes and PATCHes results back
    after(async () => {
      try {
        fetch(
          `${GROWTH_TOOLS_URL}/api/google-ads/campaign-builder/cms`,
          {
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
          }
        ).catch((err) => {
          console.error(`[build-campaigns] Failed to send request to Growth Tools:`, err);
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[build-campaigns] after() error:`, errMsg);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[build-campaigns] Unhandled error:`, err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
