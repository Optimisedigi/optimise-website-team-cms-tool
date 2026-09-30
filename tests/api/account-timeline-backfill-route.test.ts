import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const execute = vi.fn(async (query: unknown) => {
  if (typeof query === 'string') return { rows: [] }
  return { rowsAffected: 1, rows: [] }
})
const find = vi.fn(async ({ collection }: { collection: string }) => {
  if (collection === 'clients')
    return { docs: [{ id: 42, name: 'EPG engines', createdAt: '2026-06-01T03:00:00.000Z' }] }
  if (collection === 'contracts') {
    return {
      docs: [
        {
          id: 1,
          status: 'sent',
          contractTitle: 'Retainer',
          sentAt: '2026-06-10T01:00:00.000Z',
          client: 42,
        },
      ],
    }
  }
  return { docs: [] }
})

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    find,
    db: { client: { execute } },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })),
}))
vi.mock('@/payload.config', () => ({ default: {} }))

const insertCalls = () =>
  execute.mock.calls.filter(
    ([query]) =>
      typeof query === 'object' && String((query as { sql: string }).sql).startsWith('INSERT'),
  )

function post(body: string | undefined, key = 'secret-key'): NextRequest {
  return new NextRequest('https://cms.test/api/account-timeline/backfill', {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body }),
  })
}

describe('POST /api/account-timeline/backfill', () => {
  beforeEach(() => {
    vi.stubEnv('AUDIT_API_KEY', 'secret-key')
    execute.mockClear()
    find.mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('rejects a wrong key without reading anything', async () => {
    const { POST } = await import('@/app/(frontend)/api/account-timeline/backfill/route')
    const res = await POST(post(undefined, 'wrong-key!'))
    expect(res.status).toBe(401)
    expect(find).not.toHaveBeenCalled()
  })

  it('previews by default and writes nothing', async () => {
    const { POST } = await import('@/app/(frontend)/api/account-timeline/backfill/route')
    const res = await POST(post(undefined))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      mode: 'preview',
      owners: 1,
      planned: 2,
      byAction: { client_created: 1, contract_sent: 1 },
    })
    expect(json.preview[0]).toEqual({
      timeline: 'client',
      id: 42,
      name: 'EPG engines',
      entries: [
        {
          date: '2026-06-01',
          action: 'Client Account Created',
          description: 'Client account created in the CMS',
        },
        {
          date: '2026-06-10',
          action: 'Contract Sent',
          description: 'Contract sent to client: Retainer',
        },
      ],
    })
    expect(insertCalls()).toHaveLength(0)
  })

  it('only writes when apply is exactly true', async () => {
    const { POST } = await import('@/app/(frontend)/api/account-timeline/backfill/route')

    await POST(post(JSON.stringify({ apply: 'yes' })))
    expect(insertCalls()).toHaveLength(0)

    const res = await POST(post(JSON.stringify({ apply: true })))
    expect(await res.json()).toMatchObject({ mode: 'apply', added: 2, failedOwners: [] })
    expect(insertCalls()).toHaveLength(2)
  })

  it('returns a clear error and writes nothing when records cannot be loaded', async () => {
    find.mockRejectedValueOnce(new Error('database is locked'))
    const { POST } = await import('@/app/(frontend)/api/account-timeline/backfill/route')

    const res = await POST(post(JSON.stringify({ apply: true })))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'Could not load records for the backfill; nothing was written.',
      detail: 'database is locked',
    })
    expect(insertCalls()).toHaveLength(0)
  })

  it('applies only the entry types not excluded', async () => {
    const { POST } = await import('@/app/(frontend)/api/account-timeline/backfill/route')

    const res = await POST(post(JSON.stringify({ apply: true, exclude: ['client_created'] })))

    expect(await res.json()).toMatchObject({
      mode: 'apply',
      excluded: ['client_created'],
      planned: 1,
      added: 1,
      byAction: { contract_sent: 1 },
    })
    expect(insertCalls()).toHaveLength(1)
    expect(JSON.stringify(insertCalls())).not.toContain('client_created')
  })

  it('rejects an exclude list with unknown or non-string values, writing nothing', async () => {
    const { POST } = await import('@/app/(frontend)/api/account-timeline/backfill/route')

    for (const exclude of [['client_createdd'], 'client_created', [1]]) {
      const res = await POST(post(JSON.stringify({ apply: true, exclude })))
      expect(res.status).toBe(400)
    }
    expect(find).not.toHaveBeenCalled()
    expect(insertCalls()).toHaveLength(0)
  })

  it('rejects a body that is not JSON', async () => {
    const { POST } = await import('@/app/(frontend)/api/account-timeline/backfill/route')
    const res = await POST(post('apply'))
    expect(res.status).toBe(400)
    expect(insertCalls()).toHaveLength(0)
  })
})
