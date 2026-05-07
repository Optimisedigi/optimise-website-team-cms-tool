/**
 * Provider failover: callLLM walks the fallbackModels chain when the
 * primary model errors with a recoverable failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the credential resolver so the LLM layer never tries to read the
// agent-credentials Payload collection during the test. Returns a static
// API-key auth header for every provider.
vi.mock("@/lib/agents/_shared/llm/auth/resolver", () => ({
  resolveCredential: vi.fn().mockResolvedValue({
    authHeader: { "x-api-key": "test-key", "anthropic-version": "2023-06-01" },
    source: "api-key",
    credential: { kind: "api-key", provider: "anthropic", apiKey: "test-key" },
  }),
  OAuthFailedError: class extends Error {},
}));

import { callLLM } from "@/lib/agents/_shared/llm";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  const queue = [...responses];
  // @ts-expect-error - vi global polyfilled via setup
  globalThis.fetch = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("Unexpected fetch beyond mocked sequence");
    if (!next.ok) {
      return {
        ok: false,
        status: next.status ?? 500,
        text: async () => JSON.stringify(next.body),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => next.body,
    } as unknown as Response;
  });
}

describe("callLLM failover", () => {
  it("falls through to second model when primary returns 429 (rate limited)", async () => {
    // First call (primary, claude-sonnet-4.5): 429. Retry policy retries
    // up to 3 times, so the next 3 attempts also fail. Then we fall to kimi-k2.
    mockFetchSequence([
      { ok: false, status: 429, body: { error: "rate limited" } },
      { ok: false, status: 429, body: { error: "rate limited" } },
      { ok: false, status: 429, body: { error: "rate limited" } },
      // Kimi succeeds on first try
      {
        ok: true,
        body: {
          id: "chatcmpl-1",
          model: "kimi-k2.6",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        },
      },
    ]);

    const response = await callLLM({
      model: "claude-sonnet-4.5",
      fallbackModels: ["kimi-k2.6"],
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    });

    expect(response.model).toBe("kimi-k2.6");
    expect(response.providerModel).toBe("kimi-k2.6");
    expect(response.message.content).toEqual([{ type: "text", text: "ok" }]);
  });

  it("aborts immediately on 400 invalid-request from primary (no fallback)", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        body: { error: { type: "invalid_request_error", message: "bad input" } },
      },
    ]);

    await expect(
      callLLM({
        model: "claude-sonnet-4.5",
        fallbackModels: ["kimi-k2.6"],
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      }),
    ).rejects.toThrow();
  });

  // 3 retries with 1s + 2s + 4s exponential backoff = up to ~7s per model;
  // two models = up to ~14s. Bump vitest's default 5s timeout.
  it("aggregates errors when all models fail", { timeout: 30_000 }, async () => {
    mockFetchSequence([
      // primary fails 4x (3 retries + 1)
      { ok: false, status: 503, body: "primary down" },
      { ok: false, status: 503, body: "primary down" },
      { ok: false, status: 503, body: "primary down" },
      // fallback also fails
      { ok: false, status: 503, body: "fallback down" },
      { ok: false, status: 503, body: "fallback down" },
      { ok: false, status: 503, body: "fallback down" },
    ]);

    await expect(
      callLLM({
        model: "claude-sonnet-4.5",
        fallbackModels: ["kimi-k2.6"],
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      }),
    ).rejects.toThrow(/All models failed/);
  });
});
