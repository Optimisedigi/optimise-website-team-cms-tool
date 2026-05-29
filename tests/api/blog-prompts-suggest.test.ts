import { describe, expect, it } from "vitest";
import {
  extractJson,
  extractJsonFromReply,
} from "@/app/(frontend)/api/blog-prompts/suggest/route";

describe("blog-prompts/suggest JSON extraction", () => {
  it("parses a bare JSON object", () => {
    const out = extractJson('{"titleIdea":"x"}') as Record<string, unknown>;
    expect(out.titleIdea).toBe("x");
  });

  it("parses JSON inside a ```json fence", () => {
    const reply = 'Sure!\n```json\n{"tag":"seo"}\n```\nDone.';
    const out = extractJson(reply) as Record<string, unknown>;
    expect(out.tag).toBe("seo");
  });

  it("parses JSON wrapped in prose by taking first { to last }", () => {
    const reply = 'Here is the brief: {"mainPoint":"do x"} hope that helps';
    const out = extractJson(reply) as Record<string, unknown>;
    expect(out.mainPoint).toBe("do x");
  });

  it("throws when there is no JSON object", () => {
    expect(() => extractJson("I could not produce a brief.")).toThrow();
  });

  it("throws on empty visible content with no reasoning", () => {
    expect(() => extractJsonFromReply("", undefined)).toThrow();
  });

  it("falls back to reasoning content when visible content is empty", () => {
    // Reproduces the production bug: thinking models (kimi-k2.6) burn the token
    // budget on reasoning and leave visible content empty, but the JSON answer
    // is present in the reasoning channel.
    const reasoning = 'Let me think... the answer is {"titleIdea":"from reasoning"}';
    const out = extractJsonFromReply("", reasoning) as Record<string, unknown>;
    expect(out.titleIdea).toBe("from reasoning");
  });

  it("prefers visible content over reasoning when both have JSON", () => {
    const out = extractJsonFromReply(
      '{"tag":"visible"}',
      '{"tag":"reasoning"}',
    ) as Record<string, unknown>;
    expect(out.tag).toBe("visible");
  });
});
