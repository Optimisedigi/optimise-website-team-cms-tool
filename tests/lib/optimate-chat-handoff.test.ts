import { describe, expect, it } from 'vitest'
import {
  HANDOFF_TTL_MS,
  readHandoffMessages,
  stashChatHandoff,
  takeChatHandoff,
} from '@/lib/optimate-chat-handoff'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

const snapshot = { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], draft: 'next' }

describe('optimate chat handoff', () => {
  it('hands a snapshot to the popout exactly once', () => {
    const storage = memoryStorage()
    const id = stashChatHandoff({ storage, agent: 'adminmate', snapshot, id: 'abc-1', now: 1000 })
    expect(id).toBe('abc-1')
    expect(takeChatHandoff({ storage, agent: 'adminmate', id: 'abc-1', now: 2000 })).toEqual(snapshot)
    expect(takeChatHandoff({ storage, agent: 'adminmate', id: 'abc-1', now: 2000 })).toBeNull()
    expect(storage.map.size).toBe(0)
  })

  it('rejects another agent, expired entries and unsafe ids, and still deletes the entry', () => {
    const storage = memoryStorage()
    stashChatHandoff({ storage, agent: 'invoices', snapshot, id: 'inv', now: 0 })
    expect(takeChatHandoff({ storage, agent: 'adminmate', id: 'inv', now: 1 })).toBeNull()
    expect(storage.map.size).toBe(0)

    stashChatHandoff({ storage, agent: 'invoices', snapshot, id: 'old', now: 0 })
    expect(takeChatHandoff({ storage, agent: 'invoices', id: 'old', now: HANDOFF_TTL_MS + 1 })).toBeNull()

    expect(stashChatHandoff({ storage, agent: 'invoices', snapshot, id: '../x', now: 0 })).toBeNull()
    expect(takeChatHandoff({ storage, agent: 'invoices', id: '../x', now: 0 })).toBeNull()
  })

  it('prunes abandoned handoffs when stashing a new one', () => {
    const storage = memoryStorage()
    stashChatHandoff({ storage, agent: 'adminmate', snapshot, id: 'stale', now: 0 })
    storage.setItem('optimate:handoff:garbage', '{not json')
    storage.setItem('unrelated', 'keep')
    stashChatHandoff({ storage, agent: 'adminmate', snapshot, id: 'fresh', now: HANDOFF_TTL_MS + 10 })
    expect([...storage.map.keys()].sort()).toEqual(['optimate:handoff:fresh', 'unrelated'])
  })

  it('returns null instead of throwing when storage is full', () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(stashChatHandoff({ storage, agent: 'adminmate', snapshot, id: 'a', now: 0 })).toBeNull()
  })

  it('keeps only well-formed messages with allowed roles', () => {
    const out = readHandoffMessages(
      { messages: [{ role: 'user', content: 'ok' }, { role: 'system', content: 'x' }, { role: 'assistant' }, null, 'str'] },
      ['user', 'assistant'],
    )
    expect(out.map((m) => [m.role, m.content])).toEqual([['user', 'ok']])
    expect(readHandoffMessages(null, ['user'])).toEqual([])
  })
})
