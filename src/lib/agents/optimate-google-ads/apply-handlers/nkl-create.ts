/**
 * Apply handler: nkl-create
 *
 * Creates a new `negative-keyword-lists` document from agent-proposed
 * candidates. The document is created INACTIVE-by-default? No — we follow the
 * collection default (`isActive: true`) so it shows up in the avoided-spend
 * dashboard once keywords are pushed. Live push is a separate handler
 * (`nkl-push-live`) that the agent must propose explicitly.
 *
 * Expected payload:
 *   {
 *     auditId: string|number,
 *     name: string,
 *     scope: "account"|"campaign"|"ad_group",
 *     campaigns?: string[],          // names, when scope=campaign
 *     adGroupName?: string,          // when scope=ad_group
 *     keywords: Array<{ keyword, matchType }>,
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId, resolveClientId, type NklKeyword } from "./_helpers";

export const applyNklCreate: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("nkl-create payload missing auditId");

  const name = String(payload.name ?? "").trim();
  if (!name) throw new Error("nkl-create payload missing name");

  const scope = String(payload.scope ?? "account") as "account" | "campaign" | "ad_group";
  if (!["account", "campaign", "ad_group"].includes(scope)) {
    throw new Error(`nkl-create: invalid scope "${scope}"`);
  }

  const rawKeywords = Array.isArray(payload.keywords) ? (payload.keywords as Array<Record<string, unknown>>) : [];
  if (rawKeywords.length === 0) throw new Error("nkl-create: keywords array is empty");

  const keywords: NklKeyword[] = rawKeywords.map((k, i) => {
    const keyword = String(k.keyword ?? "").trim();
    const matchType = String(k.matchType ?? "exact").toLowerCase();
    if (!keyword) throw new Error(`nkl-create: keyword[${i}] missing text`);
    if (!["exact", "phrase", "broad"].includes(matchType)) {
      throw new Error(`nkl-create: keyword[${i}] invalid matchType "${matchType}"`);
    }
    return { keyword, matchType: matchType as NklKeyword["matchType"] };
  });

  const { auditDoc } = await resolveCustomerId(pl, auditId);
  const clientId = await resolveClientId(pl, auditDoc);
  if (!clientId) {
    throw new Error("nkl-create: no client could be resolved from the audit; NKLs require a client");
  }

  const data: Record<string, unknown> = {
    client: clientId,
    name,
    scope,
    keywords,
    isActive: true,
    source: "optimate-agent",
  };

  if (scope === "campaign") {
    const campaignsList = Array.isArray(payload.campaigns) ? (payload.campaigns as unknown[]) : [];
    data.campaigns = campaignsList
      .map((c) => (typeof c === "string" ? c : (c as { campaignName?: string })?.campaignName))
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .map((campaignName) => ({ campaignName }));
  }
  if (scope === "ad_group") {
    const adGroupName = String(payload.adGroupName ?? "").trim();
    if (!adGroupName) throw new Error("nkl-create: scope=ad_group requires adGroupName");
    data.adGroupName = adGroupName;
  }

  const created = (await pl.create({
    collection: "negative-keyword-lists",
    data: data as never,
    overrideAccess: true,
  })) as { id: number };

  return {
    message: `Created NKL #${created.id} ("${name}") with ${keywords.length} keywords for client ${clientId}.`,
    detail: { nklId: created.id, clientId, scope, keywordCount: keywords.length },
  };
};
