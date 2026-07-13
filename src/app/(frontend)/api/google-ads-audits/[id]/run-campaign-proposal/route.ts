import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { resolveBrandTerms } from "@/lib/brand-terms";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
// Direct Railway URL bypasses the Vercel proxy (60s timeout) for long-running proposal calls.
// Falls back to GROWTH_TOOLS_URL if not set.
const GROWTH_TOOLS_DIRECT_URL = process.env.GROWTH_TOOLS_DIRECT_URL || GROWTH_TOOLS_URL;

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
      proposalServiceSplit, proposalMaxIndustryVerticals, proposalMaxAdGroupsPerCampaign, proposalPrimaryFocus,
    } = audit;
    if (!websiteUrl || !businessName) {
      return NextResponse.json(
        { error: "Missing required fields: websiteUrl and businessName must be set on the audit" },
        { status: 400 }
      );
    }

    // Parse brand terms: per-audit override (audit.brandTerms) takes priority,
    // otherwise fall back to the canonical client field (clients.brandKeywords).
    let clientBrandKeywords: string | undefined;
    const clientRef = (audit as any).client;
    const clientId = typeof clientRef === "object" && clientRef ? clientRef.id : clientRef;
    if (clientId) {
      try {
        const clientDoc = await payload.findByID({
          collection: "clients",
          id: clientId,
          depth: 0,
          overrideAccess: true,
        });
        clientBrandKeywords = (clientDoc as any)?.brandKeywords;
      } catch { /* fall through with empty fallback */ }
    }
    const parsedBrandTerms = resolveBrandTerms(
      clientBrandKeywords,
      typeof brandTerms === "string" ? brandTerms : undefined,
    );

    let searchLocation = audit.proposalTargetLocation || audit.location || "au";
    let searchLanguage = audit.proposalSearchLanguage || undefined;
    const proposalRef = audit.proposal;
    const proposalId = typeof proposalRef === "object" && proposalRef ? proposalRef.id : proposalRef;
    if (proposalId && (!audit.proposalTargetLocation || !audit.proposalSearchLanguage)) {
      try {
        const proposal = await payload.findByID({
          collection: "client-proposals",
          id: proposalId,
          depth: 0,
          overrideAccess: true,
        }) as any;
        searchLocation = audit.proposalTargetLocation || proposal.targetLocation || searchLocation;
        searchLanguage = audit.proposalSearchLanguage || proposal.searchLanguage || searchLanguage;
      } catch { /* retain audit snapshot/default */ }
    }

    await payload.update({
      collection: "google-ads-audits",
      id,
      data: {
        proposalTargetLocation: searchLocation,
        proposalSearchLanguage: searchLanguage || null,
      } as any,
      overrideAccess: true,
    });

    // Mark proposal as pending (direct DB update to avoid Payload re-validating
    // unset select fields like proposalBusinessType which store "" in SQLite)
    try {
      const dbClient = (payload.db as any).client;
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET campaign_proposal_status = ? WHERE id = ?",
        args: ["pending", id],
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
        // Mark as running (direct DB to avoid validation issues with empty select fields)
        const dbClient = (payload.db as any).client;
        await dbClient.execute({
          sql: "UPDATE google_ads_audits SET campaign_proposal_status = ? WHERE id = ?",
          args: ["running", id],
        });

        // Fire-and-forget: GT processes synchronously (5-10 min) then pushes results
        // back to CMS via PATCH. Do NOT await — Vercel kills after() within seconds.
        // GT also handles marking status as "failed" on error via its own PATCH.
        fetch(
          `${GROWTH_TOOLS_DIRECT_URL}/api/google-ads/campaign-proposal/cms`,
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
              location: searchLocation,
              language: searchLanguage,
              brandTerms: parsedBrandTerms.length > 0 ? parsedBrandTerms : undefined,
              negativeKeywords: Array.isArray(campaignProposalNegativeKeywords) && campaignProposalNegativeKeywords.length > 0
                ? campaignProposalNegativeKeywords.map((nk: any) => ({
                    pattern: nk.pattern,
                    scope: nk.scope || "global",
                    ...(nk.category ? { category: nk.category } : {}),
                  }))
                : undefined,
              businessType: ["distributor", "ecommerce", "service", "other"].includes(proposalBusinessType) ? proposalBusinessType : undefined,
              conversionGoal: ["leads", "sales", "bookings", "signups"].includes(proposalConversionGoal) ? proposalConversionGoal : undefined,
              serviceRadius: ["local", "metro", "state", "national"].includes(proposalServiceRadius) ? proposalServiceRadius : undefined,
              enabledCampaigns: Array.isArray(proposalEnabledCampaigns) && proposalEnabledCampaigns.length > 0
                ? proposalEnabledCampaigns
                : undefined,
              minAdGroupVolume: proposalMinAdGroupVolume != null ? Number(proposalMinAdGroupVolume) : undefined,
              minBrandImpressions: proposalMinBrandImpressions != null ? Number(proposalMinBrandImpressions) : undefined,
              brandVolumeExempt: proposalBrandVolumeExempt != null ? Boolean(proposalBrandVolumeExempt) : undefined,
              serviceSplitPreference: ["single", "auto"].includes(proposalServiceSplit) ? proposalServiceSplit : undefined,
              maxIndustryVerticals: proposalMaxIndustryVerticals != null ? Number(proposalMaxIndustryVerticals) : undefined,
              maxAdGroupsPerCampaign: proposalMaxAdGroupsPerCampaign != null ? Number(proposalMaxAdGroupsPerCampaign) : undefined,
              primaryFocus: ["services", "products", "equal"].includes(proposalPrimaryFocus) ? proposalPrimaryFocus : undefined,
              extraGenericBrandWords: [],
            }),
          }
        ).catch((err) => {
          console.error(`[run-campaign-proposal] Failed to send request to Growth Tools:`, err);
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[run-campaign-proposal] after() error:`, errMsg);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[run-campaign-proposal] Unhandled error:`, err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
