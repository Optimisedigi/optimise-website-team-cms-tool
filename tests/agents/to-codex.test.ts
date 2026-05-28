/**
 * to-codex transformer: canonical CallLLMOptions -> Codex Responses body.
 *
 * Asserts the mandatory Codex instructions prefix is present and begins with
 * the Codex sentinel; the caller's system prompt is appended as a leading
 * developer-role input message; tool defs map to Responses function tools;
 * messages map to Responses input items (user/assistant text, tool_use ->
 * function_call, tool_result -> function_call_output); and reasoning effort is
 * set from the per-model config.
 */

import { describe, it, expect } from "vitest";
import {
  toCodex,
  CODEX_INSTRUCTIONS_PREFIX,
  UnsupportedCodexImageInputError,
} from "@/lib/agents/_shared/llm/transformers/to-codex";
import type { CallLLMOptions } from "@/lib/agents/_shared/llm/types";

const opts: CallLLMOptions = {
  model: "gpt-5.5-codex-medium",
  system: "You are OptiMate, a Google Ads expert.",
  messages: [
    { role: "user", content: [{ type: "text", text: "Audit campaign X." }] },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Running the audit." },
        { type: "tool_use", id: "call_1", name: "run_audit", input: { campaign: "X" } },
      ],
    },
    {
      role: "tool",
      content: [{ type: "tool_result", toolUseId: "call_1", content: "audit done" }],
    },
  ],
  tools: [
    { name: "run_audit", description: "Run an audit", inputSchema: { type: "object", properties: {} } },
  ],
};

describe("toCodex", () => {
  it("sets instructions to the canonical Codex prefix", () => {
    const body = toCodex(opts, "gpt-5.5", { effort: "medium" });
    expect(body.instructions).toBe(CODEX_INSTRUCTIONS_PREFIX);
    expect(body.instructions.startsWith("You are Codex, based on GPT-5.")).toBe(true);
  });

  it("puts the caller system prompt as a leading developer message", () => {
    const body = toCodex(opts, "gpt-5.5", { effort: "medium" });
    const first = body.input[0];
    expect(first.type).toBe("message");
    if (first.type === "message") {
      expect(first.role).toBe("developer");
      expect(first.content[0]).toEqual({
        type: "input_text",
        text: "You are OptiMate, a Google Ads expert.",
      });
    }
  });

  it("maps user text to a user input_text message", () => {
    const body = toCodex(opts, "gpt-5.5", { effort: "medium" });
    const userMsg = body.input.find(
      (i) => i.type === "message" && i.role === "user",
    );
    expect(userMsg).toBeDefined();
    if (userMsg && userMsg.type === "message") {
      expect(userMsg.content[0]).toEqual({ type: "input_text", text: "Audit campaign X." });
    }
  });

  it("maps assistant text to output_text and tool_use to function_call", () => {
    const body = toCodex(opts, "gpt-5.5", { effort: "medium" });
    const asstMsg = body.input.find(
      (i) => i.type === "message" && i.role === "assistant",
    );
    expect(asstMsg).toBeDefined();
    if (asstMsg && asstMsg.type === "message") {
      expect(asstMsg.content[0]).toEqual({
        type: "output_text",
        text: "Running the audit.",
        annotations: [],
      });
    }
    const fnCall = body.input.find((i) => i.type === "function_call");
    expect(fnCall).toEqual({
      type: "function_call",
      call_id: "call_1",
      name: "run_audit",
      arguments: JSON.stringify({ campaign: "X" }),
    });
  });

  it("maps tool_result to function_call_output", () => {
    const body = toCodex(opts, "gpt-5.5", { effort: "medium" });
    const out = body.input.find((i) => i.type === "function_call_output");
    expect(out).toEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: "audit done",
    });
  });

  it("maps tools to Responses function tools and sets tool_choice", () => {
    const body = toCodex(opts, "gpt-5.5", { effort: "medium" });
    expect(body.tools).toEqual([
      {
        type: "function",
        name: "run_audit",
        description: "Run an audit",
        parameters: { type: "object", properties: {} },
        strict: false,
      },
    ]);
    expect(body.tool_choice).toBe("auto");
    expect(body.parallel_tool_calls).toBe(true);
  });

  it("sets reasoning effort from the per-model config", () => {
    expect(toCodex(opts, "gpt-5.5", { effort: "medium" }).reasoning).toEqual({ effort: "medium" });
    expect(toCodex(opts, "gpt-5.5", { effort: "low" }).reasoning).toEqual({ effort: "low" });
  });

  it("always sends store:false and stream:true", () => {
    const body = toCodex(opts, "gpt-5.5", { effort: "low" });
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
  });

  it("throws UnsupportedCodexImageInputError on image parts", () => {
    const withImage: CallLLMOptions = {
      model: "gpt-5.5-codex-medium",
      messages: [
        {
          role: "user",
          content: [{ type: "image", mediaType: "image/png", data: "base64data" }],
        },
      ],
    };
    expect(() => toCodex(withImage, "gpt-5.5", { effort: "medium" })).toThrow(
      UnsupportedCodexImageInputError,
    );
  });
});
