'use client'

import { useState, FormEvent, ReactNode } from 'react'

export default function AuditPasswordGate({
  auditSlug,
  children,
}: {
  auditSlug: string
  children: ReactNode
}) {
  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/audit-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: auditSlug, password }),
      })

      if (res.ok) {
        setUnlocked(true)
      } else {
        setError('Incorrect password')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (unlocked) return <>{children}</>

  return (
    <div className="password-gate">
      <div className="password-gate-card">
        <h2>This report is password protected</h2>
        <p>Enter the password provided to you to view this SEO audit report.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
          />
          <button type="submit" disabled={loading || !password}>
            {loading ? 'Checking...' : 'View Report'}
          </button>
        </form>
        {error && <p className="password-error">{error}</p>}
      </div>
    </div>
  )
}
