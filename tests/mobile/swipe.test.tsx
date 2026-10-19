import React, { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { isSwipeBack, useSwipeBack } from '@/lib/swipe'

const p = (x: number, y: number, t: number) => ({ x, y, t })

describe('isSwipeBack', () => {
  it('accepts a quick, mostly horizontal swipe to the right', () => {
    expect(isSwipeBack(p(20, 300, 0), p(180, 320, 250))).toBe(true)
  })
  it('rejects short, left, vertical-scroll and slow drags', () => {
    expect(isSwipeBack(p(20, 300, 0), p(60, 300, 100))).toBe(false)
    expect(isSwipeBack(p(200, 300, 0), p(40, 300, 100))).toBe(false)
    expect(isSwipeBack(p(20, 100, 0), p(120, 400, 200))).toBe(false)
    expect(isSwipeBack(p(20, 300, 0), p(200, 300, 2000))).toBe(false)
  })
  it('respects an edge-only zone', () => {
    expect(isSwipeBack(p(150, 300, 0), p(300, 300, 200), { edgeZone: 40 })).toBe(false)
    expect(isSwipeBack(p(10, 300, 0), p(160, 300, 200), { edgeZone: 40 })).toBe(true)
  })
})

function Harness({ onBack, enabled = true }: { onBack: () => void; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeBack(ref, onBack, enabled)
  return <div ref={ref} data-testid="panel" />
}

const touch = (x: number, y: number) => ({ clientX: x, clientY: y, identifier: 1, target: document.body })

describe('useSwipeBack', () => {
  it('fires onBack on a touch swipe right', () => {
    const onBack = vi.fn()
    const { getByTestId } = render(<Harness onBack={onBack} />)
    const el = getByTestId('panel')
    fireEvent.touchStart(el, { touches: [touch(20, 300)] })
    fireEvent.touchEnd(el, { changedTouches: [touch(200, 310)] })
    expect(onBack).toHaveBeenCalledTimes(1)
  })
  it('ignores vertical scrolling and multi-finger gestures', () => {
    const onBack = vi.fn()
    const { getByTestId } = render(<Harness onBack={onBack} />)
    const el = getByTestId('panel')
    fireEvent.touchStart(el, { touches: [touch(20, 100)] })
    fireEvent.touchEnd(el, { changedTouches: [touch(60, 500)] })
    fireEvent.touchStart(el, { touches: [touch(20, 300), touch(80, 300)] })
    fireEvent.touchEnd(el, { changedTouches: [touch(300, 300)] })
    expect(onBack).not.toHaveBeenCalled()
  })
  it('does nothing when disabled', () => {
    const onBack = vi.fn()
    const { getByTestId } = render(<Harness onBack={onBack} enabled={false} />)
    const el = getByTestId('panel')
    fireEvent.touchStart(el, { touches: [touch(20, 300)] })
    fireEvent.touchEnd(el, { changedTouches: [touch(200, 300)] })
    expect(onBack).not.toHaveBeenCalled()
  })
})
