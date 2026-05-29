import { toCodex } from "@/lib/agents/_shared/llm/transformers/to-codex";
import type { CallLLMOptions } from "@/lib/agents/_shared/llm/types";

function baseOpts(overrides: Partial<CallLLMOptions> = {}): CallLLMOptions {
  return {
    model: "gpt-5.5-codex-medium",
    messages: [{ role: "user", content: [{ type: "text", text: "ok" }] }],
    ...overrides,
  };
}

const config = { effort: "medium" as const };

describe("toCodex instructions field", () => {
  it("uses the caller's system prompt when provided", () => {
    const body = toCodex(baseOpts({ system: "You are Optimate." }), "gpt-5.5", config);
    expect(body.instructions).toBe("You are Optimate.");
  });

  it("falls back to a non-empty instruction when no system prompt is given", () => {
    // The Codex Responses endpoint 400s on an empty/absent instructions field
    // ({"detail":"Instructions are required"}) — the probe hits this path.
    const body = toCodex(baseOpts(), "gpt-5.5", config);
    expect(typeof body.instructions).toBe("string");
    expect(body.instructions.trim().length).toBeGreaterThan(0);
  });

  it("falls back when system is empty/whitespace", () => {
    const body = toCodex(baseOpts({ system: "   " }), "gpt-5.5", config);
    expect(body.instructions.trim().length).toBeGreaterThan(0);
  });
});
