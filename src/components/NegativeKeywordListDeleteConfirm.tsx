'use client'

import { useEffect } from 'react'
import { wrapFetchWithNegativeKeywordListDeleteConfirm } from '../lib/confirm-negative-keyword-list-delete'

export default function NegativeKeywordListDeleteConfirm() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = wrapFetchWithNegativeKeywordListDeleteConfirm(originalFetch)
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
