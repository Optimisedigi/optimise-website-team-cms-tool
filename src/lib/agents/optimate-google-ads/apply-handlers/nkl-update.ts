/**
 * Apply handler: nkl-update
 *
 * Updates an existing `negative-keyword-lists` document. Used when the agent
 * proposes adding/removing keywords from an already-managed list (e.g. "add
 * 'free' as exact match to NKL #3"). Replaces the keywords array wholesale
 * with the proposed set so the proposal is the single source of truth — the
 * agent must compose the merged set in its propose-tool.
 *
 * Expected payload:
 *   {
 *     nklId: number,
 *     keywords: Array<{ keyword, matchType }>,
 *     name?: string,           // optional rename
 *     isActive?: boolean,      // optional toggle
 *   }
 */

import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";
import type { NklKeyword } from "./_helpers";

export const applyNklUpdate: ApplyHandler = async (payload, ctx): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;
  const nklId = Number(payload.nklId);
  if (!Number.isFinite(nklId)) throw new Error("nkl-update payload missing or invalid nklId");

  const data: Record<string, unknown> = {};

  if (Array.isArray(payload.keywords)) {
    const keywords: NklKeyword[] = (payload.keywords as Array<Record<string, unknown>>).map((k, i) => {
      const keyword = String(k.keyword ?? "").trim();
      const matchType = String(k.matchType ?? "exact").toLowerCase();
      if (!keyword) throw new Error(`nkl-update: keyword[${i}] missing text`);
      if (!["exact", "phrase", "broad"].includes(matchType)) {
        throw new Error(`nkl-update: keyword[${i}] invalid matchType "${matchType}"`);
      }
      return { keyword, matchType: matchType as NklKeyword["matchType"] };
    });
    data.keywords = keywords;
  }

  if (typeof payload.name === "string" && payload.name.trim()) {
    data.name = payload.name.trim();
  }
  if (typeof payload.isActive === "boolean") {
    data.isActive = payload.isActive;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("nkl-update: payload changes nothing (no keywords, name, or isActive)");
  }

  const updated = (await pl.update({
    collection: "negative-keyword-lists",
    id: nklId,
    data: data as never,
    overrideAccess: true,
  })) as { id: number; keywordCount?: number };

  return {
    message: `Updated NKL #${updated.id}${updated.keywordCount !== undefined ? ` (now ${updated.keywordCount} keywords)` : ""}.`,
    detail: { nklId: updated.id, fieldsChanged: Object.keys(data) },
  };
};
