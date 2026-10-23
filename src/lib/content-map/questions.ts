/**
 * Questions tracked in AI tools: up to 8 active per topic authority. Gaps are
 * filled in this order, and existing questions are never replaced, so the
 * list stays stable week to week:
 *
 *   1. planned recommendation questions (snapshot ideas for the topic)
 *   2. approved suggestion questions (their briefs)
 *   3. questions existing articles answer (titles phrased as questions),
 *      then buyer questions written by the subscription model
 *
 * Removed questions stay as inactive rows, so filling never brings them back.
 */

import type { Payload } from "payload";
import { normTitle } from "./ideas";
import { callContentMapModel, extractJson, type ContentMapLlmResult } from "./llm";
import { plainText } from "./suggestions";
import type { ContentMapSnapshot, TopicAuthorityInput, TrackedQuestionView } from "./types";
import { isRecord, MAX_QUESTIONS_PER_TOPIC } from "./types";

type Doc = Record<string, unknown>;
type Call = (p: Payload, i: { system: string; user: string; maxTokens?: number; timeoutMs?: number }) => Promise<ContentMapLlmResult>;
type Source = TrackedQuestionView["source"];

export async function loadQuestions(payload: Payload, clientId: string, activeOnly = true): Promise<Doc[]> {
  const res = await payload.find({
    collection: "content-map-questions",
    where: activeOnly ? { and: [{ client: { equals: clientId } }, { active: { equals: true } }] } : { client: { equals: clientId } },
    sort: "createdAt",
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  });
  return res.docs as unknown as Doc[];
}

function cleanQuestion(v: unknown): string {
  const q = plainText(v).slice(0, 300).trim();
  return q.length >= 8 ? q : "";
}

export function buildQuestionsPrompt(input: { siteUrl: string; topic: TopicAuthorityInput; pages: string[]; existing: string[]; count: number }): { system: string; user: string } {
  const system = `You write the questions real buyers type into AI assistants (ChatGPT, Perplexity, Gemini, Google AI Overviews) when researching a subject. Each question is natural, specific, under 20 words, and something a business on this subject would want to be cited for. Australian English.

Reply with JSON only: {"questions":["..."]}`;
  const user = [
    `Website: ${input.siteUrl}`,
    `Topic: ${input.topic.name}`,
    input.topic.description ? `What it covers: ${input.topic.description}` : "",
    input.pages.length ? "Pages the site has on this topic:" : "",
    ...input.pages.slice(0, 40).map((t) => `- ${t}`),
    input.existing.length ? "Already tracked (do not repeat or reword):" : "",
    ...input.existing.map((q) => `- ${q}`),
    "",
    `Give ${input.count} new questions, most commonly asked first.`,
  ].filter(Boolean).join("\n");
  return { system, user };
}

/** Fill every authority up to 8 active questions. Returns all active questions after filling. */
export async function ensureQuestions(
  payload: Payload,
  input: { clientId: string; siteUrl: string; authorities: readonly TopicAuthorityInput[]; snapshot: ContentMapSnapshot | null; suggestions: readonly Doc[] },
  deps: { call?: Call } = {},
): Promise<Doc[]> {
  const all = await loadQuestions(payload, input.clientId, false);
  const taken = new Set(all.map((d) => normTitle(String(d.question ?? ""))));
  const pages = (input.snapshot?.nodes ?? []).filter((n) => !n.agg);
  for (const topic of input.authorities) {
    const active = all.filter((d) => d.active === true && d.topic === topic.key);
    let room = MAX_QUESTIONS_PER_TOPIC - active.length;
    if (room <= 0) continue;
    const add = async (question: string, source: Source) => {
      const q = cleanQuestion(question);
      const key = normTitle(q);
      if (!q || !key || taken.has(key) || room <= 0) return;
      taken.add(key);
      room--;
      const doc = (await payload.create({
        collection: "content-map-questions",
        data: { client: Number(input.clientId) || input.clientId, topic: topic.key, question: q, source, active: true } as never,
        overrideAccess: true,
      })) as unknown as Doc;
      all.push(doc);
    };
    for (const r of input.snapshot?.recommendations ?? []) if (r.topic === topic.key) await add(r.question, "recommendation");
    for (const s of input.suggestions) {
      if (s.status !== "approved" || s.topic !== topic.key || !isRecord(s.brief)) continue;
      await add(String(s.brief.question ?? ""), s.origin === "client" ? "client" : "team");
    }
    const titles = pages.filter((n) => n.g === topic.key).sort((a, b) => b.in - a.in).map((n) => n.t);
    for (const t of titles) if (t.trim().endsWith("?")) await add(t, "article");
    if (room <= 0) continue;
    try {
      const prompt = buildQuestionsPrompt({
        siteUrl: input.siteUrl,
        topic,
        pages: titles,
        existing: all.filter((d) => d.topic === topic.key).map((d) => String(d.question ?? "")),
        count: room,
      });
      const res = await (deps.call ?? callContentMapModel)(payload, { ...prompt, maxTokens: 1500, timeoutMs: 90_000 });
      const json = extractJson(res.text);
      const list = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.questions) ? json.questions : [];
      for (const q of list) await add(String(q ?? ""), "ai");
    } catch (err) {
      console.warn(`[content-map] questions for "${topic.name}" failed:`, (err as Error).message);
    }
  }
  const keys = new Set(input.authorities.map((a) => a.key));
  return all.filter((d) => d.active === true && keys.has(String(d.topic)));
}

export type QuestionResult = { ok: true; questions: Doc[] } | { ok: false; error: string; status: number };

export async function addQuestion(payload: Payload, input: { clientId: string; topic: string; question: unknown; authorities: readonly TopicAuthorityInput[] }): Promise<QuestionResult> {
  if (!input.authorities.some((a) => a.key === input.topic)) return { ok: false, error: "Choose one of the client's topics", status: 400 };
  const question = cleanQuestion(input.question);
  if (!question) return { ok: false, error: "The question must be 8 to 300 characters", status: 400 };
  const all = await loadQuestions(payload, input.clientId, false);
  const active = all.filter((d) => d.active === true && d.topic === input.topic);
  if (active.length >= MAX_QUESTIONS_PER_TOPIC) return { ok: false, error: `This topic already tracks ${MAX_QUESTIONS_PER_TOPIC} questions. Remove one first.`, status: 409 };
  const key = normTitle(question);
  const same = all.find((d) => normTitle(String(d.question ?? "")) === key);
  if (same?.active === true) return { ok: false, error: "This question is already tracked", status: 409 };
  if (same) {
    await payload.update({ collection: "content-map-questions", id: same.id as number, data: { active: true, topic: input.topic, source: "team" } as never, overrideAccess: true });
  } else {
    await payload.create({
      collection: "content-map-questions",
      data: { client: Number(input.clientId) || input.clientId, topic: input.topic, question, source: "team", active: true } as never,
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
