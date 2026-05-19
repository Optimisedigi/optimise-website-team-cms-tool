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
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
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
      // Model decided it's done. Log the final output and return.
      const finalStep: AgentStep = {
        step: turn,
        type: "final-output",
        output: assistantText,
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
        title: `${opts.agentName} final output`,
        output: assistantText,
        model: response.model,
        source: response.source,
        clientId: opts.context.clientId as string | number | undefined,
      });
      return {
        finalMessage: response.message,
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
