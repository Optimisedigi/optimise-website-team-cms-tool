import { describe, expect, it } from 'vitest'
import {
  filterMentionSuggestions,
  insertMention,
  mentionTokenAt,
  parseTaggedUserIds,
} from '@/lib/monthly-keyword-mention-text'

describe('monthly-keyword-mention-text', () => {
  it('parses unique tagged ids and drops junk', () => {
    expect(parseTaggedUserIds(['11', '11', ' 9 ', 'undefined', ''])).toEqual(['11', '9'])
    expect(parseTaggedUserIds('11,9,11')).toEqual(['11', '9'])
  })

  it('finds the @token at the caret for prefix matching', () => {
    expect(mentionTokenAt('hey @Al', 7)).toEqual({ start: 4, query: 'Al' })
    expect(mentionTokenAt('no mention here', 5)).toBeNull()
  })

  it('filters teammates by prefix and inserts the chosen label', () => {
    const mates = [{ id: '1', label: 'Alice' }, { id: '2', label: 'Bob' }]
    expect(filterMentionSuggestions(mates, 'al')).toEqual([{ id: '1', label: 'Alice' }])
    expect(insertMention('hey @Al', 7, 4, 'Alice')).toEqual({ next: 'hey @Alice ', caret: 11 })
  })
})
