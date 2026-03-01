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
  delete: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

// Import after mocks are set up
import { GET, POST, PATCH, DELETE } from '@/app/(frontend)/api/blog-prompts/route'
import { NextRequest } from 'next/server'

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3001/api/blog-prompts')
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  return new NextRequest(url, { method: 'GET' })
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3001/api/blog-prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3001/api/blog-prompts')
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  return new NextRequest(url, { method: 'PATCH' })
}

function makeDeleteRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3001/api/blog-prompts')
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  return new NextRequest(url, { method: 'DELETE' })
}

describe('GET /api/blog-prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns non-archived briefs by default', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.delete.mockResolvedValue({ docs: [] })
    mockPayload.find.mockResolvedValue({ docs: [{ id: '1', title: 'Brief 1' }] })

    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.docs).toEqual([{ id: '1', title: 'Brief 1' }])

    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'blog-prompts',
      sort: '-createdAt',
      limit: 50,
      where: { archivedAt: { exists: false } },
      overrideAccess: true,
    })
  })

  it('returns archived briefs when ?archived=true', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.delete.mockResolvedValue({ docs: [] })
    mockPayload.find.mockResolvedValue({ docs: [{ id: '2', title: 'Archived Brief' }] })

    const res = await GET(makeGetRequest({ archived: 'true' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.docs).toEqual([{ id: '2', title: 'Archived Brief' }])

    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'blog-prompts',
      sort: '-createdAt',
      limit: 50,
      where: { archivedAt: { exists: true } },
      overrideAccess: true,
    })
  })

  it('runs lazy cleanup of old archived briefs', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.delete.mockResolvedValue({ docs: [] })
    mockPayload.find.mockResolvedValue({ docs: [] })

    await GET(makeGetRequest())

    expect(mockPayload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'blog-prompts',
        where: {
          archivedAt: { less_than: expect.any(String), exists: true },
        },
        overrideAccess: true,
      })
    )
  })

  it('still returns briefs when cleanup fails', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.delete.mockRejectedValue(new Error('Cleanup failed'))
    mockPayload.find.mockResolvedValue({ docs: [{ id: '1' }] })

    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.docs).toEqual([{ id: '1' }])
  })

  it('returns 500 when find throws an error', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.delete.mockResolvedValue({ docs: [] })
    mockPayload.find.mockRejectedValue(new Error('DB error'))

    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to load briefs')
  })

  it('returns 500 when auth itself throws', async () => {
    mockPayload.auth.mockRejectedValue(new Error('Auth service down'))

    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to load briefs')
  })
})

describe('POST /api/blog-prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const res = await POST(makePostRequest({ title: 'Test' }))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('creates a brief and returns the doc', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    const briefData = { title: 'New Brief', content: 'Some content' }
    mockPayload.create.mockResolvedValue({ id: '1', ...briefData })

    const res = await POST(makePostRequest(briefData))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.doc).toEqual({ id: '1', ...briefData })

    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: 'blog-prompts',
      data: briefData,
      overrideAccess: true,
    })
  })

  it('returns 500 when create throws an error', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.create.mockRejectedValue(new Error('DB error'))

    const res = await POST(makePostRequest({ title: 'Test' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to save brief')
  })

  it('returns 500 when auth itself throws', async () => {
    mockPayload.auth.mockRejectedValue(new Error('Auth service down'))

    const res = await POST(makePostRequest({ title: 'Test' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to save brief')
  })
})

describe('PATCH /api/blog-prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const res = await PATCH(makePatchRequest({ id: '1' }))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 when id is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    const res = await PATCH(makePatchRequest())
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Missing id')
  })

  it('archives a brief by setting archivedAt', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.update.mockResolvedValue({ id: '1', archivedAt: '2026-03-01T00:00:00.000Z' })

    const res = await PATCH(makePatchRequest({ id: '1' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.doc).toEqual({ id: '1', archivedAt: '2026-03-01T00:00:00.000Z' })

    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: 'blog-prompts',
      id: '1',
      data: { archivedAt: expect.any(String) },
      overrideAccess: true,
    })
  })

  it('returns 500 when update throws an error', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.update.mockRejectedValue(new Error('DB error'))

    const res = await PATCH(makePatchRequest({ id: '1' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to archive brief')
  })

  it('returns 500 when auth itself throws', async () => {
    mockPayload.auth.mockRejectedValue(new Error('Auth service down'))

    const res = await PATCH(makePatchRequest({ id: '1' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to archive brief')
  })
})

describe('DELETE /api/blog-prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const res = await DELETE(makeDeleteRequest({ id: '1' }))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 when id is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    const res = await DELETE(makeDeleteRequest())
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('Missing id')
  })

  it('deletes a brief and returns success', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.delete.mockResolvedValue({ id: '1' })

    const res = await DELETE(makeDeleteRequest({ id: '1' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)

    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: 'blog-prompts',
      id: '1',
      overrideAccess: true,
    })
  })

  it('returns 500 when delete throws an error', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.delete.mockRejectedValue(new Error('DB error'))

    const res = await DELETE(makeDeleteRequest({ id: '1' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to delete brief')
  })

  it('returns 500 when auth itself throws', async () => {
    mockPayload.auth.mockRejectedValue(new Error('Auth service down'))

    const res = await DELETE(makeDeleteRequest({ id: '1' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('Failed to delete brief')
  })
})
