import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// ── useAuth + refresh endpoint mocks ──────────────────────────────────────
const setUser = vi.fn()
const fetchMock = vi.fn()
const originalFetch = globalThis.fetch
let mockUser: { id: number } | null = { id: 1 }

vi.mock('@payloadcms/ui', () => ({
  useAuth: () => ({ user: mockUser, setUser }),
}))

const successfulRefresh = () =>
  new Response(
    JSON.stringify({ exp: 2_000_000_000, refreshedToken: 'refreshed', user: { id: 1 } }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )

// ── BroadcastChannel polyfill (jsdom has none) ───────────────────────────
// Minimal in-memory implementation that connects instances by channel name so
// we can simulate a second tab posting activity.
class FakeBroadcastChannel {
  static registry = new Map<string, FakeBroadcastChannel[]>()
  name: string
  onmessage: ((ev: { data: unknown }) => void) | null = null
  constructor(name: string) {
    this.name = name
    const list = FakeBroadcastChannel.registry.get(name) ?? []
    list.push(this)
    FakeBroadcastChannel.registry.set(name, list)
  }
  postMessage(data: unknown) {
    for (const chan of FakeBroadcastChannel.registry.get(this.name) ?? []) {
      if (chan !== this && chan.onmessage) chan.onmessage({ data })
    }
  }
  close() {
    const list = FakeBroadcastChannel.registry.get(this.name)
    if (!list) return
    const i = list.indexOf(this)
    if (i >= 0) list.splice(i, 1)
  }
}

import IdleSessionKeepAlive from '@/components/IdleSessionKeepAlive'

// Must mirror the constants inside the component.
const TICK_MS = 60 * 1000
const THROTTLE_MS = 5 * 60 * 1000
const CHANNEL_NAME = 'cms-session-activity'

function fireActivity() {
  window.dispatchEvent(new Event('keydown'))
}

/** Advance enough wall-clock (and ticks) to clear the refresh throttle. */
async function advancePastThrottle() {
  await vi.advanceTimersByTimeAsync(THROTTLE_MS + TICK_MS)
}

describe('IdleSessionKeepAlive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setUser.mockReset()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => successfulRefresh())
    globalThis.fetch = fetchMock as typeof fetch
    mockUser = { id: 1 }
    FakeBroadcastChannel.registry.clear()
    ;(globalThis as unknown as { BroadcastChannel: typeof FakeBroadcastChannel }).BroadcastChannel =
      FakeBroadcastChannel
  })

  afterEach(() => {
    cleanup()
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it('never refreshes while the user is idle', async () => {
    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    // Sit idle well beyond the throttle window across many ticks.
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 3)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes once after local activity, then throttles further activity', async () => {
    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    fireActivity()
    await advancePastThrottle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/users/refresh-token',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(setUser).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'refreshed',
        user: expect.objectContaining({ id: 1 }),
      }),
    )

    // A burst of activity inside the throttle window must NOT trigger more refreshes.
    fireActivity()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    fireActivity()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Once the throttle elapses, a single further refresh is allowed.
    await advancePastThrottle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the session alive when another tab reports activity', async () => {
    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    // No local activity here — a *different* tab broadcasts that the user is
    // active. This instance must treat it as its own activity and refresh.
    const otherTab = new FakeBroadcastChannel(CHANNEL_NAME)
    otherTab.postMessage({ type: 'activity' })

    await advancePastThrottle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries after a network failure instead of waiting a full window', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementation(async () => successfulRefresh())

    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    fireActivity()
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(setUser).not.toHaveBeenCalled()

    // No new activity: the failed attempt remains eligible on the next tick.
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(setUser).toHaveBeenCalledTimes(1)
  })

  it('keeps the current user and retries after a non-200 refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementation(async () => successfulRefresh())

    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    fireActivity()
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(setUser).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(setUser).toHaveBeenCalledTimes(1)
  })
})
