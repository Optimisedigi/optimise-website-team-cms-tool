'use client'

import React, { useEffect } from 'react'

/**
 * Intercepts failed RSC navigations and expired sessions to auto-recover.
 *
 * 1. **500 errors (stale RSC):** After a Vercel deployment, stale browser state
 *    can cause RSC requests to fail with 500 errors. This reloads the page.
 *
 * 2. **401 errors (expired session):** When the user's session expires, Payload
 *    API calls return 401 but the admin UI stays open with a crippled sidebar
 *    (only publicly-readable collections visible). This redirects to login.
 *
 * Uses sessionStorage to prevent infinite reload/redirect loops.
 */
const NavigationRecovery: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ) {
      const response = await originalFetch.call(window, input, init)

      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const isAdmin = url.includes('/admin')
      const isPayloadApi = url.includes('/api/')

      // ── Session expiry detection ─────────────────────────────
      // Only `/api/users/me` returning 401 reliably means the session has
      // expired. Other endpoints can return 401 for permission reasons
      // (per-user featureAccess), so treating those as expiry would
      // wrongly redirect users away from pages they're allowed to see.
      const isMeEndpoint =
        url.includes('/api/users/me') || url.endsWith('/users/me')
      if (response.status === 401 && isPayloadApi && isMeEndpoint) {
        const key = 'nav-recovery:session-expired'
        const lastRedirect = sessionStorage.getItem(key)
        const now = Date.now()

        if (!lastRedirect || now - Number(lastRedirect) > 30000) {
          sessionStorage.setItem(key, String(now))
          console.warn('[NavigationRecovery] Session expired (401 on /users/me), redirecting to login.')
          window.location.href = '/admin/login'
          return response
        }
      }

      // ── Stale RSC detection ──────────────────────────────────
      if (response.status === 500 && isAdmin) {
        // Check RSC header in both Request object headers AND init.headers
        let isRSC = false
        if (input instanceof Request) {
          isRSC = input.headers.get('RSC') === '1'
        }
        if (!isRSC && init?.headers) {
          const headers = init.headers
          isRSC =
            headers instanceof Headers
              ? headers.get('RSC') === '1'
              : Array.isArray(headers)
                ? headers.some(([k, v]) => k === 'RSC' && v === '1')
                : typeof headers === 'object' && headers !== null
                  ? (headers as Record<string, string>)['RSC'] === '1'
                  : false
        }
        // Fallback: any non-JSON 500 on admin routes is likely a broken RSC response
        const contentType = response.headers.get('content-type') || ''
        const isNonJsonError = !contentType.includes('application/json')

        if (isRSC || isNonJsonError) {
          const key = `nav-recovery:${url}`
          const lastReload = sessionStorage.getItem(key)
          const now = Date.now()

          if (!lastReload || now - Number(lastReload) > 30000) {
            sessionStorage.setItem(key, String(now))
            console.warn('[NavigationRecovery] RSC navigation returned 500, reloading page.')
            window.location.reload()
          }
        }
      }

      return response
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return <>{children}</>
}

export default NavigationRecovery
