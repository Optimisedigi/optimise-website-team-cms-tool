import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import SchedulePicker from '@/components/mail/SchedulePicker'

// Wed 21 Oct 2026, 6:00am local.
const NOW = () => new Date(2026, 9, 21, 6, 0)

function mount() {
  const onSchedule = vi.fn()
  render(<SchedulePicker busy={false} scheduling={false} canSchedule onSchedule={onSchedule} now={NOW} />)
  return { onSchedule }
}

const scheduled = (fn: ReturnType<typeof vi.fn>) => {
  fireEvent.click(screen.getByRole('button', { name: 'Schedule send' }))
  return fn.mock.calls.at(-1)?.[0] as Date
}

afterEach(cleanup)

describe('SchedulePicker', () => {
  it('only offers Today and Tomorrow, plus 7:48am and 8:11am with +2 buttons', () => {
    mount()
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tomorrow' })).toBeTruthy()
    expect(screen.queryByText(/afternoon|Monday/)).toBeNull()
    expect(screen.getByRole('button', { name: '7:48am' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '8:11am' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add 2 minutes to 7:48am' }).textContent).toBe('+2')
  })

  it('+2 moves a quick time on two minutes each press before picking it', () => {
    const { onSchedule } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 minutes to 8:11am' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 minutes to 8:13am' }))
    fireEvent.click(screen.getByRole('button', { name: '8:15am' }))
    expect(scheduled(onSchedule).getTime()).toBe(new Date(2026, 9, 22, 8, 15).getTime())
  })

  it('opens the calendar from anywhere on the date box and picks a day', () => {
    const { onSchedule } = mount()
    fireEvent.click(screen.getByRole('button', { name: /Send date:/ }))
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeTruthy()
    // Past days are struck out and can't be picked; today is marked.
    expect(screen.getByRole('button', { name: 'Tuesday 20 October 2026' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Wednesday 21 October 2026' }).getAttribute('aria-current')).toBe('date')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Thursday 5 November 2026' }))
    expect(screen.queryByRole('grid')).toBeNull()
    expect(scheduled(onSchedule).getTime()).toBe(new Date(2026, 10, 5, 7, 48).getTime())
  })

  it('moves between days with the arrow keys, across months', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Send date:/ }))
    const day = screen.getByRole('button', { name: 'Saturday 31 October 2026' })
    fireEvent.keyDown(day, { key: 'ArrowRight' })
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeTruthy()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Sunday 1 November 2026')
  })

  it('opens the native time picker when the time box is clicked', () => {
    mount()
    const input = screen.getByLabelText('Send time') as HTMLInputElement
    const showPicker = vi.fn()
    Object.defineProperty(input, 'showPicker', { value: showPicker })
    fireEvent.click(input)
    expect(showPicker).toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '09:30' } })
    expect(input.value).toBe('09:30')
  })
})
