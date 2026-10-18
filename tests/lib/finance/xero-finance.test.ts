import { describe, expect, it, vi } from 'vitest'
import { fetchXeroMonthlyFinance } from '@/lib/finance/xero-finance'

const env = { GROWTH_TOOLS_URL: 'https://gt.example', INTERNAL_API_KEY: 'k' }

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

const OCT = { from: '2026-10', to: '2026-10' }

const summary = {
  months: [{ month: '2026-10', invoiced: 10000, received: 8000, costs: 3000, costsByAccount: [{ account: 'Software', amount: 3000 }] }],
  fetchedAt: '2026-10-17T05:00:00.000Z',
}

describe('fetchXeroMonthlyFinance', () => {
  it('calls Growth Tools with the internal key and returns validated data', async () => {
    const fetchImpl = respond(200, summary)

    const result = await fetchXeroMonthlyFinance(OCT, { env, fetchImpl })

    expect(result).toEqual({ ok: true, data: summary })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://gt.example/api/xero/finance/monthly?from=2026-10&to=2026-10')
    expect(init.headers).toEqual({ 'x-internal-key': 'k' })
  })

  it.each([
    [404, {}, 'not_deployed'],
    [409, { code: 'XERO_SCOPE_MISSING' }, 'scope_missing'],
    [409, { code: 'XERO_NOT_CONNECTED' }, 'not_connected'],
    [502, { code: 'XERO_ERROR' }, 'error'],
  ])('maps HTTP %i to %s', async (status, body, reason) => {
    expect(await fetchXeroMonthlyFinance(OCT, { env, fetchImpl: respond(status, body) })).toEqual({ ok: false, reason })
  })

  it('treats an HTML page (Growth Tools catch-all for unknown paths) as not deployed', async () => {
    const fetchImpl = vi.fn(async () => new Response('<!DOCTYPE html><html></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }))
    expect(await fetchXeroMonthlyFinance(OCT, { env, fetchImpl })).toEqual({ ok: false, reason: 'not_deployed' })
  })

  it('rejects a malformed response instead of showing wrong numbers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchXeroMonthlyFinance(OCT, { env, fetchImpl: respond(200, { months: [{ month: 'Oct', invoiced: '10' }] }) })
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('reports not_configured without making a request', async () => {
    const fetchImpl = respond(200, summary)
    expect(await fetchXeroMonthlyFinance(OCT, { env: {}, fetchImpl })).toEqual({ ok: false, reason: 'not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('applies the timeout even when the caller passes its own signal', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
    const caller = new AbortController() // never aborted

    const result = await fetchXeroMonthlyFinance(OCT, { env, fetchImpl, signal: caller.signal, timeoutMs: 20 })

    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('requests an exact financial year and returns only those months', async () => {
    const fy = { from: '2024-07', to: '2025-06' }
    const months = ['2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06']
    const fetchImpl = respond(200, {
      months: months.map((month) => ({ month, invoiced: 1, received: 1, costs: 1, costsByAccount: [] })),
      fetchedAt: '2026-10-17T05:00:00.000Z',
    })

    const result = await fetchXeroMonthlyFinance(fy, { env, fetchImpl })

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://gt.example/api/xero/finance/monthly?from=2024-07&to=2025-06')
    expect(result.ok && result.data.months.map((m) => m.month)).toEqual(months)
  })

  it('refuses a reply that does not cover the requested months (older Growth Tools ignoring from/to)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = respond(200, summary) // only 2026-10
    const result = await fetchXeroMonthlyFinance({ from: '2024-07', to: '2025-06' }, { env, fetchImpl })
    expect(result).toEqual({ ok: false, reason: 'not_deployed' })
  })

  it('rejects an invalid range as a programming error', async () => {
    await expect(fetchXeroMonthlyFinance({ from: '2026-10', to: '2026-07' }, { env, fetchImpl: respond(200, summary) })).rejects.toThrow('invalid range')
  })

  it('treats network failures as unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    expect(await fetchXeroMonthlyFinance(OCT, { env, fetchImpl })).toEqual({ ok: false, reason: 'error' })
  })
})
