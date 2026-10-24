/**
 * Topic / article / bridge suggestions from the team and from clients (PIN
 * view). Everything starts pending; the team approves or dismisses:
 *
 * - approve topic   → new topic authority on the client + a refresh run
 * - approve article / bridge → a subscription model writes the GEO brief
 *   (same prompt style and validation as ideas.ts), stored on the suggestion,
 *   which then shows in the plan
 * - dismiss         → status dismissed (+ reason, team only)
 */

import { SENTENCE_CASE_RULE } from "./sentence-case";
import type { Payload } from "payload";
import { authoritiesFromClient, MAX_TOPIC_AUTHORITIES, slugifyAuthority, type AuthorityRow } from "./authorities";
import { authorityTopics, toRecommendation } from "./ideas";
import { callContentMapModel, extractJson, type ContentMapLlmResult } from "./llm";
import { suggestionPlanItem } from "./plan";
import { relId, requestRefresh } from "./snapshots";
import type { ContentMapSnapshot, PlanItem, SuggestionKind, SuggestionView, TopicAuthorityInput } from "./types";
import { isRecord } from "./types";
import { clientSiteUrl } from "./paths";

type Doc = Record<string, unknown>;
type Call = (p: Payload, i: { system: string; user: string; maxTokens?: number; timeoutMs?: number }) => Promise<ContentMapLlmResult>;

export const CLIENT_DAILY_LIMIT = 10;
export const CLIENT_PENDING_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const KINDS: readonly SuggestionKind[] = ["topic", "bridge", "article"];

/** Plain text only: tags and control characters removed, whitespace collapsed (newlines kept when multiline). */
export function plainText(value: unknown, multiline = false): string {
  if (typeof value !== "string") return "";
  let s = value.replace(/<[^>]*>/g, " ").replace(/[<>]/g, "");
  s = multiline ? s.replace(/\r\n?/g, "\n") : s.replace(/[\r\n]+/g, " ");
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g, multiline ? "" : " ");
  s = s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export interface SuggestionInput {
  kind: SuggestionKind;
  title: string;
  why: string;
  topic: string | null;
  topicB: string | null;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

/** Validate a suggestion body (§3 limits) against the client's authority keys. */
export function parseSuggestionInput(body: Doc, authorities: readonly TopicAuthorityInput[]): Checked<SuggestionInput> {
  const kind = body.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as SuggestionKind)) return { ok: false, error: "kind must be topic, bridge or article", status: 400 };
  if (typeof body.title !== "string" || (body.why !== undefined && typeof body.why !== "string")) return { ok: false, error: "title and why must be text", status: 400 };
  if (body.title.length > 2000 || (typeof body.why === "string" && body.why.length > 5000)) return { ok: false, error: "Too long", status: 400 };
  const title = plainText(body.title);
  const why = plainText(body.why ?? "", true);
  if (title.length < 3 || title.length > 160) return { ok: false, error: "The title must be 3 to 160 characters", status: 400 };
  if (why.length > 600) return { ok: false, error: "The reason must be at most 600 characters", status: 400 };
  const keys = new Set(authorities.map((a) => a.key));
  const key = (v: unknown) => (typeof v === "string" && keys.has(v) ? v : null);
  let topic: string | null = null;
  let topicB: string | null = null;
  if (kind === "article") {
    topic = key(body.topic);
    if (!topic) return { ok: false, error: "Choose one of the client's topics", status: 400 };
  } else if (kind === "bridge") {
    topic = key(body.topic);
    topicB = key(body.topicB);
    if (!topic || !topicB || topic === topicB) return { ok: false, error: "Choose two different topics to connect", status: 400 };
  }
  return { ok: true, value: { kind: kind as SuggestionKind, title, why, topic, topicB } };
}

const dateStr = (v: unknown) => (typeof v === "string" && v ? v : null);

export function toSuggestionView(doc: Doc): SuggestionView {
  const origin = doc.origin === "client" || doc.origin === "ai" ? doc.origin : "team";
  return {
    id: String(doc.id),
    kind: KINDS.includes(doc.kind as SuggestionKind) ? (doc.kind as SuggestionKind) : "article",
    title: String(doc.title ?? ""),
    why: String(doc.why ?? ""),
    topic: typeof doc.topic === "string" && doc.topic ? doc.topic : null,
    topicB: typeof doc.topicB === "string" && doc.topicB ? doc.topicB : null,
    status: doc.status === "approved" || doc.status === "dismissed" ? doc.status : "pending",
    origin,
    suggestedBy: String(doc.suggestedBy ?? "") || (origin === "client" ? "Client" : origin === "ai" ? "AI" : "Team"),
    createdAt: dateStr(doc.createdAt) ?? "",
    decidedAt: dateStr(doc.decidedAt),
    dismissReason: typeof doc.dismissReason === "string" && doc.dismissReason ? doc.dismissReason : null,
    recommendationId: typeof doc.recommendationId === "string" && doc.recommendationId ? doc.recommendationId : null,
  };
}

export async function loadSuggestions(payload: Payload, clientId: string): Promise<Doc[]> {
  const res = await payload.find({
    collection: "content-map-suggestions",
    where: { client: { equals: clientId } },
    sort: "-createdAt",
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  return res.docs as unknown as Doc[];
}

/** Create a pending suggestion. Client-origin ones are rate limited (10 / 24 h, 30 pending → 429). */
export async function createSuggestion(
  payload: Payload,
  input: { clientId: string; value: SuggestionInput; origin: "team" | "client"; suggestedBy: string; userId?: number | string | null },
  now: () => number = Date.now,
): Promise<Checked<Doc>> {
  if (input.origin === "client") {
    const res = await payload.find({
      collection: "content-map-suggestions",
      where: { and: [{ client: { equals: input.clientId } }, { origin: { equals: "client" } }] },
      sort: "-createdAt",
      limit: 200,
      depth: 0,
      overrideAccess: true,
      select: { status: true, createdAt: true },
    });
    const docs = res.docs as unknown as Doc[];
    const t = now();
    const today = docs.filter((d) => t - Date.parse(String(d.createdAt ?? "")) < DAY_MS).length;
    const pending = docs.filter((d) => d.status === "pending").length;
    if (today >= CLIENT_DAILY_LIMIT) return { ok: false, error: "That's the most suggestions for today. Please try again tomorrow.", status: 429 };
    if (pending >= CLIENT_PENDING_LIMIT) return { ok: false, error: "There are already many suggestions waiting for review. Please wait for the team to go through them.", status: 429 };
  }
  const v = input.value;
  const doc = (await payload.create({
    collection: "content-map-suggestions",
    data: {
      client: Number(input.clientId) || input.clientId,
      kind: v.kind,
      title: v.title,
      why: v.why,
      topic: v.topic,
      topicB: v.topicB,
      status: "pending",
      origin: input.origin,
      suggestedBy: input.suggestedBy.slice(0, 120),
      ...(input.userId != null ? { suggestedByUser: input.userId } : {}),
    } as never,
    overrideAccess: true,
  })) as unknown as Doc;
  return { ok: true, value: doc };
}

export function buildSuggestionBriefPrompt(input: {
  siteUrl: string;
  suggestion: SuggestionInput;
  authorities: readonly TopicAuthorityInput[];
  snapshot: ContentMapSnapshot | null;
}): { system: string; user: string } {
  const { suggestion: s, snapshot } = input;
  const name = (k: string | null) => input.authorities.find((a) => a.key === k)?.name ?? k ?? "";
  const topic = input.authorities.find((a) => a.key === s.topic);
  const nodes = (snapshot?.nodes ?? []).filter((n) => !n.agg);
  const inTopic = (k: string | null) => nodes.filter((n) => n.g === k).sort((a, b) => b.in - a.in);
  const candidates = [...inTopic(s.topic).slice(0, 25), ...inTopic(s.topicB).slice(0, 15), ...inTopic("core").slice(0, 5)];
  const system = `You are a content strategist. You turn one suggested article into a brief that makes the website the clear topical authority and that AI assistants (ChatGPT, Gemini, Perplexity, Google AI Overviews) will cite: generative engine optimisation (GEO).

The article must:
- answer one specific question real people ask, staying true to the suggestion;
- ${s.kind === "bridge" ? "connect the two given topic authorities naturally, linking pages in both;" : "sit inside the given topic authority;"}
- be planned for citation: a direct 40-60 word answer first, question-style H2s, named entities, FAQs, and evidence worth citing.

${SENTENCE_CASE_RULE}
Reply with JSON only, no prose:
{"ideas":[{"title":"","question":"","why":"one or two sentences: the gap it fills","priority":"high|medium|low","overlaps":["other authority key"],"primaryKeyword":"","secondaryKeywords":[""],"outline":["H2 as a question"],"answerFirst":"40-60 words","entities":[""],"faqs":[""],"evidence":[""],"schema":["Article","FAQPage"],"linksTo":["page id"],"linksFrom":["page id"]}]}`;
  const user = [
    `Website: ${input.siteUrl}`,
    s.kind === "bridge"
      ? `Bridge between topic authorities: ${name(s.topic)} (key: ${s.topic}) and ${name(s.topicB)} (key: ${s.topicB})`
      : `Topic authority: ${name(s.topic)} (key: ${s.topic})`,
    topic?.description ? `What it covers: ${topic.description}` : "",
    `Suggested article: ${s.title}`,
    s.why ? `Why it was suggested: ${s.why}` : "",
    "",
    candidates.length ? "Existing pages it can link to or be linked from (use these ids exactly in linksTo / linksFrom):" : "",
    ...candidates.map((n) => `- ${n.id} | ${n.t}`),
    "",
    "Give exactly 1 idea. Keep the suggested title unless it can be made clearer.",
  ].filter(Boolean).join("\n");
  return { system, user };
}

export type DecideResult = { ok: true; suggestion: Doc; planItem?: PlanItem } | { ok: false; error: string; status: number };

export async function decideSuggestion(
  payload: Payload,
  input: { clientId: string; id: string; decision: "approve" | "dismiss"; reason?: string; decidedBy: string },
  deps: { call?: Call; now?: () => number; refresh?: (p: Payload, clientId: string) => Promise<void>; snapshot?: ContentMapSnapshot | null } = {},
): Promise<DecideResult> {
  const now = deps.now ?? Date.now;
  let doc: Doc;
  try {
    doc = (await payload.findByID({ collection: "content-map-suggestions", id: input.id, depth: 0, overrideAccess: true })) as unknown as Doc;
  } catch {
    return { ok: false, error: "Suggestion not found", status: 404 };
  }
  // Never act on another client's suggestion, whatever id was sent.
  if (relId(doc.client) !== input.clientId) return { ok: false, error: "Suggestion not found", status: 404 };
  if (doc.status !== "pending") return { ok: false, error: "This suggestion has already been decided", status: 409 };
  const decided = { decidedBy: input.decidedBy.slice(0, 120), decidedAt: new Date(now()).toISOString() };
  const update = async (data: Doc) =>
    (await payload.update({ collection: "content-map-suggestions", id: doc.id as number, data: data as never, overrideAccess: true })) as unknown as Doc;

  if (input.decision === "dismiss") {
    const reason = plainText(input.reason ?? "", true).slice(0, 600);
    return { ok: true, suggestion: await update({ status: "dismissed", dismissReason: reason || null, ...decided }) };
  }

  const client = (await payload.findByID({ collection: "clients", id: input.clientId, depth: 0, overrideAccess: true })) as unknown as Doc;
  const authorities = authoritiesFromClient(client);

  if (doc.kind === "topic") {
    if (authorities.length >= MAX_TOPIC_AUTHORITIES) return { ok: false, error: `The client already has ${MAX_TOPIC_AUTHORITIES} topics. Remove one first.`, status: 409 };
    const title = String(doc.title ?? "").trim();
    if (authorities.some((a) => a.key === slugifyAuthority(title) || a.name.toLowerCase() === title.toLowerCase())) {
      return { ok: false, error: "The client already has this topic", status: 409 };
    }
    const rows = (Array.isArray(client.topicAuthorities) ? (client.topicAuthorities as AuthorityRow[]) : []).map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name,
      description: r.description ?? null,
      primary: r.primary === true,
    }));
    rows.push({ name: title, description: String(doc.why ?? "") || null, primary: false });
    // The explicit refresh below replaces the Clients afterChange run (no double GT call).
    await payload.update({ collection: "clients", id: input.clientId, data: { topicAuthorities: rows } as never, overrideAccess: true, context: { skipContentMap: true } });
    const suggestion = await update({ status: "approved", ...decided });
    await (deps.refresh ?? requestRefresh)(payload, input.clientId).catch((err: Error) => console.warn("[content-map] refresh after topic approval failed:", err.message));
    return { ok: true, suggestion };
  }

  const value: SuggestionInput = {
    kind: doc.kind === "bridge" ? "bridge" : "article",
    title: String(doc.title ?? ""),
    why: String(doc.why ?? ""),
    topic: typeof doc.topic === "string" ? doc.topic : null,
    topicB: typeof doc.topicB === "string" ? doc.topicB : null,
  };
  if (!value.topic || !authorities.some((a) => a.key === value.topic)) return { ok: false, error: "The suggestion's topic no longer exists", status: 409 };
  const snapshot = deps.snapshot ?? null;
  const prompt = buildSuggestionBriefPrompt({ siteUrl: clientSiteUrl(client), suggestion: value, authorities, snapshot });
  let raw: unknown = null;
  try {
    const res = await (deps.call ?? callContentMapModel)(payload, { ...prompt, maxTokens: 3000, timeoutMs: 120_000 });
    const json = extractJson(res.text);
    raw = Array.isArray(json) ? json[0] : isRecord(json) && Array.isArray(json.ideas) ? json.ideas[0] : json;
  } catch (err) {
    console.warn("[content-map] suggestion brief failed:", (err as Error).message);
  }
  const nodeIds = new Set((snapshot?.nodes ?? []).filter((n) => !n.agg).map((n) => n.id));
  const authorityKeys = new Set([...authorities.map((a) => a.key), ...(snapshot ? authorityTopics(snapshot).map((t) => t.k) : [])]);
  const rec = toRecommendation(raw, { topic: value.topic, index: 0, nodeIds, authorityKeys });
  if (!rec) return { ok: false, error: "No model could write the brief. Check the OAuth connections in OptiMate settings, then try again.", status: 502 };
  if (value.kind === "bridge" && value.topicB && !rec.overlaps.includes(value.topicB)) rec.overlaps = [value.topicB, ...rec.overlaps].slice(0, 3);
  const suggestion = await update({ status: "approved", brief: rec, recommendationId: rec.id, ...decided });
  return { ok: true, suggestion, planItem: suggestionPlanItem(suggestion) ?? undefined };
}
