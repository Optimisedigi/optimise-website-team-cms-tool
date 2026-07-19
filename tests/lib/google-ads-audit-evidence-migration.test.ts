import { describe, expect, it, vi } from 'vitest'
import { down, up } from '@/migrations/20260806_120000_add_google_ads_audit_evidence_context'

describe('Google Ads audit evidence context migration', () => {
  it('adds and removes frozen context columns without rewriting snapshot rows', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    await up({ db: { run } } as any)
    const upSql = run.mock.calls.map(([statement]) => JSON.stringify(statement)).join('\n')
    expect(upSql).toContain('google_ads_audit_snapshots')
    expect(upSql).toContain('competitor_seed_queries')
    expect(upSql).not.toMatch(/UPDATE|DELETE|INSERT/i)

    run.mockClear()
    await down({ db: { run } } as any)
    const downSql = run.mock.calls.map(([statement]) => JSON.stringify(statement)).join('\n')
    expect(downSql).toContain('DROP COLUMN')
    expect(downSql).not.toMatch(/DELETE FROM/i)
  })
})
