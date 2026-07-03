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

  it("normalizes caller temperature to Kimi For Coding's accepted value", async () => {
    await callKimiCoding(baseOptions(), "kimi-for-coding", {
      baseUrl: "https://kimi.test/coding/v1",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.temperature).toBe(0.6);
  });
});
