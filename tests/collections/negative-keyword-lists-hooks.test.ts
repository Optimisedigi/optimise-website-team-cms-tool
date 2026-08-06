import { describe, expect, it, vi } from 'vitest'
import { NegativeKeywordLists } from '@/collections/NegativeKeywordLists'

describe('NegativeKeywordLists hooks', () => {
  it('keeps keyword cache cleanup in the parent update transaction', async () => {
    const deleteRecords = vi.fn().mockResolvedValue({ docs: [] })
    const req = {
      payload: {
        delete: deleteRecords,
        logger: { warn: vi.fn() },
      },
      transactionID: 'transaction-1',
    }
    const afterChange = NegativeKeywordLists.hooks?.afterChange?.[0]

    expect(typeof afterChange).toBe('function')
    await (afterChange as any)({
      doc: { client: 'client-1', keywords: [] },
      previousDoc: {
        client: 'client-1',
        keywords: [{ keyword: 'whereu', matchType: 'phrase' }],
      },
      req,
      operation: 'update',
    })

    expect(deleteRecords).toHaveBeenCalledTimes(2)
    for (const [options] of deleteRecords.mock.calls) {
      expect(options.req).toBe(req)
    }
  })
})
