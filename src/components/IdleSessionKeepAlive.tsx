'use client'

import React, { useEffect, useRef } from 'react'
import { useAuth } from '@payloadcms/ui'

/**
 * Turns Payload's absolute session timeout into a sliding IDLE timeout.
 *
 * Payload issues a JWT with a fixed `exp` at login (see `tokenExpiration` on
 * the Users collection). Its `AuthProvider` opens the "stay logged in" modal a
 * short buffer before that absolute time — so without intervention the prompt
 * always appears a fixed ~2h after login, even for someone actively working.
 *
 * This provider listens for real user activity and, while the user is active,
 * periodically calls Payload's own `refreshCookieAsync()`. That re-issues the
 * cookie (sliding `exp` forward) AND resets the AuthProvider's reminder /
 * force-logout timers, so the prompt is pushed back. When activity stops
 * everywhere, no refresh happens and the token lapses ~2h after the last
 * activity — a true idle timeout.
 *
 * Cross-tab: activity in ANY open CMS window is broadcast over a
 * BroadcastChannel. Every tab treats a remote signal like local activity and
 * refreshes its OWN session state, so a tab left open in the background (where
 * the user has unsaved progress) is kept alive as long as they're interacting
 * in any other window.
 */

// Must match `tokenExpiration` (seconds) on the Users collection.
const SESSION_TTL_MS = 7200 * 1000 // 2 hours

// While active, slide the window forward at most this often. Clamped to well
// under SESSION_TTL_MS so an active session can never lapse between refreshes.
const REFRESH_THROTTLE_MS = Math.min(5 * 60 * 1000, SESSION_TTL_MS / 2) // 5 minutes

// How often we check whether a refresh is due.
const TICK_MS = 60 * 1000 // 1 minute

// Rate-limit cross-tab activity pings so a dragged mouse doesn't flood the channel.
const BROADCAST_THROTTLE_MS = 30 * 1000 // 30 seconds

const CHANNEL_NAME = 'cms-session-activity'

const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'wheel',
  'touchstart',
  'pointerdown',
] as const

const IdleSessionKeepAlive: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshCookieAsync } = useAuth()
  const userId = user?.id ?? null

  // Keep the latest refresh fn in a ref so effect setup runs once per session,
  // not on every AuthProvider re-render.
  const refreshRef = useRef(refreshCookieAsync)
  refreshRef.current = refreshCookieAsync

  const activeSinceRefreshRef = useRef(false)
  const lastRefreshAtRef = useRef(Date.now())
  const lastBroadcastAtRef = useRef(0)
  const refreshInFlightRef = useRef(false)

  useEffect(() => {
    if (!userId) return

    // Reset accounting whenever the logged-in user changes. AuthProvider
    // already refreshes the cookie on mount, so start the clock now.
    lastRefreshAtRef.current = Date.now()
    activeSinceRefreshRef.current = false
    lastBroadcastAtRef.current = 0

    let channel: BroadcastChannel | null = null
    try {
      channel =
        typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null
    } catch {
      channel = null
    }

    const markActive = (broadcast: boolean) => {
      activeSinceRefreshRef.current = true
      if (broadcast && channel) {
        const now = Date.now()
        if (now - lastBroadcastAtRef.current >= BROADCAST_THROTTLE_MS) {
          lastBroadcastAtRef.current = now
          try {
            channel.postMessage({ type: 'activity' })
          } catch {
            /* channel closed — ignore */
          }
        }
      }
    }

    const handleLocalActivity = () => markActive(true)

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleLocalActivity, { passive: true })
    }

    if (channel) {
      channel.onmessage = (event) => {
        // A remote tab reported activity — treat it as ours, but don't
        // re-broadcast or tabs would echo forever.
        if (event.data?.type === 'activity') markActive(false)
      }
    }

    const tick = () => {
      if (refreshInFlightRef.current) return
      if (!activeSinceRefreshRef.current) return
      const now = Date.now()
      if (now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) return

      // Optimistically record the attempt so a slow refresh doesn't stack and
      // concurrent ticks don't fire overlapping requests.
      const previousRefreshAt = lastRefreshAtRef.current
      lastRefreshAtRef.current = now
      activeSinceRefreshRef.current = false
      refreshInFlightRef.current = true

      Promise.resolve(refreshRef.current?.())
        .catch(() => {
          // A failed refresh must stay eligible for retry: roll the throttle
          // clock back and re-arm the activity flag so the next tick tries
          // again instead of waiting a full window.
          lastRefreshAtRef.current = previousRefreshAt
          activeSinceRefreshRef.current = true
        })
        .finally(() => {
          refreshInFlightRef.current = false
        })
    }

    const interval = window.setInterval(tick, TICK_MS)

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleLocalActivity)
      }
      window.clearInterval(interval)
      if (channel) {
        channel.onmessage = null
        try {
          channel.close()
        } catch {
          /* ignore */
        }
      }
    }
  }, [userId])

  return <>{children}</>
}

export default IdleSessionKeepAlive
