import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCredential: vi.fn(async () => ({
    credential: {
      kind: "oauth" as const,
      accessToken: "test-access-token",
      expiresAt: Date.now() + 60_000,
      kimiModelId: "kimi-for-coding",
    },
    source: "oauth" as const,
  })),
}));

vi.mock("../src/lib/agents/_shared/llm/auth/resolver", () => ({
  resolveCredential: mocks.resolveCredential,
}));

import { callKimiCoding } from "../src/lib/agents/_shared/llm/providers/kimi-coding";
import type { CallLLMOptions } from "../src/lib/agents/_shared/llm/types";

const baseOptions = (overrides: Partial<CallLLMOptions> = {}): CallLLMOptions => ({
  model: "kimi-for-coding",
  system: "You are OptiMate.",
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  temperature: 0.3,
  ...overrides,
});

describe("Kimi For Coding adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "chatcmpl_test",
          model: "kimi-for-coding",
          choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
  });

  function sentBody() {
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    return JSON.parse(String(init?.body));
  }

  it("normalizes caller temperature to Kimi For Coding's accepted value", async () => {
    await callKimiCoding(baseOptions(), "kimi-for-coding", {
      baseUrl: "https://kimi.test/coding/v1",
    });

    expect(sentBody().temperature).toBe(0.6);
  });

  it("forces reasoning on for k3 when no reasoning mode is supplied (cron path)", async () => {
    await callKimiCoding(baseOptions({ reasoningMode: undefined }), "k3", {
      baseUrl: "https://kimi.test/coding/v1",
    });

    const body = sentBody();
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("low");
  });

  it("forces reasoning on for k3 even when the caller explicitly asks for off", async () => {
    await callKimiCoding(baseOptions({ reasoningMode: "off" }), "k3", {
      baseUrl: "https://kimi.test/coding/v1",
    });

    const body = sentBody();
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("low");
  });

  it("honours an explicit reasoning effort on k3", async () => {
    await callKimiCoding(baseOptions({ reasoningMode: "high" }), "k3", {
      baseUrl: "https://kimi.test/coding/v1",
    });

    const body = sentBody();
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("high");
  });

  it("leaves reasoning disabled for non-k3 models when reasoning is off", async () => {
    await callKimiCoding(baseOptions({ reasoningMode: "off" }), "kimi-for-coding", {
      baseUrl: "https://kimi.test/coding/v1",
    });

    const body = sentBody();
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.reasoning_effort).toBeUndefined();
  });
});
