import { describe, expect, it } from "vitest";
import { toAnthropic } from "../src/lib/agents/_shared/llm/transformers/to-anthropic";
import type { CallLLMOptions } from "../src/lib/agents/_shared/llm/types";

const baseOptions = (overrides: Partial<CallLLMOptions> = {}): CallLLMOptions => ({
  model: "claude-opus-4-8",
  system: "You are OptiMate.",
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  ...overrides,
});

describe("Anthropic transformers", () => {
  it("omits temperature for native Claude models that reject it", () => {
    const body = toAnthropic(
      baseOptions({ temperature: 0.3 }),
      "claude-opus-4-8",
      true,
    );

    expect(body.temperature).toBeUndefined();
  });

  it("keeps temperature for Anthropic-compatible non-Claude providers", () => {
    const body = toAnthropic(
      baseOptions({ model: "minimax-m3", temperature: 0.3 }),
      "MiniMax-M3",
      false,
    );

    expect(body.temperature).toBe(0.3);
  });
});
