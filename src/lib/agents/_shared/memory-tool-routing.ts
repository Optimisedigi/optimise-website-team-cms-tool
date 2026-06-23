import type { Message } from "./llm/types";

const MEMORY_TOOL_REQUEST_PATTERN = /\b(remember|save (?:this|that)|store (?:this|that)|make a note|keep (?:this|that) in mind|memory|memories|saved facts?|what do you remember|search (?:your )?memory|look (?:in|through) (?:your )?memory|forget|recall|last time|previously|before|known preference|known constraint|their stance|history)\b/i;
const SOUL_TOOL_REQUEST_PATTERN = /\b(soul|communication[- ]style|tone rule|style rule|from now on|always reply|never reply|be more direct|less waffle|no emoji|no emojis|no dashes|formatting rule)\b/i;

export function shouldAttachMemoryToolsForText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return MEMORY_TOOL_REQUEST_PATTERN.test(trimmed) || SOUL_TOOL_REQUEST_PATTERN.test(trimmed);
}

export function shouldAttachMemoryTools(messages: Message[]): boolean {
  return shouldAttachMemoryToolsForText(extractLatestUserText(messages));
}

export function memoryToolRoutingPrompt(agentName: string): string {
  return `\n\nMemory tool routing: pinned memory/soul context that is already loaded above is always available. The memory_search, remember, and soul_set tool schemas are attached only for explicit memory work. If the user asks ${agentName} to remember, search saved memory, or update long-term communication style/soul rules and those tools are not visible, request/attach the memory tools first, then complete that memory action. Do not use memory tools for ordinary tasks.`;
}

function extractLatestUserText(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    return message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}
