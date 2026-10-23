import type { Payload, Where } from "payload";
import type { ContentMapDecision, ContentMapSnapshot, SnapshotOpportunity } from "./types";

export type DecisionAction = ContentMapDecision | "undo";

/** siteUrl + path; draft `cms:` ids and already-absolute URLs stay as-is. */
export function absoluteUrl(siteUrl: string, id: string): string {
  if (id.startsWith("cms:") || /^https?:\/\//i.test(id)) return id;
  let origin = siteUrl.trim().replace(/\/+$/, "");
  try {
    origin = new URL(origin).origin;
  } catch {
    /* keep as typed */
  }
  return `${origin}${id.startsWith("/") ? id : `/${id}`}`;
}

/**
 * Learned term weights (+1 per accepted, -1 per dismissed opportunity term).
 * Terms come from the newest snapshot that still lists the opportunity.
 */
export function computeTermW(
  decisions: ReadonlyArray<{ key: string; decision: ContentMapDecision }>,
  snapshots: ReadonlyArray<Pick<ContentMapSnapshot, "opportunities"> | null>,
): Record<string, number> {
  const terms = new Map<string, string[]>();
  for (const snap of snapshots) {
    for (const opp of snap?.opportunities ?? []) if (!terms.has(opp.key)) terms.set(opp.key, opp.terms);
  }
  const w: Record<string, number> = {};
  for (const d of [...decisions].sort((a, b) => a.key.localeCompare(b.key))) {
    for (const t of terms.get(d.key) ?? []) w[t] = (w[t] ?? 0) + (d.decision === "accepted" ? 1 : -1);
  }
  return Object.fromEntries(Object.entries(w).filter(([, v]) => v !== 0).sort(([a], [b]) => a.localeCompare(b)));
}

export function suggestionDataFor(snapshot: ContentMapSnapshot, siteUrl: string, opp: SnapshotOpportunity) {
  const src = snapshot.nodes[opp.s];
  const tgt = snapshot.nodes[opp.t];
  const topicName = (k: string | undefined) => snapshot.topics.find((t) => t.k === k)?.name ?? k ?? "";
  const same = src?.g === tgt?.g;
  return {
    sourceUrl: absoluteUrl(siteUrl, src?.id ?? ""),
    targetUrl: absoluteUrl(siteUrl, tgt?.id ?? ""),
    anchorText: opp.anchor?.trim() || tgt?.t || tgt?.id || "link",
    contextSnippet: opp.snippet ?? "",
    confidenceScore: Math.max(0, Math.min(100, Math.round(opp.sim * 100))),
    clusterRelation: same ? "within" : "cross",
    clusterName: same ? topicName(src?.g) : `${topicName(src?.g)} → ${topicName(tgt?.g)}`,
  };
}

export type DecisionResult =
  | { ok: true; key: string; decision: DecisionAction; suggestionId: string | number | null }
  | { ok: false; error: string; status: number };

export async function applyDecision(
  payload: Payload,
  input: { clientId: string; siteUrl: string; snapshot: ContentMapSnapshot | null; key: string; decision: DecisionAction },
): Promise<DecisionResult> {
  const where: Where = {
    and: [
      { client: { equals: input.clientId } },
      { origin: { equals: "content-map" } },
      { opportunityKey: { equals: input.key } },
    ],
  };
  const existing = await payload.find({ collection: "internal-link-suggestions", where, limit: 10, depth: 0, overrideAccess: true });
  if (input.decision === "undo") {
    if (existing.docs.length) await payload.delete({ collection: "internal-link-suggestions", where, overrideAccess: true });
    return { ok: true, key: input.key, decision: "undo", suggestionId: null };
  }
  const opp = input.snapshot?.opportunities.find((o) => o.key === input.key);
  if (!opp || !input.snapshot) return { ok: false, error: "Opportunity not found in the latest snapshot", status: 404 };
  const data = {
    ...suggestionDataFor(input.snapshot, input.siteUrl || input.snapshot.siteUrl, opp),
    client: Number(input.clientId) || input.clientId,
    origin: "content-map",
    opportunityKey: input.key,
    status: input.decision === "accepted" ? "approved" : "rejected",
  };
  const first = existing.docs[0];
  const doc = first
    ? await payload.update({ collection: "internal-link-suggestions", id: first.id, data: data as never, overrideAccess: true })
    : await payload.create({ collection: "internal-link-suggestions", data: data as never, overrideAccess: true });
  return { ok: true, key: input.key, decision: input.decision, suggestionId: doc.id };
}
