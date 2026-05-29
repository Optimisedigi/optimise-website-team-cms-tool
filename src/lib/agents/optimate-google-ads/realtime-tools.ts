/**
 * Realtime voice tool surface for OptiMate.
 *
 * The voice path is READ + ASK ONLY (see plan §3). The model may auto-execute
 * read-only data tools, but never budget/keyword/campaign writes — those stay
 * behind the text-chat propose → request_confirm → apply gate. So this module
 * maps only the read-only `get_*` / `list_*` / `memory_search` tools into the
 * OpenAI Realtime `tools` shape.
 *
 * Server-side (the realtime-tool route) re-derives this same allow-set and
 * rejects anything outside it, so a compromised/confused client can't widen
 * the surface — this adapter is just what the model is *told* it has.
 */

import { getTools } from './index'
import type { CanonicalTool } from '../_shared/tool'

/** A single Realtime function-tool definition (GA `tools[]` entry). */
export interface RealtimeFunctionTool {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * The names allowed to auto-execute from voice. Derived by convention from the
 * registered tool set: read-only data lookups only. Explicitly EXCLUDES every
 * write/propose/apply/create tool. Resolved against `getTools()` so a tool that
 * isn't actually registered can never sneak in.
 */
export function getVoiceReadToolNames(): Set<string> {
  const allowed = new Set<string>()
  for (const tool of getTools()) {
    if (isVoiceReadTool(tool.name)) {
      allowed.add(tool.name)
    }
  }
  return allowed
}

/**
 * A tool is voice-read-safe when it only reads data. We allow the `get_*` and
 * `list_*` lookup families plus `memory_search`, and hard-deny anything that
 * proposes, applies, creates, or otherwise mutates state.
 */
export function isVoiceReadTool(name: string): boolean {
  if (MUTATING_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return false
  }
  if (EXPLICIT_DENY.has(name)) {
    return false
  }
  return name.startsWith('get_') || name.startsWith('list_') || name === 'memory_search'
}

const MUTATING_PREFIXES = ['propose_', 'apply_', 'create_', 'request_'] as const

// Belt-and-braces deny-list for read-shaped names that still carry side effects
// or shouldn't be voice-driven (e.g. memory writes, persona changes).
const EXPLICIT_DENY = new Set<string>(['remember', 'soul_set'])

/**
 * Build the Realtime `tools` array for the allowed read set. Pass the result
 * of getVoiceReadToolNames() (or a narrower subset) as `allowed`.
 */
export function getRealtimeToolDefinitions(allowed: Set<string>): RealtimeFunctionTool[] {
  return getTools()
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
