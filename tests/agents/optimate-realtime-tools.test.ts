/**
 * OptiMate Realtime voice tool adapter.
 *
 * Verifies the voice path is read + ask only:
 *   - getVoiceReadToolNames() returns only read-only lookup tools and never a
 *     propose/apply/create/request or memory-write tool.
 *   - getRealtimeToolDefinitions() maps allowed CanonicalTools into the GA
 *     Realtime `{ type:"function", name, description, parameters }` shape.
 *   - isVoiceReadTool() denies every mutating prefix.
 *
 * Mocks payload like the other agent tool tests so the module graph (index.ts
 * pulls in payload + config) resolves under vitest.
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
  isVoiceReadTool,
} from '@/lib/agents/optimate-google-ads/realtime-tools'
import { getTools } from '@/lib/agents/optimate-google-ads'

describe('getVoiceReadToolNames', () => {
  const allowed = getVoiceReadToolNames()

  it('includes core read-only data tools', () => {
    expect(allowed.has('get_campaign_performance')).toBe(true)
    expect(allowed.has('get_account_overview')).toBe(true)
    expect(allowed.has('memory_search')).toBe(true)
    expect(allowed.has('list_scheduled_tasks')).toBe(true)
  })

  it('never includes a write/propose/apply/create tool', () => {
    for (const name of allowed) {
      expect(name.startsWith('propose_')).toBe(false)
      expect(name.startsWith('apply_')).toBe(false)
      expect(name.startsWith('create_')).toBe(false)
      expect(name.startsWith('request_')).toBe(false)
    }
    expect(allowed.has('propose_budget_update')).toBe(false)
    expect(allowed.has('propose_keywords_add')).toBe(false)
    expect(allowed.has('create_gmail_draft')).toBe(false)
    expect(allowed.has('request_confirm')).toBe(false)
    expect(allowed.has('remember')).toBe(false)
    expect(allowed.has('soul_set')).toBe(false)
  })

  it('is a strict subset of the registered tool set', () => {
    const registered = new Set(getTools().map((t) => t.name))
    for (const name of allowed) {
      expect(registered.has(name)).toBe(true)
    }
  })
})

describe('isVoiceReadTool', () => {
  it('allows read families', () => {
    expect(isVoiceReadTool('get_account_overview')).toBe(true)
    expect(isVoiceReadTool('list_goal_runs')).toBe(true)
    expect(isVoiceReadTool('memory_search')).toBe(true)
  })

  it('denies mutating prefixes and explicit writes', () => {
    expect(isVoiceReadTool('propose_budget_update')).toBe(false)
    expect(isVoiceReadTool('apply_keywords_add')).toBe(false)
    expect(isVoiceReadTool('create_goal_run')).toBe(false)
    expect(isVoiceReadTool('request_confirm')).toBe(false)
    expect(isVoiceReadTool('remember')).toBe(false)
    expect(isVoiceReadTool('soul_set')).toBe(false)
  })
})

describe('getRealtimeToolDefinitions', () => {
  it('maps allowed tools to the GA Realtime function shape', () => {
    const allowed = getVoiceReadToolNames()
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
