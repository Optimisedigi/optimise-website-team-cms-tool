import { toOpenAI } from "@/lib/agents/_shared/llm/transformers/to-openai";
import type { CallLLMOptions } from "@/lib/agents/_shared/llm/types";

function baseOpts(overrides: Partial<CallLLMOptions> = {}): CallLLMOptions {
  return {
    model: "test",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    ...overrides,
  };
}

describe("toOpenAI temperature handling", () => {
  it("forwards temperature for standard chat models", () => {
    const body = toOpenAI(baseOpts({ temperature: 0.7 }), "kimi-k2.6");
    expect(body.temperature).toBe(0.7);
  });

  it("drops temperature for gpt-5-class models that only allow the default", () => {
    const body = toOpenAI(baseOpts({ temperature: 0.7 }), "gpt-5.5");
    expect(body.temperature).toBeUndefined();
  });

  it("drops temperature for o-series reasoning models", () => {
    for (const model of ["o1", "o3-mini", "o4-mini"]) {
      const body = toOpenAI(baseOpts({ temperature: 0.2 }), model);
      expect(body.temperature, `model ${model}`).toBeUndefined();
    }
  });

  it("omits temperature entirely when none is requested", () => {
    const body = toOpenAI(baseOpts(), "gpt-4.1");
    expect(body.temperature).toBeUndefined();
  });

  it("still forwards temperature for gpt-4-class models", () => {
    const body = toOpenAI(baseOpts({ temperature: 0.3 }), "gpt-4.1");
    expect(body.temperature).toBe(0.3);
  });
});
