/**
 * Write next ideas written by the CMS's own (subscription) models. Used while
 * Growth Tools has no working LLM (snapshot.ai.llm === "none"): GT's template
 * ideas are replaced per topic authority with model-written, GEO-shaped briefs.
 * Authorities whose call fails keep GT's ideas.
 */

import { createHash } from "crypto";
import { SENTENCE_CASE_RULE, sentenceCase } from "./sentence-case";
import type { Payload } from "payload";
import { callContentMapModel, extractJson, type ContentMapLlmResult } from "./llm";
import type { ContentMapSnapshot, SnapshotNode, SnapshotRecommendation } from "./types";
import { parseSnapshot } from "./types";

type Doc = Record<string, unknown>;

const MAX_PER_TOPIC = 5;
const MAX_TOPICS = 8;
const CONCURRENCY = 4;
const PRIORITY_BASE = { high: 0.9, medium: 0.65, low: 0.4 } as const;

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, maxItems: number, maxLen = 200) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

export function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(t: string): Set<string> {
  return new Set(normTitle(t).split(" ").filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function recommendationId(topic: string, title: string): string {
  return `cm-${createHash("sha1").update(`${topic}|${normTitle(title)}`).digest("hex").slice(0, 12)}`;
}

/** Authorities to plan for, primary first (snapshot topic order otherwise). */
export function authorityTopics(snapshot: ContentMapSnapshot) {
  const list = snapshot.topics.filter((t) => !t.agg && t.k !== "core");
  return [...list.filter((t) => t.primary), ...list.filter((t) => !t.primary)].slice(0, MAX_TOPICS);
}

export function buildIdeasPrompt(snapshot: ContentMapSnapshot, topicKey: string): { system: string; user: string } {
  const topic = snapshot.topics.find((t) => t.k === topicKey);
  const authorities = authorityTopics(snapshot);
  const nodes = snapshot.nodes.filter((n) => !n.agg);
  const byTopic = (k: string) => nodes.filter((n) => n.g === k).sort((a, b) => b.in - a.in);
  const mine = byTopic(topicKey);
  const others = authorities.filter((t) => t.k !== topicKey);
  // Topic pairs with no links either way.
  const linked = new Set<string>();
  for (const l of snapshot.links) {
    const a = snapshot.nodes[l.s]?.g, b = snapshot.nodes[l.t]?.g;
    if (a && b && a !== b) { linked.add(`${a}>${b}`); linked.add(`${b}>${a}`); }
  }
  const unlinked = others.filter((o) => !linked.has(`${topicKey}>${o.k}`)).map((o) => o.name);
  const orphans = mine.filter((n) => n.in === 0).slice(0, 15);
  const core = byTopic("core").slice(0, 5);
  const candidates: SnapshotNode[] = [...mine.slice(0, 25), ...others.flatMap((o) => byTopic(o.k).slice(0, 3)), ...core];

  const system = `You are a content strategist. You plan new articles that make a website the clear topical authority on a subject and that AI assistants (ChatGPT, Gemini, Perplexity, Google AI Overviews) will cite: generative engine optimisation (GEO).

Each idea must:
- answer one specific question real people ask, that no existing page on the site already answers;
- sit inside the given topic authority, bridging to another authority only where that is natural;
- be planned for citation: a direct 40-60 word answer first, question-style H2s, named entities, FAQs, and evidence worth citing.

${SENTENCE_CASE_RULE}
Reply with JSON only, no prose:
{"ideas":[{"title":"","question":"","why":"one or two sentences: the gap it fills","priority":"high|medium|low","overlaps":["other authority key"],"primaryKeyword":"","secondaryKeywords":[""],"outline":["H2 as a question"],"answerFirst":"40-60 words","entities":[""],"faqs":[""],"evidence":[""],"schema":["Article","FAQPage"],"linksTo":["page id"],"linksFrom":["page id"]}]}`;

  const user = [
    `Website: ${snapshot.siteUrl}`,
    `Topic authority: ${topic?.name ?? topicKey} (key: ${topicKey})${topic?.primary ? " — the site's primary authority" : ""}`,
    topic?.description ? `What it covers: ${topic.description}` : "",
    others.length ? `Other authorities on the site (key: name): ${others.map((o) => `${o.k}: ${o.name}`).join("; ")}` : "",
    "",
    `Existing pages in this authority (${mine.length}):`,
    ...mine.slice(0, 60).map((n) => `- ${n.t}`),
    "",
    others.length ? "Strongest pages in the other authorities:" : "",
    ...others.flatMap((o) => byTopic(o.k).slice(0, 8).map((n) => `- [${o.name}] ${n.t}`)),
    "",
    orphans.length ? `Pages in this authority nothing links to: ${orphans.map((n) => n.t).join("; ")}` : "",
    unlinked.length ? `Authorities this one never links to or from: ${unlinked.join(", ")}` : "",
    "",
    "Pages the new articles can link to or be linked from (use these ids exactly in linksTo / linksFrom):",
    ...candidates.map((n) => `- ${n.id} | ${n.t}`),
    "",
    `Give up to ${MAX_PER_TOPIC} ideas, best first. Do not repeat or lightly reword an existing title.`,
  ].filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== "")).join("\n");
  return { system, user };
}

/** Validate one model idea into the snapshot shape; null when unusable. */
export function toRecommendation(raw: unknown, ctx: { topic: string; index: number; nodeIds: Set<string>; authorityKeys: Set<string> }): SnapshotRecommendation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 160);
  const question = str(r.question, 300);
  if (title.length < 10 || !question) return null;
  const priority = r.priority === "high" || r.priority === "medium" || r.priority === "low" ? r.priority : "medium";
  const ids = (v: unknown) => [...new Set(strList(v, 10, 500).filter((id) => ctx.nodeIds.has(id)))].slice(0, 5);
  return {
    id: recommendationId(ctx.topic, title),
    topic: ctx.topic,
    overlaps: [...new Set(strList(r.overlaps, 3, 80).filter((k) => k !== ctx.topic && ctx.authorityKeys.has(k)))],
    title: sentenceCase(title),
    question: sentenceCase(question),
    why: str(r.why, 400),
    priority,
    score: Math.max(0.05, Math.round((PRIORITY_BASE[priority] - ctx.index * 0.03) * 100) / 100),
    primaryKeyword: str(r.primaryKeyword, 120) || undefined,
    secondaryKeywords: strList(r.secondaryKeywords, 8, 120),
    outline: strList(r.outline, 10, 200).map(sentenceCase),
    geo: {
      answerFirst: str(r.answerFirst, 700),
      entities: strList(r.entities, 12, 120),
      faqs: strList(r.faqs, 8, 200),
      evidence: strList(r.evidence, 8, 240),
      schema: strList(r.schema, 5, 40),
    },
    linksTo: ids(r.linksTo),
    linksFrom: ids(r.linksFrom),
  };
}

type Call = (p: Payload, i: { system: string; user: string; maxTokens?: number; timeoutMs?: number }) => Promise<ContentMapLlmResult>;

export interface IdeasResult {
  recommendations: SnapshotRecommendation[];
  model: string;
  topicsDone: number;
  topicsFailed: number;
}

/** Ideas for every authority; failed authorities keep the snapshot's existing ideas. Null when every call failed. */
export async function generateIdeas(payload: Payload, snapshot: ContentMapSnapshot, call: Call = callContentMapModel): Promise<IdeasResult | null> {
  const topics = authorityTopics(snapshot);
  const nodeIds = new Set(snapshot.nodes.filter((n) => !n.agg).map((n) => n.id));
  const authorityKeys = new Set(topics.map((t) => t.k));
  const existing = snapshot.nodes.filter((n) => !n.agg).map((n) => tokens(n.t));
  const results = new Map<string, SnapshotRecommendation[] | null>();
  let model = "";
  let next = 0;
  const worker = async () => {
    while (next < topics.length) {
      const t = topics[next++];
      try {
        const res = await call(payload, { ...buildIdeasPrompt(snapshot, t.k), maxTokens: 6000, timeoutMs: 120_000 });
        const json = extractJson(res.text) as { ideas?: unknown } | unknown[] | null;
        const list = Array.isArray(json) ? json : Array.isArray((json as { ideas?: unknown })?.ideas) ? ((json as { ideas: unknown[] }).ideas) : null;
        if (!list) { results.set(t.k, null); continue; }
        model ||= res.model;
        const recs: SnapshotRecommendation[] = [];
        for (const raw of list) {
          const rec = toRecommendation(raw, { topic: t.k, index: recs.length, nodeIds, authorityKeys });
          if (!rec) continue;
          const tk = tokens(rec.title);
          if (existing.some((e) => jaccard(e, tk) >= 0.75)) continue;
          if (recs.some((r) => r.id === rec.id || jaccard(tokens(r.title), tk) >= 0.75)) continue;
          recs.push(rec);
          if (recs.length >= MAX_PER_TOPIC) break;
        }
        results.set(t.k, recs.length ? recs : null);
      } catch (err) {
        console.warn(`[content-map] ideas for "${t.name}" failed:`, (err as Error).message);
        results.set(t.k, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, topics.length) }, worker));
  const done = [...results.values()].filter(Boolean).length;
  if (!done) return null;
  const recommendations = topics.flatMap((t) => results.get(t.k) ?? snapshot.recommendations.filter((r) => r.topic === t.k));
  recommendations.sort((a, b) => b.score - a.score);
  return { recommendations, model, topicsDone: done, topicsFailed: topics.length - done };
}

/** GT ran without an LLM and the CMS hasn't written ideas for this snapshot yet. */
export function needsIdeas(snapshot: ContentMapSnapshot | null): boolean {
  // Ideas are always written by the CMS's subscription models (Growth Tools runs no LLM).
  return Boolean(snapshot && !snapshot.ai.ideas);
}

export async function latestCompletedDoc(payload: Payload, clientId: string): Promise<Doc | null> {
  const res = await payload.find({
    collection: "content-map-snapshots",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "completed" } }] },
    sort: "-generatedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (res.docs[0] as unknown as Doc | undefined) ?? null;
}

/** Rewrite a stored snapshot's ideas with the CMS models. */
export async function refreshIdeas(
  payload: Payload,
  doc: Doc,
  deps: { call?: Call; now?: () => Date } = {},
): Promise<{ ok: true; model: string; count: number; topicsFailed: number } | { ok: false; error: string }> {
  const snapshot = parseSnapshot(doc.data);
  if (!snapshot) return { ok: false, error: "The analysis has no usable snapshot" };
  const res = await generateIdeas(payload, snapshot, deps.call ?? callContentMapModel);
  if (!res) return { ok: false, error: "No model could write ideas. Check the OAuth connections in OptiMate settings." };
  const data: ContentMapSnapshot = {
    ...snapshot,
    recommendations: res.recommendations,
    ai: { ...snapshot.ai, ideas: { model: res.model, generatedAt: (deps.now?.() ?? new Date()).toISOString() } },
  };
  await payload.update({ collection: "content-map-snapshots", id: doc.id as number, data: { data } as never, overrideAccess: true });
  return { ok: true, model: res.model, count: res.recommendations.length, topicsFailed: res.topicsFailed };
}
