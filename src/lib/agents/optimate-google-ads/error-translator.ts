/**
 * Translate agent-loop and provider failures into a plain-English message
 * the user can read in the chat itself.
 *
 * Why: previously a 400 from Anthropic (e.g. "tool_use ids were found
 * without tool_result blocks immediately after") bubbled up as a generic
 * "Failed to process chat request" toast that vanished after a few
 * seconds. The user saw the model say "I'll push to Gmail", then nothing.
 * They had to dig into the network tab or production logs to know what
 * happened.
 *
 * Now the chat route calls this translator. If it recognises the failure
 * mode, it returns a `userMessage` string that the route surfaces as a
 * normal assistant turn (HTTP 200, `reply` field set). The user sees the
 * explanation in-context, can read it, and knows what to do next.
 *
 * The translator is intentionally tight: it ONLY catches known failure
 * modes by pattern-matching the error message string. Unrecognised
 * errors return null so the route falls through to its existing
 * "something broke" path. This keeps unexpected errors loud (visible
 * in logs as 500s) while routine failures become legible to the user.
 */

import { HttpError } from "../_shared/llm/retry";
import { MAX_TOKENS_TRUNCATION_MARKER } from "../_shared/base-agent";

/**
 * Stable identifiers for telemetry. Add a new kind whenever you add a
 * new pattern below so dashboards and tests can match on it.
 */
export type AgentErrorKind =
  | "unpaired_tool_use"
  | "max_tokens_truncation"
  | "context_overflow"
  | "anthropic_overloaded"
  | "anthropic_rate_limited"
  | "auth_failure"
  | "gmail_not_connected"
  | "tool_timeout";

export interface TranslatedAgentError {
  kind: AgentErrorKind;
  /** What we render in the chat as the assistant's reply. */
  userMessage: string;
}

/**
 * Pattern-match the error and return a user-facing message, or null if
 * we don't recognise it (caller should fall back to its generic error
 * path so the failure stays loud in logs).
 *
 * Order matters: more specific matches first. The unpaired-tool-use 400
 * has to be caught before the generic invalid_request 400 because both
 * have status === 400.
 */
export function translateAgentError(err: unknown): TranslatedAgentError | null {
  if (err instanceof HttpError) {
    const body = err.bodyText ?? "";

    // The specific 400 we shipped this whole change to fix. If it still
    // shows up after the base-agent strip + the orchestrator scrub, we
    // want the user to see it as a clear, actionable message rather
    // than a generic toast. Anthropic wraps tool_use / tool_result in
    // backticks in the error body (e.g. "`tool_use` ids were found
    // without `tool_result` blocks immediately after"), so the pattern
    // tolerates optional backticks around the identifiers.
    if (err.status === 400 && /`?tool_use`?\s+ids\s+were\s+found\s+without\s+`?tool_result`?/i.test(body)) {
      return {
        kind: "unpaired_tool_use",
        userMessage:
          "I hit a tool-call pairing error mid-turn and had to abort. " +
          "This usually means I ran out of output room while calling a tool. " +
          "Please ask the same question again, or break it into smaller steps.",
      };
    }

    if (err.status === 400 && /context|max.?tokens|too.?long|prompt.*length/i.test(body)) {
      return {
        kind: "context_overflow",
        userMessage:
          "This conversation has grown past what the model can hold in one request. " +
          "Start a fresh chat (the History button keeps the old thread), or trim the attached email if you added one.",
      };
    }

    if (err.status === 429) {
      return {
        kind: "anthropic_rate_limited",
        userMessage:
          "The model provider is rate-limiting us right now. " +
          "Wait 30 seconds and try again, or switch model from the picker.",
      };
    }

    if (err.status === 529) {
      return {
        kind: "anthropic_overloaded",
        userMessage:
          "The model provider is overloaded right now. " +
          "Wait a moment and try again, or switch model from the picker.",
      };
    }

    if (err.status === 401 || err.status === 403) {
      return {
        kind: "auth_failure",
        userMessage:
          "I lost authentication to the model provider. " +
          "Reconnect in OptiMate Settings → Auth and try again.",
      };
    }
  }

  // Non-HttpError but still recognisable string patterns.
  const message = err instanceof Error ? err.message : String(err);

  if (/gmail.?not.?connected|gmail-not-connected|gmail auth/i.test(message)) {
    return {
      kind: "gmail_not_connected",
      userMessage:
        "I need Gmail access to do that. " +
        "Connect Gmail from OptiMate Settings → Auth and try again.",
    };
  }

  // Caller already substituted this marker when a max_tokens-truncated
  // tool_use leaked through; if that text reaches us as an Error message
  // somehow (defensive), surface it cleanly.
  if (message.includes(MAX_TOKENS_TRUNCATION_MARKER)) {
    return {
      kind: "max_tokens_truncation",
      userMessage: MAX_TOKENS_TRUNCATION_MARKER,
    };
  }

  if (/timed?\s?out|timeout|ETIMEDOUT/i.test(message)) {
    return {
      kind: "tool_timeout",
      userMessage:
        "A tool call timed out. The downstream service may be slow; try again in a moment.",
    };
  }

  return null;
}
