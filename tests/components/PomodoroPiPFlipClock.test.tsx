import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'

// Mock @payloadcms/ui which transitively imports react-image-crop CSS
vi.mock('@payloadcms/ui', () => ({
  useAuth: () => ({ user: null }),
}))

// Silence CSS module import that jsdom can't handle
vi.mock('react-image-crop/dist/ReactCrop.css', () => ({}))

/**
 * PiP portal must use FlipClockDisplay (matching the in-panel format)
 * wrapped in a container with exactly scale(1.3).
 *
 * We mock `documentPictureInPicture.requestWindow` BEFORE importing the
 * hook so that `pipSupported = true` on first render, then trigger openPip
 * and assert on the portal rendered into the mock pip window's document.
 */
describe('PiP portal — uses FlipClockDisplay at 1.3× scale', () => {
  // Shared mock pip window so we can query its document after portal renders
  let pipDoc: Document
  let cleanup: (() => void) | undefined

  beforeEach(() => {
    vi.resetModules()

    pipDoc = document.implementation.createHTMLDocument('pip')
    const mockPipWindow = {
      document: pipDoc,
      addEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as Window

    ;(window as unknown as Record<string, unknown>).documentPictureInPicture = {
      requestWindow: vi.fn().mockResolvedValue(mockPipWindow),
    }
  })

  afterEach(() => {
    cleanup?.()
    delete (window as unknown as Record<string, unknown>).documentPictureInPicture
    vi.restoreAllMocks()
  })

  it('renders FlipClockDisplay (white digit cards) instead of plain text in the PiP portal', async () => {
    // Confirm the mock is in place before importing
    expect('documentPictureInPicture' in window).toBe(true)

    const { usePomodoro, PomodoroBody } = await import('@/components/PomodoroTimer')

    function TestHarness() {
      const pomo = usePomodoro()
      return (
        <>
          <PomodoroBody pomo={pomo} />
          {pomo.pipPortal}
        </>
      )
    }

    let result: ReturnType<typeof render>
    await act(async () => {
      result = render(<TestHarness />)
      cleanup = result.unmount
    })

    // Verify the PiP button rendered (title is "Pop out to floating window")
    const pipButton = result!.container.querySelector('[title="Pop out to floating window"]') as HTMLButtonElement
    expect(pipButton).toBeTruthy()

    // Click to open PiP
    await act(async () => {
      pipButton.click()
      await new Promise((r) => setTimeout(r, 100))
    })

    // Verify requestWindow was called (openPip ran)
    const pipCall = (window as unknown as { documentPictureInPicture: { requestWindow: ReturnType<typeof vi.fn> } })
      .documentPictureInPicture.requestWindow
    expect(pipCall).toHaveBeenCalled()

    // The portal renders into pipDoc.body via createPortal
    // FlipClockDisplay renders .bg-white.text-black digit cards (4 for mm:ss)
    const pipDigitCards = pipDoc.querySelectorAll('.bg-white.text-black')
    expect(pipDigitCards.length).toBe(4)

    // Should NOT contain plain-text timer (a div with just "25:00" and no digit cards)
    const allDivs = pipDoc.querySelectorAll('div')
    for (const div of allDivs) {
      // A plain-text timer would be a leaf div whose only text is a time string
      if (div.children.length === 0 && /^\d{2}:\d{2}$/.test(div.textContent ?? '')) {
        expect.fail(
          `PiP portal contains plain-text timer "${div.textContent}" — should use FlipClockDisplay instead`,
        )
      }
    }
  })

  it('wraps FlipClockDisplay in a container with exactly scale(1.3)', async () => {
    expect('documentPictureInPicture' in window).toBe(true)

    const { usePomodoro, PomodoroBody } = await import('@/components/PomodoroTimer')

    function TestHarness() {
      const pomo = usePomodoro()
      return (
        <>
          <PomodoroBody pomo={pomo} />
          {pomo.pipPortal}
        </>
      )
    }

    let result: ReturnType<typeof render>
    await act(async () => {
      result = render(<TestHarness />)
      cleanup = result.unmount
    })

    const pipButton = result!.container.querySelector('[title="Pop out to floating window"]') as HTMLButtonElement
    await act(async () => {
      pipButton.click()
      await new Promise((r) => setTimeout(r, 100))
    })

    // Find the scale(1.3) wrapper in the pip document
    const styledEls = pipDoc.querySelectorAll('[style]')
    let scaleWrapper: Element | null = null
    for (const el of styledEls) {
      const style = el.getAttribute('style') ?? ''
      if (style.includes('scale(1.3)')) {
        scaleWrapper = el
        break
      }
    }
    expect(scaleWrapper).toBeTruthy()

    // The scale wrapper's transformOrigin should be center
    const style = scaleWrapper!.getAttribute('style') ?? ''
    expect(style).toContain('transform-origin')
    expect(style).toContain('center')

    // The scale wrapper should contain the FlipClockDisplay digit cards
    const digitCardsInside = scaleWrapper!.querySelectorAll('.bg-white.text-black')
    expect(digitCardsInside.length).toBe(4)
  })
})
