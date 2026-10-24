import type { Payload } from "payload";
import { absoluteUrl } from "./decisions";
import { sentenceCase } from "./sentence-case";
import type { ContentMapSnapshot, PlanItem, SnapshotRecommendation } from "./types";

export interface BriefData {
  client: number | string;
  blogIdea: string;
  titleIdea: string;
  category: string;
  mainPoint: string;
  keyPoints: string;
  primaryKeywords: string;
  secondaryKeywords: string;
  supportingContent: string;
  source: "content-map";
  contentMapRecommendationId: string;
}

function categoryFor(name: string, blogCategories: string): string {
  const wanted = name.trim().toLowerCase();
  const match = blogCategories
    .split(/\r?\n/)
    .map((c) => c.trim())
    .find((c) => c && c.toLowerCase() === wanted);
  return match ?? "";
}

/** "Write next" recommendation → Blog Prompter brief fields. Pure. */
export function recommendationToBrief(input: {
  clientId: string;
  rec: SnapshotRecommendation & Partial<Pick<PlanItem, "sources" | "cover" | "beat">>;
  snapshot: Pick<ContentMapSnapshot, "topics" | "siteUrl">;
  siteUrl: string;
  blogCategories: string;
}): BriefData {
  const { rec } = input;
  const site = input.siteUrl || input.snapshot.siteUrl;
  const authority = input.snapshot.topics.find((t) => t.k === rec.topic)?.name ?? "";
  const list = (label: string, items: readonly string[]) => (items.length ? [`${label}:`, ...items.map((i) => `- ${i}`)] : []);
  const geo = [
    "GEO checklist",
    ...list("Entities to cover", rec.geo.entities),
    ...list("FAQs", rec.geo.faqs),
    ...list("Evidence to cite", rec.geo.evidence),
    ...list("Schema", rec.geo.schema),
  ];
  const ai = [
    ...list("Sources AI cites now", (rec.sources ?? []).map((s) => `${s.title || s.domain} (${s.url})`)),
    ...list("Cover", rec.cover ?? []),
    ...list("Do better than them", rec.beat ?? []),
  ];
  const links = [
    ...rec.linksTo.map((id) => `Link to: ${absoluteUrl(site, id)}`),
    ...rec.linksFrom.map((id) => `Link from: ${absoluteUrl(site, id)}`),
  ];
  return {
    client: Number(input.clientId) || input.clientId,
    blogIdea: sentenceCase(rec.title),
    titleIdea: sentenceCase(rec.title),
    category: categoryFor(authority, input.blogCategories),
    mainPoint: [rec.question, rec.geo.answerFirst].filter(Boolean).join("\n\n"),
    keyPoints: rec.outline.map(sentenceCase).join("\n"),
    primaryKeywords: rec.primaryKeyword ?? "",
    secondaryKeywords: rec.secondaryKeywords.join(", "),
    supportingContent: [...links, ...(links.length ? [""] : []), ...geo, ...(ai.length ? ["", ...ai] : [])].join("\n"),
    source: "content-map",
    contentMapRecommendationId: rec.id,
  };
}

export type SendResult = { ok: true; blogPromptId: string; created: boolean } | { ok: false; error: string; status: number };

/** Idempotent per client + recommendation id. */
export async function sendRecommendation(
  payload: Payload,
  input: { clientId: string; recommendationId: string; snapshot: ContentMapSnapshot | null; plan?: readonly PlanItem[]; siteUrl: string; blogCategories: string },
): Promise<SendResult> {
  const existing = await payload.find({
    collection: "blog-prompts",
    where: {
      and: [
        { client: { equals: input.clientId } },
        { contentMapRecommendationId: { equals: input.recommendationId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const found = existing.docs[0];
  if (found) return { ok: true, blogPromptId: String(found.id), created: false };
  // Plan items (snapshot ideas, AI-citation gaps, approved suggestions) first, then the raw snapshot.
  const rec = input.plan?.find((r) => r.id === input.recommendationId) ?? input.snapshot?.recommendations.find((r) => r.id === input.recommendationId);
  if (!rec) return { ok: false, error: "Recommendation not found in the plan", status: 404 };
  const snapshot = input.snapshot ?? { topics: [], siteUrl: input.siteUrl };
  const data = recommendationToBrief({ clientId: input.clientId, rec, snapshot, siteUrl: input.siteUrl, blogCategories: input.blogCategories });
  const doc = await payload.create({ collection: "blog-prompts", data: data as never, overrideAccess: true });
  return { ok: true, blogPromptId: String(doc.id), created: true };
}
