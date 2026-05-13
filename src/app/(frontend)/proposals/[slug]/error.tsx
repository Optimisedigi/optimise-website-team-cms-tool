'use client'

/**
 * Route-level error boundary for /proposals/[slug].
 *
 * Two failure modes we care about distinctly:
 *
 *  1. Schema drift — the underlying DB is missing a table or column the
 *     current build's Payload config expects. This is the bug class the
 *     `onInit` auto-heal in `payload.config.ts` exists to prevent, but if
 *     auto-heal itself fails or someone forgot to register the table in
 *     `runMigrations`, we surface an *actionable* message naming the missing
 *     table/column and the exact fix (POST /api/migrate) instead of the
 *     useless generic "Application error".
 *
 *  2. Anything else — a sanitised "Something went wrong" card that exposes
 *     only Next.js's `error.digest` (a server-correlation ID) and never the
 *     raw error message, since these pages are PIN-gated but still
 *     prospect-facing.
 *
 * Per Next.js App Router: this file must be a Client Component (it receives
 * an `error` prop that may include client-only fields and a `reset` function
 * that re-renders the route segment).
 */

type SchemaDrift =
  | { kind: 'table'; name: string }
  | { kind: 'column'; name: string }
  | null

function detectSchemaDrift(message: string): SchemaDrift {
  const tableMatch = message.match(/no such table:?\s*(\S+)/i)
  if (tableMatch?.[1]) return { kind: 'table', name: tableMatch[1] }
  const columnMatch = message.match(/no such column:?\s*(\S+)/i)
  if (columnMatch?.[1]) return { kind: 'column', name: columnMatch[1] }
  return null
}

export default function ProposalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const drift = detectSchemaDrift(error.message ?? '')

  const wrapStyle: React.CSSProperties = {
    minHeight: '100vh',
    background:
      'radial-gradient(1200px 800px at 20% 10%, #1a1f3a 0%, #0a0e1f 60%, #05070f 100%)',
    color: '#e6e8f0',
    fontFamily:
      '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  }

  const cardStyle: React.CSSProperties = {
    maxWidth: 560,
    width: '100%',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: '32px 28px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(10px)',
  }

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: '#fff',
  }

  const subtitleStyle: React.CSSProperties = {
    margin: '8px 0 20px',
    fontSize: 14,
    color: 'rgba(230, 232, 240, 0.6)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }

  const bodyStyle: React.CSSProperties = {
    margin: '0 0 24px',
    fontSize: 15,
    lineHeight: 1.6,
    color: 'rgba(230, 232, 240, 0.85)',
  }

  const codeStyle: React.CSSProperties = {
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: 13,
    background: 'rgba(0, 0, 0, 0.35)',
    padding: '2px 6px',
    borderRadius: 4,
    color: '#9ec5ff',
  }

  const buttonStyle: React.CSSProperties = {
    appearance: 'none',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const digestStyle: React.CSSProperties = {
    marginTop: 20,
    fontSize: 12,
    color: 'rgba(230, 232, 240, 0.4)',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  }

  if (drift) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle} role="alert">
          <p style={subtitleStyle}>Mission control</p>
          <h1 style={titleStyle}>Schema needs migration</h1>
          <p style={bodyStyle}>
            Production database is missing{' '}
            {drift.kind === 'table' ? 'table' : 'column'}{' '}
            <code style={codeStyle}>{drift.name}</code>.
          </p>
          <p style={bodyStyle}>
            Run{' '}
            <code style={codeStyle}>POST /api/migrate</code>{' '}
            (header{' '}
            <code style={codeStyle}>x-api-key: $AUDIT_API_KEY</code>) to sync
            the schema, then refresh.
          </p>
          <button type="button" onClick={reset} style={buttonStyle}>
            Try again
          </button>
          {error.digest && (
            <p style={digestStyle}>digest: {error.digest}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle} role="alert">
        <p style={subtitleStyle}>Mission control</p>
        <h1 style={titleStyle}>Something went wrong</h1>
        <p style={bodyStyle}>
          We hit an unexpected error loading this proposal. Try again, or
          reach out to your account contact if it keeps happening.
        </p>
        <button type="button" onClick={reset} style={buttonStyle}>
          Try again
        </button>
        {error.digest && (
          <p style={digestStyle}>digest: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
