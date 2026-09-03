import { describe, expect, it, vi } from 'vitest'
import { NegativeKeywordLists } from '@/collections/NegativeKeywordLists'

describe('NegativeKeywordLists hooks', () => {
  it('blocks delete when the list still has keywords', async () => {
    const findByID = vi.fn().mockResolvedValue({
      name: 'Brand Terms',
      keywords: [{ keyword: 'free', matchType: 'exact' }],
    })
    const beforeDelete = NegativeKeywordLists.hooks?.beforeDelete?.[0]

    expect(typeof beforeDelete).toBe('function')
    await expect(
      (beforeDelete as any)({
        id: 13,
        req: { payload: { findByID } },
      }),
    ).rejects.toThrow('still has 1 keyword')

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'negative-keyword-lists',
        id: 13,
        overrideAccess: true,
      }),
    )
  })

  it('allows delete when the list has no keywords', async () => {
    const findByID = vi.fn().mockResolvedValue({ name: 'Empty list', keywords: [], keywordCount: 0 })
    const beforeDelete = NegativeKeywordLists.hooks?.beforeDelete?.[0]

    await expect(
      (beforeDelete as any)({
        id: 13,
        req: { payload: { findByID } },
      }),
    ).resolves.toBeUndefined()
  })

  it('blocks delete when keywordCount is set even if keywords are missing', async () => {
    const findByID = vi.fn().mockResolvedValue({ name: 'Brand Terms', keywordCount: 4 })
    const beforeDelete = NegativeKeywordLists.hooks?.beforeDelete?.[0]

    await expect(
      (beforeDelete as any)({
        id: 13,
        req: { payload: { findByID } },
      }),
    ).rejects.toThrow('still has 4 keywords')
  })

  it('does not allow delete when the list lookup fails', async () => {
    const findByID = vi.fn().mockRejectedValue(new Error('db unavailable'))
    const beforeDelete = NegativeKeywordLists.hooks?.beforeDelete?.[0]

    await expect(
      (beforeDelete as any)({
        id: 13,
        req: { payload: { findByID } },
      }),
    ).rejects.toThrow('db unavailable')
  })

  it('does not allow delete when the list is missing', async () => {
    const findByID = vi.fn().mockResolvedValue(null)
    const beforeDelete = NegativeKeywordLists.hooks?.beforeDelete?.[0]

    await expect(
      (beforeDelete as any)({
        id: 13,
        req: { payload: { findByID } },
      }),
    ).rejects.toThrow('list was not found')
  })

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
