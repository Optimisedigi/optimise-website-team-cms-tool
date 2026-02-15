'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin-error]', error)
  }, [error])

  return (
    <div
      style={{
        padding: 40,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 600,
        margin: '60px auto',
      }}
    >
      <h2 style={{ color: '#e11d48', marginBottom: 12 }}>
        Something went wrong
      </h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        {error.message || 'An unexpected error occurred while loading this page.'}
      </p>
      {error.digest && (
        <p style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>
          Error digest: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        style={{
          padding: '8px 16px',
          background: '#000',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Try again
      </button>
    </div>
  )
}
