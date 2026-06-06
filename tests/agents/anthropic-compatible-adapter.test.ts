/**
 * callAnthropicCompatible adapter (MiniMax M3): mocks the resolver + fetch and
 * asserts the request hits the MiniMax /v1/messages endpoint with the required
 * `anthropic-version` header and with adaptive thinking enabled (temperature
 * dropped) — replicating gg-coder's Anthropic-SDK setup so MiniMax-M3's
 * thinking blocks round-trip cleanly inside OptiMate's tool loop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockResolve = vi.fn();
vi.mock("@/lib/agents/_shared/llm/auth/resolver", () => ({
  resolveCredential: (...args: unknown[]) => mockResolve(...args),
  OAuthFailedError: class extends Error {},
}));

import { callAnthropicCompatible } from "@/lib/agents/_shared/llm/providers/anthropic-compatible";
import type { CallLLMOptions } from "@/lib/agents/_shared/llm/types";

const opts: CallLLMOptions = {
  model: "minimax-m3",
  system: "You are OptiMate.",
  temperature: 0.3,
  messages: [{ role: "user", content: [{ type: "text", text: "Reply ok" }] }],
};

const config = {
  provider: "minimax" as const,
  baseUrl: "https://api.minimax.io/anthropic",
};

const originalFetch = global.fetch;

function okResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "MiniMax-M3",
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 1 },
    }),
  } as unknown as Response;
}

beforeEach(() => {
  mockResolve.mockReset();
  mockResolve.mockResolvedValue({
    source: "api-key",
    authHeader: { Authorization: "Bearer mm-key" },
    credential: { kind: "api-key", provider: "minimax", apiKey: "mm-key" },
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("callAnthropicCompatible (MiniMax)", () => {
  it("sends the anthropic-version header, enables adaptive thinking, and drops temperature", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await callAnthropicCompatible(opts, "MiniMax-M3", config);

    expect(res.message.content).toEqual([{ type: "text", text: "ok" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.minimax.io/anthropic/v1/messages");

    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["Authorization"]).toBe("Bearer mm-key");

    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.thinking).toEqual({ type: "adaptive" });
    expect(sentBody.temperature).toBeUndefined();
    expect(sentBody.model).toBe("MiniMax-M3");
  });
});
