/**
 * callXaiGrok adapter: mocks the resolver + fetch and asserts the request hits
 * the grok-cli proxy Responses endpoint with the required headers, sends a
 * non-streaming body, parses a Responses JSON document into a canonical
 * LLMResponse, and throws HttpError on a non-OK response so the callLLM
 * fallback chain engages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockResolve = vi.fn();
vi.mock("@/lib/agents/_shared/llm/auth/resolver", () => ({
  resolveCredential: (...args: unknown[]) => mockResolve(...args),
}));

import { callXaiGrok } from "@/lib/agents/_shared/llm/providers/xai-grok";
import { HttpError } from "@/lib/agents/_shared/llm/retry";
import type { CallLLMOptions } from "@/lib/agents/_shared/llm/types";

const opts: CallLLMOptions = {
  model: "grok-build",
  system: "You are OptiMate.",
  messages: [{ role: "user", content: [{ type: "text", text: "Reply ok" }] }],
};

const config = { baseUrl: "https://cli-chat-proxy.grok.com/v1", clientVersion: "0.2.51" };

const originalFetch = global.fetch;

beforeEach(() => {
  mockResolve.mockReset();
  mockResolve.mockResolvedValue({
    source: "oauth",
    authHeader: { Authorization: "Bearer tok" },
    credential: { kind: "oauth", provider: "xai-grok" },
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("callXaiGrok", () => {
  it("POSTs to /responses with the grok-cli headers, non-streaming, and parses the JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: "grok-build",
        status: "completed",
        output: [
          { type: "reasoning", summary: [{ type: "summary_text", text: "thinking" }] },
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "ok" }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 4 } },
      }),
      headers: new Headers(),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await callXaiGrok(opts, "grok-build", config);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cli-chat-proxy.grok.com/v1/responses");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["X-XAI-Token-Auth"]).toBe("xai-grok-cli");
    expect(init.headers["x-grok-client-version"]).toBe("0.2.51");
    expect(init.headers["x-grok-model-override"]).toBe("grok-build");

    const body = JSON.parse(init.body);
    expect(body.stream).toBe(false);
    expect(body.model).toBe("grok-build");

    expect(res.source).toBe("oauth");
    expect(res.message.content).toEqual([{ type: "text", text: "ok" }]);
    expect(res.providerModel).toBe("grok-build");
    // cached tokens subtracted from input, surfaced as cacheReadTokens.
    expect(res.usage).toEqual({ inputTokens: 6, outputTokens: 2, cacheReadTokens: 4 });
    expect(res.stopReason).toBe("end_turn");
  });

  it("maps a function_call item to a tool_use and tool_use stop reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: "grok-build",
        status: "completed",
        output: [
          {
            type: "function_call",
            call_id: "fc_123",
            name: "get_weather",
            arguments: '{"city":"Sydney"}',
          },
        ],
      }),
      headers: new Headers(),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await callXaiGrok(opts, "grok-build", config);
    expect(res.stopReason).toBe("tool_use");
    expect(res.message.content[0]).toMatchObject({
      type: "tool_use",
      name: "get_weather",
      input: { city: "Sydney" },
    });
  });

  it("throws HttpError on a non-OK response (engages the fallback chain)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
      headers: new Headers(),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(callXaiGrok(opts, "grok-build", config)).rejects.toBeInstanceOf(HttpError);
  });
});
