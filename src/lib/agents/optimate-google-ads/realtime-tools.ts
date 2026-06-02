/**
 * Realtime voice tool surface for OptiMate.
 *
 * Voice now exposes the same canonical OptiMate tool registry as text chat.
 * Tool-level and approval-queue guardrails remain the safety boundary: Google
 * Ads/CMS proposals queue for human review, goal-run creation queues approval,
 * and Gmail has draft-only scope (never send). Server-side (the realtime-tool
 * route) re-derives this same registered-tool allow-set and rejects anything
 * outside it, so a compromised/confused client cannot widen the surface.
 */

import { getPortfolioTools, getTools } from './index'
import type { CanonicalTool } from '../_shared/tool'

/** A single Realtime function-tool definition (GA `tools[]` entry). */
export interface RealtimeFunctionTool {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * The names allowed to execute from voice. This intentionally mirrors the
 * registered text-chat tool set so voice and text OptiMate have the same
 * capabilities. Resolved against `getTools()` so a tool that isn't registered
 * can never sneak in.
 */
export function getVoiceToolNames(): Set<string> {
  return new Set(getTools().map((tool) => tool.name))
}

export const getVoiceReadToolNames = getVoiceToolNames

export function getPortfolioVoiceToolNames(): Set<string> {
  return new Set(getPortfolioTools().map((tool) => tool.name))
}

/** True when the name belongs to the registered OptiMate tool set. */
export function isVoiceTool(name: string): boolean {
  return getVoiceToolNames().has(name)
}

export function isPortfolioVoiceTool(name: string): boolean {
  return getPortfolioVoiceToolNames().has(name)
}

export const isVoiceReadTool = isVoiceTool

/** Build the Realtime `tools` array for the allowed voice set. */
export function getRealtimeToolDefinitions(allowed: Set<string>): RealtimeFunctionTool[] {
  return getTools()
    .filter((tool) => allowed.has(tool.name))
    .map(toRealtimeFunctionTool)
}

export function getPortfolioRealtimeToolDefinitions(allowed: Set<string>): RealtimeFunctionTool[] {
  return getPortfolioTools()
    .filter((tool) => allowed.has(tool.name))
    .map(toRealtimeFunctionTool)
}

function toRealtimeFunctionTool(tool: CanonicalTool<unknown>): RealtimeFunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }
}
