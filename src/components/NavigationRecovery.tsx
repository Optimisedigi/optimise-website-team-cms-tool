'use client'

import React, { useEffect } from 'react'

/**
 * Intercepts failed RSC navigations (500 errors) and forces a full page reload.
 *
 * After a Vercel deployment, stale browser state can cause RSC requests to fail
 * with 500 errors (the "router state header could not be parsed" error). This
 * leaves the page with a blank content area and no error boundary catch.
 *
 * This provider monkey-patches `fetch` to detect these failures and auto-recover
 * by reloading the page. Uses sessionStorage to prevent infinite reload loops.
 */
const NavigationRecovery: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ) {
      const response = await originalFetch.call(window, input, init)

      if (response.status === 500) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        const isAdmin = url.includes('/admin')

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

        if ((isRSC || isNonJsonError) && isAdmin) {
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
