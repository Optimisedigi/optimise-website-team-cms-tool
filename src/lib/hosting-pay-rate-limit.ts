import { hashOfferToken } from './hosting-billing'

/**
 * Per-token attempt limit for public payment-link checkout routes. Each
 * serverless instance keeps its own window: this slows guessing and
 * double-click storms, it is not a global quota.
 */
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_ATTEMPTS_PER_WINDOW = 8
const MAX_TRACKED_TOKENS = 1_000

export type RateLimiter = (token: string) => boolean

export function createTokenRateLimiter(): RateLimiter {
  const attempts = new Map<string, { count: number; until: number }>()
  return (token) => {
    const now = Date.now()
    for (const [key, state] of attempts) {
      if (state.until <= now) attempts.delete(key)
    }

    const key = hashOfferToken(token)
    const state = attempts.get(key) || { count: 0, until: now + RATE_LIMIT_WINDOW_MS }
    state.count += 1
    attempts.delete(key)
    attempts.set(key, state)

    while (attempts.size > MAX_TRACKED_TOKENS) {
      const oldestKey = attempts.keys().next().value
      if (!oldestKey) break
      attempts.delete(oldestKey)
    }

    return state.count > MAX_ATTEMPTS_PER_WINDOW
  }
}
