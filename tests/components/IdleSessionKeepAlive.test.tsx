import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// ── useAuth mock ─────────────────────────────────────────────────────────
// The component slides Payload's session window by calling refreshCookieAsync
// from the Auth provider. We stub it so we can assert exactly when it fires.
const refreshCookieAsync = vi.fn()
let mockUser: { id: number } | null = { id: 1 }

vi.mock('@payloadcms/ui', () => ({
  useAuth: () => ({ user: mockUser, refreshCookieAsync }),
}))

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
    refreshCookieAsync.mockReset()
    refreshCookieAsync.mockResolvedValue({ id: 1 })
    mockUser = { id: 1 }
    FakeBroadcastChannel.registry.clear()
    ;(globalThis as unknown as { BroadcastChannel: typeof FakeBroadcastChannel }).BroadcastChannel =
      FakeBroadcastChannel
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('never refreshes while the user is idle', async () => {
    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    // Sit idle well beyond the throttle window across many ticks.
    await vi.advanceTimersByTimeAsync(THROTTLE_MS * 3)

    expect(refreshCookieAsync).not.toHaveBeenCalled()
  })

  it('refreshes once after local activity, then throttles further activity', async () => {
    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    fireActivity()
    await advancePastThrottle()
    expect(refreshCookieAsync).toHaveBeenCalledTimes(1)

    // A burst of activity inside the throttle window must NOT trigger more refreshes.
    fireActivity()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    fireActivity()
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(refreshCookieAsync).toHaveBeenCalledTimes(1)

    // Once the throttle elapses, a single further refresh is allowed.
    await advancePastThrottle()
    expect(refreshCookieAsync).toHaveBeenCalledTimes(2)
  })

  it('keeps the session alive when another tab reports activity', async () => {
    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    // No local activity here — a *different* tab broadcasts that the user is
    // active. This instance must treat it as its own activity and refresh.
    const otherTab = new FakeBroadcastChannel(CHANNEL_NAME)
    otherTab.postMessage({ type: 'activity' })

    await advancePastThrottle()
    expect(refreshCookieAsync).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed refresh instead of waiting a full window', async () => {
    // First refresh rejects; the failure must leave the session eligible for
    // an immediate retry on the next tick rather than consuming the window.
    refreshCookieAsync
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ id: 1 })

    render(<IdleSessionKeepAlive>child</IdleSessionKeepAlive>)

    fireActivity()
    // Advance to exactly the first throttle boundary so only one attempt fires.
    await vi.advanceTimersByTimeAsync(THROTTLE_MS)
    expect(refreshCookieAsync).toHaveBeenCalledTimes(1)

    // No new activity — but because the previous attempt failed, the very next
    // tick should retry rather than waiting another full throttle window.
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(refreshCookieAsync).toHaveBeenCalledTimes(2)
  })
})
