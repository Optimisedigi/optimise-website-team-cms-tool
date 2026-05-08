/**
 * Registers every Optimate-Google-Ads apply handler with the shared
 * dispatcher. Imported once from the apply route so the side-effect runs
 * before dispatchApply() is called.
 *
 * Handler key (proposalType) ↔ behaviour:
 *   - "negative-keywords"    → legacy: creates an NKL from candidates
 *   - "nkl-create"           → create NKL from explicit name+scope+keywords
 *   - "nkl-update"           → update an existing NKL
 *   - "nkl-push-live"        → push NKL keywords to Google Ads
 *   - "budget-update"        → save monthly budget OR campaign allocations to CMS
 *   - "budget-push-live"     → push campaign budgets to Google Ads
 *   - "ad-copy-generate"     → prepare an audit for ad-copy generation
 *   - "ad-copy-deploy"       → push approved RSAs to Google Ads (PAUSED)
 */

import { registerApplyHandler } from "@/lib/agents/_shared/apply-dispatcher";
import { applyNklCreate } from "./nkl-create";
import { applyNklUpdate } from "./nkl-update";
import { applyNklPushLive } from "./nkl-push-live";
import { applyBudgetUpdate } from "./budget-update";
import { applyBudgetPushLive } from "./budget-push-live";
import { applyAdCopyGenerate } from "./ad-copy-generate";
import { applyAdCopyDeploy } from "./ad-copy-deploy";
import { applyCampaignRestructure } from "./campaign-restructure";
import { applyCampaignBuild } from "./campaign-build";
import { applyScheduledTaskCreate } from "./scheduled-task-create";
import { applyScheduledTaskUpdate } from "./scheduled-task-update";

let registered = false;

/** Idempotent: safe to call multiple times across hot reloads. */
export function registerOptimateApplyHandlers(): void {
  if (registered) return;
  registered = true;

  // Legacy proposalType from the original propose_negative_keywords tool —
  // map it to nkl-create so existing pending rows can still be Applied.
  registerApplyHandler("negative-keywords", legacyNegativeKeywordsAdapter);

  registerApplyHandler("nkl-create", applyNklCreate);
  registerApplyHandler("nkl-update", applyNklUpdate);
  registerApplyHandler("nkl-push-live", applyNklPushLive);
  registerApplyHandler("budget-update", applyBudgetUpdate);
  registerApplyHandler("budget-push-live", applyBudgetPushLive);
  registerApplyHandler("ad-copy-generate", applyAdCopyGenerate);
  registerApplyHandler("ad-copy-deploy", applyAdCopyDeploy);
  registerApplyHandler("campaign-restructure", applyCampaignRestructure);
  registerApplyHandler("campaign-build", applyCampaignBuild);
  registerApplyHandler("scheduled-task-create", applyScheduledTaskCreate);
  registerApplyHandler("scheduled-task-update", applyScheduledTaskUpdate);
}

/**
 * The original propose_negative_keywords tool stored payload as
 *   { summary, candidates: [{ term, matchType, reason }], customerId, auditId }
 * Translate that to the nkl-create shape on the fly.
 */
const legacyNegativeKeywordsAdapter: typeof applyNklCreate = async (rawPayload, ctx) => {
  const summary = String((rawPayload as { summary?: unknown }).summary ?? "").trim();
  const candidates = Array.isArray((rawPayload as { candidates?: unknown }).candidates)
    ? ((rawPayload as { candidates?: unknown }).candidates as Array<Record<string, unknown>>)
    : [];
  const auditId = (rawPayload as { auditId?: string | number }).auditId;
  if (!auditId) throw new Error("legacy negative-keywords: payload missing auditId");

  const adapted = {
    auditId,
    name: `Optimate proposal — ${summary.slice(0, 60) || new Date().toISOString().slice(0, 10)}`,
    scope: "account",
    keywords: candidates.map((c) => ({
      keyword: String(c.term ?? "").trim(),
      matchType: String(c.matchType ?? "exact").toLowerCase(),
    })),
  };
  return applyNklCreate(adapted, ctx);
};
