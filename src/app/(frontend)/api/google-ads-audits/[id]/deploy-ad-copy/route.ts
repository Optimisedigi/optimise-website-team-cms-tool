import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

type AdCopyEntry = { text: string; pinnedPosition?: 1 | 2 | 3 | null };

function getText(item: string | AdCopyEntry): string {
  return typeof item === "string" ? item : item?.text ?? "";
}

function getPin(item: string | AdCopyEntry): number | null {
  return typeof item === "string" ? null : item?.pinnedPosition || null;
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
      console.error(`[deploy-ad-copy] Auth error:`, authErr);
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

    let body: { confirmedCustomerId?: string; adLabel?: string; adStatus?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const adLabel = body.adLabel || `OD RSA ${new Date().toISOString().slice(0, 10)}`;
    const adStatus = body.adStatus || "ENABLED";

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

    const { customerId, businessName, websiteUrl, campaignProposal, generatedAdCopy, adCopyStatus } = audit;

    // Validate ad copy is approved
    if (adCopyStatus !== "approved") {
      return NextResponse.json(
        { error: `Ad copy must be approved before deploying. Current status: ${adCopyStatus || "none"}` },
        { status: 400 }
      );
    }

    if (!customerId) {
      return NextResponse.json({ error: "Customer ID is not set on this audit" }, { status: 400 });
    }

    // Customer ID verification
    const normalizeId = (cid: string) => cid.replace(/[-\s]/g, "");
    if (!body.confirmedCustomerId || normalizeId(body.confirmedCustomerId) !== normalizeId(customerId)) {
      return NextResponse.json(
        { error: "Customer ID verification failed. Please confirm the correct Customer ID." },
        { status: 400 }
      );
    }

    // Parse ad copy and campaign proposal
    const adCopy = typeof generatedAdCopy === "string" ? JSON.parse(generatedAdCopy) : generatedAdCopy;
    const proposalData = typeof campaignProposal === "string" ? JSON.parse(campaignProposal) : campaignProposal;

    if (!adCopy || Object.keys(adCopy).length === 0) {
      return NextResponse.json({ error: "No ad copy found to deploy" }, { status: 400 });
    }

    // Build the ad copy payload — normalize entries to { text, pinnedPosition } format
    const adGroups: { campaignName: string; adGroupName: string; headlines: { text: string; pinnedPosition: number | null }[]; descriptions: { text: string; pinnedPosition: number | null }[]; landingPageUrl: string | null }[] = [];

    // Build landing page lookup from proposal
    const landingPageMap: Record<string, Record<string, string>> = {};
    const proposedCampaigns = proposalData?.proposedCampaigns || [];
    for (const camp of proposedCampaigns) {
      if (!landingPageMap[camp.name]) landingPageMap[camp.name] = {};
      for (const ag of camp.adGroups || []) {
        landingPageMap[camp.name][ag.name] = ag.landingPage?.url || "";
      }
    }

    for (const [campaignName, agMap] of Object.entries(adCopy)) {
      for (const [adGroupName, copy] of Object.entries(agMap as Record<string, any>)) {
        const headlines = (copy.headlines || []).map((h: string | AdCopyEntry) => ({
          text: getText(h),
          pinnedPosition: getPin(h),
        }));
        const descriptions = (copy.descriptions || []).map((d: string | AdCopyEntry) => ({
          text: getText(d),
          pinnedPosition: getPin(d),
        }));
        adGroups.push({
          campaignName,
          adGroupName,
          headlines,
          descriptions,
          landingPageUrl: landingPageMap[campaignName]?.[adGroupName] || null,
        });
      }
    }

    // Set deploy status to "deploying" and store the label
    try {
      const dbClient = (payload.db as any).client;
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET ad_copy_deploy_status = ?, ad_copy_deploy_started_at = ?, ad_copy_deploy_error = NULL, ad_copy_deploy_label = ? WHERE id = ?",
        args: ["deploying", new Date().toISOString(), adLabel, id],
      });
    } catch (err) {
      console.error(`[deploy-ad-copy] Failed to set deploying status:`, err);
      return NextResponse.json({ error: "Failed to update deploy status" }, { status: 500 });
    }

    // Fire-and-forget: Growth Tools processes and PATCHes results back
    after(async () => {
      try {
        fetch(
          `${GROWTH_TOOLS_URL}/api/google-ads/deploy-ad-copy/cms`,
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
              adGroups,
              adLabel,
              adStatus,
            }),
          }
        ).catch((err) => {
          console.error(`[deploy-ad-copy] Failed to send request to Growth Tools:`, err);
        });
      } catch (error) {
        console.error(`[deploy-ad-copy] after() error:`, error);
      }
    });

    return NextResponse.json({ success: true, adGroupCount: adGroups.length });
  } catch (err) {
    console.error(`[deploy-ad-copy] Unhandled error:`, err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
