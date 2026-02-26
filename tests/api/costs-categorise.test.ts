import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/headers before importing the route
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

// Mock payload
const mockPayload = {
  auth: vi.fn(),
  update: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

// Import after mocks are set up
import { POST } from '@/app/(frontend)/api/costs/categorise/route'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3001/api/costs/categorise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/costs/categorise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const res = await POST(makeRequest({ transactionId: '1', categoryId: '2' }))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 when transactionId is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    const res = await POST(makeRequest({ categoryId: '2' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('transactionId and categoryId are required')
  })

  it('returns 400 when categoryId is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    const res = await POST(makeRequest({ transactionId: '1' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('transactionId and categoryId are required')
  })

  it('returns 400 when both transactionId and categoryId are missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    const res = await POST(makeRequest({}))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('transactionId and categoryId are required')
  })

  it('updates transaction category and returns ok', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.update.mockResolvedValue({ id: '1', description: 'Amazon Purchase' })

    const res = await POST(makeRequest({ transactionId: '1', categoryId: '5' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.ruleSaved).toBe(false)

    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: 'business-costs',
      id: '1',
      data: { category: '5' },
      overrideAccess: true,
    })
  })

  it('creates a cost-rule when saveRule is true and no existing rule', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.update.mockResolvedValue({ id: '1', description: 'Monthly hosting' })
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] })
    mockPayload.create.mockResolvedValue({ id: 'rule-1' })

    const res = await POST(makeRequest({ transactionId: '1', categoryId: '5', saveRule: true }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.ruleSaved).toBe(true)

    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'cost-rules',
      where: { pattern: { equals: 'Monthly hosting' } },
      limit: 1,
      overrideAccess: true,
    })

    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: 'cost-rules',
      data: { pattern: 'Monthly hosting', category: '5' },
      overrideAccess: true,
    })
  })

  it('does not create a duplicate cost-rule when one already exists', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.update.mockResolvedValue({ id: '1', description: 'Existing pattern' })
    mockPayload.find.mockResolvedValue({ totalDocs: 1, docs: [{ id: 'r1' }] })

    const res = await POST(makeRequest({ transactionId: '1', categoryId: '5', saveRule: true }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.ruleSaved).toBe(false)
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('does not save rule when saveRule is true but description is empty', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.update.mockResolvedValue({ id: '1', description: '' })

    const res = await POST(makeRequest({ transactionId: '1', categoryId: '5', saveRule: true }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.ruleSaved).toBe(false)
    expect(mockPayload.find).not.toHaveBeenCalled()
  })

  it('does not save rule when saveRule is false', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.update.mockResolvedValue({ id: '1', description: 'Something' })

    const res = await POST(makeRequest({ transactionId: '1', categoryId: '5', saveRule: false }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.ruleSaved).toBe(false)
    expect(mockPayload.find).not.toHaveBeenCalled()
  })

  it('returns 500 when update throws an error', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.update.mockRejectedValue(new Error('DB connection lost'))

    const res = await POST(makeRequest({ transactionId: '1', categoryId: '5' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to categorise')
    expect(json.details).toContain('DB connection lost')
  })

  it('returns 500 when auth itself throws', async () => {
    mockPayload.auth.mockRejectedValue(new Error('Auth service down'))

    const res = await POST(makeRequest({ transactionId: '1', categoryId: '5' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to categorise')
  })
})
