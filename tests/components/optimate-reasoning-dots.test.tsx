import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import OptiMateReasoningDots, { nextReasoningLevel, REASONING_DOTS } from '@/components/OptiMateReasoningDots'

describe('OptiMateReasoningDots', () => {
  it('steps off → low → medium → high → off', () => {
    expect(nextReasoningLevel('off', true)).toBe('low')
    expect(nextReasoningLevel('low', true)).toBe('medium')
    expect(nextReasoningLevel('medium', true)).toBe('high')
    expect(nextReasoningLevel('high', true)).toBe('off')
  })
  it('skips Off for models that need reasoning', () => {
    expect(nextReasoningLevel('high', false)).toBe('low')
  })
  it('lights more dots as reasoning goes up', () => {
    const lit = (v: keyof typeof REASONING_DOTS) => REASONING_DOTS[v].lit
    expect([lit('off'), lit('low'), lit('medium'), lit('high')]).toEqual([0, 2, 3, 5])
  })
  it('renders five dots and reports the next level on tap', () => {
    const onChange = vi.fn()
    const { container } = render(<OptiMateReasoningDots value="low" onChange={onChange} />)
    expect(container.querySelectorAll('.om-reasoning-dot')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: /Reasoning low/ }))
    expect(onChange).toHaveBeenCalledWith('medium')
  })
})
