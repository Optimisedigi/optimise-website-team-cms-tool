'use client'

/**
 * Shows an "Agency" badge at the top of the client edit page
 * when the client record has isAgency checked.
 */
function AgencyBadge() {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      color: '#fff',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      marginBottom: 8,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      Agency
    </div>
  )
}

export default AgencyBadge
