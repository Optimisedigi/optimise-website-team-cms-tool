/**
 * Apply handler: ad-copy-deploy
 *
 * Pushes generated RSAs to Google Ads PAUSED. Mirrors POST
 * /api/google-ads-audits/[id]/deploy-ad-copy — same Growth Tools endpoint,
 * same status flips, same customer-id verification.
 *
 * The proposing agent is responsible for marking adCopyStatus="approved"
 * via a separate review step (the audit UI has an Approve button) before
 * proposing this handler. We re-check the status here as a guard.
 *
 * Expected payload:
 *   {
 *     auditId: string|number,
 *     adLabel?: string,
 *     adStatus?: "PAUSED"|"ENABLED",   // default PAUSED for safety
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId, postGrowthTools } from "./_helpers";

interface AdCopyEntry {
  text?: string;
  pinnedPosition?: number | null;
}

interface AuditForDeploy {
  id: number;
  businessName?: string;
  websiteUrl?: string;
  campaignProposal?: unknown;
  generatedAdCopy?: unknown;
  adCopyStatus?: string;
}

function getText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") return String((item as AdCopyEntry).text ?? "");
  return "";
}

function getPin(item: unknown): number | null {
  if (typeof item === "string") return null;
  if (item && typeof item === "object") {
    const p = (item as AdCopyEntry).pinnedPosition;
    return p === undefined ? null : p;
  }
  return null;
}

export const applyAdCopyDeploy: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("ad-copy-deploy payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("ad-copy-deploy: auditId must be numeric");

  const adLabel = typeof payload.adLabel === "string" && payload.adLabel.trim()
    ? payload.adLabel.trim()
    : `OD RSA ${new Date().toISOString().slice(0, 10)}`;
  // Default PAUSED — the plan is "ships PAUSED, human flips it on in Google Ads".
  const adStatus = String(payload.adStatus ?? "PAUSED").toUpperCase();
  if (adStatus !== "PAUSED" && adStatus !== "ENABLED") {
    throw new Error(`ad-copy-deploy: adStatus must be PAUSED or ENABLED, got "${adStatus}"`);
  }

  const audit = (await pl.findByID({
    collection: "google-ads-audits",
    id: auditIdNum as number,
    overrideAccess: true,
  })) as AuditForDeploy;

  if (audit.adCopyStatus !== "approved") {
    throw new Error(`ad-copy-deploy: audit ad-copy status is "${audit.adCopyStatus ?? "none"}", must be "approved" first`);
  }
  if (!audit.businessName || !audit.websiteUrl) {
    throw new Error("ad-copy-deploy: audit is missing businessName or websiteUrl");
  }

  const adCopy = typeof audit.generatedAdCopy === "string"
    ? JSON.parse(audit.generatedAdCopy)
    : audit.generatedAdCopy;
  const proposalData = typeof audit.campaignProposal === "string"
    ? JSON.parse(audit.campaignProposal)
    : audit.campaignProposal;

  if (!adCopy || typeof adCopy !== "object" || Object.keys(adCopy).length === 0) {
    throw new Error("ad-copy-deploy: no generated ad copy on audit");
  }

  const proposedCampaigns = (proposalData as { proposedCampaigns?: unknown[] } | null)?.proposedCampaigns ?? [];
  const landingPageMap: Record<string, Record<string, string>> = {};
  for (const camp of proposedCampaigns as Array<{ name?: string; adGroups?: Array<{ name?: string; landingPage?: { url?: string } }> }>) {
    if (!camp.name) continue;
    landingPageMap[camp.name] = {};
    for (const ag of camp.adGroups ?? []) {
      if (ag.name) landingPageMap[camp.name][ag.name] = ag.landingPage?.url ?? "";
    }
  }

  const adGroups: Array<{
    campaignName: string;
    adGroupName: string;
    headlines: Array<{ text: string; pinnedPosition: number | null }>;
    descriptions: Array<{ text: string; pinnedPosition: number | null }>;
    landingPageUrl: string | null;
  }> = [];

  for (const [campaignName, agMap] of Object.entries(adCopy as Record<string, unknown>)) {
    if (!agMap || typeof agMap !== "object") continue;
    for (const [adGroupName, copy] of Object.entries(agMap as Record<string, unknown>)) {
      const co = (copy as { headlines?: unknown[]; descriptions?: unknown[] }) ?? {};
      const headlines = (co.headlines ?? []).map((h) => ({ text: getText(h), pinnedPosition: getPin(h) }));
      const descriptions = (co.descriptions ?? []).map((d) => ({ text: getText(d), pinnedPosition: getPin(d) }));
      adGroups.push({
        campaignName,
        adGroupName,
        headlines,
        descriptions,
        landingPageUrl: landingPageMap[campaignName]?.[adGroupName] ?? null,
      });
    }
  }

  const { customerId } = await resolveCustomerId(pl, auditIdNum);

  // Stamp deploy status before kicking off Growth Tools (mirrors the route).
  try {
    const dbClient = (pl.db as unknown as { client?: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } }).client;
    if (dbClient) {
      await dbClient.execute({
        sql: "UPDATE google_ads_audits SET ad_copy_deploy_status = ?, ad_copy_deploy_started_at = ?, ad_copy_deploy_error = NULL, ad_copy_deploy_label = ? WHERE id = ?",
        args: ["deploying", new Date().toISOString(), adLabel, auditIdNum],
      });
    }
  } catch (err) {
    throw new Error(`ad-copy-deploy: failed to set deploying status: ${(err as Error).message}`);
  }

  const res = await postGrowthTools("/api/google-ads/deploy-ad-copy/cms", {
    auditDocId: auditIdNum,
    customerId,
    businessName: audit.businessName,
    websiteUrl: audit.websiteUrl,
    adGroups,
    adLabel,
    adStatus,
  });

  if (!res.ok) {
    // Roll status back to "approved" so the human can retry.
    try {
      const dbClient = (pl.db as unknown as { client?: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } }).client;
      if (dbClient) {
        await dbClient.execute({
          sql: "UPDATE google_ads_audits SET ad_copy_deploy_status = ?, ad_copy_deploy_error = ? WHERE id = ?",
          args: [null, res.error.slice(0, 4000), auditIdNum],
        });
      }
    } catch { /* best effort */ }
    throw new Error(`Growth Tools deploy-ad-copy failed: ${res.error}`);
  }

  return {
    message: `Dispatched ${adGroups.length} ad groups (${adStatus}) to Google Ads as "${adLabel}". Status will flip to "deployed" when Growth Tools finishes.`,
    detail: { auditId: auditIdNum, customerId, adGroupCount: adGroups.length, adLabel, adStatus },
  };
};
