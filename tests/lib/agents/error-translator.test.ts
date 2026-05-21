/**
 * Tests for the agent error translator.
 *
 * Locks in: when a known provider/agent-loop failure happens, we surface
 * a plain-English message the chat UI can render as a regular assistant
 * turn instead of letting it bubble up as a generic toast.
 *
 * The canonical case is the unpaired tool_use 400 \u2014 the literal error
 * string that caused today's "I'll push to Gmail" silent failure.
 */

import { describe, it, expect } from "vitest";
import { translateAgentError } from "@/lib/agents/optimate-google-ads/error-translator";
import { HttpError } from "@/lib/agents/_shared/llm/retry";
import { MAX_TOKENS_TRUNCATION_MARKER } from "@/lib/agents/_shared/base-agent";

describe("translateAgentError", () => {
  it("recognises the unpaired-tool-use 400 (the literal error from the chat log)", () => {
    const body =
      '{"type":"error","error":{"type":"invalid_request_error","message":"messages.12: `tool_use` ids were found without `tool_result` blocks immediately after: toolu_01TgXZwBG2seWV5j5xECRK54. Each `tool_use` block must..."}}';
    const err = new HttpError(400, body);
    const t = translateAgentError(err);
    expect(t).not.toBeNull();
    expect(t!.kind).toBe("unpaired_tool_use");
    expect(t!.userMessage).toMatch(/tool-call pairing/i);
    expect(t!.userMessage).toMatch(/break it into smaller steps/i);
  });

  it("recognises the context-overflow 400 separately from unpaired-tool-use", () => {
    const err = new HttpError(
      400,
      '{"error":{"message":"prompt is too long: 220000 tokens > 200000 maximum"}}',
    );
    const t = translateAgentError(err);
    expect(t).not.toBeNull();
    expect(t!.kind).toBe("context_overflow");
    expect(t!.userMessage).toMatch(/conversation has grown/i);
  });

  it("recognises 429 as rate-limited (not overloaded)", () => {
    const err = new HttpError(429, '{"message":"Too many requests"}');
    const t = translateAgentError(err);
    expect(t!.kind).toBe("anthropic_rate_limited");
    expect(t!.userMessage).toMatch(/rate-limiting/i);
  });

  it("recognises 529 as overloaded (Anthropic's overload code)", () => {
    const err = new HttpError(529, '{"message":"overloaded"}');
    const t = translateAgentError(err);
    expect(t!.kind).toBe("anthropic_overloaded");
  });

  it("recognises 401 / 403 as auth failure", () => {
    expect(translateAgentError(new HttpError(401, ""))!.kind).toBe("auth_failure");
    expect(translateAgentError(new HttpError(403, ""))!.kind).toBe("auth_failure");
  });

  it("recognises gmail-not-connected from a plain Error message", () => {
    const t = translateAgentError(new Error("gmail-not-connected"));
    expect(t!.kind).toBe("gmail_not_connected");
    expect(t!.userMessage).toMatch(/Connect Gmail/i);
  });

  it("recognises the max_tokens truncation marker if it leaks up as an Error", () => {
    const t = translateAgentError(new Error(`run failed: ${MAX_TOKENS_TRUNCATION_MARKER}`));
    expect(t!.kind).toBe("max_tokens_truncation");
    expect(t!.userMessage).toBe(MAX_TOKENS_TRUNCATION_MARKER);
  });

  it("recognises a tool timeout error string", () => {
    expect(translateAgentError(new Error("scrapling call timed out"))!.kind).toBe(
      "tool_timeout",
    );
    expect(translateAgentError(new Error("ETIMEDOUT"))!.kind).toBe("tool_timeout");
  });

  it("returns null for unknown errors so they stay loud in logs", () => {
    expect(translateAgentError(new Error("something totally novel"))).toBeNull();
    expect(translateAgentError(new HttpError(500, "internal error"))).toBeNull();
    expect(translateAgentError(null)).toBeNull();
    expect(translateAgentError(undefined)).toBeNull();
  });

  it("order matters: a 400 with both tool_use and context wording matches tool_use first", () => {
    // Defensive: if Anthropic ever returns a body containing both pattern
    // hints, we want the more specific tool-pairing kind to win because
    // it's the actionable one.
    const err = new HttpError(
      400,
      "tool_use ids were found without tool_result blocks immediately after: toolu_x. prompt context max_tokens exceeded",
    );
    expect(translateAgentError(err)!.kind).toBe("unpaired_tool_use");
  });
});
