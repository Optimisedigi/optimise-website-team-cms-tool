/**
 * AI citation watch. Growth Tools asks ChatGPT, Perplexity, Gemini and Google
 * AI Overviews the client's tracked questions (CONTRACT-2 §1–2) and returns
 * which pages they cite. The CMS stores one row per runId (push and poll are
 * both idempotent), keeps the latest 12 completed, and — once per completed
 * run — has the subscription models turn it into insights:
 *
 *   gaps    → new plan items (origin "ai-citations") for questions where AI
 *             cites others and the client has no page
 *   refresh → existing pages whose question AI answers by citing others
 *   notes   → sources/cover/beat for existing plan items whose question was tracked
 */

import { after } from "next/server";
import type { Payload } from "payload";
import { authoritiesFromClient } from "./authorities";
import { getGtCitations, startGtCitations, type CitationsRequest } from "./gt";
import { normTitle, toRecommendation } from "./ideas";
import { callContentMapModel, extractJson, type ContentMapLlmResult } from "./llm";
import { handOffInsights } from "./handoff";
import { buildPlan, hostOf, parseCitationsResult, parseInsights, questionEvidence, type CitationInsights } from "./plan";
import { ensureQuestions } from "./questions";
import { relId } from "./snapshots";
import { loadSuggestions } from "./suggestions";
import type {
  CitationEngine,
  CitationsResult,
  CitationsView,
  ContentMapSnapshot,
  RefreshItem,
  RunStatusValue,
  TopicAuthorityInput,
  TrackedQuestionView,
} from "./types";
import { CITATION_ENGINES, isRecord, MAX_TRACKED_QUESTIONS, parseSnapshot } from "./types";
import { clientSiteUrl } from "./paths";

type Doc = Record<string, unknown>;
type Call = (p: Payload, i: { system: string; user: string; maxTokens?: number; timeoutMs?: number }) => Promise<ContentMapLlmResult>;

export const RETAIN_CITATION_RUNS = 12;
export const CITATION_REUSE_MS = 60 * 60 * 1000;
export const CITATION_POLL_AFTER_MS = 3 * 60 * 1000;
export const WEEKLY_MIN_AGE_MS = 6 * 24 * 60 * 60 * 1000;
const MAX_QUESTIONS = MAX_TRACKED_QUESTIONS;
const CONCURRENCY = 4;
/** Self-heal waits this long after the run finished / the last insights job started. */
export const CITATION_INSIGHTS_HEAL_AFTER_MS = 6 * 60 * 1000;

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, maxItems: number, maxLen = 240) => (Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : []);

/** Client name, trading name and the domain label ("awaydigitalteams"), de-duplicated, 1..6. */
export function brandTerms(client: Doc): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const s = typeof v === "string" ? v.trim().slice(0, 80) : "";
    if (s.length >= 2 && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  add(client.name);
  add(client.tradingName);
  add(hostOf(clientSiteUrl(client)).replace(/^www\./, "").split(".")[0]);
  return out.slice(0, 6);
}

async function latestSnapshot(payload: Payload, clientId: string): Promise<ContentMapSnapshot | null> {
  const res = await payload.find({
    collection: "content-map-snapshots",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "completed" } }] },
    sort: "-generatedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = res.docs[0] as unknown as Doc | undefined;
  return doc ? parseSnapshot(doc.data) : null;
}

export async function findCitationRun(payload: Payload, runId: string): Promise<Doc | null> {
  const res = await payload.find({ collection: "content-map-citations", where: { runId: { equals: runId } }, limit: 1, depth: 0, overrideAccess: true });
  return (res.docs[0] as unknown as Doc | undefined) ?? null;
}

export async function latestCompletedCitations(payload: Payload, clientId: string, limit = 1): Promise<Doc[]> {
  const res = await payload.find({
    collection: "content-map-citations",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "completed" } }] },
    sort: "-generatedAt",
    limit,
    depth: 0,
    overrideAccess: true,
  });
  return res.docs as unknown as Doc[];
}

async function activeCitationRun(payload: Payload, clientId: string, now: number): Promise<Doc | null> {
  const res = await payload.find({
    collection: "content-map-citations",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "running" } }] },
    sort: "-startedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { result: false, insights: false },
  });
  const doc = (res.docs[0] as unknown as Doc | undefined) ?? null;
  const started = Date.parse(String(doc?.startedAt ?? ""));
  return doc && Number.isFinite(started) && now - started < CITATION_REUSE_MS ? doc : null;
}

export type CitationRunResult = { ok: true; run: Doc; reused: boolean } | { ok: false; error: string; status: number };

/** Fill missing questions, then start (or reuse) a GT citation run. Never throws for expected failures. */
export async function startCitationRun(
  payload: Payload,
  clientId: string,
  deps: { now?: () => number; call?: Call } = {},
): Promise<CitationRunResult> {
  const now = deps.now ?? Date.now;
  let client: Doc;
  try {
    client = (await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
  } catch {
    return { ok: false, error: "Client not found", status: 404 };
  }
  const siteUrl = clientSiteUrl(client);
  const authorities = authoritiesFromClient(client);
  if (client.contentMapEnabled !== true) return { ok: false, error: "Content analysis is switched off for this client", status: 400 };
  if (!siteUrl) return { ok: false, error: "Client has no Website URL", status: 400 };
  if (!authorities.length) return { ok: false, error: "Client has no topic authorities", status: 400 };

  const active = await activeCitationRun(payload, clientId, now());
  if (active) return { ok: true, run: active, reused: true };

  const [snapshot, suggestions] = await Promise.all([latestSnapshot(payload, clientId), loadSuggestions(payload, clientId)]);
  const questions = await ensureQuestions(payload, { clientId, siteUrl, authorities, snapshot, suggestions }, { call: deps.call });
  if (!questions.length) return { ok: false, error: "No questions to track yet", status: 400 };
  const body: CitationsRequest = {
    clientId,
    siteUrl,
    brandTerms: brandTerms(client),
    engines: [...CITATION_ENGINES],
    location: "Australia",
    language: "en",
    questions: questions.slice(0, MAX_QUESTIONS).map((q) => ({ id: String(q.id), topic: String(q.topic), question: String(q.question).slice(0, 300) })),
  };
  const started = await startGtCitations(body);
  if (!started.ok) return { ok: false, error: started.error, status: 502 };
  const existing = await findCitationRun(payload, started.value.runId);
  if (existing) return { ok: true, run: existing, reused: true };
  const run = (await payload.create({
    collection: "content-map-citations",
    data: { client: Number(clientId) || clientId, runId: started.value.runId, status: "running", phase: "queued", startedAt: new Date(now()).toISOString() } as never,
    overrideAccess: true,
  })) as unknown as Doc;
  return { ok: true, run, reused: started.value.adopted };
}

export interface CitationUpdate {
  clientId: string;
  runId: string;
  status: RunStatusValue;
  phase?: string;
  error?: string;
  result?: unknown;
}

function smallStats(r: CitationsResult) {
  return {
    questions: r.stats.questions,
    checks: r.stats.checks,
    okChecks: r.stats.okChecks,
    cited: r.stats.clientCitedChecks,
    mentioned: r.stats.clientMentionedChecks,
  };
}

/** Upsert by runId (push + poll share this). A completed run without a usable result becomes failed. */
export async function upsertCitationRun(payload: Payload, update: CitationUpdate, now: () => number = Date.now): Promise<{ doc: Doc; result: CitationsResult | null }> {
  const result = update.result === undefined ? null : parseCitationsResult(update.result);
  const status: RunStatusValue = update.status === "completed" && !result ? "failed" : update.status;
  const existing = await findCitationRun(payload, update.runId);
  // A completed run is final: a late push or poll never overwrites it.
  if (existing && existing.status === "completed") return { doc: existing, result: parseCitationsResult(existing.result) };
  const data: Doc = {
    status,
    ...(update.phase ? { phase: update.phase } : {}),
    ...(result && status === "completed" ? { phase: "done", result, stats: smallStats(result), generatedAt: result.generatedAt || new Date(now()).toISOString() } : {}),
    ...(status === "failed" ? { error: (update.error || (update.status === "completed" ? "Citation result missing or invalid" : "Citation run failed")).slice(0, 2000) } : {}),
  };
  const doc = existing
    ? ((await payload.update({ collection: "content-map-citations", id: existing.id as number, data: data as never, overrideAccess: true })) as unknown as Doc)
    : ((await payload.create({
        collection: "content-map-citations",
        data: { client: Number(update.clientId) || update.clientId, runId: update.runId, startedAt: new Date(now()).toISOString(), ...data } as never,
        overrideAccess: true,
      })) as unknown as Doc);
  if (status !== "running") await applyCitationRetention(payload, update.clientId);
  return { doc, result: status === "completed" ? result : null };
}

/** Keep the latest 12 completed citation runs plus running ones, and the newest failed one if it is the newest row. */
export async function applyCitationRetention(payload: Payload, clientId: string): Promise<number> {
  const res = await payload.find({
    collection: "content-map-citations",
    where: { and: [{ client: { equals: clientId } }, { status: { not_equals: "running" } }] },
    sort: "-createdAt",
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { status: true, createdAt: true },
  });
  const docs = res.docs as unknown as Doc[];
  const keep = new Set<unknown>(docs.filter((d) => d.status === "completed").slice(0, RETAIN_CITATION_RUNS).map((d) => d.id));
  if (docs[0]?.status === "failed") keep.add(docs[0].id);
  const drop = docs.filter((d) => !keep.has(d.id)).map((d) => d.id);
  if (drop.length) await payload.delete({ collection: "content-map-citations", where: { id: { in: drop as number[] } }, overrideAccess: true });
  return drop.length;
}

export function needsInsights(doc: Doc | null | undefined): boolean {
  if (!doc || doc.status !== "completed" || !doc.result) return false;
  const insights = parseInsights(doc.insights);
  return !insights || insights.complete === false;
}

/** Missing/partial insights, run finished ≥ 6 min ago and no insights job started in the last 6 min. */
export function citationInsightsStalled(doc: Doc | null | undefined, now: number): boolean {
  if (!needsInsights(doc) || !doc) return false;
  const at = Date.parse(String(doc.generatedAt ?? ""));
  if (Number.isFinite(at) && now - at < CITATION_INSIGHTS_HEAL_AFTER_MS) return false;
  const started = Date.parse(parseInsights(doc.insights)?.insightsStartedAt ?? "");
  return !(Number.isFinite(started) && now - started < CITATION_INSIGHTS_HEAL_AFTER_MS);
}

/** Self-heal: stamp insightsStartedAt (no double start within 6 min), then resume the missing topics. */
export async function healCitationInsights(payload: Payload, doc: Doc | null | undefined, deps: { call?: Call; now?: () => number } = {}): Promise<boolean> {
  const now = deps.now ?? Date.now;
  if (!doc || !citationInsightsStalled(doc, now())) return false;
  const stamp = new Date(now()).toISOString();
  const marked: CitationInsights = { ...(parseInsights(doc.insights) ?? { model: "", generatedAt: "", gaps: [], refresh: [], notes: {}, topicsFailed: 0, topicsDone: [], complete: false }), insightsStartedAt: stamp };
  const updated = (await payload.update({ collection: "content-map-citations", id: doc.id as number, data: { insights: marked } as never, overrideAccess: true })) as unknown as Doc;
  // Called from page loads (30 s): hand the job to the 300 s route instead of running it here.
  handOffInsights("citations", String(updated.id), () => scheduleInsights(payload, updated, deps));
  return true;
}

/** Run insights after the response (request scope) or detached (scripts/tests). */
export function scheduleInsights(payload: Payload, doc: Doc, deps: { call?: Call; now?: () => number } = {}): void {
  const job = async () => {
    const res = await writeInsights(payload, doc, deps).catch((err: Error) => ({ ok: false as const, error: err.message }));
    if (!res.ok) console.warn("[content-map] citation insights failed:", res.error);
  };
  try {
    after(job);
  } catch {
    void job();
  }
}

/** Fallback for a missed citation push: ask GT directly and upsert. */
export async function pollStaleCitationRun(payload: Payload, run: Doc, now: () => number = Date.now): Promise<Doc> {
  const started = Date.parse(String(run.startedAt ?? ""));
  if (run.status !== "running" || !Number.isFinite(started) || now() - started < CITATION_POLL_AFTER_MS) return run;
  const res = await getGtCitations(String(run.runId ?? ""));
  if (!res.ok) return run;
  const s = res.value;
  const out = await upsertCitationRun(
    payload,
    { clientId: relId(run.client), runId: String(run.runId), status: s.status, phase: s.phase, error: s.error, result: s.status === "completed" ? s.result : undefined },
    now,
  );
  if (needsInsights(out.doc)) handOffInsights("citations", String(out.doc.id), () => scheduleInsights(payload, out.doc));
  return out.doc;
}

/** Weekly chain: start a citation run when the last completed one is ≥ 6 days old (or there is none). */
export async function maybeStartWeeklyCitations(payload: Payload, clientId: string, deps: { now?: () => number; call?: Call } = {}): Promise<CitationRunResult | null> {
  const now = deps.now ?? Date.now;
  const [last] = await latestCompletedCitations(payload, clientId);
  const at = Date.parse(String(last?.generatedAt ?? ""));
  if (last && Number.isFinite(at) && now() - at < WEEKLY_MIN_AGE_MS) return null;
  return startCitationRun(payload, clientId, deps);
}

// ─── Insights ─────────────────────────────────────────────────────────────

interface TopicTask {
  topic: TopicAuthorityInput;
  /** Questions where AI cites others and not the client. */
  open: Array<{ id: string; question: string; hasPlan: string | null }>;
}

export function buildInsightsPrompt(input: {
  siteUrl: string;
  topic: TopicAuthorityInput;
  result: CitationsResult;
  questions: TopicTask["open"];
  pages: Array<{ id: string; t: string }>;
  planned: Array<{ id: string; title: string; question: string }>;
}): { system: string; user: string } {
  const sourceLines = (qid: string) =>
    input.result.sources
      .filter((s) => s.questionIds.includes(qid) && s.ok)
      .slice(0, 5)
      .map((s) => `    • ${s.title || s.domain} (${s.domain}, ${s.words} words) — headings: ${s.headings.slice(0, 12).join(" | ")} — ${s.summary.slice(0, 400)}`);
  const system = `You are a GEO (generative engine optimisation) strategist. AI assistants (ChatGPT, Perplexity, Gemini, Google AI Overviews) were asked a website's tracked questions and cited other sites instead of it. For each question, decide:
- "gap": no existing page on the site answers it → plan one new article (same fields as below);
- "refresh": an existing page answers it but isn't cited → say what that page is missing;
- "plan": it matches an already planned article → say what to cover and how to beat the cited pages.
"cover" = points the cited pages cover that the article must cover. "beat" = concrete ways to do better than them (fresher data, local Australian specifics, clearer direct answer, original examples).

Reply with JSON only:
{"gaps":[{"questionId":"","title":"","why":"","priority":"high|medium|low","primaryKeyword":"","secondaryKeywords":[""],"outline":["H2 as a question"],"answerFirst":"40-60 words","entities":[""],"faqs":[""],"evidence":[""],"schema":["Article","FAQPage"],"linksTo":["page id"],"cover":[""],"beat":[""]}],"refresh":[{"questionId":"","nodeId":"page id","missing":[""],"why":""}],"plan":[{"planId":"","questionId":"","cover":[""],"beat":[""]}]}`;
  const user = [
    `Website: ${input.siteUrl}`,
    `Topic authority: ${input.topic.name} (key: ${input.topic.key})`,
    "",
    "Existing pages in this topic (id | title):",
    ...input.pages.slice(0, 60).map((p) => `- ${p.id} | ${p.t}`),
    "",
    input.planned.length ? "Already planned articles (planId | title | question):" : "",
    ...input.planned.map((p) => `- ${p.id} | ${p.title} | ${p.question}`),
    "",
    "Questions AI answers citing other sites (questionId | question), with the pages it cites:",
    ...input.questions.flatMap((q) => [`- ${q.id} | ${q.question}${q.hasPlan ? ` (matches planned ${q.hasPlan})` : ""}`, ...sourceLines(q.id)]),
    "",
    "Every question goes in exactly one of gaps, refresh or plan. Use page ids and planIds exactly as given.",
  ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n");
  return { system, user };
}

/**
 * Write insights for a completed run with the subscription models (per topic,
 * 4 in flight). Each finished topic is saved straight away (complete: false),
 * so a timeout keeps what's done; a later run only calls the missing topics.
 */
export async function writeInsights(
  payload: Payload,
  doc: Doc,
  deps: { call?: Call; now?: () => number; concurrency?: number } = {},
): Promise<{ ok: true; insights: CitationInsights } | { ok: false; error: string }> {
  const result = parseCitationsResult(doc.result);
  if (!result) return { ok: false, error: "The citation run has no usable result" };
  const clientId = relId(doc.client);
  const client = (await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
  const authorities = authoritiesFromClient(client);
  const [snapshot, suggestions] = await Promise.all([latestSnapshot(payload, clientId), loadSuggestions(payload, clientId)]);
  const basePlan = buildPlan({ snapshot, suggestions, result: null, insights: null });
  const pages = (snapshot?.nodes ?? []).filter((n) => !n.agg);
  const tasks: TopicTask[] = [];
  for (const topic of authorities) {
    const open: TopicTask["open"] = [];
    for (const q of result.questions.filter((x) => x.topic === topic.key)) {
      const ev = questionEvidence(result, { id: q.id });
      if (!ev || ev.clientCited || !ev.enginesCitingOthers.length) continue;
      const plan = basePlan.find((p) => normTitle(p.question) === normTitle(q.question));
      open.push({ id: q.id, question: q.question, hasPlan: plan?.id ?? null });
    }
    if (open.length) tasks.push({ topic, open });
  }
  const now = deps.now ?? Date.now;
  const fresh = await payload.findByID({ collection: "content-map-citations", id: doc.id as number, depth: 0, overrideAccess: true }).then((d) => d as unknown as Doc).catch(() => doc);
  const stored = parseInsights(fresh.insights);
  const resume = stored && stored.complete === false ? stored : null;
  const done = new Set(resume?.topicsDone ?? []);
  const insights: CitationInsights = {
    model: resume?.model ?? "",
    generatedAt: new Date(now()).toISOString(),
    gaps: [...(resume?.gaps ?? [])],
    refresh: [...(resume?.refresh ?? [])],
    notes: { ...(resume?.notes ?? {}) },
    topicsFailed: 0,
    topicsDone: tasks.map((t) => t.topic.key).filter((k) => done.has(k)),
    complete: false,
    insightsStartedAt: new Date(now()).toISOString(),
  };
  const todo = tasks.filter((t) => !done.has(t.topic.key));
  // Saves are chained so concurrent topics never write out of order.
  let saving: Promise<unknown> = Promise.resolve();
  const save = () => {
    const snapshotOf: CitationInsights = { ...insights, generatedAt: new Date(now()).toISOString(), gaps: [...insights.gaps], refresh: [...insights.refresh], notes: { ...insights.notes }, topicsDone: tasks.map((t) => t.topic.key).filter((k) => done.has(k)) };
    saving = saving.then(() => payload.update({ collection: "content-map-citations", id: doc.id as number, data: { insights: snapshotOf } as never, overrideAccess: true })).catch((err: Error) => {
      console.warn("[content-map] citation insights save failed:", err.message);
    });
    return saving;
  };
  if (todo.length) await save();
  const nodeIds = new Set(pages.map((n) => n.id));
  const authorityKeys = new Set(authorities.map((a) => a.key));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const task = todo[next++];
      if (!task) break;
      const topicPages = pages.filter((n) => n.g === task.topic.key).sort((a, b) => b.in - a.in);
      const planned = basePlan.filter((p) => p.topic === task.topic.key).slice(0, 15);
      try {
        const res = await (deps.call ?? callContentMapModel)(payload, {
          ...buildInsightsPrompt({ siteUrl: result.siteUrl, topic: task.topic, result, questions: task.open, pages: topicPages, planned }),
          maxTokens: 6000,
          timeoutMs: 120_000,
        });
        const json = extractJson(res.text);
        if (!isRecord(json)) { insights.topicsFailed++; await save(); continue; }
        insights.model ||= res.model;
        const byId = new Map(task.open.map((q) => [q.id, q]));
        for (const raw of Array.isArray(json.gaps) ? json.gaps : []) {
          if (!isRecord(raw)) continue;
          const q = byId.get(str(raw.questionId, 200));
          if (!q || q.hasPlan) continue;
          const rec = toRecommendation({ ...raw, question: q.question }, { topic: task.topic.key, index: insights.gaps.filter((g) => g.topic === task.topic.key).length, nodeIds, authorityKeys });
          if (!rec || insights.gaps.some((g) => g.id === rec.id || g.questionId === q.id)) continue;
          insights.gaps.push({ ...rec, questionId: q.id, cover: strList(raw.cover, 8), beat: strList(raw.beat, 6) });
        }
        for (const raw of Array.isArray(json.refresh) ? json.refresh : []) {
          if (!isRecord(raw)) continue;
          const q = byId.get(str(raw.questionId, 200));
          const nodeId = str(raw.nodeId, 500);
          if (!q || !topicPages.some((n) => n.id === nodeId) || insights.refresh.some((r) => r.nodeId === nodeId && r.question === q.question)) continue;
          const ev = questionEvidence(result, { id: q.id });
          const item: RefreshItem = {
            id: `rf-${insights.refresh.length + 1}-${normTitle(q.question).slice(0, 30).replace(/ /g, "-")}`,
            nodeId,
            topic: task.topic.key,
            question: q.question,
            missing: strList(raw.missing, 8),
            sources: ev?.sources ?? [],
            why: str(raw.why, 400),
          };
          insights.refresh.push(item);
        }
        for (const raw of Array.isArray(json.plan) ? json.plan : []) {
          if (!isRecord(raw)) continue;
          const planId = str(raw.planId, 200);
          const q = byId.get(str(raw.questionId, 200));
          if (!q || !planned.some((p) => p.id === planId)) continue;
          insights.notes[planId] = { questionId: q.id, cover: strList(raw.cover, 8), beat: strList(raw.beat, 6) };
        }
        done.add(task.topic.key);
      } catch (err) {
        console.warn(`[content-map] citation insights for "${task.topic.name}" failed:`, (err as Error).message);
        insights.topicsFailed++;
      }
      await save();
    }
  };
  await Promise.all(Array.from({ length: Math.min(deps.concurrency ?? CONCURRENCY, todo.length) }, worker));
  await saving;
  insights.refresh.sort((a, b) => a.topic.localeCompare(b.topic) || a.id.localeCompare(b.id));
  insights.topicsDone = tasks.map((t) => t.topic.key).filter((k) => done.has(k));
  insights.complete = true;
  insights.generatedAt = new Date(now()).toISOString();
  await payload.update({ collection: "content-map-citations", id: doc.id as number, data: { insights } as never, overrideAccess: true });
  return { ok: true, insights };
}

// ─── View ─────────────────────────────────────────────────────────────────

export function buildCitationsView(input: {
  latest: Doc | null;
  completed: readonly Doc[];
  questions: readonly Doc[];
  authorities: readonly TopicAuthorityInput[];
  /** For existing-article questions: the page's live address and title. */
  snapshot?: ContentMapSnapshot | null;
}): CitationsView | null {
  const { latest } = input;
  if (!latest && !input.questions.length) return null;
  const done = input.completed[0] ?? null;
  const result = done ? parseCitationsResult(done.result) : null;
  const insights = done ? parseInsights(done.insights) : null;
  const engines: CitationEngine[] = result?.engines?.length ? result.engines : [...CITATION_ENGINES];
  const keys = new Set(input.authorities.map((a) => a.key));
  const origin = (() => {
    try {
      return input.snapshot?.siteUrl ? new URL(input.snapshot.siteUrl).origin : "";
    } catch {
      return "";
    }
  })();
  const nodes = new Map((input.snapshot?.nodes ?? []).filter((n) => !n.agg).map((n) => [n.id, n]));
  const questions: TrackedQuestionView[] = input.questions
    .filter((q) => keys.has(String(q.topic)))
    .map((q) => {
      const group: TrackedQuestionView["group"] = q.questionGroup === "existing" ? "existing" : "planned";
      const pageId = group === "existing" && typeof q.pageId === "string" && q.pageId ? q.pageId : null;
      const node = pageId ? nodes.get(pageId) : undefined;
      const pageUrl = node && origin && node.id.startsWith("/") ? `${origin}${node.id}` : null;
      const pageTitle = group === "existing" ? (typeof q.pageTitle === "string" && q.pageTitle ? q.pageTitle : node?.t ?? null) : null;
      const id = String(q.id);
      const text = String(q.question ?? "");
      const hit = result?.questions.find((x) => x.id === id) ?? result?.questions.find((x) => normTitle(x.question) === normTitle(text));
      const source = ["ai", "team", "client", "recommendation", "article"].includes(String(q.source)) ? (q.source as TrackedQuestionView["source"]) : "ai";
      return {
        id,
        topic: String(q.topic),
        question: text,
        source,
        group,
        pageTitle,
        pageUrl,
        pageId: node ? node.id : pageId,
        checks: (hit?.results ?? []).map((c) => ({
          engine: c.engine,
          ok: c.ok,
          clientCited: c.clientCited,
          clientMentioned: c.clientMentioned,
          citedDomains: [...new Set(c.cited.map((x) => x.domain))],
        })),
      };
    });
  const byTopic: CitationsView["byTopic"] = {};
  for (const a of input.authorities) {
    const qs = result?.questions.filter((q) => q.topic === a.key) ?? [];
    const checks = qs.flatMap((q) => q.results.filter((c) => c.ok));
    byTopic[a.key] = { questions: qs.length, checks: checks.length, cited: checks.filter((c) => c.clientCited).length };
  }
  const groups: CitationsView["groups"] = { existing: { questions: 0, checks: 0, cited: 0 }, planned: { questions: 0, checks: 0, cited: 0 } };
  for (const q of questions) {
    const g = groups[q.group];
    g.questions++;
    const ok = q.checks.filter((c) => c.ok);
    g.checks += ok.length;
    g.cited += ok.filter((c) => c.clientCited).length;
  }
  const trend = [...input.completed]
    .slice(0, RETAIN_CITATION_RUNS)
    .reverse()
    .map((d) => {
      const s = isRecord(d.stats) ? d.stats : {};
      return { generatedAt: String(d.generatedAt ?? ""), checks: Number(s.okChecks ?? s.checks ?? 0) || 0, cited: Number(s.cited ?? 0) || 0 };
    });
  const status: CitationsView["status"] = latest ? ((latest.status as CitationsView["status"]) ?? "none") : "none";
  return {
    status,
    error: latest?.status === "failed" ? String(latest.error ?? "") || "Citation run failed" : null,
    generatedAt: done ? String(done.generatedAt ?? "") || null : null,
    engines,
    questions,
    byTopic,
    groups,
    trend,
    topDomains: (result?.stats.topDomains ?? []).slice(0, 15).map((d) => ({ domain: d.domain, count: d.count })),
    refresh: insights?.refresh ?? [],
    insightsModel: insights?.model ?? "",
  };
}

/** Everything state.ts needs for the living layer, in one place. */
export async function loadCitationState(payload: Payload, clientId: string, now: () => number = Date.now) {
  const [latestRes, completed] = await Promise.all([
    payload.find({ collection: "content-map-citations", where: { client: { equals: clientId } }, sort: "-createdAt", limit: 1, depth: 0, overrideAccess: true, select: { result: false, insights: false } }),
    latestCompletedCitations(payload, clientId, RETAIN_CITATION_RUNS),
  ]);
  let latest = (latestRes.docs[0] as unknown as Doc | undefined) ?? null;
  let done = completed;
  if (latest?.status === "running") {
    const polled = await pollStaleCitationRun(payload, latest, now);
    if (polled.status === "completed" && !done.some((d) => d.id === polled.id)) done = [polled, ...done].slice(0, RETAIN_CITATION_RUNS);
    latest = polled;
  }
  // Self-heal insights cut off by a timeout (resumes only the missing topics).
  if (citationInsightsStalled(done[0], now())) {
    await healCitationInsights(payload, done[0], { now }).catch((err: Error) => console.warn("[content-map] citation insights self-heal failed:", err.message));
  }
  return { latest, completed: done };
}
