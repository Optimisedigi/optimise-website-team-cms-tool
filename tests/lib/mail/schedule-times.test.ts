import { describe, expect, it } from 'vitest'
import { parseDatetimeLocal, schedulePresets, toDatetimeLocalValue } from '@/lib/mail/schedule-times'

const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi)

describe('schedulePresets', () => {
  it('offers this afternoon only while it is still well ahead', () => {
    expect(schedulePresets(local(2026, 10, 20, 9)).map((p) => p.label)).toContain('This afternoon')
    expect(schedulePresets(local(2026, 10, 20, 12, 30)).map((p) => p.label)).not.toContain('This afternoon')
  })

  it('offers tomorrow morning/afternoon and the next Monday', () => {
    // Wed 21 Oct 2026
    const presets = schedulePresets(local(2026, 10, 21, 15))
    expect(presets.map((p) => [p.label, toDatetimeLocalValue(p.date)])).toEqual([
      ['Tomorrow morning', '2026-10-22T08:00'],
      ['Tomorrow afternoon', '2026-10-22T13:00'],
      ['Monday morning', '2026-10-26T08:00'],
    ])
  })

  it('skips the Monday preset when tomorrow is Monday and uses next week on a Monday', () => {
    expect(schedulePresets(local(2026, 10, 18, 15)).map((p) => p.label)).not.toContain('Monday morning') // Sunday
    const monday = schedulePresets(local(2026, 10, 19, 15)).find((p) => p.label === 'Monday morning')
    expect(monday && toDatetimeLocalValue(monday.date)).toBe('2026-10-26T08:00')
  })

  it('every preset is in the future', () => {
    const now = local(2026, 10, 23, 23, 30)
    for (const preset of schedulePresets(now)) expect(preset.date.getTime()).toBeGreaterThan(now.getTime())
  })
})

describe('datetime-local helpers', () => {
  it('round-trips a local time', () => {
    const date = local(2026, 12, 5, 7, 5)
    expect(toDatetimeLocalValue(date)).toBe('2026-12-05T07:05')
    expect(parseDatetimeLocal('2026-12-05T07:05')?.getTime()).toBe(date.getTime())
  })

  it('rejects empty, malformed and impossible values', () => {
    expect(parseDatetimeLocal('')).toBeNull()
    expect(parseDatetimeLocal('2026-12-05')).toBeNull()
    expect(parseDatetimeLocal('2026-02-31T10:00')).toBeNull()
  })
})
