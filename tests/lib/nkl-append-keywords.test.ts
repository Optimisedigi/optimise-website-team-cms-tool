import { describe, expect, it, vi } from 'vitest'
import { appendNklKeywords } from '@/lib/nkl-append-keywords'

// Regression: appending to a 4,672-keyword list used to rewrite every row in a
// single INSERT (>32,766 bound params → "too many SQL variables" 500).
// The helper must only write the delta, in chunks under the SQLite cap.
function fakePayload(existingCount: number) {
  const run = vi.fn(async (query: { queryChunks?: unknown[] }) => {
    const text = JSON.stringify(query)
    if (text.includes('max(_order)')) return { rows: [{ max_order: existingCount }] }
    return { rows: [] }
  })
  const del = vi.fn(async () => ({ docs: [] }))
  return { payload: { db: { drizzle: { run } }, delete: del, logger: { warn: vi.fn() } } as never, run, del }
}

const countParams = (query: unknown) => (JSON.stringify(query).match(/"encoder"/g) || []).length

describe('appendNklKeywords', () => {
  it('does nothing for an empty delta', async () => {
    const { payload, run } = fakePayload(4672)
    expect(await appendNklKeywords(payload, 13, 6, [])).toBe(0)
    expect(run).not.toHaveBeenCalled()
  })

  it('writes only the new rows, chunked under the SQLite variable cap, then bumps keyword_count', async () => {
    const { payload, run, del } = fakePayload(4672)
    const keywords = Array.from({ length: 1200 }, (_, i) => ({ keyword: `kw ${i}`, matchType: 'exact' }))
    expect(await appendNklKeywords(payload, 13, 6, keywords)).toBe(1200)

    const inserts = run.mock.calls.filter(([q]) => JSON.stringify(q).includes('insert into negative_keyword_lists_keywords'))
    expect(inserts).toHaveLength(3) // 500 + 500 + 200
    for (const [q] of inserts) expect(countParams(q)).toBeLessThan(32766)

    const update = run.mock.calls.find(([q]) => JSON.stringify(q).includes('update negative_keyword_lists set keyword_count'))
    expect(JSON.stringify(update?.[0])).toContain('5872') // 4672 + 1200
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ collection: 'negative-keyword-monthly-waste-relevancy-cache' }))
  })
})
