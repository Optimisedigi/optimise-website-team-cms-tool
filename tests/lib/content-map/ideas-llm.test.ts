import { describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";

vi.mock("@/lib/agents/_shared/llm", () => ({ callLLM: vi.fn() }));
vi.mock("@/lib/agents/_shared/llm/auth/store", () => ({ getCredential: vi.fn() }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({ getOptiMateDefaultModels: vi.fn() }));

import sampleJson from "../../fixtures/content-map-snapshot-sample.json";
import { buildIdeasPrompt, generateIdeas, needsIdeas, recommendationId, refreshIdeas } from "@/lib/content-map/ideas";
import { callContentMapModel, contentMapModelChain, extractJson } from "@/lib/content-map/llm";
import type { ContentMapSnapshot } from "@/lib/content-map/types";
import { createFakePayload } from "./fake-payload";

const sample = sampleJson as unknown as ContentMapSnapshot;
const P = {} as Payload;

describe("Content Map model chain", () => {
  it("uses only subscription models by default, and Claude only when its OAuth is connected", async () => {
    const settings = vi.fn(async () => ({}) as never);
    const none = vi.fn(async () => null);
    expect(await contentMapModelChain(P, { settings, credential: none })).toEqual(["kimi-k3", "grok-4.6", "gpt-5.6-terra"]);
    const apiKeyOnly = vi.fn(async () => ({ kind: "api-key" }) as never);
    expect(await contentMapModelChain(P, { settings, credential: apiKeyOnly })).not.toContain("claude-sonnet-5.5");
    const oauth = vi.fn(async () => ({ kind: "oauth" }) as never);
    expect(await contentMapModelChain(P, { settings, credential: oauth })).toEqual(["kimi-k3", "claude-sonnet-5.5", "grok-4.6", "gpt-5.6-terra"]);
  });

  it("puts the model chosen in OptiMate settings first", async () => {
    const settings = vi.fn(async () => ({ contentMapModel: "claude-opus-5.5" }) as never);
    const chain = await contentMapModelChain(P, { settings, credential: vi.fn(async () => null) });
    expect(chain[0]).toBe("claude-opus-5.5");
    expect(chain.slice(1)).toEqual(["kimi-k3", "grok-4.6", "gpt-5.6-terra"]);
  });

  it("calls the first model with the rest as fallbacks and returns its text", async () => {
    const call = vi.fn(async () => ({ message: { role: "assistant", content: [{ type: "text", text: ' {"a":1} ' }] }, model: "grok-4.6" }) as never);
    const res = await callContentMapModel(P, { system: "s", user: "u" }, { call, chain: ["kimi-k3", "grok-4.6"] });
    expect(res).toEqual({ text: '{"a":1}', model: "grok-4.6" });
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ model: "kimi-k3", fallbackModels: ["grok-4.6"], system: "s", reasoningMode: "low" }));
  });

  it("pulls JSON out of fenced or chatty replies", () => {
    expect(extractJson('```json\n{"ideas":[1]}\n```')).toEqual({ ideas: [1] });
    expect(extractJson('Sure! Here it is: {"found": false} Hope that helps.')).toEqual({ found: false });
    expect(extractJson("no json here")).toBeNull();
  });
});

function idea(title: string, extra: Record<string, unknown> = {}) {
  return {
    title, question: `Question about ${title}?`, why: "Fills a gap.", priority: "high", overlaps: ["cost", "not-a-topic"],
    primaryKeyword: title.toLowerCase(), secondaryKeywords: ["a"], outline: ["What is it?"], answerFirst: "Direct answer.",
    entities: ["Vietnam"], faqs: ["Is it legal?"], evidence: ["Salary data"], schema: ["Article", "FAQPage"],
    linksTo: [sample.nodes[1]!.id, "/not/a/page/"], linksFrom: [], ...extra,
  };
}

describe("generateIdeas", () => {
  it("prompts each authority with its pages and the ids it may link to", () => {
    const { user } = buildIdeasPrompt(sample, "vietnam");
    expect(user).toMatch(/Topic authority: Vietnam \(key: vietnam\)/);
    expect(user).toContain(sample.nodes.find((n) => n.g === "vietnam")!.t);
    expect(user).toMatch(/use these ids exactly/);
  });

  it("validates ideas, drops repeats of existing pages and unknown ids, and keeps GT ideas where a topic fails", async () => {
    const existing = sample.nodes.find((n) => n.g === "vietnam" && !n.agg)!.t;
    const call = vi.fn(async (_p: Payload, input: { user: string }) => {
      if (input.user.includes("(key: cost)")) throw new Error("rate limited");
      const topic = input.user.match(/\(key: ([^)]+)\)/)![1];
      return { text: JSON.stringify({ ideas: [idea(existing), idea(`Fresh ${topic} guide for owners`), idea("bad")] }), model: "kimi-k3" };
    });
    const res = await generateIdeas(P, sample, call);
    expect(res).not.toBeNull();
    const vietnam = res!.recommendations.filter((r) => r.topic === "vietnam");
    expect(vietnam).toHaveLength(1);
    expect(vietnam[0]).toMatchObject({
      id: recommendationId("vietnam", "Fresh vietnam guide for owners"),
      overlaps: ["cost"],
      linksTo: [sample.nodes[1]!.id],
      priority: "high",
    });
    // cost failed: its GT idea is kept
    expect(res!.recommendations.filter((r) => r.topic === "cost").map((r) => r.id)).toEqual(sample.recommendations.filter((r) => r.topic === "cost").map((r) => r.id));
    expect(res).toMatchObject({ model: "kimi-k3", topicsFailed: 1 });
  });

  it("returns null when every model call fails", async () => {
    expect(await generateIdeas(P, sample, vi.fn(async () => { throw new Error("down"); }))).toBeNull();
  });

  it("refreshIdeas rewrites the stored snapshot and records the model", async () => {
    const p = createFakePayload({ "content-map-snapshots": [{ id: 9, client: 7, status: "completed", data: sample }] });
    const call = vi.fn(async (_p: Payload, input: { user: string }) => {
      const topic = input.user.match(/\(key: ([^)]+)\)/)![1];
      return { text: JSON.stringify([idea(`New ${topic} explainer for buyers`)]), model: "claude-sonnet-5.5" };
    });
    const res = await refreshIdeas(p as unknown as Payload, p.store["content-map-snapshots"]![0]!, { call, now: () => new Date("2026-10-23T00:00:00.000Z") });
    expect(res).toMatchObject({ ok: true, model: "claude-sonnet-5.5", topicsFailed: 0 });
    const data = p.store["content-map-snapshots"]![0]!.data as ContentMapSnapshot;
    expect(data.ai.ideas).toEqual({ model: "claude-sonnet-5.5", generatedAt: "2026-10-23T00:00:00.000Z" });
    expect(data.recommendations.every((r) => r.id.startsWith("cm-"))).toBe(true);
    expect(needsIdeas(data)).toBe(false);
    expect(needsIdeas(sample)).toBe(true);
  });
});
