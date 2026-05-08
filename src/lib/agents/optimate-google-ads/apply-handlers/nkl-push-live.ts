/**
 * Apply handler: nkl-push-live
 *
 * Pushes the keywords from a CMS-managed NKL to the linked Google Ads
 * account. Mirrors `POST /api/google-ads-audits/approve-negatives` — calls
 * Growth Tools `negative-sweep/apply` with the keywords from the NKL.
 *
 * Expected payload:
 *   {
 *     auditId: string|number,
 *     nklId: number,
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import { resolveCustomerId, postGrowthTools } from "./_helpers";

interface NklDoc {
  id: number;
  name?: string;
  keywords?: Array<{ keyword?: string; matchType?: string }>;
}

interface ApplyResult {
  successCount?: number;
  errors?: unknown[];
}

export const applyNklPushLive: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const auditId = payload.auditId as string | number | undefined;
  const nklId = Number(payload.nklId);
  if (!auditId) throw new Error("nkl-push-live payload missing auditId");
  if (!Number.isFinite(nklId)) throw new Error("nkl-push-live payload missing or invalid nklId");

  const nkl = (await pl.findByID({
    collection: "negative-keyword-lists",
    id: nklId,
    overrideAccess: true,
  })) as NklDoc;

  const keywords = (nkl.keywords ?? [])
    .map((k) => ({
      keyword: String(k.keyword ?? "").trim(),
      matchType: String(k.matchType ?? "exact").toUpperCase(),
    }))
    .filter((k) => k.keyword.length > 0);

  if (keywords.length === 0) {
    throw new Error(`nkl-push-live: NKL #${nklId} has no keywords to push`);
  }

  const { customerId } = await resolveCustomerId(pl, auditId);

  const res = await postGrowthTools("/api/google-ads/negative-sweep/apply", {
    customerId,
    keywords,
    cmsDocId: auditId,
    nklId,
  });

  if (!res.ok) {
    throw new Error(`Growth Tools apply failed: ${res.error}`);
  }

  const data = res.data as ApplyResult | null;
  const successCount = Number(data?.successCount ?? keywords.length);
  const errCount = Array.isArray(data?.errors) ? data!.errors.length : 0;

  return {
    message: `Pushed ${successCount}/${keywords.length} keywords from NKL #${nklId} ("${nkl.name ?? ""}") to Google Ads${errCount ? ` — ${errCount} per-keyword errors` : ""}.`,
    detail: { customerId, nklId, attempted: keywords.length, successCount, errCount },
  };
};
