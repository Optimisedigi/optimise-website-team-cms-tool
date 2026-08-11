/**
 * Regression tests for the runaway draft loop.
 *
 * Production incident: an OptiMate chat run emitted `create_gmail_draft` 20
 * times, 19 of them with byte-identical arguments, and every call created a
 * real Gmail draft addressed to a client. The loop only stopped when the agent
 * hit its hard turn cap.
 *
 * The agent loop now de-duplicates side-effecting tool calls within a run, so a
 * degenerate model loop costs turns instead of real-world actions.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/agents/_shared/activity-log', () => ({
  logAgentStep: vi.fn().mockResolvedValue(undefined),
}))

const llmMock = vi.hoisted(() => ({ callLLM: vi.fn() }))
vi.mock('@/lib/agents/_shared/llm', () => ({
  callLLM: llmMock.callLLM,
  AggregateLLMError: class AggregateLLMError extends Error {
    errors: Array<{ model: string; error: unknown }> = []
  },
}))

import { runAgent } from '@/lib/agents/_shared/base-agent'
import type { CanonicalTool } from '@/lib/agents/_shared/tool'

/** Queues one LLM response per turn: N tool-use turns, then a final text turn. */
function queueToolThenFinish(
  toolCalls: Array<{ name: string; input: unknown }>,
  finalText = 'done',
): void {
  for (const [i, call] of toolCalls.entries()) {
    llmMock.callLLM.mockResolvedValueOnce({
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: `tu-${i}`, name: call.name, input: call.input }],
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 1, outputTokens: 1 },
      model: 'test-model',
      source: 'api-key',
    })
  }
  llmMock.callLLM.mockResolvedValueOnce({
    message: { role: 'assistant', content: [{ type: 'text', text: finalText }] },
    stopReason: 'end_turn',
    usage: { inputTokens: 1, outputTokens: 1 },
    model: 'test-model',
    source: 'api-key',
  })
}

function baseOpts(tools: CanonicalTool<unknown>[], maxTurns = 30) {
  return {
    agentName: 'test-agent',
    model: 'test-model' as never,
    tools,
    initialMessages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'go' }] }],
    context: {},
    maxTurns,
  }
}

describe('side-effecting tool de-duplication', () => {
  beforeEach(() => {
    llmMock.callLLM.mockReset()
  })

  it('executes an identical side-effecting call only once per run', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { draftId: 'r1' } })
    const tool: CanonicalTool<unknown> = {
      name: 'create_gmail_draft',
      description: 'creates a draft',
      inputSchema: { type: 'object' },
      sideEffect: true,
      execute,
    }

    // The exact production shape: the same draft request, over and over.
    const identical = { subject: 'Re: Custom Fluid Power', to: 'client@example.com', htmlBody: '<p>hi</p>' }
    queueToolThenFinish(Array.from({ length: 20 }, () => ({ name: 'create_gmail_draft', input: identical })))

    await runAgent(baseOpts([tool]) as never)

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('tells the model the work is already done instead of silently succeeding', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { draftId: 'r1' } })
    const tool: CanonicalTool<unknown> = {
      name: 'create_gmail_draft',
      description: 'creates a draft',
      inputSchema: { type: 'object' },
      sideEffect: true,
      execute,
    }
    const input = { subject: 'x' }
    queueToolThenFinish([
      { name: 'create_gmail_draft', input },
      { name: 'create_gmail_draft', input },
    ])

    const result = await runAgent(baseOpts([tool]) as never)

    const suppressed = result.steps.find(
      (s) => s.type === 'tool-call' && String(s.output).includes('duplicateSuppressed'),
    )
    expect(suppressed).toBeDefined()
    const payload = JSON.parse(String(suppressed!.output))
    expect(payload.duplicateSuppressed).toBe(true)
    // The original result is echoed so the model can still cite the draft.
    expect(payload.originalResult).toMatchObject({ draftId: 'r1' })
    expect(payload.note).toMatch(/already completed/i)
  })

  it('still runs the tool when arguments genuinely differ', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { draftId: 'r' } })
    const tool: CanonicalTool<unknown> = {
      name: 'create_gmail_draft',
      description: 'creates a draft',
      inputSchema: { type: 'object' },
      sideEffect: true,
      execute,
    }
    queueToolThenFinish([
      { name: 'create_gmail_draft', input: { subject: 'Account A' } },
      { name: 'create_gmail_draft', input: { subject: 'Account B' } },
      { name: 'create_gmail_draft', input: { subject: 'Account C' } },
    ])

    await runAgent(baseOpts([tool]) as never)

    expect(execute).toHaveBeenCalledTimes(3)
  })

  it('treats reordered argument keys as the same call', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { draftId: 'r1' } })
    const tool: CanonicalTool<unknown> = {
      name: 'create_gmail_draft',
      description: 'creates a draft',
      inputSchema: { type: 'object' },
      sideEffect: true,
      execute,
    }
    queueToolThenFinish([
      { name: 'create_gmail_draft', input: { subject: 'x', to: 'a@b.com' } },
      { name: 'create_gmail_draft', input: { to: 'a@b.com', subject: 'x' } },
    ])

    await runAgent(baseOpts([tool]) as never)

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('never de-duplicates read-only tools', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { spend: 100 } })
    const tool: CanonicalTool<unknown> = {
      name: 'get_campaign_performance',
      description: 'reads performance',
      inputSchema: { type: 'object' },
      execute,
    }
    const input = { range: 'LAST_7_DAYS' }
    queueToolThenFinish([
      { name: 'get_campaign_performance', input },
      { name: 'get_campaign_performance', input },
      { name: 'get_campaign_performance', input },
    ])

    await runAgent(baseOpts([tool]) as never)

    // Re-reading must always hit the source; data can change between turns.
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it('allows a retry after a failed side effect', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'Gmail timed out' })
      .mockResolvedValueOnce({ ok: true, data: { draftId: 'r1' } })
    const tool: CanonicalTool<unknown> = {
      name: 'create_gmail_draft',
      description: 'creates a draft',
      inputSchema: { type: 'object' },
      sideEffect: true,
      execute,
    }
    const input = { subject: 'x' }
    queueToolThenFinish([
      { name: 'create_gmail_draft', input },
      { name: 'create_gmail_draft', input },
    ])

    await runAgent(baseOpts([tool]) as never)

    // A failure creates nothing, so the retry must not be mistaken for a duplicate.
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('de-duplicates two identical calls emitted in the same turn', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { draftId: 'r1' } })
    const tool: CanonicalTool<unknown> = {
      name: 'create_gmail_draft',
      description: 'creates a draft',
      inputSchema: { type: 'object' },
      sideEffect: true,
      execute,
    }
    const input = { subject: 'x' }
    // Both tool_use blocks arrive in one assistant message and execute concurrently.
    llmMock.callLLM.mockResolvedValueOnce({
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'a', name: 'create_gmail_draft', input },
          { type: 'tool_use', id: 'b', name: 'create_gmail_draft', input },
        ],
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 1, outputTokens: 1 },
      model: 'test-model',
      source: 'api-key',
    })
    llmMock.callLLM.mockResolvedValueOnce({
      message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1 },
      model: 'test-model',
      source: 'api-key',
    })

    await runAgent(baseOpts([tool]) as never)

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('marks every real draft-creating and proposal tool as side-effecting', async () => {
    // The mechanism above is inert unless the production tools opt in. This is
    // the wiring check: a new draft tool that forgets the flag fails here.
    const { getTools, getPortfolioTools } = await import('@/lib/agents/optimate-google-ads')
    // Individual-account, portfolio, and email chats have separate registries.
    // The production runaway happened in the EMAIL agent, which imports the
    // shared create_gmail_draft tool, so every registry must be covered.
    const { getEmailTools } = await import('@/lib/agents/optimate-email')
    const tools = [...getTools(), ...getPortfolioTools(), ...getEmailTools()]
    const byName = new Map(tools.map((t) => [t.name, t]))

    const mustBeGuarded = [
      'create_gmail_draft',
      'create_weekly_budget_gmail_draft',
      'create_monthly_budget_gmail_draft',
      'create_portfolio_weekly_gmail_drafts',
      'create_portfolio_budget_pacing_gmail_drafts',
    ]
    for (const name of mustBeGuarded) {
      expect(byName.get(name), `${name} should be registered`).toBeDefined()
      expect(byName.get(name)!.sideEffect, `${name} must be sideEffect:true`).toBe(true)
    }

    // Approval-queue writers are covered by the propose_* convention.
    const proposals = tools.filter((t) => t.name.startsWith('propose_'))
    expect(proposals.length).toBeGreaterThan(0)
    for (const tool of proposals) {
      expect(tool.sideEffect, `${tool.name} must be sideEffect:true`).toBe(true)
    }

    // Reads must stay un-guarded so repeated lookups still hit the source.
    expect(byName.get('get_campaign_performance')?.sideEffect).toBeFalsy()
    expect(byName.get('get_search_terms')?.sideEffect).toBeFalsy()
    expect(byName.get('search_gmail_inbox')?.sideEffect).toBeFalsy()
    expect(byName.get('read_gmail_message')?.sideEffect).toBeFalsy()
  })

  it('reproduces the production incident: 20 email-agent draft calls create one draft', async () => {
    // Replay of run msnz8nhf-i3zjmz (agent optimate-email, model grok-build):
    // 20 create_gmail_draft calls, 19 byte-identical, each creating a real
    // client-addressed draft until the hard turn cap fired.
    const { getEmailTools } = await import('@/lib/agents/optimate-email')
    const draftTool = getEmailTools().find((t) => t.name === 'create_gmail_draft')!
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { draftId: 'r1' } })
    const guarded: CanonicalTool<unknown> = { ...draftTool, execute }

    const incidentArgs = {
      subject: 'Re: Custom Fluid Power - Google ads audit',
      to: 'PMason@questas.com.au',
      htmlBody: '<p>Hi Priya, Just following up on the Custom Fluid Power presentation.</p>',
    }
    queueToolThenFinish(
      Array.from({ length: 20 }, () => ({ name: 'create_gmail_draft', input: incidentArgs })),
    )

    await runAgent(baseOpts([guarded], 25) as never)

    // Before the fix this was 20 real drafts to a client address.
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('caps distinct side-effecting calls so a varying-argument loop cannot run away', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { draftId: 'r' } })
    const tool: CanonicalTool<unknown> = {
      name: 'create_gmail_draft',
      description: 'creates a draft',
      inputSchema: { type: 'object' },
      sideEffect: true,
      execute,
    }
    // Every call differs, so hashing cannot catch it; the cap must.
    queueToolThenFinish(
      Array.from({ length: 25 }, (_, i) => ({
        name: 'create_gmail_draft',
        input: { subject: `draft ${i}` },
      })),
    )

    const result = await runAgent(baseOpts([tool], 40) as never)

    expect(execute).toHaveBeenCalledTimes(12)
    const blocked = result.steps.find(
      (s) => s.type === 'tool-call' && String(s.output).includes('per-run safety limit'),
    )
    expect(blocked).toBeDefined()
  })
})
