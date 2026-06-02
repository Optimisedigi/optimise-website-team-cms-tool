/**
 * to-codex transformer: canonical CallLLMOptions -> Codex Responses body.
 *
 * Matches gg-framework's streamOpenAICodex shape: the caller's system prompt is
 * the top-level `instructions` string (no Codex sentinel, no developer-role
 * message); messages map to Responses input items; tool_use IDs are remapped to
 * the `fc_` prefix; tools map to Responses function tools with strict:null;
 * body carries store:false/stream:true/tool_choice:auto/parallel_tool_calls:true/
 * include:["reasoning.encrypted_content"] and reasoning:{ effort, summary:"auto" }.
 */

import { describe, it, expect } from "vitest";
import { toCodex } from "@/lib/agents/_shared/llm/transformers/to-codex";
import type { CallLLMOptions } from "@/lib/agents/_shared/llm/types";

const opts: CallLLMOptions = {
  model: "gpt-5.5-codex",
  system: "You are OptiMate, a Google Ads expert.",
  messages: [
    { role: "user", content: [{ type: "text", text: "Audit campaign X." }] },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Running the audit." },
        { type: "tool_use", id: "toolu_1", name: "run_audit", input: { campaign: "X" } },
      ],
    },
    {
      role: "tool",
      content: [{ type: "tool_result", toolUseId: "toolu_1", content: "audit done" }],
    },
  ],
  tools: [
    { name: "run_audit", description: "Run an audit", inputSchema: { type: "object", properties: {} } },
  ],
};

describe("toCodex", () => {
  it("sets instructions to the caller's system prompt (no Codex sentinel)", () => {
    const body = toCodex(opts, "gpt-5.5", { reasoningMode: "medium" });
    expect(body.instructions).toBe("You are OptiMate, a Google Ads expert.");
  });

  it("does NOT emit a developer-role message", () => {
    const body = toCodex(opts, "gpt-5.5", { reasoningMode: "medium" });
    const hasDeveloper = body.input.some(
      (i) => "role" in i && (i as { role?: string }).role === "developer",
    );
    expect(hasDeveloper).toBe(false);
  });

  it("maps user text to a user input_text message", () => {
    const body = toCodex(opts, "gpt-5.5", { reasoningMode: "medium" });
    const userMsg = body.input.find((i) => "role" in i && i.role === "user");
    expect(userMsg).toMatchObject({
      role: "user",
      content: [{ type: "input_text", text: "Audit campaign X." }],
    });
  });

  it("maps assistant text to output_text with status completed", () => {
    const body = toCodex(opts, "gpt-5.5", { reasoningMode: "medium" });
    const asstMsg = body.input.find(
      (i) => "type" in i && i.type === "message" && (i as { role?: string }).role === "assistant",
    );
    expect(asstMsg).toMatchObject({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Running the audit.", annotations: [] }],
      status: "completed",
    });
  });

  it("remaps tool_use ids to the fc_ prefix on the function_call", () => {
    const body = toCodex(opts, "gpt-5.5", { reasoningMode: "medium" });
    const fnCall = body.input.find((i) => "type" in i && i.type === "function_call");
    expect(fnCall).toEqual({
      type: "function_call",
      id: "fc_1",
      call_id: "fc_1",
      name: "run_audit",
      arguments: JSON.stringify({ campaign: "X" }),
    });
  });

  it("remaps the matching tool_result call_id deterministically (same fc_ id)", () => {
    const body = toCodex(opts, "gpt-5.5", { reasoningMode: "medium" });
    const out = body.input.find((i) => "type" in i && i.type === "function_call_output");
    expect(out).toEqual({ type: "function_call_output", call_id: "fc_1", output: "audit done" });
  });

  it("maps tools to Responses function tools with strict:null", () => {
    const body = toCodex(opts, "gpt-5.5", { reasoningMode: "medium" });
    expect(body.tools).toEqual([
      {
        type: "function",
        name: "run_audit",
        description: "Run an audit",
        parameters: { type: "object", properties: {} },
        strict: null,
      },
    ]);
    expect(body.tool_choice).toBe("auto");
    expect(body.parallel_tool_calls).toBe(true);
  });

  it("sets reasoning effort + summary, and the reasoning include", () => {
    const body = toCodex(opts, "gpt-5.5", { reasoningMode: "medium" });
    expect(body.reasoning).toEqual({ effort: "medium", summary: "auto" });
    expect(body.include).toEqual(["reasoning.encrypted_content"]);
    expect(toCodex(opts, "gpt-5.5", { reasoningMode: "low" }).reasoning).toEqual({
      effort: "low",
      summary: "auto",
    });
  });

  it("always sends store:false and stream:true, never temperature", () => {
    const body = toCodex({ ...opts, temperature: 0.7 }, "gpt-5.5", { reasoningMode: "low" });
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
    expect("temperature" in body).toBe(false);
  });

  it("maps image parts to Responses input_image parts", () => {
    const withImage: CallLLMOptions = {
      model: "gpt-5.5-codex",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mediaType: "image/png", data: "base64data" },
            { type: "text", text: "Read this screenshot." },
          ],
        },
      ],
    };
    const body = toCodex(withImage, "gpt-5.5", { reasoningMode: "off" });
    expect(body.input[0]).toMatchObject({
      role: "user",
      content: [
        { type: "input_image", image_url: "data:image/png;base64,base64data" },
        { type: "input_text", text: "Read this screenshot." },
      ],
    });
  });
});
