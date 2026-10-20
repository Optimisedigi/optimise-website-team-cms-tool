import { describe, expect, it } from 'vitest'
import {
  addMinutesToTime,
  calendarWeeks,
  combineDateAndTime,
  dateKey,
  defaultScheduleChoice,
  formatTime12,
  parseDateKey,
  parseDatetimeLocal,
  QUICK_SEND_TIMES,
  toDatetimeLocalValue,
} from '@/lib/mail/schedule-times'

const local = (y: number, m: number, d: number, h = 0, mi = 0, sec = 0) => new Date(y, m - 1, d, h, mi, sec)

describe('quick schedule choices', () => {
  it('opens on today at 7:48am while that is still ahead, otherwise tomorrow', () => {
    expect(defaultScheduleChoice(local(2026, 10, 21, 6, 0))).toEqual({ day: '2026-10-21', time: '07:48' })
    expect(defaultScheduleChoice(local(2026, 10, 21, 7, 47, 30))).toEqual({ day: '2026-10-22', time: '07:48' })
    expect(defaultScheduleChoice(local(2026, 10, 31, 15))).toEqual({ day: '2026-11-01', time: '07:48' })
  })

  it('offers 7:48am and 8:11am, and +2 moves a time by two minutes, wrapping at midnight', () => {
    expect(QUICK_SEND_TIMES.map(formatTime12)).toEqual(['7:48am', '8:11am'])
    expect(addMinutesToTime('07:48', 2)).toBe('07:50')
    expect(addMinutesToTime('08:59', 2)).toBe('09:01')
    expect(addMinutesToTime('23:59', 2)).toBe('00:01')
    expect(formatTime12('12:05')).toBe('12:05pm')
    expect(formatTime12('00:10')).toBe('12:10am')
  })

  it('combines a day and a time in local time and rejects bad input', () => {
    expect(combineDateAndTime('2026-10-22', '08:11')?.getTime()).toBe(local(2026, 10, 22, 8, 11).getTime())
    expect(combineDateAndTime('2026-02-30', '08:11')).toBeNull()
    expect(parseDateKey('2026-10-22')?.getTime()).toBe(local(2026, 10, 22).getTime())
    expect(parseDateKey('nope')).toBeNull()
    expect(dateKey(local(2026, 1, 5))).toBe('2026-01-05')
  })
})

describe('calendarWeeks', () => {
  it('lays out a month Sunday first with neighbouring days', () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const weeks = calendarWeeks(2026, 9)
    expect(weeks).toHaveLength(5)
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(dateKey(weeks[0]![0]!)).toBe('2026-09-27')
    expect(dateKey(weeks[4]![6]!)).toBe('2026-10-31')
    // February 2026 starts on a Sunday: exactly four weeks.
    expect(calendarWeeks(2026, 1)).toHaveLength(4)
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
