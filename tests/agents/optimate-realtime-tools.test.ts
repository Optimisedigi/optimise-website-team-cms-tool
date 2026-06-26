/**
 * OptiMate Realtime voice tool adapter.
 *
 * Voice shares the canonical OptiMate tool registry with text chat. Safety for
 * side effects is handled by the same tool-level approval queues and Gmail
 * draft-only scope, while the realtime bridge still rejects unregistered names.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    find: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    findByID: vi.fn(),
  })),
}))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))

import {
  getRealtimeToolDefinitions,
  getVoiceReadToolNames,
  getVoiceToolNames,
  isVoiceReadTool,
  isVoiceTool,
} from '@/lib/agents/optimate-google-ads/realtime-tools'
import { getTools } from '@/lib/agents/optimate-google-ads'

describe('getVoiceToolNames', () => {
  const allowed = getVoiceToolNames()

  it('includes read, draft, approval, goal, and memory tools from text OptiMate for live voice requests', () => {
    expect(allowed.has('get_campaign_performance')).toBe(true)
    expect(allowed.has('get_account_overview')).toBe(true)
    expect(allowed.has('memory_search')).toBe(true)
    expect(allowed.has('list_scheduled_tasks')).toBe(true)
    expect(allowed.has('create_gmail_draft')).toBe(true)
    expect(allowed.has('propose_budget_update')).toBe(true)
    expect(allowed.has('request_confirm')).toBe(true)
    expect(allowed.has('create_goal_run')).toBe(true)
    expect(allowed.has('create_account_efficiency_goal_run')).toBe(true)
    expect(allowed.has('remember')).toBe(true)
    expect(allowed.has('soul_set')).toBe(true)
  })

  it('matches the registered voice tool set exactly', () => {
    const registered = new Set(getTools({ attachMemoryTools: true }).map((t) => t.name))
    expect(allowed).toEqual(registered)
    expect(getVoiceReadToolNames()).toEqual(registered)
  })
})

describe('isVoiceTool', () => {
  it('allows registered text OptiMate tools over voice', () => {
    expect(isVoiceTool('get_account_overview')).toBe(true)
    expect(isVoiceTool('list_goal_runs')).toBe(true)
    expect(isVoiceTool('memory_search')).toBe(true)
    expect(isVoiceTool('propose_budget_update')).toBe(true)
    expect(isVoiceTool('create_goal_run')).toBe(true)
    expect(isVoiceTool('request_confirm')).toBe(true)
    expect(isVoiceReadTool('create_gmail_draft')).toBe(true)
  })

  it('denies unregistered names', () => {
    expect(isVoiceTool('apply_keywords_add')).toBe(false)
    expect(isVoiceTool('send_gmail')).toBe(false)
    expect(isVoiceReadTool('delete_everything')).toBe(false)
  })
})

describe('getRealtimeToolDefinitions', () => {
  it('maps allowed tools to the GA Realtime function shape', () => {
    const allowed = getVoiceToolNames()
    const defs = getRealtimeToolDefinitions(allowed)

    expect(defs.length).toBe(allowed.size)
    for (const def of defs) {
      expect(def.type).toBe('function')
      expect(typeof def.name).toBe('string')
      expect(allowed.has(def.name)).toBe(true)
      expect(typeof def.description).toBe('string')
      expect(def.parameters).toBeTypeOf('object')
      expect((def.parameters as { type?: string }).type).toBe('object')
    }
  })

  it('excludes tools outside the allowed set', () => {
    const onlyOne = new Set(['get_campaign_performance'])
    const defs = getRealtimeToolDefinitions(onlyOne)
    expect(defs.map((d) => d.name)).toEqual(['get_campaign_performance'])
  })
})
