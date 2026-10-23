/**
 * The merged plan: snapshot ideas + AI-citation gaps + approved suggestions,
 * de-duplicated by normalised title/question, best first, each with short
 * plain-language reasons. Pure (no Payload) so it is cheap to test.
 */

import { normTitle } from "./ideas";
import type {
  CitationEngine,
  CitationsResult,
  ContentMapSnapshot,
  PlanItem,
  PlanOrigin,
  PlanReason,
  RefreshItem,
  SnapshotRecommendation,
} from "./types";
import { CITATION_ENGINE_LABELS, CITATION_ENGINES, isRecord } from "./types";

type Doc = Record<string, unknown>;
type Source = { url: string; domain: string; title: string };

/** What the subscription model wrote for a completed citation run (stored on the run as `insights`). */
export interface CitationInsights {
  model: string;
  generatedAt: string;
  gaps: Array<SnapshotRecommendation & { questionId: string; cover: string[]; beat: string[] }>;
  refresh: RefreshItem[];
  /** Per existing plan item id whose question was tracked. */
  notes: Record<string, { questionId: string; cover: string[]; beat: string[] }>;
  topicsFailed: number;
}

export function parseCitationsResult(value: unknown): CitationsResult | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!Array.isArray(value.questions) || !Array.isArray(value.sources) || !isRecord(value.stats)) return null;
  return value as unknown as CitationsResult;
}

export function parseInsights(value: unknown): CitationInsights | null {
  if (!isRecord(value) || !Array.isArray(value.gaps) || !Array.isArray(value.refresh) || !isRecord(value.notes)) return null;
  return value as unknown as CitationInsights;
}

export function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** "ChatGPT", "ChatGPT and Perplexity", "ChatGPT, Perplexity and Gemini". */
export function engineNames(engines: readonly CitationEngine[]): string {
  const names = CITATION_ENGINES.filter((e) => engines.includes(e)).map((e) => CITATION_ENGINE_LABELS[e]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export interface QuestionEvidence {
  questionId: string;
  /** Engines that answered citing other sites and not the client. */
  enginesCitingOthers: CitationEngine[];
  /** Non-client domains cited, most-cited first. */
  domains: string[];
  clientCited: boolean;
  sources: Source[];
}

/** Evidence for one tracked question (matched by id or normalised text) in a citation result. */
export function questionEvidence(result: CitationsResult | null, match: { id?: string; question?: string }): QuestionEvidence | null {
  if (!result) return null;
  const wanted = match.question ? normTitle(match.question) : "";
  const q = result.questions.find((x) => (match.id && x.id === match.id) || (wanted && normTitle(x.question) === wanted));
  if (!q) return null;
  const clientHost = hostOf(result.siteUrl);
  const counts = new Map<string, number>();
  const urls = new Map<string, Source>();
  const engines: CitationEngine[] = [];
  let clientCited = false;
  for (const check of q.results) {
    if (!check.ok) continue;
    if (check.clientCited) clientCited = true;
    const others = check.cited.filter((c) => hostOf(c.domain || c.url) !== clientHost);
    if (others.length && !check.clientCited) engines.push(check.engine);
    for (const c of others) {
      const d = hostOf(c.domain || c.url);
      if (!d) continue;
      counts.set(d, (counts.get(d) ?? 0) + 1);
      if (!urls.has(c.url)) {
        const known = result.sources.find((s) => s.url === c.url);
        urls.set(c.url, { url: c.url, domain: d, title: known?.title || c.title || d });
      }
    }
  }
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([d]) => d);
  const sources = [...urls.values()].sort((a, b) => (counts.get(b.domain) ?? 0) - (counts.get(a.domain) ?? 0) || a.url.localeCompare(b.url)).slice(0, 6);
  return { questionId: q.id, enginesCitingOthers: CITATION_ENGINES.filter((e) => engines.includes(e)), domains, clientCited, sources };
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

function snapshotReasons(item: SnapshotRecommendation, snapshot: ContentMapSnapshot | null): { reasons: PlanReason[]; hasPage: boolean } {
  if (!snapshot) return { reasons: [], hasPage: false };
  const reasons: PlanReason[] = [];
  const pages = snapshot.nodes.filter((n) => !n.agg);
  const tk = tokens(item.title), qk = tokens(item.question);
  const hasPage = pages.some((n) => { const nk = tokens(n.t); return jaccard(nk, tk) >= 0.6 || jaccard(nk, qk) >= 0.6; });
  if (!hasPage) reasons.push({ kind: "no-page", text: "No page on the site answers this question yet" });
  const linked = new Set<string>();
  for (const l of snapshot.links) {
    const a = snapshot.nodes[l.s]?.g, b = snapshot.nodes[l.t]?.g;
    if (a && b && a !== b) { linked.add(`${a}>${b}`); linked.add(`${b}>${a}`); }
  }
  const name = (k: string) => snapshot.topics.find((t) => t.k === k)?.name ?? k;
  const unlinked = item.overlaps.find((k) => k !== item.topic && !linked.has(`${item.topic}>${k}`));
  if (unlinked) reasons.push({ kind: "unlinked-topics", text: `Bridges ${name(item.topic)} and ${name(unlinked)}, which never link to each other` });
  const orphanIds = new Set(pages.filter((n) => n.in === 0).map((n) => n.id));
  const orphans = item.linksTo.filter((id) => orphanIds.has(id)).length;
  if (orphans) reasons.push({ kind: "orphan-pages", text: `Links to ${orphans} ${orphans === 1 ? "page" : "pages"} nothing links to yet` });
  return { reasons, hasPage };
}

export function citationReasons(ev: QuestionEvidence | null, hasPage: boolean): PlanReason[] {
  if (!ev) return [];
  const out: PlanReason[] = [];
  if (ev.enginesCitingOthers.length && ev.domains.length) {
    const n = ev.domains.length;
    out.push({
      kind: "ai-cites-others",
      text: `${engineNames(ev.enginesCitingOthers)} ${ev.enginesCitingOthers.length === 1 ? "cites" : "cite"} ${n} other ${n === 1 ? "site" : "sites"} for this`,
      engines: ev.enginesCitingOthers,
      domains: ev.domains.slice(0, 5),
    });
  }
  if (hasPage && !ev.clientCited) out.push({ kind: "client-not-cited", text: "Your page on this isn't cited by any AI tool yet" });
  return out;
}

/** An approved article/bridge suggestion with a stored brief → plan item (reasons added by buildPlan). */
export function suggestionPlanItem(doc: Doc): PlanItem | null {
  if (doc.status !== "approved" || (doc.kind !== "article" && doc.kind !== "bridge")) return null;
  const brief = doc.brief;
  if (!isRecord(brief) || typeof brief.id !== "string" || typeof brief.title !== "string") return null;
  const origin: PlanOrigin = doc.origin === "client" ? "client" : doc.origin === "ai" ? "ai" : "team";
  return { ...(brief as unknown as SnapshotRecommendation), origin, reasons: [], suggestionId: String(doc.id) };
}

function suggestedReason(origin: PlanOrigin): PlanReason {
  return { kind: "suggested", text: origin === "client" ? "Suggested by the client" : "Suggested by the team" };
}

const RANK_BONUS: Partial<Record<PlanReason["kind"], number>> = { demand: 0.04, "search-console": 0.04, competitors: 0.02, "ai-cites-others": 0.08, "client-not-cited": 0.04, suggested: 0.1, "unlinked-topics": 0.02, "orphan-pages": 0.02 };
const rank = (p: PlanItem) => p.score + p.reasons.reduce((s, r) => s + (RANK_BONUS[r.kind] ?? 0), 0);

const STOPWORDS = new Set(["the", "and", "for", "with", "you", "your", "our", "how", "what", "why", "are", "can", "does", "into", "from", "that", "this", "about", "much", "its"]);
function contentTokens(t: string): Set<string> {
  return new Set(normTitle(t).split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}
/** Same topic and (question Jaccard ≥ 0.6 or title Jaccard ≥ 0.7, stopwords removed). */
export function nearDuplicate(a: Pick<PlanItem, "topic" | "title" | "question">, b: Pick<PlanItem, "topic" | "title" | "question">): boolean {
  if (a.topic !== b.topic) return false;
  return jaccard(contentTokens(a.question), contentTokens(b.question)) >= 0.6 || jaccard(contentTokens(a.title), contentTokens(b.title)) >= 0.7;
}

export function buildPlan(input: Parameters<typeof buildPlanWithAliases>[0]): PlanItem[] {
  return buildPlanWithAliases(input).plan;
}

/** The plan plus dropped duplicate id → kept id (so old ids still resolve). */
export function buildPlanWithAliases(input: {
  snapshot: ContentMapSnapshot | null;
  suggestions: readonly Doc[];
  result: CitationsResult | null;
  insights: CitationInsights | null;
  /** In-plan research ideas (origin "research", reasons already set from evidence). */
  research?: readonly PlanItem[];
}): { plan: PlanItem[]; aliases: Record<string, string> } {
  const { snapshot, result, insights } = input;
  const raw: PlanItem[] = [];
  for (const r of snapshot?.recommendations ?? []) {
    const note = insights?.notes[r.id];
    raw.push({ ...r, origin: "ai", reasons: [], ...(note ? { cover: note.cover, beat: note.beat } : {}) });
  }
  for (const s of input.suggestions) {
    const item = suggestionPlanItem(s);
    if (item) raw.push(item);
  }
  for (const g of insights?.gaps ?? []) {
    const { questionId: _q, cover, beat, ...rec } = g;
    raw.push({ ...rec, origin: "ai-citations", reasons: [], cover, beat });
  }

  for (const r of input.research ?? []) raw.push({ ...r, reasons: [...r.reasons] });

  const items = raw.map((item) => {
    const snap = snapshotReasons(item, snapshot);
    const ev = questionEvidence(result, { question: item.question });
    const reasons = [...item.reasons, ...citationReasons(ev, snap.hasPage), ...snap.reasons];
    if (item.suggestionId) reasons.push(suggestedReason(item.origin));
    return { ...item, reasons, ...(ev?.sources.length && !item.sources ? { sources: ev.sources } : {}) };
  });

  // De-dupe: the best-ranked copy wins and absorbs the others' reasons and notes.
  items.sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id));
  const out: PlanItem[] = [];
  const aliases: Record<string, string> = {};
  const seen = new Map<string, PlanItem>();
  for (const item of items) {
    const keys = [normTitle(item.title), normTitle(item.question)].filter(Boolean);
    const dup = keys.map((k) => seen.get(k)).find(Boolean) ?? out.find((o) => nearDuplicate(o, item));
    if (dup) {
      if (item.id !== dup.id) aliases[item.id] = dup.id;
      for (const r of item.reasons) if (!dup.reasons.some((x) => x.kind === r.kind)) dup.reasons.push(r);
      dup.sources ??= item.sources;
      dup.cover ??= item.cover;
      dup.beat ??= item.beat;
      if (item.suggestionId && !dup.suggestionId) dup.suggestionId = item.suggestionId;
      if (item.researchId && !dup.researchId) dup.researchId = item.researchId;
      if (item.volume != null && dup.volume == null) dup.volume = item.volume;
      continue;
    }
    const copy = { ...item, reasons: [...item.reasons] };
    out.push(copy);
    for (const k of keys) seen.set(k, copy);
  }
  return { plan: out, aliases };
}
