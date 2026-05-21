/**
 * Base agent loop. Calls callLLM(), executes any tool_use parts, appends
 * tool_result messages, repeats until the model returns end_turn or the
 * hard cap is hit. Logs each step to the activity-log collection.
 *
 * Reliability patterns kept (subset of gg-coder's full set, per the build plan):
 *   - Hard cap on turns (default 20) to avoid runaway loops
 *   - Tool pairing repair: if a tool_use was emitted but execute() throws,
 *     append a synthetic tool_result with isError=true so the next call
 *     doesn't break Anthropic's pairing constraint
 *   - Provider failover handled inside callLLM via fallbackModels
 *
 * Patterns deliberately omitted (not relevant for the CMS use case):
 *   - Streaming (transactional batch responses, not interactive)
 *   - Sub-agent recursion (agent-to-agent is just a function call here)
 *   - Plan mode, session DAGs, multi-turn memory across runs
 */

import { callLLM } from "./llm";
import { toToolDef, type CanonicalTool, type ToolContext } from "./tool";
import { logAgentStep } from "./activity-log";
import { recordAuthEvent } from "./llm/auth/events";
import { MODEL_REGISTRY, type CanonicalModelName } from "./llm/registry";
import type { AgentRunOptions, AgentRunResult, AgentStep } from "./types";
import type { ContentPart, Message, Usage } from "./llm/types";

const DEFAULT_MAX_TURNS = 20;

/**
 * Hard ceiling on the auto-expanded max_tokens budget when we retry a
 * truncated tool-use turn. We double the original budget each truncation,
 * but never go above this — 16,384 is generous (~12,000 words of output)
 * and well below every supported model's context window.
 */
const MAX_TOKENS_RETRY_CEILING = 16384;

/**
 * Sentinel string we use as text content when a max_tokens-truncated
 * assistant message is returned to the caller. The original message had
 * an orphan tool_use block that cannot be paired with a tool_result
 * (the model never finished emitting it), so we replace the entire
 * content with this single text part. Callers that splice a synthetic
 * user message after the final message (e.g. the OptiMate corrective-
 * retry path) are therefore safe by construction — no orphan tool_use
 * can leak into the next Anthropic request.
 *
 * The text is user-readable on purpose: if the chat route surfaces the
 * final reply verbatim, the user sees a clear explanation instead of
 * the run going silent.
 */
export const MAX_TOKENS_TRUNCATION_MARKER =
  "[OptiMate hit the output token limit mid-tool-call and could not complete this turn. Try asking again, or break the request into smaller steps.]";

function newRunId(): string {
  // Compact, sortable, no external uuid dep needed. Format: agent-<unix-ms>-<rand>
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0 };
}

function accumulateUsage(acc: Usage, add: Usage): Usage {
  return {
    inputTokens: acc.inputTokens + add.inputTokens,
    outputTokens: acc.outputTokens + add.outputTokens,
    cacheCreationTokens:
      (acc.cacheCreationTokens ?? 0) + (add.cacheCreationTokens ?? 0) || undefined,
    cacheReadTokens: (acc.cacheReadTokens ?? 0) + (add.cacheReadTokens ?? 0) || undefined,
  };
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const runId = opts.runId ?? newRunId();
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const toolMap = new Map(opts.tools.map((t) => [t.name, t]));
  const toolDefs = opts.tools.map((t) => toToolDef(t));

  const messages: Message[] = [...opts.initialMessages];
  const steps: AgentStep[] = [];
  let totalUsage: Usage = emptyUsage();
  let modelUsed = opts.model;
  let lastSource: AgentRunResult["source"] = "api-key";

  // Tracks the current per-call output cap. Starts at opts.maxTokens (or
  // undefined = provider default). Fix B(b1): when a turn hits stopReason
  // 'max_tokens' WITH an unfinished tool_use block, we double this and
  // replay the same turn once, giving the model room to finish emitting
  // the tool call. Resets back to the caller's value after the recovered
  // turn so a single oversize prompt doesn't permanently inflate every
  // subsequent turn's budget.
  const baseMaxTokens = opts.maxTokens;
  let currentMaxTokens = baseMaxTokens;
  let truncationRetriesUsed = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (opts.signal?.aborted) {
      throw new Error("Agent run aborted");
    }

    const llmStart = Date.now();
    const response = await callLLM({
      model: opts.model,
      fallbackModels: opts.fallbackModels,
      messages,
      system: opts.systemPrompt,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      ...(currentMaxTokens !== undefined ? { maxTokens: currentMaxTokens } : {}),
    });
    const llmDuration = Date.now() - llmStart;

    totalUsage = accumulateUsage(totalUsage, response.usage);
    modelUsed = response.model;
    lastSource = response.source;

    // If the model that served the response differs from what was requested,
    // a provider failover happened inside callLLM. Surface that as a loud
    // auth event so the chat status pill / agent-auth page / notifications
    // can flag it. The user explicitly asked for visibility on these.
    if (response.model !== opts.model) {
      const requestedProvider = MODEL_REGISTRY[opts.model as CanonicalModelName]?.provider;
      const servedProvider = MODEL_REGISTRY[response.model as CanonicalModelName]?.provider;
      await recordAuthEvent({
        provider: servedProvider ?? "moonshot",
        kind: "provider-failover",
        message: `Requested ${opts.model} (${requestedProvider}), served by ${response.model} (${servedProvider}). Reason: primary model failed; agent loop walked fallback chain.`,
        agentRunId: runId,
        agentName: opts.agentName,
        modelAttempted: opts.model,
        modelServed: response.model,
      }).catch(() => {});
    }

    // Append the assistant turn to the running messages.
    messages.push(response.message);

    // Capture text reasoning (text content blocks before any tool_use) and
    // each tool_use as separate activity-log rows for legibility.
    const assistantText = response.message.content
      .filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();

    if (assistantText.length > 0) {
      const step: AgentStep = {
        step: turn,
        type: "reasoning",
        reasoning: assistantText,
        model: response.model,
        source: response.source,
        durationMs: llmDuration,
        timestamp: new Date().toISOString(),
      };
      steps.push(step);
      await logAgentStep({
        agentRunId: runId,
        agentName: opts.agentName,
        step: turn,
        type: "agent_reasoning",
        title: `${opts.agentName} reasoning, turn ${turn}`,
        reasoning: assistantText,
        model: response.model,
        source: response.source,
        durationMs: llmDuration,
        clientId: opts.context.clientId as string | number | undefined,
      });
    }

    if (response.stopReason !== "tool_use") {
      // Fix B(b1): max_tokens with an unfinished tool_use block means the
      // model ran out of room while emitting a tool call. Returning this
      // message as-is poisons the conversation — the next request would
      // contain an assistant tool_use with no matching tool_result and
      // Anthropic 400s with "tool_use ids were found without tool_result
      // blocks immediately after". Try once with a doubled budget; if
      // even that truncates, strip the orphan tool_use blocks and
      // surface a clear message via the truncation marker.
      const truncatedMidToolUse =
        response.stopReason === "max_tokens" &&
        response.message.content.some((p) => p.type === "tool_use");

      if (truncatedMidToolUse && truncationRetriesUsed === 0) {
        const nextBudget = Math.min(
          (currentMaxTokens ?? 4096) * 2,
          MAX_TOKENS_RETRY_CEILING,
        );
        await logAgentStep({
          agentRunId: runId,
          agentName: opts.agentName,
          step: turn,
          type: "agent_error",
          title: `${opts.agentName} truncated mid-tool-use, retrying turn ${turn} with maxTokens=${nextBudget}`,
          output: `stopReason=max_tokens, tool_use present, budget ${currentMaxTokens ?? "default"} -> ${nextBudget}`,
          clientId: opts.context.clientId as string | number | undefined,
        });
        // Drop the truncated assistant message we just pushed (line above
        // in this loop) — we're going to replace it by replaying the
        // exact same input with a larger budget. Without this pop the
        // replay would see its own truncated output as history.
        messages.pop();
        currentMaxTokens = nextBudget;
        truncationRetriesUsed += 1;
        continue;
      }

      // Either we didn't truncate, or we already retried once and
      // truncated again. Either way this run is over.
      let finalMessage = response.message;
      if (truncatedMidToolUse) {
        // Belt-and-braces: replace the message content with a single text
        // part so no caller (e.g. the OptiMate corrective-retry path) can
        // accidentally replay an orphan tool_use to Anthropic.
        finalMessage = {
          role: "assistant",
          content: [{ type: "text", text: MAX_TOKENS_TRUNCATION_MARKER }],
        };
        // Replace the entry we pushed at line 99 so `messages` stays
        // consistent with what we're returning — useful for callers that
        // inspect the final state.
        messages[messages.length - 1] = finalMessage;
      }

      // Reset the per-call budget for any future runAgent() invocation
      // that reuses this options object (defensive — currently each call
      // builds its own opts, but explicit is cheap).
      currentMaxTokens = baseMaxTokens;

      const finalText = truncatedMidToolUse
        ? MAX_TOKENS_TRUNCATION_MARKER
        : assistantText;

      const finalStep: AgentStep = {
        step: turn,
        type: "final-output",
        output: finalText,
        model: response.model,
        source: response.source,
        timestamp: new Date().toISOString(),
      };
      steps.push(finalStep);
      await logAgentStep({
        agentRunId: runId,
        agentName: opts.agentName,
        step: turn,
        type: "agent_final_output",
        title: `${opts.agentName} final output${truncatedMidToolUse ? " (truncated mid-tool-use, marker substituted)" : ""}`,
        output: finalText,
        model: response.model,
        source: response.source,
        clientId: opts.context.clientId as string | number | undefined,
      });
      return {
        finalMessage,
        steps,
        totalUsage,
        modelUsed,
        source: lastSource,
        runId,
      };
    }

    // Tool-use turn. Execute every tool_use part, append a single user message
    // bundling all tool_result blocks so the next call sees them paired.
    const toolUseParts = response.message.content.filter(
      (p): p is Extract<ContentPart, { type: "tool_use" }> => p.type === "tool_use",
    );
    const toolResults: ContentPart[] = [];

    for (const tu of toolUseParts) {
      const tool = toolMap.get(tu.name) as CanonicalTool<unknown> | undefined;
      const toolStart = Date.now();
      let resultContent: string;
      let isError = false;

      if (!tool) {
        resultContent = `Tool not found: ${tu.name}`;
        isError = true;
      } else {
        try {
          const args = tool.validate ? tool.validate(tu.input) : tu.input;
          const ctx: ToolContext = {
            agentName: opts.agentName,
            agentRunId: runId,
            context: opts.context,
            log: (msg, meta) => console.log(`[${opts.agentName}] ${msg}`, meta ?? ""),
          };
          const result = await tool.execute(args, ctx);
          resultContent = JSON.stringify(result.data ?? { ok: result.ok });
          if (!result.ok) isError = true;
        } catch (err) {
          // Tool pairing repair: even on throw we MUST emit a tool_result so
          // the next LLM call doesn't fail the strict pairing constraint.
          resultContent = `Tool execution failed: ${(err as Error).message}`;
          isError = true;
        }
      }

      const toolDuration = Date.now() - toolStart;
      toolResults.push({
        type: "tool_result",
        toolUseId: tu.id,
        content: resultContent,
        isError: isError || undefined,
      });

      const step: AgentStep = {
        step: turn,
        type: "tool-call",
        toolName: tu.name,
        input: tu.input,
        output: resultContent,
        model: response.model,
        source: response.source,
        durationMs: toolDuration,
        timestamp: new Date().toISOString(),
      };
      steps.push(step);
      await logAgentStep({
        agentRunId: runId,
        agentName: opts.agentName,
        step: turn,
        type: "agent_tool_call",
        title: `${opts.agentName} -> ${tu.name}`,
        toolName: tu.name,
        input: tu.input,
        output: resultContent,
        model: response.model,
        source: response.source,
        durationMs: toolDuration,
        clientId: opts.context.clientId as string | number | undefined,
      });
    }

    messages.push({ role: "tool", content: toolResults });
  }

  // Hard cap reached.
  await logAgentStep({
    agentRunId: runId,
    agentName: opts.agentName,
    step: maxTurns + 1,
    type: "agent_error",
    title: `${opts.agentName} hit hard turn cap (${maxTurns})`,
    output: "Hard turn cap reached without end_turn",
    clientId: opts.context.clientId as string | number | undefined,
  });
  throw new Error(`Agent ${opts.agentName} hit hard turn cap (${maxTurns}) without end_turn`);
}
