import { describe, expect, it, vi } from 'vitest'

import {
  badJsonRequest,
  createMockPayload,
  expectJsonStatus,
  getRequest,
  jsonRequest,
  makeFetchJsonResponse,
  params,
  setAuthenticatedUser,
} from './integration'

describe('API integration test helpers', () => {
  it('creates an authenticated Payload mock with common methods', async () => {
    const payload = createMockPayload()
    await expect(payload.auth()).resolves.toEqual({
      user: { id: 1, role: 'admin', name: 'Admin', email: 'admin@example.com' },
    })
    await expect(payload.find()).resolves.toEqual({ docs: [], totalDocs: 0 })
    await expect(payload.count()).resolves.toEqual({ totalDocs: 0 })

    setAuthenticatedUser(payload, null)
    await expect(payload.auth()).resolves.toEqual({ user: null })
  })

  it('builds JSON, GET, bad JSON, and params fixtures', async () => {
    const post = jsonRequest('http://localhost/api/example', { ok: true })
    expect(post.method).toBe('POST')
    await expect(post.json()).resolves.toEqual({ ok: true })

    const get = getRequest('http://localhost/api/example?x=1')
    expect(get.method).toBe('GET')
    expect(get.nextUrl.searchParams.get('x')).toBe('1')

    const bad = badJsonRequest('http://localhost/api/example')
    await expect(bad.json()).rejects.toThrow()

    await expect(params({ id: '123' }).params).resolves.toEqual({ id: '123' })
  })

  it('asserts JSON response status and constructs fetch JSON responses', async () => {
    const json = await expectJsonStatus(Response.json({ ok: true }, { status: 201 }), 201)
    expect(json).toEqual({ ok: true })

    const fetchResponse = makeFetchJsonResponse({ value: 42 })
    await expect(fetchResponse.json()).resolves.toEqual({ value: 42 })
  })

  it('allows callers to override Payload mock methods', async () => {
    const customFind = vi.fn(async () => ({ docs: [{ id: 7 }], totalDocs: 1 }))
    const payload = createMockPayload({ find: customFind as never })

    await expect(payload.find()).resolves.toEqual({ docs: [{ id: 7 }], totalDocs: 1 })
  })
})
