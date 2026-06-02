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
 *   - "ad-group-create"      → create ONE ad group in an existing campaign (PAUSED), optionally cloning a source
 *   - "keywords-add"         → bulk-add positive keywords to an existing ad group (PAUSED)
 *   - "geo-campaign-split"   → create a labelled geo campaign batch PAUSED + reviewed parent isolation
 *   - "goal-run-create"      → create a generic goal-agent run
 *   - "account-efficiency-goal-run-create" → create an Account Efficiency goal-agent run
 *   - "stakeholder-deck"     → write a 5-slide deck (page.tsx + globals.css) to disk
 */

import { registerApplyHandler } from "@/lib/agents/_shared/apply-dispatcher";
import { applyNklCreate } from "./nkl-create";
import { applyNklUpdate } from "./nkl-update";
import { applyNklPushLive } from "./nkl-push-live";
import { applyBudgetUpdate } from "./budget-update";
import { applyBudgetPushLive } from "./budget-push-live";
import { applyCampaignTargetCpaUpdate } from "./campaign-target-cpa-update";
import { applyCampaignTargetRoasUpdate } from "./campaign-target-roas-update";
import { applyCampaignBidStrategyChange } from "./campaign-bid-strategy-change";
import { applyAdCopyGenerate } from "./ad-copy-generate";
import { applyAdCopyDeploy } from "./ad-copy-deploy";
import { applyAdGroupCreate } from "./ad-group-create";
import { applyAdGroupPause } from "./ad-group-pause";
import { applyKeywordsAdd } from "./keywords-add";
import { applyKeywordPause } from "./keyword-pause";
import { applyCampaignRestructure } from "./campaign-restructure";
import { applyCampaignBuild } from "./campaign-build";
import { applyGeoCampaignSplit } from "./geo-campaign-split";
import { applyGoalRunCreate } from "./goal-run-create";
import { applyAccountEfficiencyGoalRunCreate } from "./account-efficiency-goal-run-create";
import { applyScheduledTaskCreate } from "./scheduled-task-create";
import { applyScheduledTaskUpdate } from "./scheduled-task-update";
import { applyStakeholderDeck } from "./stakeholder-deck";
import { applyDeckFromTemplate } from "./deck-from-template";

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
  registerApplyHandler("campaign-target-cpa-update", applyCampaignTargetCpaUpdate);
  registerApplyHandler("campaign-target-roas-update", applyCampaignTargetRoasUpdate);
  registerApplyHandler("campaign-bid-strategy-change", applyCampaignBidStrategyChange);
  registerApplyHandler("ad-copy-generate", applyAdCopyGenerate);
  registerApplyHandler("ad-copy-deploy", applyAdCopyDeploy);
  registerApplyHandler("ad-group-create", applyAdGroupCreate);
  registerApplyHandler("ad-group-pause", applyAdGroupPause);
  registerApplyHandler("keywords-add", applyKeywordsAdd);
  registerApplyHandler("keyword-pause", applyKeywordPause);
  registerApplyHandler("campaign-restructure", applyCampaignRestructure);
  registerApplyHandler("campaign-build", applyCampaignBuild);
  registerApplyHandler("geo-campaign-split", applyGeoCampaignSplit);
  registerApplyHandler("goal-run-create", applyGoalRunCreate);
  registerApplyHandler("account-efficiency-goal-run-create", applyAccountEfficiencyGoalRunCreate);
  registerApplyHandler("scheduled-task-create", applyScheduledTaskCreate);
  registerApplyHandler("scheduled-task-update", applyScheduledTaskUpdate);
  registerApplyHandler("stakeholder-deck", applyStakeholderDeck);
  registerApplyHandler("deck-from-template", applyDeckFromTemplate);
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
