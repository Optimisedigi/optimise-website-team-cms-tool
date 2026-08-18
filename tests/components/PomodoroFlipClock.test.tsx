import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlipClockDisplay } from '@/components/PomodoroTimer'

// Mock @payloadcms/ui which transitively imports react-image-crop CSS
vi.mock('@payloadcms/ui', () => ({
  useAuth: () => ({ user: null }),
}))

// Silence CSS module import that jsdom can't handle
vi.mock('react-image-crop/dist/ReactCrop.css', () => ({}))

describe('FlipClockDisplay — pomodoro white-card flip clock', () => {
  it('renders countdown mm:ss digits as white cards with black text', () => {
    const { container } = render(<FlipClockDisplay time="25:00" />)

    // The root flex container holds 5 children: 4 digit cards + 1 colon separator
    const root = container.querySelector('.flex.items-center.justify-center.gap-1')!
    expect(root).toBeTruthy()
    expect(root.children).toHaveLength(5)

    // Each digit card has bg-white and text-black
    const digitCards = container.querySelectorAll('.bg-white.text-black')
    expect(digitCards).toHaveLength(4)

    // Verify actual digit text — each digit renders 4x (top bg, bottom bg, top flap, bottom flap)
    const digits = Array.from(digitCards).map(el => el.textContent?.trim())
    expect(digits).toEqual(['2222', '5555', '0000', '0000'])

    // One colon separator between mm:ss
    const seps = container.querySelectorAll('.text-black\\/60')
    expect(seps).toHaveLength(1)
    expect(seps[0].textContent).toBe(':')
  })

  it('renders tracker hh:mm:ss digits with two colons when showHours=true', () => {
    const { container } = render(<FlipClockDisplay time="01:23:45" showHours />)

    const root = container.querySelector('.flex.items-center.justify-center.gap-1')!
    // 6 digit cards + 2 colon separators = 8 children
    expect(root.children).toHaveLength(8)

    const seps = container.querySelectorAll('.text-black\\/60')
    expect(seps).toHaveLength(2)
  })

  it('injects pomo-flip-top / pomo-flip-bottom keyframe styles', () => {
    render(<FlipClockDisplay time="00:00" />)

    const styleEl = document.querySelector('style')
    expect(styleEl?.textContent).toContain('pomo-flip-top')
    expect(styleEl?.textContent).toContain('pomo-flip-bottom')
    expect(styleEl?.textContent).toContain('rotateX')
  })

  it('each digit card has rounded-md and overflow-hidden classes', () => {
    const { container } = render(<FlipClockDisplay time="10:30" />)

    const digitCards = container.querySelectorAll('.bg-white.text-black')
    for (const card of digitCards) {
      expect(card.className).toContain('rounded-md')
      expect(card.className).toContain('overflow-hidden')
    }
  })
})
