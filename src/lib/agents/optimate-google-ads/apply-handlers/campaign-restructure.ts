/**
 * Apply handler: campaign-restructure
 *
 * Saves proposal settings on the audit doc + kicks off the existing
 * campaign-proposal Growth Tools pipeline. Mirrors the body of
 * POST /api/google-ads-audits/[id]/run-campaign-proposal but skips the
 * cookie-auth path (we run server-side as the Apply user already
 * authenticated to the apply route).
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId, postGrowthToolsFireAndForget } from "./_helpers";

const VALID_BUSINESS_TYPES = ["distributor", "ecommerce", "service", "other"];
const VALID_CONVERSION_GOALS = ["leads", "sales", "bookings", "signups"];
const VALID_SERVICE_RADII = ["local", "metro", "state", "national"];
const VALID_SERVICE_SPLITS = ["single", "auto"];
const VALID_PRIMARY_FOCUS = ["services", "products", "equal"];
const VALID_ENABLED_CAMPAIGNS = ["brand", "brand-product", "products", "services", "services-geo", "industry"];

export const applyCampaignRestructure: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("campaign-restructure payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("campaign-restructure: auditId must be numeric");

  // Audit settings to PATCH. Filter to known-good values so Payload's select
  // validation doesn't reject unknown enum values.
  const settings = payload.proposalSettings as Record<string, unknown> | undefined;
  if (!settings || typeof settings !== "object") {
    throw new Error("campaign-restructure: proposalSettings is required on the payload");
  }

  const updateData: Record<string, unknown> = {};
  if (typeof settings.proposalBusinessType === "string" && VALID_BUSINESS_TYPES.includes(settings.proposalBusinessType)) {
    updateData.proposalBusinessType = settings.proposalBusinessType;
  }
  if (typeof settings.proposalConversionGoal === "string" && VALID_CONVERSION_GOALS.includes(settings.proposalConversionGoal)) {
    updateData.proposalConversionGoal = settings.proposalConversionGoal;
  }
  if (typeof settings.proposalServiceRadius === "string" && VALID_SERVICE_RADII.includes(settings.proposalServiceRadius)) {
    updateData.proposalServiceRadius = settings.proposalServiceRadius;
  }
  if (typeof settings.proposalServiceSplit === "string" && VALID_SERVICE_SPLITS.includes(settings.proposalServiceSplit)) {
    updateData.proposalServiceSplit = settings.proposalServiceSplit;
  }
  if (typeof settings.proposalPrimaryFocus === "string" && VALID_PRIMARY_FOCUS.includes(settings.proposalPrimaryFocus)) {
    updateData.proposalPrimaryFocus = settings.proposalPrimaryFocus;
  }
  if (Array.isArray(settings.proposalEnabledCampaigns)) {
    const enabled = (settings.proposalEnabledCampaigns as unknown[])
      .map((s) => (typeof s === "string" ? s : ""))
      .filter((s) => VALID_ENABLED_CAMPAIGNS.includes(s));
    if (enabled.length > 0) updateData.proposalEnabledCampaigns = enabled;
  }
  for (const k of [
    "proposalMinAdGroupVolume",
    "proposalMinBrandImpressions",
    "proposalMaxIndustryVerticals",
    "proposalMaxAdGroupsPerCampaign",
  ] as const) {
    if (settings[k] != null) {
      const n = Number(settings[k]);
      if (Number.isFinite(n)) updateData[k] = n;
    }
  }
  if (typeof settings.proposalBrandVolumeExempt === "boolean") {
    updateData.proposalBrandVolumeExempt = settings.proposalBrandVolumeExempt;
  }
  if (Array.isArray(settings.campaignProposalNegativeKeywords)) {
    updateData.campaignProposalNegativeKeywords = settings.campaignProposalNegativeKeywords;
  }

  if (Object.keys(updateData).length > 0) {
    await pl.update({
      collection: "google-ads-audits",
      id: auditIdNum as number,
      data: updateData as never,
      overrideAccess: true,
    });
  }

  // Re-load to pick up the saved settings + access websiteUrl/businessName/etc.
  const audit = (await pl.findByID({
    collection: "google-ads-audits",
    id: auditIdNum as number,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> & {
    websiteUrl?: string;
    businessName?: string;
    location?: string;
    brandTerms?: string;
    campaignProposalNegativeKeywords?: Array<{ pattern?: string; scope?: string; category?: string }>;
    proposalBusinessType?: string;
    proposalConversionGoal?: string;
    proposalServiceRadius?: string;
    proposalEnabledCampaigns?: string[];
    proposalMinAdGroupVolume?: number;
    proposalMinBrandImpressions?: number;
    proposalBrandVolumeExempt?: boolean;
    proposalServiceSplit?: string;
    proposalMaxIndustryVerticals?: number;
    proposalMaxAdGroupsPerCampaign?: number;
    proposalPrimaryFocus?: string;
  };

  if (!audit.websiteUrl || !audit.businessName) {
    throw new Error("campaign-restructure: audit is missing websiteUrl or businessName");
  }

  const { customerId } = await resolveCustomerId(pl, auditIdNum as number);

  // Mark proposal status as running. We use direct DB exec to mirror the
  // existing route which avoids Payload re-validating empty select fields.
  const dbClient = (pl.db as unknown as { client?: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } }).client;
  if (dbClient) {
    try {
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET campaign_proposal_status = ? WHERE id = ?",
        args: ["running", auditIdNum],
      });
    } catch (err) {
      throw new Error(`campaign-restructure: failed to set running status: ${(err as Error).message}`);
    }
  }

  const parsedBrandTerms = String(audit.brandTerms ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const negativeKeywords = Array.isArray(audit.campaignProposalNegativeKeywords)
    ? audit.campaignProposalNegativeKeywords.map((nk) => ({
        pattern: nk.pattern,
        scope: nk.scope ?? "global",
        ...(nk.category ? { category: nk.category } : {}),
      }))
    : undefined;

  // Fire-and-forget — proposal takes 5-10 min; awaiting would exceed Vercel timeout.
  // Growth Tools pushes results back to CMS via PATCH when done.
  postGrowthToolsFireAndForget("/api/google-ads/campaign-proposal/cms", {
    auditDocId: auditIdNum,
    websiteUrl: audit.websiteUrl,
    businessName: audit.businessName,
    customerId,
    location: audit.location ?? "au",
    brandTerms: parsedBrandTerms.length > 0 ? parsedBrandTerms : undefined,
    negativeKeywords: negativeKeywords && negativeKeywords.length > 0 ? negativeKeywords : undefined,
    businessType: audit.proposalBusinessType,
    conversionGoal: audit.proposalConversionGoal,
    serviceRadius: audit.proposalServiceRadius,
    enabledCampaigns: audit.proposalEnabledCampaigns,
    minAdGroupVolume: audit.proposalMinAdGroupVolume,
    minBrandImpressions: audit.proposalMinBrandImpressions,
    brandVolumeExempt: audit.proposalBrandVolumeExempt,
    serviceSplitPreference: audit.proposalServiceSplit,
    maxIndustryVerticals: audit.proposalMaxIndustryVerticals,
    maxAdGroupsPerCampaign: audit.proposalMaxAdGroupsPerCampaign,
    primaryFocus: audit.proposalPrimaryFocus,
    extraGenericBrandWords: [],
  });

  return {
    message: `Campaign proposal kicked off for audit #${auditIdNum}. Growth Tools is generating the structure (typically 5\u201310 minutes). Check back with get_campaign_proposal_status.`,
    detail: { auditId: auditIdNum, customerId, settingsApplied: Object.keys(updateData) },
  };
};
