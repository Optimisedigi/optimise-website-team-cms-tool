import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { notificationCategory } from '@/lib/notification-categories'

describe('notification categories', () => {
  it('puts every notification kind the collection allows into a real category', () => {
    const source = readFileSync('src/collections/Notifications.ts', 'utf8')
    const kinds = [...source.matchAll(/value: "([^"]+)"/g)].map((match) => match[1] ?? '')
    expect(kinds.length).toBeGreaterThan(0)
    for (const kind of kinds) expect(notificationCategory(kind).key, kind).not.toBe('other')
  })

  it('groups kinds as agreed and falls back to Other', () => {
    expect(notificationCategory('client-email-received').label).toBe('Email')
    expect(notificationCategory('mail-follow-up-due').label).toBe('Email')
    expect(notificationCategory('google-ads-budget-review').label).toBe('Google Ads')
    expect(notificationCategory('goal-run-escalation').label).toBe('Agents')
    expect(notificationCategory('site-health-regression').label).toBe('SEO & site')
    expect(notificationCategory('invoice-statements-ready').label).toBe('Contracts & billing')
    expect(notificationCategory('meeting-confirmed').label).toBe('Meetings')
    expect(notificationCategory('team-task-mention').label).toBe('Team')
    expect(notificationCategory('something-new').label).toBe('Other')
    expect(notificationCategory(undefined).label).toBe('Other')
  })
})
