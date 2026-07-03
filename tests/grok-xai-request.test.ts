import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCredential: vi.fn(async () => ({
    authHeader: { Authorization: "Bearer test-token" },
    source: "oauth" as const,
  })),
}));

vi.mock("../src/lib/agents/_shared/llm/auth/resolver", () => ({
  resolveCredential: mocks.resolveCredential,
}));

import { callXaiGrok } from "../src/lib/agents/_shared/llm/providers/xai-grok";
import type { CallLLMOptions } from "../src/lib/agents/_shared/llm/types";

const baseOptions = (overrides: Partial<CallLLMOptions> = {}): CallLLMOptions => ({
  model: "grok-build",
  system: "You are OptiMate.",
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  reasoningMode: "high",
  ...overrides,
});

describe("xAI Grok adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "completed",
          model: "grok-build",
          output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
  });

  it("never sends Codex reasoning fields to the Grok proxy", async () => {
    await callXaiGrok(baseOptions(), "grok-build", {
      baseUrl: "https://grok.test/v1",
      clientVersion: "0.2.51",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.reasoning).toBeUndefined();
    expect(body.reasoningEffort).toBeUndefined();
  });
});
