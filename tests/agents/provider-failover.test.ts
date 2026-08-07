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
        // The Codex adapter reads response headers to extract a request id,
        // so the error fixture needs a real Headers instance.
        headers: new Headers(),
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

  it("falls through to second model on 400 invalid-request (provider-specific 400s recover)", async () => {
    // A plain 400 is often provider-specific (e.g. MiniMax 400ing on a
    // tool-call shape Kimi accepts). callLLM must walk the chain rather than
    // failing the whole turn on the first model's 400.
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        body: { error: { type: "invalid_request_error", message: "bad input" } },
      },
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
    expect(response.message.content).toEqual([{ type: "text", text: "ok" }]);
  });

  it("still aborts immediately on context-overflow (every model would reject the same oversized prompt)", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        body: {
          error: {
            type: "invalid_request_error",
            message: "prompt is too long: maximum context length exceeded",
          },
        },
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

  it("reports why each earlier model bowed out via fallbackFrom", { timeout: 30_000 }, async () => {
    // The exact shape the ChatGPT Codex backend returns when a subscription
    // hits its cap. This is what made the chat pill say "gpt fell back" with
    // no reason: callLLM used to swallow the primary model's error entirely.
    const usageLimitBody = {
      error: {
        type: "usage_limit_reached",
        message: "The usage limit has been reached",
        plan_type: "prolite",
      },
    };
    mockFetchSequence([
      { ok: false, status: 429, body: usageLimitBody },
      { ok: false, status: 429, body: usageLimitBody },
      { ok: false, status: 429, body: usageLimitBody },
      {
        ok: true,
        body: {
          id: "chatcmpl-1",
          model: "kimi-k2.6",
          choices: [
            { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        },
      },
    ]);

    const response = await callLLM({
      model: "gpt-5.6-luna",
      fallbackModels: ["kimi-k2.6"],
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    });

    expect(response.model).toBe("kimi-k2.6");
    expect(response.fallbackFrom).toHaveLength(1);
    expect(response.fallbackFrom?.[0].model).toBe("gpt-5.6-luna");
    expect(response.fallbackFrom?.[0].reason).toMatch(/usage limit/i);
  });

  it("omits fallbackFrom when the requested model served the request", async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          id: "chatcmpl-1",
          model: "kimi-k2.6",
          choices: [
            { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        },
      },
    ]);

    const response = await callLLM({
      model: "kimi-k2.6",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    });

    expect(response.model).toBe("kimi-k2.6");
    expect(response.fallbackFrom).toBeUndefined();
  });
});
