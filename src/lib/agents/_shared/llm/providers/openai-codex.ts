/**
 * Codex (ChatGPT subscription) Responses adapter.
 *
 * Resolves the `openai-codex` OAuth credential (no API-key path exists for
 * this provider — it's OAuth-only), builds the Codex Responses request body
 * with the per-model reasoning effort, sends the Codex CLI header set, POSTs
 * to chatgpt.com/backend-api/codex/responses, consumes the SSE stream to
 * completion, and assembles a single LLMResponse.
 *
 * Requests have to look like real Codex CLI traffic or the auth gate rejects
 * them. The required shape (verified: litellm, nanobot, opencode, pi-mono):
 *   - Authorization: Bearer <access_token>
 *   - chatgpt-account-id: <id from JWT claims>   (from the resolver)
 *   - OpenAI-Beta: responses=experimental
 *   - originator: codex_cli_rs
 *   - User-Agent: codex_cli_rs/<version>
 *   - Content-Type: application/json, Accept: text/event-stream
 * plus the mandatory `instructions` Codex prompt prefix (set by to-codex.ts).
 *
 * Any non-OK response throws HttpError so the callLLM fallback chain engages.
 */

import { resolveCredential } from "../auth/resolver";
import { withRetry, HttpError } from "../retry";
import { toCodex } from "../transformers/to-codex";
import { fromCodex, type CodexEvent } from "../transformers/from-codex";
import type { CallLLMOptions, LLMResponse } from "../types";
import type { CodexEffort } from "../registry";

/** Codex CLI originator + user-agent. Mirrored so traffic isn't obviously
 *  third-party. The Rust CLI sends `codex_cli_rs/<semver>`. */
const CODEX_ORIGINATOR = "codex_cli_rs";
const CODEX_USER_AGENT = "codex_cli_rs/0.0.0";

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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "OpenAI-Beta": "responses=experimental",
    originator: CODEX_ORIGINATOR,
    "User-Agent": CODEX_USER_AGENT,
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
