/**
 * Placement (CONTRACT-3 §3), on the CMS's subscription models only.
 *
 * - placeMany / placeIdea: where a title fits (topic, fit, overlaps,
 *   new-article | improve-page | new-topic, links). Every model field is
 *   validated against the client's real topic keys and snapshot node ids.
 * - writeResearchInsights: once per new research run / Search Console pull,
 *   one model call per topic groups keywords + questions + competitor
 *   subjects + Search Console queries into ideas (one per search intent) and
 *   places them. Evidence, volumes, `why` and plan reasons are built by code
 *   from the data, never from model text, so competitors are only counted.
 *   The best RESEARCH_PLAN_PER_TOPIC per topic join the plan (with a
 *   model-written GEO brief, validated like ideas.ts); the rest are listed;
 *   new-topic ideas also become pending AI topic suggestions.
 * - In progress: the same placement for Blog Prompter briefs and CMS drafts
 *   outside the plan (max 20).
 */

import { createHash } from "crypto";
import { after } from "next/server";
import type { Payload } from "payload";
import { authoritiesFromClient } from "./authorities";
import { buildGscSignals, latestGsc, maybePullWeeklyGsc, pullGsc, type GscPullResult } from "./gsc";
import { latestCompletedDoc, normTitle, toRecommendation } from "./ideas";
import { callContentMapModel, extractJson, type ContentMapLlmResult } from "./llm";
import { buildPlan } from "./plan";
import {
  buildResearchView,
  latestCompletedResearch,
  latestResearchRow,
  MONTHLY_MIN_AGE_MS,
  parseResearchInsights,
  parseResearchResult,
  pollStaleResearchRun,
  startResearchRun,
  type ResearchInsights,
  type ResearchRunResult,
} from "./research";
import { relId } from "./snapshots";
import { buildSuggestionBriefPrompt, loadSuggestions, plainText } from "./suggestions";
import type {
  CompetitorPage,
  ContentMapSnapshot,
  GscQuerySignal,
  InProgressItem,
  PlacementResult,
  PlanItem,
  PlanReason,
  ResearchEvidence,
  ResearchIdea,
  ResearchKeyword,
  ResearchLayer,
  ResearchQuestion,
  ResearchView,
  SnapshotNode,
  SnapshotRecommendation,
  TopicAuthorityInput,
} from "./types";
import { isRecord, parseSnapshot, RESEARCH_PLAN_PER_TOPIC } from "./types";
import { clientSiteUrl } from "./paths";

type Doc = Record<string, unknown>;
export type Call = (p: Payload, i: { system: string; user: string; maxTokens?: number; timeoutMs?: number }) => Promise<ContentMapLlmResult>;

export const CLIENT_PLACEMENT_DAILY_LIMIT = 20;
export const MAX_IN_PROGRESS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const PLACEMENTS = ["new-article", "improve-page", "new-topic"] as const;

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, maxItems: number, maxLen = 240) => (Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : []);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const tokens = (t: string) => new Set(normTitle(t).split(" ").filter((w) => w.length > 2));
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// ─── Placement ────────────────────────────────────────────────────────────

export interface PlacementContext {
  authorities: readonly TopicAuthorityInput[];
  pages: readonly SnapshotNode[];
}

export function placementContext(authorities: readonly TopicAuthorityInput[], snapshot: ContentMapSnapshot | null): PlacementContext {
  return { authorities, pages: (snapshot?.nodes ?? []).filter((n) => !n.agg) };
}

const topicName = (ctx: PlacementContext, k: string | null) => ctx.authorities.find((a) => a.key === k)?.name ?? k ?? "";

/** Plain line built by code: "Fits Cost strongly and also touches Vietnam." */
export function placementWhy(p: Pick<PlacementResult, "topic" | "fit" | "overlaps" | "placement" | "pageTitle" | "newTopicName">, ctx: PlacementContext): string {
  if (p.placement === "new-topic") return `Doesn't fit the current topics; it suggests a new topic: ${p.newTopicName ?? ""}.`;
  const strength = p.fit >= 0.75 ? " strongly" : p.fit < 0.45 ? " loosely" : "";
  const also = p.overlaps.length ? ` and also touches ${p.overlaps.map((k) => topicName(ctx, k)).join(", ")}` : "";
  const improve = p.placement === "improve-page" && p.pageTitle ? ` Improve '${p.pageTitle}' rather than writing a new page.` : "";
  return `Fits ${topicName(ctx, p.topic)}${strength}${also}.${improve}`;
}

/** Code warnings: existing pages with a near-identical title. */
export function overlapWarnings(title: string, ctx: PlacementContext, exceptId: string | null): string[] {
  const tk = tokens(title);
  return ctx.pages
    .filter((n) => n.id !== exceptId && jaccard(tokens(n.t), tk) >= 0.5)
    .slice(0, 2)
    .map((n) => `Overlaps '${n.t}' — consider improving that page instead.`);
}

/** Validate a model placement. Null when the topic is not a real authority key (and it is not a new topic). */
export function validatePlacement(raw: unknown, title: string, ctx: PlacementContext): PlacementResult | null {
  if (!isRecord(raw)) return null;
  const keys = new Set(ctx.authorities.map((a) => a.key));
  const byId = new Map(ctx.pages.map((n) => [n.id, n]));
  let placement = PLACEMENTS.includes(raw.placement as (typeof PLACEMENTS)[number]) ? (raw.placement as PlacementResult["placement"]) : null;
  if (!placement) return null;
  const fitNum = typeof raw.fit === "number" ? raw.fit : Number(raw.fit);
  if (!Number.isFinite(fitNum)) return null;
  const fit = Math.round(Math.min(1, Math.max(0, fitNum)) * 100) / 100;
  const rawTopic = str(raw.topic, 80);
  let topic: string | null = keys.has(rawTopic) ? rawTopic : null;
  let newTopicName: string | null = null;
  if (placement === "new-topic") {
    newTopicName = str(raw.newTopicName, 80) || null;
    if (!newTopicName) return null;
    if (ctx.authorities.some((a) => a.name.toLowerCase() === newTopicName?.toLowerCase())) {
      topic = ctx.authorities.find((a) => a.name.toLowerCase() === newTopicName?.toLowerCase())?.key ?? null;
      placement = "new-article";
      newTopicName = null;
    } else topic = null;
  }
  if (placement !== "new-topic" && !topic) return null;
  let pageId: string | null = null;
  let pageTitle: string | null = null;
  if (placement === "improve-page") {
    const node = byId.get(str(raw.pageId, 500));
    if (node) {
      pageId = node.id;
      pageTitle = node.t;
    } else placement = "new-article";
  }
  const links = (v: unknown) => [...new Set(strList(v, 10, 500))].map((id) => byId.get(id)).filter((n): n is SnapshotNode => Boolean(n)).slice(0, 5).map((n) => ({ id: n.id, title: n.t }));
  const overlaps = [...new Set(strList(raw.overlaps, 3, 80).filter((k) => keys.has(k) && k !== topic))];
  const base = { topic, fit, overlaps, placement, pageId, pageTitle, newTopicName };
  return {
    ...base,
    linksTo: links(raw.linksTo),
    linksFrom: links(raw.linksFrom),
    why: "",
    warnings: overlapWarnings(title, ctx, pageId),
  };
}

function finishPlacement(p: PlacementResult, ctx: PlacementContext): PlacementResult {
  return { ...p, why: placementWhy(p, ctx) };
}

const PLACEMENT_FIELDS = `"topic":"authority key","fit":0.0-1.0,"overlaps":["other authority key"],"placement":"new-article|improve-page|new-topic","pageId":"page id when improve-page","newTopicName":"when new-topic","linksTo":["page id"],"linksFrom":["page id"]`;

function contextLines(ctx: PlacementContext, focus: string | null): string[] {
  const inTopic = (k: string) => ctx.pages.filter((n) => n.g === k).sort((a, b) => b.in - a.in || a.id.localeCompare(b.id));
  const pages = focus ? [...inTopic(focus).slice(0, 40), ...ctx.authorities.filter((a) => a.key !== focus).flatMap((a) => inTopic(a.key).slice(0, 6))] : ctx.authorities.flatMap((a) => inTopic(a.key).slice(0, 15));
  return [
    "Topic authorities (key | name | what it covers):",
    ...ctx.authorities.map((a) => `- ${a.key} | ${a.name}${a.description ? ` | ${a.description.slice(0, 200)}` : ""}`),
    "",
    "Existing pages (id | topic | title). Use these ids exactly:",
    ...pages.map((n) => `- ${n.id} | ${n.g} | ${n.t}`),
  ];
}

export function buildPlacementPrompt(ctx: PlacementContext, items: ReadonlyArray<{ title: string; why?: string; topic?: string | null }>): { system: string; user: string } {
  const system = `You are a content strategist deciding where proposed articles fit a website's topic authorities.
For each item: pick the authority it belongs to and how well it fits (0..1), other authorities it touches, and whether it should be a new article, an improvement of an existing page that already targets the same search intent (give that page id), or a new topic (only when it fits none of the authorities; give a short topic name). Add up to 5 existing pages it should link to and be linked from.

Reply with JSON only:
{"items":[{"index":0,${PLACEMENT_FIELDS}}]}`;
  const user = [
    ...contextLines(ctx, null),
    "",
    "Items:",
    ...items.map((it, i) => `${i}. ${it.title}${it.topic ? ` (suggested topic: ${it.topic})` : ""}${it.why ? ` — ${it.why.slice(0, 200)}` : ""}`),
  ].join("\n");
  return { system, user };
}

/** Place several titles in one model call. Entries the model got wrong are null. */
export async function placeMany(
  payload: Payload,
  ctx: PlacementContext,
  items: ReadonlyArray<{ title: string; why?: string; topic?: string | null }>,
  deps: { call?: Call } = {},
): Promise<{ results: Array<PlacementResult | null>; model: string }> {
  if (!items.length || !ctx.authorities.length) return { results: items.map(() => null), model: "" };
  const res = await (deps.call ?? callContentMapModel)(payload, { ...buildPlacementPrompt(ctx, items), maxTokens: 3000, timeoutMs: 90_000 });
  const json = extractJson(res.text);
  const list = isRecord(json) && Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : [];
  const results: Array<PlacementResult | null> = items.map(() => null);
  list.forEach((raw, i) => {
    if (!isRecord(raw)) return;
    const index = typeof raw.index === "number" ? raw.index : i;
    const item = items[index];
    if (!item || results[index]) return;
    const p = validatePlacement(raw, item.title, ctx);
    results[index] = p ? finishPlacement(p, ctx) : null;
  });
  return { results, model: res.model };
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

/** Place one title for a client (staff and PIN routes). */
export async function placeIdea(
  payload: Payload,
  clientId: string,
  input: { title: string; why?: string; topic?: string | null },
  deps: { call?: Call } = {},
): Promise<Checked<PlacementResult>> {
  const client = (await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
  const authorities = authoritiesFromClient(client);
  if (!authorities.length) return { ok: false, error: "Client has no topic authorities", status: 400 };
  const doc = await latestCompletedDoc(payload, clientId);
  const ctx = placementContext(authorities, doc ? parseSnapshot(doc.data) : null);
  try {
    const { results } = await placeMany(payload, ctx, [input], deps);
    const p = results[0];
    if (!p) return { ok: false, error: "The model could not place this idea. Please try again.", status: 502 };
    return { ok: true, value: p };
  } catch (err) {
    console.warn("[content-map] placement failed:", (err as Error).message);
    return { ok: false, error: "No model could place this idea. Check the OAuth connections in OptiMate settings.", status: 502 };
  }
}

/** Client placement checks: 20 per 24 h per client (stored, so it holds across instances). */
export async function checkClientPlacementLimit(payload: Payload, clientId: string, title: string, now: () => number = Date.now): Promise<Checked<null>> {
  const res = await payload.find({
    collection: "content-map-placement-checks",
    where: { client: { equals: clientId } },
    sort: "-createdAt",
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });
  const docs = res.docs as unknown as Doc[];
  const t = now();
  const age = (d: Doc) => t - Date.parse(String(d.createdAt ?? ""));
  const old = docs.filter((d) => age(d) > 2 * DAY_MS).map((d) => d.id);
  if (old.length) await payload.delete({ collection: "content-map-placement-checks", where: { id: { in: old as number[] } }, overrideAccess: true });
  if (docs.filter((d) => age(d) < DAY_MS).length >= CLIENT_PLACEMENT_DAILY_LIMIT) {
    return { ok: false, error: "That's the most placement checks for today. Please try again tomorrow.", status: 429 };
  }
  await payload.create({ collection: "content-map-placement-checks", data: { client: Number(clientId) || clientId, title: title.slice(0, 160), createdAt: new Date(t).toISOString() } as never, overrideAccess: true });
  return { ok: true, value: null };
}

// ─── Evidence (code only) ─────────────────────────────────────────────────

export function competitorDomains(pages: readonly CompetitorPage[]): string[] {
  const seen = new Map<string, number>();
  for (const p of pages) if (p.domain) seen.set(p.domain, Math.min(seen.get(p.domain) ?? 99, p.position));
  return [...seen.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([d]) => d);
}

/** Evidence lines + volume for an idea, built only from the data. */
export function buildEvidence(input: {
  keywords: readonly ResearchKeyword[];
  questions: readonly ResearchQuestion[];
  competitors: readonly CompetitorPage[];
  gsc: readonly GscQuerySignal[];
}): { evidence: ResearchEvidence[]; volume: number | null } {
  const known = input.keywords.filter((k) => typeof k.volume === "number");
  const volume = known.length ? known.reduce((s, k) => s + (k.volume ?? 0), 0) : null;
  const evidence: ResearchEvidence[] = [];
  if (volume && volume > 0) evidence.push({ source: "volume", text: `${fmt(volume)} searches a month`, volume });
  if (input.questions.length) {
    const q = [...input.questions].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
    const n = input.questions.length;
    evidence.push({ source: "questions", text: n === 1 ? `Asked on Google: “${q?.question ?? ""}”` : `${n} questions people ask on Google, like “${q?.question ?? ""}”` });
  }
  const domains = competitorDomains(input.competitors);
  if (domains.length) {
    const n = domains.length;
    evidence.push({ source: "competitors", text: `${n} ${n === 1 ? "competitor covers" : "competitors cover"} this`, competitors: n, domains });
  }
  const top = [...input.gsc].sort((a, b) => b.impressions - a.impressions)[0];
  if (top) {
    const impressions = input.gsc.reduce((s, g) => s + g.impressions, 0);
    const position = Math.round(top.position);
    const text =
      top.kind === "cannibal"
        ? `${top.pages.length} of the site's pages compete for this in Google (${fmt(impressions)} impressions last month)`
        : top.kind === "unanswered"
          ? `Google showed the site ${fmt(impressions)} times last month at position ${position}, with no page that answers it`
          : `People searched this ${fmt(impressions)} times last month; the site shows at position ${position}`;
    evidence.push({ source: "gsc", text, impressions, position });
  }
  return { evidence, volume };
}

/** Plan reasons from an idea's evidence (competitor reasons carry domains for the team only). */
export function evidenceReasons(evidence: readonly ResearchEvidence[]): PlanReason[] {
  const out: PlanReason[] = [];
  for (const e of evidence) {
    if (e.source === "volume") out.push({ kind: "demand", text: e.text });
    else if (e.source === "questions") out.push({ kind: "questions", text: e.text });
    else if (e.source === "competitors") {
      const n = e.competitors ?? 0;
      out.push({ kind: "competitors", text: `${n} ${n === 1 ? "competitor covers" : "competitors cover"} this, the site doesn’t`, ...(e.domains ? { domains: [...e.domains] } : {}) });
    } else if (e.source === "gsc") out.push({ kind: "search-console", text: e.text });
  }
  return out;
}

/** Terms that would identify a competitor: domains, their brand labels, page titles. */
export function competitorTerms(pages: readonly CompetitorPage[]): string[] {
  const out = new Set<string>();
  for (const p of pages) {
    const d = p.domain.toLowerCase().replace(/^www\./, "");
    if (d) out.add(d);
    const label = d.split(".")[0] ?? "";
    if (label.length >= 4) out.add(label);
    const t = normTitle(p.title ?? "");
    if (t.length >= 12) out.add(t);
  }
  return [...out];
}

function mentions(text: string, terms: readonly string[]): boolean {
  const lower = text.toLowerCase();
  const norm = normTitle(text);
  return terms.some((t) => lower.includes(t) || norm.includes(t));
}

/** Drop any brief text that names a competitor. */
export function scrubBrief(rec: SnapshotRecommendation, terms: readonly string[]): SnapshotRecommendation {
  if (!terms.length) return rec;
  const s = (v: string) => (mentions(v, terms) ? "" : v);
  const l = (v: readonly string[]) => v.filter((x) => !mentions(x, terms));
  return {
    ...rec,
    question: s(rec.question) || rec.question.replace(/\S+\.\w{2,}\S*/g, "").trim(),
    why: s(rec.why),
    ...(rec.primaryKeyword ? { primaryKeyword: s(rec.primaryKeyword) || undefined } : {}),
    secondaryKeywords: l(rec.secondaryKeywords),
    outline: l(rec.outline),
    geo: { answerFirst: s(rec.geo.answerFirst), entities: l(rec.geo.entities), faqs: l(rec.geo.faqs), evidence: l(rec.geo.evidence), schema: [...rec.geo.schema] },
  };
}

export function researchIdeaId(topic: string | null, title: string): string {
  return `rs-${createHash("sha1").update(`${topic ?? "new"}|${normTitle(title)}`).digest("hex").slice(0, 12)}`;
}

// ─── Research insights ────────────────────────────────────────────────────

export interface TopicResearchInput {
  topic: TopicAuthorityInput;
  keywords: ResearchKeyword[];
  questions: ResearchQuestion[];
  competitors: CompetitorPage[];
  gsc: GscQuerySignal[];
  planned: string[];
}

export function buildResearchPrompt(ctx: PlacementContext, input: TopicResearchInput, siteUrl: string): { system: string; user: string } {
  const system = `You are a content strategist planning articles that make a website the clear topical authority and that AI assistants will cite (GEO).
You get research for one topic authority: keywords with monthly search volume, questions people ask on Google, the subjects competitor pages cover (numbered), and Search Console queries the site gets impressions for without a good page.
Group them into article-sized ideas, ONE per search intent (merge keywords and questions that a single article would answer). Then place each idea: its authority, fit 0..1, other authorities it touches, and whether it is a new article, an improvement of an existing page that already targets that intent (pageId), or a new topic (only when it fits none of the authorities; newTopicName). Write a GEO brief for each.
First discard every keyword, question or Search Console query that does not fit this topic or the client's business (e.g. immigration, travel or jobs questions on a business-services site): list them in "discarded" and never use them in an idea.
Never name competitor websites, brands or page titles in any text you write.
List keywords, questions and searchConsole queries exactly as given; competitorPages as the given numbers.

Reply with JSON only:
{"discarded":[""],"ideas":[{"title":"","question":"","keywords":[""],"questions":[""],"searchConsole":[""],"competitorPages":[0],${PLACEMENT_FIELDS},"priority":"high|medium|low","primaryKeyword":"","secondaryKeywords":[""],"outline":["H2 as a question"],"answerFirst":"40-60 words","entities":[""],"faqs":[""],"evidence":[""],"schema":["Article","FAQPage"]}]}`;
  const user = [
    `Website: ${siteUrl}`,
    `Topic authority: ${input.topic.name} (key: ${input.topic.key})`,
    input.topic.description ? `What it covers: ${input.topic.description}` : "",
    "",
    ...contextLines(ctx, input.topic.key),
    "",
    input.planned.length ? "Already planned articles (do not repeat):" : "",
    ...input.planned.slice(0, 20).map((t) => `- ${t}`),
    "",
    "Keywords (monthly searches):",
    ...input.keywords.slice(0, 60).map((k) => `- ${k.keyword} (${k.volume ?? "?"})`),
    "",
    input.questions.length ? "Questions people ask:" : "",
    ...input.questions.slice(0, 30).map((q) => `- ${q.question}`),
    "",
    input.competitors.length ? "Competitor pages (number | subject | headings):" : "",
    ...input.competitors.slice(0, 10).map((p, i) => `${i}. ${p.title} | ${p.headings.slice(0, 10).join(" · ")}`),
    "",
    input.gsc.length ? "Search Console queries without a good page (query | impressions | position):" : "",
    ...input.gsc.slice(0, 20).map((g) => `- ${g.query} | ${g.impressions} | ${g.position}`),
    "",
    "Give up to 10 ideas, strongest demand first.",
  ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n");
  return { system, user };
}

interface DraftIdea {
  idea: ResearchIdea;
  brief: SnapshotRecommendation | null;
}

/** Validate one topic's model reply into ideas with code-built evidence. Bad topics / node ids are dropped. */
export function parseResearchIdeas(json: unknown, ctx: PlacementContext, input: TopicResearchInput, terms: readonly string[]): DraftIdea[] {
  const list = isRecord(json) && Array.isArray(json.ideas) ? json.ideas : Array.isArray(json) ? json : [];
  const kwBy = new Map(input.keywords.map((k) => [normTitle(k.keyword), k]));
  const qBy = new Map(input.questions.map((q) => [normTitle(q.question), q]));
  const gBy = new Map(input.gsc.map((g) => [normTitle(g.query), g]));
  // Inputs the model discarded as off-topic never count as evidence, whatever an idea lists.
  for (const d of isRecord(json) ? strList(json.discarded, 200, 300) : []) {
    const k = normTitle(d);
    kwBy.delete(k);
    qBy.delete(k);
    gBy.delete(k);
  }
  const nodeIds = new Set(ctx.pages.map((n) => n.id));
  const authorityKeys = new Set(ctx.authorities.map((a) => a.key));
  const out: DraftIdea[] = [];
  for (const raw of list) {
    if (!isRecord(raw)) continue;
    const title = str(raw.title, 160);
    const question = str(raw.question, 300);
    if (title.length < 10 || !question || mentions(title, terms)) continue;
    const placed = validatePlacement(raw, title, ctx);
    if (!placed) continue;
    const pick = <T>(v: unknown, by: Map<string, T>) => [...new Set(strList(v, 40, 300).map(normTitle))].map((k) => by.get(k)).filter((x): x is T => Boolean(x));
    const keywords = pick(raw.keywords, kwBy);
    const questions = pick(raw.questions, qBy);
    const gsc = pick(raw.searchConsole, gBy);
    const compIdx = Array.isArray(raw.competitorPages) ? raw.competitorPages.filter((n): n is number => Number.isInteger(n)) : [];
    const kwSet = new Set(keywords.map((k) => normTitle(k.keyword)));
    const competitors = input.competitors.filter((p, i) => p.ok && (compIdx.includes(i) || kwSet.has(normTitle(p.keyword))));
    // Grounded only: an idea must rest on at least one real (kept) research input.
    if (!keywords.length && !questions.length && !gsc.length) continue;
    const { evidence, volume } = buildEvidence({ keywords, questions, competitors, gsc });
    const id = researchIdeaId(placed.topic, title);
    if (out.some((d) => d.idea.id === id || normTitle(d.idea.title) === normTitle(title))) continue;
    const idea: ResearchIdea = {
      ...finishPlacement(placed, ctx),
      id,
      title,
      question: mentions(question, terms) ? title : question,
      layers: [...new Set(evidence.map((e) => e.source))] as ResearchLayer[],
      evidence,
      volume,
      keywords: keywords.map((k) => k.keyword),
      status: "listed",
      planItemId: null,
    };
    const rec = placed.topic ? toRecommendation({ ...raw, title, question: idea.question }, { topic: placed.topic, index: 0, nodeIds, authorityKeys }) : null;
    out.push({ idea, brief: rec ? scrubBrief({ ...rec, overlaps: idea.overlaps, why: evidence.map((e) => e.text).join("; ") }, terms) : null });
  }
  return out;
}

/** Volumes below this (or unknown) are too small to tell ideas apart: rank by evidence count + fit instead. */
export const MEANINGFUL_VOLUME = 100;
/** Volume bucket (log scale) so 20 vs 30 searches doesn't outrank stronger evidence. */
const volumeBucket = (v: number | null) => (v && v >= MEANINGFUL_VOLUME ? Math.floor(Math.log10(v) * 2) : 0);
export const ideaRank = (a: ResearchIdea, b: ResearchIdea) =>
  volumeBucket(b.volume) - volumeBucket(a.volume) || b.evidence.length - a.evidence.length || b.fit - a.fit || (b.volume ?? 0) - (a.volume ?? 0) || a.id.localeCompare(b.id);

/** Statuses: dismissed/added carry over by title; then the best RESEARCH_PLAN_PER_TOPIC briefed ideas per topic join the plan. */
export function assignStatuses(drafts: DraftIdea[], previous: ResearchInsights | null, plannedTitles: ReadonlySet<string>): { ideas: ResearchIdea[]; briefs: Record<string, SnapshotRecommendation> } {
  const prev = new Map((previous?.ideas ?? []).map((i) => [normTitle(i.title), i.status]));
  const briefs: Record<string, SnapshotRecommendation> = {};
  for (const d of drafts) if (d.brief) briefs[d.idea.id] = d.brief;
  const ideas = drafts.map((d) => ({ ...d.idea, status: prev.get(normTitle(d.idea.title)) === "dismissed" ? ("dismissed" as const) : ("listed" as const) }));
  const byTopic = new Map<string, ResearchIdea[]>();
  for (const i of ideas) {
    if (!i.topic || i.placement === "new-topic" || i.status === "dismissed" || plannedTitles.has(normTitle(i.title))) continue;
    byTopic.set(i.topic, [...(byTopic.get(i.topic) ?? []), i]);
  }
  for (const list of byTopic.values()) {
    list.sort(ideaRank);
    // Manually added ones stay in the plan; fill up to the per-topic number.
    let count = 0;
    for (const i of list) {
      const brief = briefs[i.id];
      if (!brief) continue;
      if (prev.get(normTitle(i.title)) === "in-plan" || count < RESEARCH_PLAN_PER_TOPIC) {
        i.status = "in-plan";
        i.planItemId = brief.id;
        count++;
      }
    }
  }
  ideas.sort((a, b) => (a.topic ?? "~").localeCompare(b.topic ?? "~") || ideaRank(a, b));
  return { ideas, briefs };
}

/** Plan items for in-plan research ideas (merged by buildPlan). */
export function researchPlanItems(insights: ResearchInsights | null): PlanItem[] {
  if (!insights) return [];
  const out: PlanItem[] = [];
  for (const idea of insights.ideas) {
    const brief = insights.briefs[idea.id];
    if (idea.status !== "in-plan" || !brief) continue;
    out.push({ ...brief, origin: "research", reasons: evidenceReasons(idea.evidence), volume: idea.volume, researchId: idea.id });
  }
  return out;
}

async function loadInProgress(payload: Payload, clientId: string, plannedTitles: ReadonlySet<string>): Promise<Array<{ id: string; kind: "brief" | "draft"; title: string; cmsId: string }>> {
  const [prompts, posts] = await Promise.all([
    payload.find({
      collection: "blog-prompts",
      where: { and: [{ client: { equals: clientId } }, { source: { not_equals: "content-map" } }, { workflowStatus: { not_equals: "published" } }] },
      sort: "-createdAt",
      limit: 50,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: "blog-posts",
      where: { and: [{ client: { equals: clientId } }, { status: { in: ["draft", "review"] } }] },
      sort: "-createdAt",
      limit: 50,
      depth: 0,
      overrideAccess: true,
    }),
  ]);
  const out: Array<{ id: string; kind: "brief" | "draft"; title: string; cmsId: string }> = [];
  const seen = new Set(plannedTitles);
  for (const p of prompts.docs as unknown as Doc[]) {
    if (p.archivedAt) continue;
    const title = str(p.titleIdea, 160) || str(p.blogIdea, 160);
    if (!title || seen.has(normTitle(title))) continue;
    seen.add(normTitle(title));
    out.push({ id: `ip-brief-${p.id}`, kind: "brief", title, cmsId: String(p.id) });
  }
  for (const p of posts.docs as unknown as Doc[]) {
    const title = str(p.title, 160);
    if (!title || seen.has(normTitle(title))) continue;
    seen.add(normTitle(title));
    out.push({ id: `ip-draft-${p.id}`, kind: "draft", title, cmsId: String(p.id) });
  }
  return out.slice(0, MAX_IN_PROGRESS);
}

/** Pending AI topic suggestions for new-topic ideas (de-duplicated against topics and every suggestion). */
async function suggestNewTopics(payload: Payload, clientId: string, ideas: readonly ResearchIdea[], authorities: readonly TopicAuthorityInput[], existing: readonly Doc[]): Promise<number> {
  const taken = new Set([...authorities.map((a) => normTitle(a.name)), ...existing.filter((s) => s.kind === "topic").map((s) => normTitle(String(s.title ?? "")))]);
  let created = 0;
  for (const idea of ideas) {
    if (idea.placement !== "new-topic" || !idea.newTopicName || idea.status === "dismissed") continue;
    const key = normTitle(idea.newTopicName);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    const demand = idea.volume ? `${fmt(idea.volume)} searches a month` : "Research demand";
    await payload.create({
      collection: "content-map-suggestions",
      data: {
        client: Number(clientId) || clientId,
        kind: "topic",
        title: idea.newTopicName.slice(0, 160),
        why: `${demand} for “${idea.title}”, outside the current topics.`.slice(0, 600),
        topic: null,
        topicB: null,
        status: "pending",
        origin: "ai",
        suggestedBy: "Research",
      } as never,
      overrideAccess: true,
    });
    created++;
  }
  return created;
}

export function needsResearchInsights(doc: Doc | null | undefined, gscDoc: Doc | null): boolean {
  if (!doc || doc.status !== "completed" || !doc.result) return false;
  const insights = parseResearchInsights(doc.insights);
  return !insights || insights.gscId !== (gscDoc ? String(gscDoc.id) : null);
}

/** Group + place a completed research run's data with the subscription models (one call per topic). */
export async function writeResearchInsights(
  payload: Payload,
  doc: Doc,
  deps: { call?: Call; now?: () => number } = {},
): Promise<{ ok: true; insights: ResearchInsights } | { ok: false; error: string }> {
  const result = parseResearchResult(doc.result);
  if (!result) return { ok: false, error: "The research run has no usable result" };
  const call = deps.call ?? callContentMapModel;
  const clientId = relId(doc.client);
  const client = (await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
  const authorities = authoritiesFromClient(client);
  const [snapDoc, suggestions, gscDoc] = await Promise.all([latestCompletedDoc(payload, clientId), loadSuggestions(payload, clientId), latestGsc(payload, clientId)]);
  const snapshot = snapDoc ? parseSnapshot(snapDoc.data) : null;
  const ctx = placementContext(authorities, snapshot);
  const basePlan = buildPlan({ snapshot, suggestions, result: null, insights: null });
  const plannedTitles = new Set(basePlan.flatMap((p) => [normTitle(p.title), normTitle(p.question)]));
  const signals = buildGscSignals(gscDoc, snapshot);
  const openGsc = signals.queries.filter((q) => q.kind !== "cannibal");
  const primary = authorities.find((a) => a.primary)?.key ?? authorities[0]?.key ?? null;

  const drafts: DraftIdea[] = [];
  let model = "";
  let topicsFailed = 0;
  for (const topic of authorities) {
    const t = result.topics.find((x) => x.key === topic.key);
    const input: TopicResearchInput = {
      topic,
      keywords: t?.keywords ?? [],
      questions: t?.questions ?? [],
      competitors: (t?.competitors.pages ?? []).filter((p) => p.ok),
      gsc: openGsc.filter((q) => q.topic === topic.key || (q.topic === null && topic.key === primary)),
      planned: basePlan.filter((p) => p.topic === topic.key).map((p) => p.title),
    };
    if (!input.keywords.length && !input.questions.length && !input.gsc.length) continue;
    const terms = competitorTerms(input.competitors);
    try {
      const res = await call(payload, { ...buildResearchPrompt(ctx, input, result.siteUrl), maxTokens: 8000, timeoutMs: 150_000 });
      const json = extractJson(res.text);
      const parsed = parseResearchIdeas(json, ctx, input, terms);
      if (!parsed.length) { topicsFailed++; continue; }
      model ||= res.model;
      for (const d of parsed) if (!drafts.some((x) => x.idea.id === d.idea.id)) drafts.push(d);
    } catch (err) {
      console.warn(`[content-map] research insights for "${topic.name}" failed:`, (err as Error).message);
      topicsFailed++;
    }
  }
  const previous = parseResearchInsights(doc.insights) ?? parseResearchInsights((await latestCompletedResearch(payload, clientId, 2)).find((d) => d.id !== doc.id)?.insights);
  const { ideas, briefs } = assignStatuses(drafts, previous, plannedTitles);
  await suggestNewTopics(payload, clientId, ideas, authorities, suggestions);

  const researchTitles = new Set([...plannedTitles, ...ideas.filter((i) => i.status === "in-plan").map((i) => normTitle(i.title))]);
  const pending = await loadInProgress(payload, clientId, researchTitles);
  let placements: Array<PlacementResult | null> = pending.map(() => null);
  if (pending.length) {
    try {
      const res = await placeMany(payload, ctx, pending.map((p) => ({ title: p.title })), { call });
      placements = res.results;
      model ||= res.model;
    } catch (err) {
      console.warn("[content-map] in-progress placement failed:", (err as Error).message);
    }
  }
  const insights: ResearchInsights = {
    model,
    generatedAt: new Date((deps.now ?? Date.now)()).toISOString(),
    gscId: gscDoc ? String(gscDoc.id) : null,
    ideas,
    briefs,
    inProgress: pending.map((p, i) => ({ id: p.id, kind: p.kind, title: p.title, cmsId: p.cmsId, placement: placements[i] ?? null })),
    topicsFailed,
  };
  await payload.update({ collection: "content-map-research", id: doc.id as number, data: { insights } as never, overrideAccess: true });
  return { ok: true, insights };
}

/** Run research insights after the response (request scope) or detached (scripts/tests). */
export function scheduleResearchInsights(payload: Payload, doc: Doc, deps: { call?: Call; now?: () => number } = {}): void {
  const job = async () => {
    const res = await writeResearchInsights(payload, doc, deps).catch((err: Error) => ({ ok: false as const, error: err.message }));
    if (!res.ok) console.warn("[content-map] research insights failed:", res.error);
  };
  try {
    after(job);
  } catch {
    void job();
  }
}

// ─── Decide ───────────────────────────────────────────────────────────────

export type ResearchDecideResult = { ok: true; idea: ResearchIdea; planItem?: PlanItem } | { ok: false; error: string; status: number };

export async function decideResearchIdea(
  payload: Payload,
  input: { clientId: string; id: string; action: "add" | "dismiss" | "restore" },
  deps: { call?: Call } = {},
): Promise<ResearchDecideResult> {
  const [doc] = await latestCompletedResearch(payload, input.clientId);
  const insights = doc ? parseResearchInsights(doc.insights) : null;
  const idea = insights?.ideas.find((i) => i.id === input.id);
  if (!doc || !insights || !idea) return { ok: false, error: "Research idea not found", status: 404 };
  const save = async () => {
    await payload.update({ collection: "content-map-research", id: doc.id as number, data: { insights } as never, overrideAccess: true });
  };
  if (input.action === "dismiss") {
    if (idea.status === "dismissed") return { ok: false, error: "Already dismissed", status: 409 };
    idea.status = "dismissed";
    idea.planItemId = null;
    await save();
    return { ok: true, idea };
  }
  if (input.action === "restore") {
    if (idea.status !== "dismissed") return { ok: false, error: "Only dismissed ideas can be restored", status: 409 };
    idea.status = "listed";
    await save();
    return { ok: true, idea };
  }
  if (idea.status === "in-plan") return { ok: false, error: "Already in the plan", status: 409 };
  if (idea.placement === "new-topic" || !idea.topic) return { ok: false, error: "This idea needs a new topic first; approve the topic suggestion instead", status: 409 };
  let brief = insights.briefs[idea.id] ?? null;
  if (!brief) {
    const client = (await payload.findByID({ collection: "clients", id: input.clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
    const authorities = authoritiesFromClient(client);
    const snapDoc = await latestCompletedDoc(payload, input.clientId);
    const snapshot = snapDoc ? parseSnapshot(snapDoc.data) : null;
    const why = idea.evidence.map((e) => e.text).join("; ");
    const prompt = buildSuggestionBriefPrompt({ siteUrl: clientSiteUrl(client), suggestion: { kind: "article", title: idea.title, why, topic: idea.topic, topicB: null }, authorities, snapshot });
    try {
      const res = await (deps.call ?? callContentMapModel)(payload, { ...prompt, maxTokens: 3000, timeoutMs: 120_000 });
      const json = extractJson(res.text);
      const raw = Array.isArray(json) ? json[0] : isRecord(json) && Array.isArray(json.ideas) ? json.ideas[0] : json;
      const nodeIds = new Set((snapshot?.nodes ?? []).filter((n) => !n.agg).map((n) => n.id));
      const rec = toRecommendation(raw, { topic: idea.topic, index: 0, nodeIds, authorityKeys: new Set(authorities.map((a) => a.key)) });
      if (rec) {
        const terms = competitorTerms((parseResearchResult(doc.result)?.topics ?? []).flatMap((t) => t.competitors.pages));
        brief = scrubBrief({ ...rec, overlaps: idea.overlaps, why }, terms);
      }
    } catch (err) {
      console.warn("[content-map] research brief failed:", (err as Error).message);
    }
    if (!brief) return { ok: false, error: "No model could write the brief. Check the OAuth connections in OptiMate settings, then try again.", status: 502 };
    insights.briefs[idea.id] = brief;
  }
  idea.status = "in-plan";
  idea.planItemId = brief.id;
  await save();
  return { ok: true, idea, planItem: researchPlanItems({ ...insights, ideas: [idea] })[0] };
}

// ─── State + schedule ─────────────────────────────────────────────────────

/** Research view, in-progress list and research plan items for state.ts. */
export async function loadResearchState(
  payload: Payload,
  input: { clientId: string; client: Doc; snapshot: ContentMapSnapshot | null; authorities: readonly TopicAuthorityInput[] },
  now: () => number = Date.now,
): Promise<{ research: ResearchView | null; inProgress: InProgressItem[]; planItems: PlanItem[]; insights: ResearchInsights | null }> {
  const [latestRow, completed, gsc] = await Promise.all([
    latestResearchRow(payload, input.clientId),
    latestCompletedResearch(payload, input.clientId),
    latestGsc(payload, input.clientId),
  ]);
  let latest = latestRow;
  let done = completed[0] ?? null;
  if (latest?.status === "running") {
    const polled = await pollStaleResearchRun(payload, latest, now);
    if (polled.status === "completed" && polled.id !== done?.id) {
      done = polled;
      if (needsResearchInsights(polled, gsc)) scheduleResearchInsights(payload, polled);
    }
    latest = polled;
  }
  const insights = done ? parseResearchInsights(done.insights) : null;
  const location = typeof input.client.targetLocation === "string" && input.client.targetLocation.trim() ? input.client.targetLocation.trim() : "Australia";
  const research = buildResearchView({ latest, done, gsc, gscConnected: input.client.gscConnected === true, snapshot: input.snapshot, authorities: input.authorities, location });
  return { research, inProgress: insights?.inProgress ?? [], planItems: researchPlanItems(insights), insights };
}

export interface ResearchScheduleResult {
  gsc: GscPullResult | null;
  research: ResearchRunResult | null;
  placed: boolean;
}

/**
 * Monday chain (after ideas → citations): pull Search Console when the last
 * pull is ≥ 6 days old, start research when the last completed run is ≥ 28
 * days old (a running one < 60 min is reused: no double GT call). When only
 * Search Console is new, re-place the latest research run with it.
 */
export async function runResearchSchedule(
  payload: Payload,
  clientId: string,
  deps: { now?: () => number; call?: Call; pull?: typeof maybePullWeeklyGsc; start?: typeof startResearchRun } = {},
): Promise<ResearchScheduleResult> {
  const now = deps.now ?? Date.now;
  const gsc = await (deps.pull ?? maybePullWeeklyGsc)(payload, clientId, { now }).catch((err: Error) => ({ ok: false, connected: false, doc: null, error: err.message }) as GscPullResult);
  const [last] = await latestCompletedResearch(payload, clientId);
  const at = Date.parse(String(last?.generatedAt ?? ""));
  let research: ResearchRunResult | null = null;
  if (!last || !Number.isFinite(at) || now() - at >= MONTHLY_MIN_AGE_MS) {
    const snapDoc = await latestCompletedDoc(payload, clientId);
    const snapshot = snapDoc ? parseSnapshot(snapDoc.data) : null;
    const plan = buildPlan({ snapshot, suggestions: await loadSuggestions(payload, clientId), result: null, insights: null });
    research = await (deps.start ?? startResearchRun)(payload, clientId, { now, snapshot, plan });
  }
  let placed = false;
  const startedNew = research?.ok === true && research.run.status === "running";
  if (gsc?.ok && last && !startedNew && needsResearchInsights(last, gsc.doc)) {
    const res = await writeResearchInsights(payload, last, { call: deps.call, now });
    placed = res.ok;
  }
  return { gsc, research, placed };
}

/** "Research now": start research and pull Search Console now. */
export async function runResearchNow(
  payload: Payload,
  clientId: string,
  deps: { now?: () => number; pull?: typeof pullGsc; start?: typeof startResearchRun } = {},
): Promise<{ research: ResearchRunResult; gsc: GscPullResult }> {
  const now = deps.now ?? Date.now;
  const snapDoc = await latestCompletedDoc(payload, clientId);
  const snapshot = snapDoc ? parseSnapshot(snapDoc.data) : null;
  const plan = buildPlan({ snapshot, suggestions: await loadSuggestions(payload, clientId), result: null, insights: null });
  const research = await (deps.start ?? startResearchRun)(payload, clientId, { now, snapshot, plan });
  const gsc = await (deps.pull ?? pullGsc)(payload, clientId, { now }).catch((err: Error) => ({ ok: false, connected: false, doc: null, error: err.message }) as GscPullResult);
  return { research, gsc };
}

/** `{ title, why?, topic? }` from a placement request, sanitised. */
export function parsePlacementBody(body: Doc): Checked<{ title: string; why?: string; topic?: string | null }> {
  if (typeof body.title !== "string" || body.title.length > 2000) return { ok: false, error: "title must be text", status: 400 };
  if (body.why !== undefined && (typeof body.why !== "string" || body.why.length > 5000)) return { ok: false, error: "why must be text", status: 400 };
  if (body.topic !== undefined && body.topic !== null && (typeof body.topic !== "string" || body.topic.length > 80)) return { ok: false, error: "topic must be text", status: 400 };
  const title = plainText(body.title).slice(0, 160);
  if (title.length < 3) return { ok: false, error: "The title must be 3 to 160 characters", status: 400 };
  const why = plainText(body.why ?? "", true).slice(0, 600);
  return { ok: true, value: { title, ...(why ? { why } : {}), ...(typeof body.topic === "string" ? { topic: body.topic } : {}) } };
}
