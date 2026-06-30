'use client'

import { useEffect, useRef } from 'react'

const TARGET_PATH = '/admin/collections/negative-keyword-lists'
const RECENT_SAVE_WINDOW_MS = 8000

function isNegativeKeywordAdminPath() {
  return window.location.pathname.startsWith(TARGET_PATH)
}

function findStaleReloadButton() {
  const button = document.querySelector<HTMLButtonElement>('#document-stale-data-reload')
  if (button) return button

  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
    /reload document/i.test(candidate.textContent || ''),
  )
}

function isNegativeKeywordSave(url: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method || (url instanceof Request ? url.method : 'GET')).toUpperCase()
  if (method !== 'PATCH' && method !== 'POST') return false

  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
  return href.includes('/api/negative-keyword-lists')
}

export default function NegativeKeywordStaleReload() {
  const lastSuccessfulSaveAt = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const originalFetch = window.fetch

    const reloadIfSafe = () => {
      if (!isNegativeKeywordAdminPath()) return
      if (Date.now() - lastSuccessfulSaveAt.current > RECENT_SAVE_WINDOW_MS) return

      const reloadButton = findStaleReloadButton()
      if (!reloadButton) return

      lastSuccessfulSaveAt.current = 0
      reloadButton.click()
    }

    const negativeKeywordFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init)

      if (response.ok && isNegativeKeywordSave(input, init)) {
        lastSuccessfulSaveAt.current = Date.now()
        window.setTimeout(reloadIfSafe, 100)
      }

      return response
    }

    window.fetch = negativeKeywordFetch

    const observer = new MutationObserver(reloadIfSafe)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      if (window.fetch === negativeKeywordFetch) {
        window.fetch = originalFetch
      }
      observer.disconnect()
    }
  }, [])

  return null
}
