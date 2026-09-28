import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agents/_shared/llm/auth/resolver", () => ({
  resolveCredential: vi.fn(async () => ({ authHeader: { "api-key": "test-key" }, source: "api-key" })),
  OAuthFailedError: class extends Error {},
}));

import { callLLM } from "../../src/lib/agents/_shared/llm";
import { CHAT_PICKER_MODELS, MODEL_REGISTRY, PROVIDER_CONFIG } from "../../src/lib/agents/_shared/llm/registry";
import { toOpenAI } from "../../src/lib/agents/_shared/llm/transformers/to-openai";

const newModels = [
  ["claude-opus-5.5", "anthropic", "claude-opus-5-5"],
  ["gpt-6-astra", "openai", "gpt-6-astra"],
  ["gpt-6-sol", "openai", "gpt-6-sol"],
  ["gpt-6-luna", "openai", "gpt-6-luna"],
  ["mimo-v2.6-pro", "mimo", "mimo-v2.6-pro"],
  ["mimo-v2.6-flash", "mimo", "mimo-v2.6-flash"],
  ["grok-4.7", "xai-api", "grok-4.7"],
] as const;

describe("OptiMate new provider models", () => {
  it.each(newModels)("exposes %s in the picker with its wire ID", (name, provider, wireId) => {
    expect(MODEL_REGISTRY[name]).toEqual({ provider, model: wireId });
    expect(CHAT_PICKER_MODELS.some((item) => item.canonical === name)).toBe(true);
  });

  it("keeps new billed models separate from subscription-backed providers", () => {
    expect(PROVIDER_CONFIG.mimo).toMatchObject({ baseUrl: "https://api.xiaomimimo.com/v1", supportsOAuth: false });
    expect(PROVIDER_CONFIG["xai-api"]).toMatchObject({ baseUrl: "https://api.x.ai/v1", supportsOAuth: false });
    expect(PROVIDER_CONFIG["openai-codex"].supportsOAuth).toBe(true);
    expect(MODEL_REGISTRY["grok-4.6"].provider).toBe("xai-grok");
  });

  it.each([
    ["mimo-v2.6-pro", "https://api.xiaomimimo.com/v1/chat/completions"],
    ["grok-4.7", "https://api.x.ai/v1/chat/completions"],
    ["gpt-6-astra", "https://api.openai.com/v1/chat/completions"],
  ])("dispatches %s to its API endpoint", async (model, url) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      model,
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200 }));
    try {
      const result = await callLLM({ model, messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] });
      expect(result.message.content).toEqual([{ type: "text", text: "ok" }]);
      expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "POST" }));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses MiMo's documented completion budget field", () => {
    const body = toOpenAI({
      model: "mimo-v2.6-pro",
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      maxTokens: 512,
    }, "mimo-v2.6-pro");
    expect(body.max_completion_tokens).toBe(512);
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("uses GPT-6 completion limits without unsupported temperature", () => {
    const body = toOpenAI({
      model: "gpt-6-astra",
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      maxTokens: 512,
      temperature: 0.3,
    }, "gpt-6-astra");
    expect(body).toMatchObject({ model: "gpt-6-astra", max_completion_tokens: 512 });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });
});
