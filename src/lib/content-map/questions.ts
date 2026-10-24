/**
 * Questions tracked in AI tools, in two groups (user decision 2026-10-24):
 *
 *   1. "existing": one question per PUBLISHED article of the client: the
 *      question that article answers, written by the subscription models from
 *      its title, headings, opening and real Search Console searches. Listed
 *      first, so we see which existing articles AI tools cite.
 *   2. "planned": up to 2 per topic for articles in the plan and approved
 *      suggestions (suggestions first). Listed after, per topic.
 *
 * Questions never change once written, so the weekly trend compares like with
 * like. Removed questions stay inactive and are never re-added. Rows from
 * before the split (no group) are retired once; a retired row whose question
 * comes back is reactivated, so its history is kept.
 */

import type { Payload } from "payload";
import { latestGsc, buildGscSignals } from "./gsc";
import { normTitle } from "./ideas";
import { callContentMapModel, extractJson, type ContentMapLlmResult } from "./llm";
import { buildPlan } from "./plan";
import { plainText } from "./suggestions";
import type { ContentMapSnapshot, QuestionGroup, TopicAuthorityInput, TrackedQuestionView } from "./types";
import { isRecord, MAX_EXISTING_QUESTIONS, MAX_QUESTIONS_PER_TOPIC, MAX_TRACKED_QUESTIONS, PLANNED_QUESTIONS_PER_TOPIC } from "./types";

type Doc = Record<string, unknown>;
type Call = (p: Payload, i: { system: string; user: string; maxTokens?: number; timeoutMs?: number }) => Promise<ContentMapLlmResult>;
type Source = TrackedQuestionView["source"];

const ARTICLE_BATCH = 12;

export async function loadQuestions(payload: Payload, clientId: string, activeOnly = true): Promise<Doc[]> {
  const res = await payload.find({
    collection: "content-map-questions",
    where: activeOnly ? { and: [{ client: { equals: clientId } }, { active: { equals: true } }] } : { client: { equals: clientId } },
    sort: "createdAt",
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  });
  return res.docs as unknown as Doc[];
}

function cleanQuestion(v: unknown): string {
  const q = plainText(v).slice(0, 300).trim();
  return q.length >= 8 ? q : "";
}

export function questionGroup(d: Doc): QuestionGroup | null {
  return d.questionGroup === "existing" || d.questionGroup === "planned" ? d.questionGroup : null;
}

const relId = (v: unknown): string => (isRecord(v) ? String(v.id ?? "") : v === null || v === undefined ? "" : String(v));

/** "How to X | Optimise Digital" → "How to X". */
export function cleanArticleTitle(title: string): string {
  return title.replace(/\s*[|·–—-]\s*[^|·–—-]{2,60}$/u, (m) => (m.includes("|") || m.includes("·") ? "" : m)).trim();
}

const STOP = new Set("a an the and or of to in on for with your you how what why is are it its can do does my i we our should when which who vs best".split(" "));
function tokens(t: string): Set<string> {
  return new Set(normTitle(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
}
function overlap(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / (x.size + y.size - n);
}

/** Headings and the opening paragraph of an article's markdown, for the prompt. */
export function articleOutline(markdown: string): { headings: string[]; opening: string } {
  const lines = markdown.split(/\r?\n/);
  const headings = lines.filter((l) => /^#{2,3}\s+/.test(l)).map((l) => l.replace(/^#{2,3}\s+/, "").replace(/[*_`]/g, "").trim()).filter(Boolean).slice(0, 8);
  const para = lines.find((l) => l.trim().length > 60 && !/^\s*(#|!\[|>|\||-\s|\*\s|\d+\.)/.test(l)) ?? "";
  const opening = para.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim().slice(0, 320);
  return { headings, opening };
}

export interface ArticleInput {
  id: string;
  title: string;
  headings: string[];
  opening: string;
  searches: string[];
}

export function buildArticleQuestionsPrompt(input: { siteUrl: string; articles: ArticleInput[] }): { system: string; user: string } {
  const system = `For each article, write the one question a real buyer types into an AI assistant (ChatGPT, Perplexity, Gemini, Google AI Overviews) that this article answers, so we can check whether AI tools cite it. Natural, specific, under 20 words, Australian English. Base it on what the article actually covers. When real Google searches are listed for an article, prefer the most common one phrased as a question. Never name the website or brand.

Reply with JSON only: {"questions":[{"id":"<article id>","question":"..."}]}`;
  const user = [
    `Website: ${input.siteUrl}`,
    "",
    ...input.articles.flatMap((a) => [
      `Article ${a.id}: ${a.title}`,
      a.headings.length ? `  Sections: ${a.headings.join(" | ")}` : "",
      a.opening ? `  Opens with: ${a.opening}` : "",
      a.searches.length ? `  Real Google searches it shows for: ${a.searches.join(" | ")}` : "",
    ]),
  ].filter(Boolean).join("\n");
  return { system, user };
}

export function buildQuestionsPrompt(input: { siteUrl: string; topic: TopicAuthorityInput; pages: string[]; existing: string[]; count: number }): { system: string; user: string } {
  const system = `You write the questions real buyers type into AI assistants (ChatGPT, Perplexity, Gemini, Google AI Overviews) when researching a subject. Each question is natural, specific, under 20 words, and something a business on this subject would want to be cited for. Australian English. Only questions the site's existing pages do NOT already answer.

Reply with JSON only: {"questions":["..."]}`;
  const user = [
    `Website: ${input.siteUrl}`,
    `Topic: ${input.topic.name}`,
    input.topic.description ? `What it covers: ${input.topic.description}` : "",
    input.pages.length ? "Pages the site already has on this topic:" : "",
    ...input.pages.slice(0, 40).map((t) => `- ${t}`),
    input.existing.length ? "Already tracked (do not repeat or reword):" : "",
    ...input.existing.map((q) => `- ${q}`),
    "",
    `Give ${input.count} new questions, most commonly asked first.`,
  ].filter(Boolean).join("\n");
  return { system, user };
}

/** Rows to add or reactivate, keyed by normalised question text. */
interface Writer {
  all: Doc[];
  /** Normalised text of every row that is active or was removed by the team (never re-added). */
  blocked: Set<string>;
  /** Retired pre-split rows, reusable so their history carries over. */
  retired: Map<string, Doc>;
}

async function save(payload: Payload, w: Writer, clientId: string, data: Doc): Promise<Doc | null> {
  const q = cleanQuestion(data.question);
  const key = normTitle(q);
  if (!q || !key || w.blocked.has(key)) return null;
  w.blocked.add(key);
  const old = w.retired.get(key);
  const fields = { ...data, question: q, active: true };
  if (old) {
    w.retired.delete(key);
    const doc = (await payload.update({ collection: "content-map-questions", id: old.id as number, data: fields as never, overrideAccess: true })) as unknown as Doc;
    const i = w.all.findIndex((d) => d.id === old.id);
    if (i >= 0) w.all[i] = doc;
    return doc;
  }
  const doc = (await payload.create({ collection: "content-map-questions", data: { client: Number(clientId) || clientId, ...fields } as never, overrideAccess: true })) as unknown as Doc;
  w.all.push(doc);
  return doc;
}

/** Published articles of the client, best-known first (Search Console impressions, then newest). */
async function publishedArticles(payload: Payload, clientId: string): Promise<Doc[]> {
  const res = await payload.find({
    collection: "blog-posts",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "published" } }] },
    sort: "-publishedDate",
    limit: 200,
    depth: 0,
    overrideAccess: true,
    select: { title: true, slug: true, markdownContent: true, publishedDate: true },
  });
  return res.docs as unknown as Doc[];
}

/** Fill both groups. Returns the active questions to track, existing articles first. */
export async function ensureQuestions(
  payload: Payload,
  input: { clientId: string; siteUrl: string; authorities: readonly TopicAuthorityInput[]; snapshot: ContentMapSnapshot | null; suggestions: readonly Doc[] },
  deps: { call?: Call; articles?: Doc[]; gsc?: Doc | null } = {},
): Promise<Doc[]> {
  const call = deps.call ?? callContentMapModel;
  const all = await loadQuestions(payload, input.clientId, false);

  // One-time rebuild: retire rows from before the two groups existed.
  const retired = new Map<string, Doc>();
  for (const d of all) {
    if (questionGroup(d)) continue;
    if (d.active === true) {
      const doc = (await payload.update({ collection: "content-map-questions", id: d.id as number, data: { active: false } as never, overrideAccess: true })) as unknown as Doc;
      Object.assign(d, doc, { active: false });
    }
    retired.set(normTitle(String(d.question ?? "")), d);
  }
  const w: Writer = { all, blocked: new Set(all.filter((d) => questionGroup(d)).map((d) => normTitle(String(d.question ?? "")))), retired };

  const nodes = (input.snapshot?.nodes ?? []).filter((n) => !n.agg);
  const authorityKeys = new Set(input.authorities.map((a) => a.key));
  const primary = input.authorities.find((a) => a.primary)?.key ?? input.authorities[0]?.key ?? "";

  // ── 1. Existing articles ──
  const articles = deps.articles ?? (await publishedArticles(payload, input.clientId));
  const published = new Set(articles.map((a) => String(a.id)));
  // Unpublished/deleted articles stop being tracked.
  for (const d of all) {
    if (questionGroup(d) !== "existing" || d.active !== true) continue;
    if (!published.has(relId(d.blogPost))) {
      await payload.update({ collection: "content-map-questions", id: d.id as number, data: { active: false } as never, overrideAccess: true });
      d.active = false;
    }
  }
  const hasRow = new Set(all.filter((d) => questionGroup(d) === "existing").map((d) => relId(d.blogPost)));
  const gscDoc = deps.gsc !== undefined ? deps.gsc : await latestGsc(payload, input.clientId).catch(() => null);
  const gscPages = new Map(buildGscSignals(gscDoc, input.snapshot).pages.map((p) => [p.nodeId, p]));
  const nodeFor = (a: Doc) => {
    const id = String(a.id);
    const slug = String(a.slug ?? "").toLowerCase();
    return nodes.find((n) => n.cmsId === id) ?? (slug ? nodes.find((n) => n.id.replace(/\/+$/, "").toLowerCase().endsWith(`/${slug}`)) : undefined);
  };
  const ranked = articles
    .map((a) => ({ a, node: nodeFor(a) }))
    .map((x) => ({ ...x, impressions: x.node ? gscPages.get(x.node.id)?.impressions ?? 0 : 0 }))
    .sort((x, y) => y.impressions - x.impressions);
  const activeExisting = all.filter((d) => questionGroup(d) === "existing" && d.active === true).length;
  const room = Math.max(0, MAX_EXISTING_QUESTIONS - activeExisting);
  const missing = ranked.filter((x) => !hasRow.has(String(x.a.id))).slice(0, room);
  for (let i = 0; i < missing.length; i += ARTICLE_BATCH) {
    const batch = missing.slice(i, i + ARTICLE_BATCH);
    const inputs: ArticleInput[] = batch.map(({ a, node }) => {
      const { headings, opening } = articleOutline(String(a.markdownContent ?? ""));
      const searches = node ? (gscPages.get(node.id)?.topQueries ?? []).map((q) => q.query).slice(0, 5) : [];
      return { id: String(a.id), title: cleanArticleTitle(String(a.title ?? "")), headings, opening, searches };
    });
    let written = new Map<string, string>();
    try {
      const res = await call(payload, { ...buildArticleQuestionsPrompt({ siteUrl: input.siteUrl, articles: inputs }), maxTokens: 2500, timeoutMs: 90_000 });
      const json = extractJson(res.text);
      const list = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.questions) ? json.questions : [];
      written = new Map(list.filter(isRecord).map((r) => [String(r.id ?? ""), String(r.question ?? "")]));
    } catch (err) {
      console.warn("[content-map] article questions failed:", (err as Error).message);
    }
    for (const { a, node } of batch) {
      const title = cleanArticleTitle(String(a.title ?? ""));
      // A title that is already a question works when the model couldn't help; otherwise try again next run.
      const question = written.get(String(a.id)) || (title.endsWith("?") ? title : "");
      if (!question) continue;
      const topic = node && authorityKeys.has(node.g) ? node.g : primary;
      await save(payload, w, input.clientId, { topic, question, source: "article", questionGroup: "existing", blogPost: Number(a.id) || a.id, pageId: node?.id ?? null, pageTitle: title });
    }
  }
  const existingQs = all.filter((d) => questionGroup(d) === "existing" && d.active === true).map((d) => String(d.question ?? ""));
  const coveredByArticle = (q: string) => existingQs.some((e) => normTitle(e) === normTitle(q) || overlap(e, q) >= 0.6);

  // ── 2. Planned and suggested, per topic (suggestions first, then the plan by score) ──
  const plan = buildPlan({ snapshot: input.snapshot, suggestions: input.suggestions, result: null, insights: null });
  for (const topic of input.authorities) {
    const active = () => all.filter((d) => questionGroup(d) === "planned" && d.active === true && d.topic === topic.key).length;
    if (active() >= PLANNED_QUESTIONS_PER_TOPIC) continue;
    const items = plan.filter((p) => p.topic === topic.key);
    const ordered = [...items.filter((p) => p.origin === "client" || p.origin === "team"), ...items.filter((p) => p.origin !== "client" && p.origin !== "team")];
    for (const p of ordered) {
      if (active() >= PLANNED_QUESTIONS_PER_TOPIC) break;
      if (!p.question || coveredByArticle(p.question)) continue;
      const source: Source = p.origin === "client" ? "client" : p.origin === "team" ? "team" : "recommendation";
      await save(payload, w, input.clientId, { topic: topic.key, question: p.question, source, questionGroup: "planned" });
    }
    const need = PLANNED_QUESTIONS_PER_TOPIC - active();
    if (need <= 0) continue;
    try {
      const titles = nodes.filter((n) => n.g === topic.key).sort((a, b) => b.in - a.in).map((n) => cleanArticleTitle(n.t));
      const prompt = buildQuestionsPrompt({
        siteUrl: input.siteUrl,
        topic,
        pages: titles,
        existing: all.filter((d) => d.topic === topic.key && d.active === true).map((d) => String(d.question ?? "")),
        count: need,
      });
      const res = await call(payload, { ...prompt, maxTokens: 1500, timeoutMs: 90_000 });
      const json = extractJson(res.text);
      const list = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.questions) ? json.questions : [];
      for (const q of list) {
        if (active() >= PLANNED_QUESTIONS_PER_TOPIC) break;
        if (!coveredByArticle(String(q ?? ""))) await save(payload, w, input.clientId, { topic: topic.key, question: String(q ?? ""), source: "ai", questionGroup: "planned" });
      }
    } catch (err) {
      console.warn(`[content-map] questions for "${topic.name}" failed:`, (err as Error).message);
    }
  }

  const existing = all.filter((d) => questionGroup(d) === "existing" && d.active === true);
  const planned = all.filter((d) => questionGroup(d) === "planned" && d.active === true && authorityKeys.has(String(d.topic)));
  return [...existing, ...planned].slice(0, MAX_TRACKED_QUESTIONS);
}

export type QuestionResult = { ok: true; questions: Doc[] } | { ok: false; error: string; status: number };

export async function addQuestion(payload: Payload, input: { clientId: string; topic: string; question: unknown; authorities: readonly TopicAuthorityInput[] }): Promise<QuestionResult> {
  if (!input.authorities.some((a) => a.key === input.topic)) return { ok: false, error: "Choose one of the client's topics", status: 400 };
  const question = cleanQuestion(input.question);
  if (!question) return { ok: false, error: "The question must be 8 to 300 characters", status: 400 };
  const all = await loadQuestions(payload, input.clientId, false);
  const active = all.filter((d) => d.active === true && d.topic === input.topic && questionGroup(d) === "planned");
  if (active.length >= MAX_QUESTIONS_PER_TOPIC) return { ok: false, error: `This topic already tracks ${MAX_QUESTIONS_PER_TOPIC} questions. Remove one first.`, status: 409 };
  const key = normTitle(question);
  const same = all.find((d) => normTitle(String(d.question ?? "")) === key);
  if (same?.active === true) return { ok: false, error: "This question is already tracked", status: 409 };
  if (same) {
    await payload.update({ collection: "content-map-questions", id: same.id as number, data: { active: true, topic: input.topic, source: "team", questionGroup: "planned" } as never, overrideAccess: true });
  } else {
    await payload.create({
      collection: "content-map-questions",
      data: { client: Number(input.clientId) || input.clientId, topic: input.topic, question, source: "team", active: true, questionGroup: "planned" } as never,
      overrideAccess: true,
    });
  }
  return { ok: true, questions: await loadQuestions(payload, input.clientId) };
}

export async function removeQuestion(payload: Payload, input: { clientId: string; id: string }): Promise<QuestionResult> {
  const all = await loadQuestions(payload, input.clientId, false);
  const doc = all.find((d) => String(d.id) === input.id);
  if (!doc) return { ok: false, error: "Question not found", status: 404 };
  if (doc.active === true) {
    await payload.update({ collection: "content-map-questions", id: doc.id as number, data: { active: false } as never, overrideAccess: true });
  }
  return { ok: true, questions: await loadQuestions(payload, input.clientId) };
}
