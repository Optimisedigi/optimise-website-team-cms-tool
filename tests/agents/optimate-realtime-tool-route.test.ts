/**
 * POST /api/optimate/realtime-tool — the server-side voice tool bridge.
 *
 * This is the trust boundary for the Realtime voice path. Tests confirm:
 *   - Unauthenticated requests are rejected (401).
 *   - Write/propose tools are rejected (403) BEFORE any DB or tool access,
 *     even with a valid session — voice is read + ask only.
 *   - A valid read tool executes with run context resolved from the audit
 *     (not the request body) and returns the tool's ToolResultPayload.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  find: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

// A spy we can assert against, returned by getTools() as a fake read tool.
const execSpy = vi.fn(async () => ({ ok: true, data: { spend: 123 } }))
vi.mock('@/lib/agents/optimate-google-ads', () => ({
  getTools: () => [
    {
      name: 'get_campaign_performance',
      description: 'read campaigns',
      inputSchema: { type: 'object', properties: {} },
      execute: execSpy,
    },
    {
      name: 'propose_budget_update',
      description: 'write budgets',
      inputSchema: { type: 'object', properties: {} },
      execute: vi.fn(),
    },
  ],
}))
vi.mock('@/lib/agents/optimate-google-ads/config', () => ({
  conversionActionsForClient: () => 'Purchase',
}))

import { POST } from '@/app/(frontend)/api/optimate/realtime-tool/route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/optimate/realtime-tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockPayload.auth.mockReset()
  mockPayload.findByID.mockReset()
  execSpy.mockClear()
})

describe('POST /api/optimate/realtime-tool', () => {
  it('rejects unauthenticated requests with 401', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })
    const res = await POST(makeRequest({ auditId: '1', name: 'get_campaign_performance' }))
    expect(res.status).toBe(401)
    expect(mockPayload.findByID).not.toHaveBeenCalled()
  })

  it('rejects a write/propose tool with 403 before touching the DB', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 42 } })
    const res = await POST(makeRequest({ auditId: '1', name: 'propose_budget_update' }))
    expect(res.status).toBe(403)
    expect(mockPayload.findByID).not.toHaveBeenCalled()
    expect(execSpy).not.toHaveBeenCalled()
  })

  it('requires auditId and name', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 42 } })
    expect((await POST(makeRequest({ name: 'get_campaign_performance' }))).status).toBe(400)
    expect((await POST(makeRequest({ auditId: '1' }))).status).toBe(400)
  })

  it('returns 404 when the audit is not found', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 42 } })
    mockPayload.findByID.mockRejectedValue(new Error('not found'))
    const res = await POST(makeRequest({ auditId: '999', name: 'get_campaign_performance' }))
    expect(res.status).toBe(404)
  })

  it('executes an allowed read tool with audit-derived context', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 42 } })
    mockPayload.findByID.mockResolvedValue({
      id: 7,
      customerId: '123-456-7890',
      client: null,
    })
    const res = await POST(
      makeRequest({
        auditId: '7',
        name: 'get_campaign_performance',
        // Browser-supplied ids that MUST be ignored in favour of the audit.
        arguments: { range: 'LAST_7_DAYS' },
      }),
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; data: unknown }
    expect(json.ok).toBe(true)
    expect(json.data).toEqual({ spend: 123 })

    expect(execSpy).toHaveBeenCalledTimes(1)
    const [args, ctx] = execSpy.mock.calls[0] as [
      Record<string, unknown>,
      { context: Record<string, unknown> },
    ]
    expect(args).toEqual({ range: 'LAST_7_DAYS' })
    // Customer id comes from the audit (dashes stripped), not the request.
    expect(ctx.context.customerId).toBe('1234567890')
    expect(ctx.context.auditId).toBe(7)
    expect(ctx.context.userId).toBe(42)
  })
})
