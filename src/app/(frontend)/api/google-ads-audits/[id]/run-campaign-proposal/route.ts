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
      console.error(`[run-campaign-proposal] Auth error:`, authErr);
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

    const {
      websiteUrl, businessName, customerId, brandTerms, campaignProposalNegativeKeywords,
      proposalBusinessType, proposalConversionGoal, proposalServiceRadius,
      proposalEnabledCampaigns, proposalMinAdGroupVolume, proposalMinBrandImpressions, proposalBrandVolumeExempt,
    } = audit;
    if (!websiteUrl || !businessName) {
      return NextResponse.json(
        { error: "Missing required fields: websiteUrl and businessName must be set on the audit" },
        { status: 400 }
      );
    }

    // Parse brand terms (stored as textarea, one per line)
    const parsedBrandTerms = typeof brandTerms === "string"
      ? brandTerms.split("\n").map((t: string) => t.trim()).filter(Boolean)
      : [];

    // Mark proposal as pending
    try {
      await payload.update({
        collection: "google-ads-audits",
        id,
        data: { campaignProposalStatus: "pending" } as any,
        overrideAccess: true,
      });
    } catch (err) {
      console.error(`[run-campaign-proposal] Failed to set pending status:`, err);
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Failed to update audit status: ${detail}` },
        { status: 500 }
      );
    }

    // Fire-and-forget: trigger Growth Tools, which will push results back to CMS
    // via PATCH /api/google-ads-audits/:id when done (sets status to "completed").
    // Using after() so the response returns immediately, but NOT awaiting the GT call
    // since it can take 5-10 minutes and would exceed Vercel's function timeout.
    after(async () => {
      try {
        // Mark as running
        await payload.update({
          collection: "google-ads-audits",
          id,
          data: { campaignProposalStatus: "running" } as any,
          overrideAccess: true,
        });

        // Fire and forget — do NOT await this fetch.
        // Growth Tools will push results directly to CMS via API-Key auth when done.
        fetch(
          `${GROWTH_TOOLS_URL}/api/google-ads/campaign-proposal/cms`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Key": INTERNAL_API_KEY ?? "",
            },
            body: JSON.stringify({
              auditDocId: id,
              websiteUrl,
              businessName,
              customerId: customerId ?? undefined,
              location: audit.location ?? "au",
              brandTerms: parsedBrandTerms.length > 0 ? parsedBrandTerms : undefined,
              negativeKeywords: Array.isArray(campaignProposalNegativeKeywords) && campaignProposalNegativeKeywords.length > 0
                ? campaignProposalNegativeKeywords.map((nk: any) => ({
                    pattern: nk.pattern,
                    scope: nk.scope || "global",
                    ...(nk.category ? { category: nk.category } : {}),
                  }))
                : undefined,
              // Business type engine config
              businessType: proposalBusinessType || undefined,
              conversionGoal: proposalConversionGoal || undefined,
              serviceRadius: proposalServiceRadius || undefined,
              enabledCampaigns: Array.isArray(proposalEnabledCampaigns) && proposalEnabledCampaigns.length > 0
                ? proposalEnabledCampaigns
                : undefined,
              minAdGroupVolume: proposalMinAdGroupVolume != null ? Number(proposalMinAdGroupVolume) : undefined,
              minBrandImpressions: proposalMinBrandImpressions != null ? Number(proposalMinBrandImpressions) : undefined,
              brandVolumeExempt: proposalBrandVolumeExempt != null ? Boolean(proposalBrandVolumeExempt) : undefined,
            }),
          }
        ).catch((err) => {
          console.error(`[run-campaign-proposal] Failed to call Growth Tools:`, err);
        });
      } catch (error) {
        console.error(`[run-campaign-proposal] Failed to set running status:`, error);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[run-campaign-proposal] Unhandled error:`, err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
