import { describe, expect, it } from 'vitest'
import {
  buildContentMateVoiceSession,
  emptyBlogIdeaDraft,
  mergeBlogIdeaDraft,
  resolveSaveTarget,
  validateBlogIdeaSaveRequest,
} from '@/lib/contentmate/blog-idea'

const clients = [{ id: '1', name: 'Acme' }, { id: '2', name: 'Beta' }]

describe('ContentMate blog idea rules', () => {
  it('updates the current idea unless there is none or the user moved on', () => {
    const current = { id: '7', clientId: '1', clientName: 'Acme', draft: { ...emptyBlogIdeaDraft(), blogIdea: 'x' } }
    expect(resolveSaveTarget(current, 'update_current')).toEqual({ kind: 'update', id: '7' })
    expect(resolveSaveTarget(current, 'new_idea')).toEqual({ kind: 'create' })
    expect(resolveSaveTarget(null, 'update_current')).toEqual({ kind: 'create' })
  })

  it('an update changes the fields it mentions and keeps the rest', () => {
    const base = { ...emptyBlogIdeaDraft(), blogIdea: 'Speed', mainPoint: 'Fast sites win', clientId: '1', clientName: 'Acme' }
    const merged = mergeBlogIdeaDraft(base, { ...emptyBlogIdeaDraft(), blogIdea: 'Speed for plumbers', primaryKeywords: 'plumber seo' })
    expect(merged).toMatchObject({ blogIdea: 'Speed for plumbers', mainPoint: 'Fast sites win', primaryKeywords: 'plumber seo', clientId: '1' })
  })

  it('validates save requests: known client, all fields, explicit action', () => {
    const ok = validateBlogIdeaSaveRequest({ blogIdea: 'Idea', keyPoints: 'a\nb', clientId: '2', ideaAction: 'new_idea' }, clients)
    expect(ok).toEqual({ ok: true, value: { action: 'new_idea', draft: expect.objectContaining({ keyPoints: 'a\nb', clientName: 'Beta' }) } })
    expect(validateBlogIdeaSaveRequest({ blogIdea: 'Idea', clientId: '9', ideaAction: 'new_idea' }, clients).ok).toBe(false)
    expect(validateBlogIdeaSaveRequest({ blogIdea: 'Idea', clientId: '1' }, clients).ok).toBe(false)
  })

  it('the voice session lists the clients as data and offers propose + save', () => {
    const session = buildContentMateVoiceSession(clients)
    expect(session.tools.map((t) => t.name)).toEqual(['propose_blog_idea', 'save_blog_idea'])
    expect(session.instructions).toContain('{"id":"2","name":"Beta"}')
    expect(session.instructions).toMatch(/update_current/)
  })
})
