/**
 * Codex (ChatGPT subscription) Responses adapter.
 *
 * Resolves the `openai-codex` OAuth credential (no API-key path exists for
 * this provider — it's OAuth-only), builds the Codex Responses request body
 * with the per-model reasoning effort, sends the Codex CLI header set, POSTs
 * to chatgpt.com/backend-api/codex/responses, consumes the SSE stream to
 * completion, and assembles a single LLMResponse.
 *
 * Header + body shape lifted verbatim from gg-framework's `streamOpenAICodex`:
 *   - Authorization: Bearer <access_token>
 *   - chatgpt-account-id: <id from JWT claims>   (from the resolver)
 *   - OpenAI-Beta: responses=experimental
 *   - originator: ggcoder
 *   - User-Agent: ggcoder (<os> <release>; <arch>)
 *   - session_id + x-client-request-id pinned to the prompt cache scope so
 *     consecutive requests hit the same Codex cache shard
 *   - Content-Type: application/json, Accept: text/event-stream
 * The system prompt is the top-level `instructions` string (set by to-codex.ts).
 *
 * Any non-OK response throws HttpError so the callLLM fallback chain engages.
 */

import os from "node:os";
import { resolveCredential } from "../auth/resolver";
import { withRetry, HttpError } from "../retry";
import { toCodex } from "../transformers/to-codex";
import { fromCodex, type CodexEvent } from "../transformers/from-codex";
import type { CallLLMOptions, LLMResponse } from "../types";
import type { CodexEffort } from "../registry";

/** Originator gg-framework sends. Kept identical so traffic matches ggcoder. */
const CODEX_ORIGINATOR = "ggcoder";

/** User-Agent built the same way gg-framework does: `ggcoder (<os>...)`. */
function codexUserAgent(): string {
  try {
    return `ggcoder (${os.platform()} ${os.release()}; ${os.arch()})`;
  } catch {
    return "ggcoder";
  }
}

/** Prompt-cache scope key. gg-framework defaults this to "ggcoder" and pins it
 *  on both the body `prompt_cache_key` and the session_id/x-client-request-id
 *  headers so the Codex backend routes to the same cache shard. */
const CODEX_CACHE_SCOPE = "ggcoder";

const CODEX_RESPONSES_PATH = "/codex/responses";

/**
 * Parse a Codex SSE stream body to a flat list of JSON events. Reads the
 * stream to completion (the agent loop sees a single response, not a stream).
 */
async function parseCodexSSE(body: ReadableStream<Uint8Array>): Promise<CodexEvent[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: CodexEvent[] = [];
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = chunk
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n")
          .trim();
        if (data && data !== "[DONE]") {
          try {
            events.push(JSON.parse(data) as CodexEvent);
          } catch {
            // Ignore malformed SSE chunks; a terminal event still drives the result.
          }
        }
        idx = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* best effort */
    }
  }
  return events;
}

export async function callOpenAICodex(
  opts: CallLLMOptions,
  providerModel: string,
  config: { effort: CodexEffort; baseUrl: string },
): Promise<LLMResponse> {
  const auth = await resolveCredential("openai-codex");
  const body = toCodex(opts, providerModel, { effort: config.effort });
  // Pin the prompt cache scope on the body (gg-framework also sets this).
  body.prompt_cache_key = CODEX_CACHE_SCOPE;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "OpenAI-Beta": "responses=experimental",
    originator: CODEX_ORIGINATOR,
    "User-Agent": codexUserAgent(),
    // The chatgpt.com codex backend routes prompt-cache lookups by header, not
    // body — pinning both makes consecutive requests hit the same cache shard.
    session_id: CODEX_CACHE_SCOPE,
    "x-client-request-id": CODEX_CACHE_SCOPE,
    ...auth.authHeader,
  };

  const url = `${config.baseUrl.replace(/\/+$/, "")}${CODEX_RESPONSES_PATH}`;

  const events = await withRetry(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new HttpError(res.status, await res.text(), { headers: res.headers });
    }
    if (!res.body) {
      throw new HttpError(502, "Codex response had no body", { headers: res.headers });
    }
    return parseCodexSSE(res.body);
  });

  return fromCodex(events, opts.model, auth.source);
}
