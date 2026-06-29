/**
 * After a dismissed search term is promoted to an EXACT keyword in target ad
 * groups, the term should stop serving via the original phrase/exact keyword
 * that triggered it. This adds the term as an EXACT negative to the source
 * candidate's own ad-group negative keyword list (auto-matched or created via
 * the same routing the approve flow uses), so traffic funnels to the new
 * exact keyword instead of the old match.
 */
import { randomUUID } from "node:crypto";
import type { getPayload } from "payload";
import { resolveTargetList, type RoutingCandidate } from "@/lib/match-type-approve";

type Payload = Awaited<ReturnType<typeof getPayload>>;

export interface NegateResult {
  listId: string | number;
  listName: string;
  createdList: boolean;
  alreadyPresent: boolean;
}

export async function negateExactInOwnList(
  payload: Payload,
  candidate: RoutingCandidate,
  keywordText: string,
): Promise<NegateResult> {
  const resolved = await resolveTargetList(payload, {
    candidate,
    routing: { mode: "auto" },
  });

  type NklKeyword = { id?: string | null; keyword?: string; matchType?: "exact" | "phrase" | "broad"; flaggedForRemoval?: boolean | null; negatedAt?: string | null };
  const nkl = (await payload.findByID({
    collection: "negative-keyword-lists",
    id: resolved.listId,
    depth: 0,
    overrideAccess: true,
  })) as { name?: string; keywords?: NklKeyword[] };

  const existing: NklKeyword[] = Array.isArray(nkl.keywords) ? nkl.keywords : [];
  const alreadyPresent = existing.some(
    (k) =>
      (k.keyword ?? "").toLowerCase() === keywordText.toLowerCase() &&
      (k.matchType ?? "").toLowerCase() === "exact",
  );

  if (!alreadyPresent) {
    const updated: NklKeyword[] = [
      ...existing,
      { id: randomUUID(), keyword: keywordText, matchType: "exact" as const, flaggedForRemoval: false, negatedAt: new Date().toISOString() },
    ].sort((a, b) => (a.keyword ?? "").localeCompare(b.keyword ?? ""));
    await payload.update({
      collection: "negative-keyword-lists",
      id: resolved.listId,
      data: { keywords: updated },
      overrideAccess: true,
    });
  }

  return {
    listId: resolved.listId,
    listName: String(nkl.name ?? ""),
    createdList: resolved.created,
    alreadyPresent,
  };
}
