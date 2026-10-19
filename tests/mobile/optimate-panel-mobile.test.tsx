import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@payloadcms/ui', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }))
vi.mock('@/components/OptiMateMultiChat', () => ({ default: () => <div />, __esModule: true }))
vi.mock('@/components/InvoiceAssistantChat', () => ({ default: () => <div /> }))
vi.mock('@/components/GmailReplyChat', () => ({ default: () => <div /> }))
vi.mock('@/components/TaskMateChat', () => ({ default: () => <div /> }))
vi.mock('@/components/AdminMateChat', () => ({ default: () => <div /> }))
vi.mock('@/components/ClientEmailAlert', () => ({ default: () => null }))
vi.mock('@/components/RocketSplash', () => ({ default: () => null }))
vi.mock('@/components/PomodoroTimer', () => ({
  usePomodoro: () => new Proxy({}, { get: () => () => {} }),
  PomodoroBody: () => null,
}))

import OptiMateLauncher from '@/components/OptiMateLauncher'

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && /max-width/.test(query),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('OptiMate panel on mobile', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ docs: [] }) })) as unknown as typeof fetch
  })

  it('closes on the phone back button', () => {
    setViewport(true)
    const { container } = render(<OptiMateLauncher><div /></OptiMateLauncher>)
    fireEvent.click(screen.getByLabelText('Ask OptiMate'))
    expect(container.ownerDocument.querySelector('.om-panel')).not.toBeNull()
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(container.ownerDocument.querySelector('.om-panel')).toBeNull()
  })

  it('does not hijack history on desktop', () => {
    setViewport(false)
    const push = vi.spyOn(window.history, 'pushState')
    render(<OptiMateLauncher><div /></OptiMateLauncher>)
    fireEvent.click(screen.getByLabelText('Ask OptiMate'))
    expect(push).not.toHaveBeenCalled()
    push.mockRestore()
  })
})
