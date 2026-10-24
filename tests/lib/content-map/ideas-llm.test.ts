import { describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";

vi.mock("@/lib/agents/_shared/llm", () => ({ callLLM: vi.fn() }));
vi.mock("@/lib/agents/_shared/llm/auth/store", () => ({ getCredential: vi.fn(), isForceFallback: vi.fn(async () => false) }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({ getOptiMateDefaultModels: vi.fn() }));

import sampleJson from "../../fixtures/content-map-snapshot-sample.json";
import { buildIdeasPrompt, generateIdeas, needsIdeas, recommendationId, refreshIdeas } from "@/lib/content-map/ideas";
import { callContentMapModel, contentMapModelChain, extractJson } from "@/lib/content-map/llm";
import type { ContentMapSnapshot } from "@/lib/content-map/types";
import { createFakePayload } from "./fake-payload";

const sample = sampleJson as unknown as ContentMapSnapshot;
const P = {} as Payload;

describe("Content Map model chain", () => {
  // Production today: Claude, ChatGPT (Codex), Grok and Kimi OAuth logins; default chat model Claude Sonnet 5.5.
  const logins = (...providers: string[]) => vi.fn(async (p: string) => (providers.includes(p) ? ({ kind: "oauth" } as never) : null));
  const prod = logins("anthropic", "openai-codex", "xai-grok", "kimi-coding");
  const noForce = vi.fn(async () => false);

  it("starts with the CMS default chat model, then one backup per other connected provider (picker order)", async () => {
    const settings = vi.fn(async () => ({ defaultChatModel: "claude-sonnet-5.5" }) as never);
    expect(await contentMapModelChain(P, { settings, credential: prod, forceFallback: noForce })).toEqual(["claude-sonnet-5.5", "kimi-k3", "grok-4.6"]);
  });

  it("follows the CMS settings, not a fixed list: a different default comes first", async () => {
    const settings = vi.fn(async () => ({ defaultChatModel: "grok-4.6" }) as never);
    expect(await contentMapModelChain(P, { settings, credential: prod, forceFallback: noForce })).toEqual(["grok-4.6", "claude-sonnet-5.5", "kimi-k3"]);
  });

  it("puts the Content Map model setting first when its provider has an active login", async () => {
    const settings = vi.fn(async () => ({ defaultChatModel: "claude-sonnet-5.5", contentMapModel: "claude-opus-5.5" }) as never);
    expect(await contentMapModelChain(P, { settings, credential: prod, forceFallback: noForce })).toEqual(["claude-opus-5.5", "claude-sonnet-5.5", "kimi-k3", "grok-4.6"]);
  });

  it("skips models whose provider has no active subscription login (no API-key billing)", async () => {
    // API-key-only picker models (GPT-6, Grok 4.7, MiniMax, MiMo) never appear.
    const settings = vi.fn(async () => ({ defaultChatModel: "gpt-6-sol", contentMapModel: "minimax-m3" }) as never);
    expect(await contentMapModelChain(P, { settings, credential: prod, forceFallback: noForce })).toEqual(["claude-sonnet-5.5", "kimi-k3", "grok-4.6"]);
    // Claude stored as an API key, or switched to force fallback → not used.
    const apiKeyClaude = vi.fn(async (p: string) => (p === "anthropic" ? ({ kind: "api-key" } as never) : p === "xai-grok" ? ({ kind: "oauth" } as never) : null));
    const def = vi.fn(async () => ({ defaultChatModel: "claude-sonnet-5.5" }) as never);
    expect(await contentMapModelChain(P, { settings: def, credential: apiKeyClaude, forceFallback: noForce })).toEqual(["grok-4.6"]);
    const forced = vi.fn(async (p: string) => p === "anthropic");
    expect(await contentMapModelChain(P, { settings: def, credential: prod, forceFallback: forced })).toEqual(["kimi-k3", "grok-4.6"]);
  });

  it("returns nothing when no subscription login is connected", async () => {
    const settings = vi.fn(async () => ({ defaultChatModel: "claude-sonnet-5.5" }) as never);
    expect(await contentMapModelChain(P, { settings, credential: vi.fn(async () => null), forceFallback: noForce })).toEqual([]);
  });

  it("calls the first model with the rest as fallbacks and returns its text", async () => {
    const call = vi.fn(async () => ({ message: { role: "assistant", content: [{ type: "text", text: ' {"a":1} ' }] }, model: "grok-4.6" }) as never);
    const res = await callContentMapModel(P, { system: "s", user: "u" }, { call, chain: ["claude-sonnet-5.5", "grok-4.6"] });
    expect(res).toEqual({ text: '{"a":1}', model: "grok-4.6" });
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-5.5", fallbackModels: ["grok-4.6"], system: "s", reasoningMode: "low" }));
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
