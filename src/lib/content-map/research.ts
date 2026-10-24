/**
 * Research layers (CONTRACT-3). Growth Tools collects keyword volumes,
 * questions people ask and competitor pages per topic authority; the CMS
 * stores one row per runId (push and poll are both idempotent), keeps the
 * latest 12 completed, and placement.ts turns each completed run into ideas.
 * This file is the GT side + the pure view builder; no model calls here.
 */

import type { Payload } from "payload";
import { authoritiesFromClient } from "./authorities";
import { buildGscSignals, gscRows, type GscSignals } from "./gsc";
import { getGtResearch, startGtResearch, type ResearchRequest } from "./gt";
import { normTitle } from "./ideas";
import { relId } from "./snapshots";
import type {
  ContentMapSnapshot,
  InProgressItem,
  PlanItem,
  ResearchIdea,
  ResearchResult,
  ResearchView,
  RunStatusValue,
  SnapshotRecommendation,
  TopicAuthorityInput,
  TopicResearch,
} from "./types";
import { isRecord } from "./types";
import { clientSiteUrl } from "./paths";

type Doc = Record<string, unknown>;

export const RETAIN_RESEARCH_RUNS = 12;
export const RESEARCH_REUSE_MS = 60 * 60 * 1000;
export const RESEARCH_POLL_AFTER_MS = 5 * 60 * 1000;
export const MONTHLY_MIN_AGE_MS = 28 * 24 * 60 * 60 * 1000;
const MAX_TOPICS = 8;
const MAX_SEEDS = 10;

/** What the subscription models wrote for a completed research run (stored as `insights`). */
export interface ResearchInsights {
  model: string;
  generatedAt: string;
  /** Search Console pull the placement used (re-placed when a newer pull arrives). */
  gscId: string | null;
  ideas: ResearchIdea[];
  /** Model-written GEO briefs by idea id (in-plan ideas, and any the model briefed). */
  briefs: Record<string, SnapshotRecommendation>;
  inProgress: InProgressItem[];
  topicsFailed: number;
  /** Topic keys whose model call finished (incremental save). Absent on older rows. */
  topicsDone?: string[];
  /** Topic keys whose model call failed in the latest pass. */
  topicsFailedKeys?: string[];
  /** Why each failed topic failed (latest pass). */
  topicsFailedReasons?: Record<string, string>;
  /** Model attempts per topic key (failed topics retry until RESEARCH_TOPIC_MAX_ATTEMPTS). */
  topicAttempts?: Record<string, number>;
  /** Version of the research step that wrote this; a newer version retries topics an older one failed. */
  parserVersion?: number;
  /** false while topics are still missing or the final statuses haven't run; absent (older rows) = complete. */
  complete?: boolean;
  /** When the latest insights job started (self-heal de-duplication). */
  insightsStartedAt?: string;
}

/** A topic that failed is retried until it has had this many model attempts. */
export const RESEARCH_TOPIC_MAX_ATTEMPTS = 3;
/** Current version of the research step (kept in sync with placement.ts RESEARCH_PARSER_VERSION). */
export const RESEARCH_STEP_VERSION = 2;

/**
 * Still work to do: explicitly partial, or finished with failed topics that
 * have attempts left. Older rows (complete with failures, no topicAttempts)
 * count as one attempt so far, so they retry too.
 */
export function insightsIncomplete(insights: ResearchInsights): boolean {
  if (insights.complete === false) return true;
  const failed = insights.topicsFailedKeys ?? [];
  if (!failed.length) return false;
  const attempts = insights.topicAttempts;
  // Attempts used up under an older version of this step: retry once more with the fix.
  if (attempts && (insights.parserVersion ?? 1) < RESEARCH_STEP_VERSION) return true;
  if (!attempts) return true;
  return failed.some((k) => (attempts[k] ?? 1) < RESEARCH_TOPIC_MAX_ATTEMPTS);
}

export function parseResearchResult(value: unknown): ResearchResult | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.topics) || !isRecord(value.stats)) return null;
  return value as unknown as ResearchResult;
}

export function parseResearchInsights(value: unknown): ResearchInsights | null {
  if (!isRecord(value) || !Array.isArray(value.ideas) || !isRecord(value.briefs)) return null;
  const v = value as unknown as ResearchInsights;
  return {
    model: typeof v.model === "string" ? v.model : "",
    generatedAt: typeof v.generatedAt === "string" ? v.generatedAt : "",
    gscId: typeof v.gscId === "string" ? v.gscId : null,
    ideas: v.ideas,
    briefs: v.briefs,
    inProgress: Array.isArray(v.inProgress) ? v.inProgress : [],
    topicsFailed: typeof v.topicsFailed === "number" ? v.topicsFailed : 0,
    ...(Array.isArray(v.topicsDone) ? { topicsDone: v.topicsDone.filter((k): k is string => typeof k === "string") } : {}),
    ...(Array.isArray(v.topicsFailedKeys) ? { topicsFailedKeys: v.topicsFailedKeys.filter((k): k is string => typeof k === "string") } : {}),
    ...(isRecord(v.topicsFailedReasons) ? { topicsFailedReasons: Object.fromEntries(Object.entries(v.topicsFailedReasons).filter((e): e is [string, string] => typeof e[1] === "string")) } : {}),
    ...(isRecord(v.topicAttempts) ? { topicAttempts: Object.fromEntries(Object.entries(v.topicAttempts).filter((e): e is [string, number] => typeof e[1] === "number")) } : {}),
    ...(typeof v.parserVersion === "number" ? { parserVersion: v.parserVersion } : {}),
    ...(typeof v.complete === "boolean" ? { complete: v.complete } : {}),
    ...(typeof v.insightsStartedAt === "string" ? { insightsStartedAt: v.insightsStartedAt } : {}),
  };
}

// ─── Seeds ────────────────────────────────────────────────────────────────

const STOP = new Set(["the", "and", "for", "with", "you", "your", "our", "how", "what", "why", "are", "can", "to", "of", "in", "a", "an", "on", "is", "it", "vs", "from", "that", "this", "into", "about", "guide"]);

/** Page title → keyword-ish phrase: brand suffix and stop words dropped, ≤ 6 words. */
export function titleKeywords(title: string): string {
  const main = title.split(/\s+[|–—-]\s+/)[0] ?? title;
  const words = normTitle(main).split(" ").filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
  return words.slice(0, 6).join(" ");
}

/** 1..10 seeds: topic name, description phrases, top page titles' keywords, planned primaryKeywords. */
export function buildSeeds(input: {
  topic: TopicAuthorityInput;
  snapshot: ContentMapSnapshot | null;
  plan: readonly Pick<PlanItem, "topic" | "primaryKeyword">[];
}): string[] {
  const out: string[] = [];
  const add = (s: string | undefined) => {
    const v = normTitle(s ?? "").slice(0, 80).trim();
    if (v.length >= 3 && !out.includes(v) && out.length < MAX_SEEDS) out.push(v);
  };
  add(input.topic.name);
  for (const phrase of (input.topic.description ?? "").split(/[.,;:!?()–—]+/)) {
    const words = normTitle(phrase).split(" ").filter(Boolean);
    if (words.length >= 2 && words.length <= 6) add(phrase);
  }
  const pages = (input.snapshot?.nodes ?? []).filter((n) => !n.agg && n.g === input.topic.key).sort((a, b) => b.in - a.in || a.id.localeCompare(b.id));
  for (const n of pages.slice(0, 4)) add(titleKeywords(n.t));
  for (const p of input.plan) if (p.topic === input.topic.key) add(p.primaryKeyword);
  return out;
}

export function buildResearchRequest(input: {
  clientId: string;
  client: Doc;
  authorities: readonly TopicAuthorityInput[];
  snapshot: ContentMapSnapshot | null;
  plan: readonly Pick<PlanItem, "topic" | "primaryKeyword">[];
}): ResearchRequest {
  const location = typeof input.client.targetLocation === "string" && input.client.targetLocation.trim() ? input.client.targetLocation.trim().slice(0, 120) : "Australia";
  const ordered = [...input.authorities.filter((a) => a.primary), ...input.authorities.filter((a) => !a.primary)].slice(0, MAX_TOPICS);
  return {
    clientId: input.clientId,
    siteUrl: clientSiteUrl(input.client),
    location,
    topics: ordered.map((t) => ({
      key: t.key,
      name: t.name,
      ...(t.description ? { description: t.description.slice(0, 500) } : {}),
      seeds: buildSeeds({ topic: t, snapshot: input.snapshot, plan: input.plan }),
    })),
  };
}

// ─── Runs ─────────────────────────────────────────────────────────────────

export async function findResearchRun(payload: Payload, runId: string): Promise<Doc | null> {
  const res = await payload.find({ collection: "content-map-research", where: { runId: { equals: runId } }, limit: 1, depth: 0, overrideAccess: true });
  return (res.docs[0] as unknown as Doc | undefined) ?? null;
}

export async function latestCompletedResearch(payload: Payload, clientId: string, limit = 1): Promise<Doc[]> {
  const res = await payload.find({
    collection: "content-map-research",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "completed" } }] },
    sort: "-generatedAt",
    limit,
    depth: 0,
    overrideAccess: true,
  });
  return res.docs as unknown as Doc[];
}

export async function latestResearchRow(payload: Payload, clientId: string): Promise<Doc | null> {
  const res = await payload.find({
    collection: "content-map-research",
    where: { client: { equals: clientId } },
    sort: "-createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { result: false, insights: false },
  });
  return (res.docs[0] as unknown as Doc | undefined) ?? null;
}

async function activeResearchRun(payload: Payload, clientId: string, now: number): Promise<Doc | null> {
  const res = await payload.find({
    collection: "content-map-research",
    where: { and: [{ client: { equals: clientId } }, { status: { equals: "running" } }] },
    sort: "-startedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { result: false, insights: false },
  });
  const doc = (res.docs[0] as unknown as Doc | undefined) ?? null;
  const started = Date.parse(String(doc?.startedAt ?? ""));
  return doc && Number.isFinite(started) && now - started < RESEARCH_REUSE_MS ? doc : null;
}

export type ResearchRunResult = { ok: true; run: Doc; reused: boolean } | { ok: false; error: string; status: number };

/** Start (or reuse a < 60 min running) GT research run. Never throws for expected failures. */
export async function startResearchRun(
  payload: Payload,
  clientId: string,
  deps: { now?: () => number; snapshot?: ContentMapSnapshot | null; plan?: readonly Pick<PlanItem, "topic" | "primaryKeyword">[] } = {},
): Promise<ResearchRunResult> {
  const now = deps.now ?? Date.now;
  let client: Doc;
  try {
    client = (await payload.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
  } catch {
    return { ok: false, error: "Client not found", status: 404 };
  }
  const authorities = authoritiesFromClient(client);
  if (client.contentMapEnabled !== true) return { ok: false, error: "Content analysis is switched off for this client", status: 400 };
  if (!clientSiteUrl(client)) return { ok: false, error: "The client's Website URL is missing or isn't a valid web address", status: 400 };
  if (!authorities.length) return { ok: false, error: "Client has no topic authorities", status: 400 };

  const active = await activeResearchRun(payload, clientId, now());
  if (active) return { ok: true, run: active, reused: true };

  const body = buildResearchRequest({ clientId, client, authorities, snapshot: deps.snapshot ?? null, plan: deps.plan ?? [] });
  const started = await startGtResearch(body);
  if (!started.ok) return { ok: false, error: started.error, status: 502 };
  const existing = await findResearchRun(payload, started.value.runId);
  if (existing) return { ok: true, run: existing, reused: true };
  const run = (await payload.create({
    collection: "content-map-research",
    data: { client: Number(clientId) || clientId, runId: started.value.runId, status: "running", phase: "queued", startedAt: new Date(now()).toISOString() } as never,
    overrideAccess: true,
  })) as unknown as Doc;
  return { ok: true, run, reused: started.value.adopted };
}

export interface ResearchUpdate {
  clientId: string;
  runId: string;
  status: RunStatusValue;
  phase?: string;
  error?: string;
  result?: unknown;
}

/** Upsert by runId (push + poll share this). A completed run is final; completed without a usable result → failed. */
export async function upsertResearchRun(payload: Payload, update: ResearchUpdate, now: () => number = Date.now): Promise<{ doc: Doc; result: ResearchResult | null }> {
  const result = update.result === undefined ? null : parseResearchResult(update.result);
  const status: RunStatusValue = update.status === "completed" && !result ? "failed" : update.status;
  const existing = await findResearchRun(payload, update.runId);
  if (existing && existing.status === "completed") return { doc: existing, result: parseResearchResult(existing.result) };
  const data: Doc = {
    status,
    ...(update.phase ? { phase: update.phase } : {}),
    ...(result && status === "completed"
      ? { phase: "done", result, stats: { ...result.stats }, generatedAt: result.generatedAt || new Date(now()).toISOString() }
      : {}),
    ...(status === "failed" ? { error: (update.error || (update.status === "completed" ? "Research result missing or invalid" : "Research run failed")).slice(0, 2000) } : {}),
  };
  const doc = existing
    ? ((await payload.update({ collection: "content-map-research", id: existing.id as number, data: data as never, overrideAccess: true })) as unknown as Doc)
    : ((await payload.create({
        collection: "content-map-research",
        data: { client: Number(update.clientId) || update.clientId, runId: update.runId, startedAt: new Date(now()).toISOString(), ...data } as never,
        overrideAccess: true,
      })) as unknown as Doc);
  if (status !== "running") await applyResearchRetention(payload, update.clientId);
  return { doc, result: status === "completed" ? result : null };
}

/** Keep the latest 12 completed runs plus running ones, and the newest failed one if it is the newest row. */
export async function applyResearchRetention(payload: Payload, clientId: string): Promise<number> {
  const res = await payload.find({
    collection: "content-map-research",
    where: { and: [{ client: { equals: clientId } }, { status: { not_equals: "running" } }] },
    sort: "-createdAt",
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { status: true, createdAt: true },
  });
  const docs = res.docs as unknown as Doc[];
  const keep = new Set<unknown>(docs.filter((d) => d.status === "completed").slice(0, RETAIN_RESEARCH_RUNS).map((d) => d.id));
  if (docs[0]?.status === "failed") keep.add(docs[0].id);
  const drop = docs.filter((d) => !keep.has(d.id)).map((d) => d.id);
  if (drop.length) await payload.delete({ collection: "content-map-research", where: { id: { in: drop as number[] } }, overrideAccess: true });
  return drop.length;
}

/** Fallback for a missed push: ask GT directly and upsert. Returns the (maybe updated) row. */
export async function pollStaleResearchRun(payload: Payload, run: Doc, now: () => number = Date.now): Promise<Doc> {
  const started = Date.parse(String(run.startedAt ?? ""));
  if (run.status !== "running" || !Number.isFinite(started) || now() - started < RESEARCH_POLL_AFTER_MS) return run;
  const res = await getGtResearch(String(run.runId ?? ""));
  if (!res.ok) return run;
  const s = res.value;
  const out = await upsertResearchRun(
    payload,
    { clientId: relId(run.client), runId: String(run.runId), status: s.status, phase: s.phase, error: s.error, result: s.status === "completed" ? s.result : undefined },
    now,
  );
  return out.doc;
}

// ─── View ─────────────────────────────────────────────────────────────────

const tokens = (t: string) => new Set(normTitle(t).split(" ").filter((w) => w.length > 2));
function containment(query: string, title: string): number {
  const q = tokens(query);
  if (!q.size) return 0;
  const t = tokens(title);
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return hit / q.size;
}

/** A keyword "has a page" when a page title covers it, or the site already ranks top 20 for it in Search Console. */
export function keywordHasPage(keyword: string, titles: readonly string[], ranked: ReadonlySet<string>): boolean {
  return ranked.has(normTitle(keyword)) || titles.some((t) => containment(keyword, t) >= 0.75);
}

export function buildResearchView(input: {
  latest: Doc | null;
  done: Doc | null;
  gsc: Doc | null;
  gscConnected: boolean;
  snapshot: ContentMapSnapshot | null;
  authorities: readonly TopicAuthorityInput[];
  location: string;
  signals?: GscSignals;
}): ResearchView | null {
  const { latest, done, gsc, snapshot } = input;
  if (!latest && !gsc) return null;
  const result = done ? parseResearchResult(done.result) : null;
  const insights = done ? parseResearchInsights(done.insights) : null;
  const signals = input.signals ?? buildGscSignals(gsc, snapshot);
  const pages = (snapshot?.nodes ?? []).filter((n) => !n.agg);
  const titles = pages.map((n) => n.t);
  const ranked = new Set(gscRows(gsc).filter((r) => r.position <= 20).map((r) => normTitle(r.query)));
  const nodeTopic = new Map(pages.map((n) => [n.id, n.g]));

  const topics: Record<string, TopicResearch> = {};
  for (const a of input.authorities) {
    const t = result?.topics.find((x) => x.key === a.key);
    const gscPages = signals.pages.filter((p) => nodeTopic.get(p.nodeId) === a.key);
    const imp = gscPages.reduce((s, p) => s + p.impressions, 0);
    const gscAgg = gscPages.length
      ? { clicks: gscPages.reduce((s, p) => s + p.clicks, 0), impressions: imp, position: imp ? Math.round((gscPages.reduce((s, p) => s + p.position * p.impressions, 0) / imp) * 10) / 10 : 0 }
      : null;
    if (!t && !gscAgg) continue;
    const kws = t?.keywords ?? [];
    const volume = t?.totals?.volume ?? kws.reduce((s, k) => s + (k.volume ?? 0), 0);
    const kwVolume = kws.reduce((s, k) => s + (k.volume ?? 0), 0);
    const coveredVol = kws.filter((k) => keywordHasPage(k.keyword, titles, ranked)).reduce((s, k) => s + (k.volume ?? 0), 0);
    topics[a.key] = {
      key: a.key,
      volume,
      keywords: t?.totals?.keywords ?? kws.length,
      covered: kwVolume > 0 ? Math.round((coveredVol / kwVolume) * 1000) / 1000 : 0,
      questions: t?.totals?.questions ?? t?.questions.length ?? 0,
      competitorPages: t?.competitors.pages.filter((p) => p.ok).length ?? 0,
      competitorDomains: (t?.competitors.domains ?? []).map((d) => ({ domain: d.domain, pages: d.pages })),
      gsc: gscAgg,
    };
  }

  const ideas = insights?.ideas ?? [];
  const pairMap = new Map<string, { a: string; b: string; volume: number; ideas: number }>();
  for (const idea of ideas) {
    if (!idea.topic || idea.status === "dismissed") continue;
    for (const b of idea.overlaps) {
      if (b === idea.topic) continue;
      const key = `${idea.topic}|${b}`;
      const p = pairMap.get(key) ?? { a: idea.topic, b, volume: 0, ideas: 0 };
      p.volume += idea.volume ?? 0;
      p.ideas += 1;
      pairMap.set(key, p);
    }
  }
  const status: ResearchView["status"] = latest ? ((["running", "completed", "failed"].includes(String(latest.status)) ? latest.status : "none") as ResearchView["status"]) : "none";
  return {
    status,
    error: latest?.status === "failed" ? String(latest.error ?? "") || "Research run failed" : null,
    generatedAt: done ? String(done.generatedAt ?? "") || null : null,
    gscAt: gsc ? String(gsc.pulledAt ?? "") || null : null,
    gscConnected: input.gscConnected,
    location: result?.location || input.location,
    topics,
    ideas,
    gscPages: signals.pages,
    gscQueries: signals.queries,
    pairs: [...pairMap.values()].sort((x, y) => y.volume - x.volume || `${x.a}|${x.b}`.localeCompare(`${y.a}|${y.b}`)),
    insightsModel: insights?.model ?? "",
  };
}
