/**
 * callOpenAICodex adapter: mocks the resolver + fetch and asserts the request
 * hits the Codex responses endpoint with the required Codex CLI headers, that
 * an SSE body is parsed into a canonical LLMResponse, and that a non-OK
 * response throws HttpError so the callLLM fallback chain engages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockResolve = vi.fn();
vi.mock("@/lib/agents/_shared/llm/auth/resolver", () => ({
  resolveCredential: (...args: unknown[]) => mockResolve(...args),
}));

import { callOpenAICodex } from "@/lib/agents/_shared/llm/providers/openai-codex";
import { HttpError } from "@/lib/agents/_shared/llm/retry";
import type { CallLLMOptions } from "@/lib/agents/_shared/llm/types";

const opts: CallLLMOptions = {
  model: "gpt-5.5-codex-medium",
  system: "You are OptiMate.",
  messages: [{ role: "user", content: [{ type: "text", text: "Reply ok" }] }],
};

const config = { effort: "medium" as const, baseUrl: "https://chatgpt.com/backend-api" };

const originalFetch = global.fetch;

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const chunks = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

beforeEach(() => {
  mockResolve.mockReset();
  mockResolve.mockResolvedValue({
    source: "oauth",
    authHeader: { Authorization: "Bearer tok", "chatgpt-account-id": "acct-1" },
    credential: { kind: "oauth", provider: "openai-codex" },
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("callOpenAICodex", () => {
  it("POSTs to /codex/responses with the Codex CLI headers and parses the SSE response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream([
        {
          type: "response.output_item.done",
          item: { type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] },
        },
        { type: "response.completed", response: { status: "completed", model: "gpt-5.5" } },
      ]),
      headers: new Headers(),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await callOpenAICodex(opts, "gpt-5.5", config);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["chatgpt-account-id"]).toBe("acct-1");
    expect(init.headers["OpenAI-Beta"]).toBe("responses=experimental");
    expect(init.headers.originator).toBe("ggcoder");
    expect(init.headers["User-Agent"]).toMatch(/^ggcoder/);
    // gg-framework pins the prompt-cache scope on both headers.
    expect(init.headers.session_id).toBe("ggcoder");
    expect(init.headers["x-client-request-id"]).toBe("ggcoder");

    expect(res.source).toBe("oauth");
    expect(res.message.content).toEqual([{ type: "text", text: "ok" }]);
    expect(res.providerModel).toBe("gpt-5.5");
  });

  it("throws HttpError on a non-OK response (engages the fallback chain)", async () => {
    // 400 is non-retryable, so withRetry surfaces it immediately (no backoff
    // sleeps) — keeps the test fast while still proving HttpError propagation.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
      headers: new Headers(),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(callOpenAICodex(opts, "gpt-5.5", config)).rejects.toBeInstanceOf(HttpError);
  });
});
