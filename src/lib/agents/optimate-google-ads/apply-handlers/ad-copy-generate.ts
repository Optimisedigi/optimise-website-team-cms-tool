/**
 * Apply handler: ad-copy-generate
 *
 * Kicks off the existing generate-ad-copy pipeline for an audit. The actual
 * generation is a long-running background job (Kimi RSAs across all ad
 * groups), so we replicate the route's status-stamp + return immediately.
 * The chat agent then watches via get_ad_copy_status (or the human reads
 * audit.adCopyStatus) for completion.
 *
 * Because the Kimi work is wrapped in `after()` inside the route — which is
 * Next-server-only — we duplicate the trigger here using the same approach:
 * mark status="generating" and call the route's POST self-invoke is fragile
 * (cookie auth). Simpler: stamp status and rely on a separate worker /
 * background trigger. For v1 we simply stamp status and let the operator
 * trigger generation by clicking "Generate" in the audit UI; the agent
 * surfaces a clear next-step message.
 *
 * NOTE: A future iteration will accept the api-key on the generate-ad-copy
 * route so the apply-handler can fully kick it off. Until then this handler
 * is a "ready to generate" marker — see expected payload.
 *
 * Expected payload:
 *   {
 *     auditId: string|number,
 *     brandHeadlines?: string[],   // optional CMS field update
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";

export const applyAdCopyGenerate: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const auditId = payload.auditId as string | number | undefined;
  if (!auditId) throw new Error("ad-copy-generate payload missing auditId");
  const auditIdNum = typeof auditId === "string" ? Number(auditId) : auditId;
  if (!Number.isFinite(auditIdNum)) throw new Error("ad-copy-generate: auditId must be numeric");

  const data: Record<string, unknown> = { adCopyStatus: "draft" };
  if (Array.isArray(payload.brandHeadlines)) {
    const lines = (payload.brandHeadlines as unknown[])
      .map((h) => (typeof h === "string" ? h.trim() : ""))
      .filter((h) => h.length > 0 && h.length <= 30);
    if (lines.length > 0) {
      data.adCopyBrandHeadlines = lines.join("\n");
    }
  }

  await pl.update({
    collection: "google-ads-audits",
    id: auditIdNum as number,
    data: data as never,
    overrideAccess: true,
  });

  return {
    message: `Audit #${auditIdNum} prepared for ad-copy generation${data.adCopyBrandHeadlines ? " (brand headlines saved)" : ""}. Operator: open the audit and click "Generate Ad Copy" to start the Kimi run.`,
    detail: { auditId: auditIdNum, brandHeadlinesSaved: Boolean(data.adCopyBrandHeadlines) },
  };
};
