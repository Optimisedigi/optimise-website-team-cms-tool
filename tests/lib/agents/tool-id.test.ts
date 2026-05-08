import { sanitizeToolUseId } from "@/lib/agents/_shared/llm/transformers/_tool-id";

describe("sanitizeToolUseId", () => {
  // Anthropic Messages API rejects tool_use.id values that don't match
  // ^[a-zA-Z0-9_-]+$. The sanitiser is the only thing standing between
  // OpenAI-compatible provider IDs (which often contain `.`, `:` etc.) and
  // a user-facing 400 when the conversation later switches to Claude.
  const ANTHROPIC_PATTERN = /^[a-zA-Z0-9_-]+$/;

  it("passes through ids that already match Anthropic's pattern", () => {
    expect(sanitizeToolUseId("tool_abc123")).toBe("tool_abc123");
    expect(sanitizeToolUseId("toolu_01ABC")).toBe("toolu_01ABC");
    expect(sanitizeToolUseId("call-xyz-789")).toBe("call-xyz-789");
  });

  it("replaces dots (the most common Kimi/MiniMax case) with underscores", () => {
    expect(sanitizeToolUseId("chatcmpl-tool-abc.0")).toBe("chatcmpl-tool-abc_0");
  });

  it("replaces colons, slashes and other punctuation with underscores", () => {
    expect(sanitizeToolUseId("call:abc/xyz")).toBe("call_abc_xyz");
  });

  it("returns Anthropic-pattern-matching output for every realistic input", () => {
    const samples = [
      "chatcmpl-tool-abc.0",
      "call:foo/bar",
      "tool@hash#1",
      "weird id with spaces",
      "toolu_01ABC",
    ];
    for (const s of samples) {
      expect(sanitizeToolUseId(s)).toMatch(ANTHROPIC_PATTERN);
    }
  });

  it("is deterministic — same input maps to same output (so tool_use ↔ tool_result still pair)", () => {
    expect(sanitizeToolUseId("chatcmpl-tool-abc.0")).toBe(sanitizeToolUseId("chatcmpl-tool-abc.0"));
  });

  it("falls back to a non-empty placeholder for empty / pathological input", () => {
    expect(sanitizeToolUseId("")).toMatch(ANTHROPIC_PATTERN);
    expect(sanitizeToolUseId("...")).toMatch(ANTHROPIC_PATTERN);
  });
});
