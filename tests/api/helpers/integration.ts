import { NextRequest } from 'next/server'
import { vi } from 'vitest'

import { expect } from 'vitest'

type MockFn = ReturnType<typeof vi.fn>

export interface MockPayloadShape {
  auth: MockFn
  find: MockFn
  findByID: MockFn
  findGlobal: MockFn
  count: MockFn
  create: MockFn
  update: MockFn
  delete: MockFn
  logger: {
    error: MockFn
    warn: MockFn
    info: MockFn
  }
}

export function createMockPayload(overrides: Partial<MockPayloadShape> = {}): MockPayloadShape {
  return {
    auth: vi.fn(async () => ({ user: { id: 1, role: 'admin', name: 'Admin', email: 'admin@example.com' } })),
    find: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
    findByID: vi.fn(async () => null),
    findGlobal: vi.fn(async () => null),
    count: vi.fn(async () => ({ totalDocs: 0 })),
    create: vi.fn(async (args: { data?: Record<string, unknown> }) => ({ id: 1, ...(args?.data ?? {}) })),
    update: vi.fn(async (args: { id?: number | string; data?: Record<string, unknown> }) => ({ id: args?.id ?? 1, ...(args?.data ?? {}) })),
    delete: vi.fn(async (args: { id?: number | string }) => ({ id: args?.id ?? 1 })),
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
    ...overrides,
  }
}

export function setAuthenticatedUser(payload: MockPayloadShape, user: Record<string, unknown> | null = { id: 1, role: 'admin' }): void {
  payload.auth.mockResolvedValue({ user })
}

export function jsonRequest(url: string, body: unknown, init: RequestInit = {}): NextRequest {
  return new NextRequest(url, {
    method: init.method ?? 'POST',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  })
}

export function getRequest(url: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    ...init,
  })
}

export function badJsonRequest(url: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(url, {
    method: init.method ?? 'POST',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
    body: 'not-json',
  })
}

export function params<T extends Record<string, string>>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) }
}

export async function expectJsonStatus(response: Response, status: number): Promise<Record<string, unknown>> {
  expect(response.status).toBe(status)
  const contentType = response.headers.get('content-type') ?? ''
  expect(contentType).toContain('application/json')
  return (await response.json()) as Record<string, unknown>
}

export function installPayloadMocks(mockPayload: MockPayloadShape): void {
  vi.doMock('payload', () => ({
    getPayload: vi.fn(async () => mockPayload),
  }))
  vi.doMock('@/payload.config', () => ({
    default: Promise.resolve({}),
  }))
}

export function installNextHeadersMock(headers = new Headers()): void {
  vi.doMock('next/headers', () => ({
    headers: vi.fn(async () => headers),
  }))
}

export function makeFetchJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, init)
}
