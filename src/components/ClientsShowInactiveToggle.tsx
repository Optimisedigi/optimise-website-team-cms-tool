'use client'

/**
 * Active-only / Show-inactive toggle for the Clients list view.
 *
 * Reads ?showInactive from the URL and flips between two pill links. The
 * collection's baseListFilter on the server reads the same query param and
 * either keeps `isActive != false` (default — active clients only) or returns
 * null (show everything, including deactivated clients).
 *
 * Mirrors ProposalsShowConvertedToggle in look + behaviour so the admin keeps
 * a consistent list-toolbar vocabulary.
 */
import { useSearchParams, usePathname, useRouter } from 'next/navigation'

function ClientsShowInactiveToggle() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const showInactive = params.get('showInactive') === '1' || params.get('showInactive') === 'true'

  const setMode = (inactive: boolean) => {
    const next = new URLSearchParams(Array.from(params.entries()))
    if (inactive) next.set('showInactive', '1')
    else next.delete('showInactive')
    // Reset pagination when switching modes — the new view almost always
    // has a different row count.
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    border: active ? '1px solid #111827' : '1px solid #d1d5db',
    background: active ? '#111827' : '#ffffff',
    color: active ? '#ffffff' : '#374151',
    borderRadius: 999,
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        View:
      </span>
      <button type="button" onClick={() => setMode(false)} style={pill(!showInactive)}>
        Active only
      </button>
      <button type="button" onClick={() => setMode(true)} style={pill(showInactive)}>
        Show inactive
      </button>
      {showInactive && (
        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
          Including deactivated clients.
        </span>
      )}
    </div>
  )
}

export default ClientsShowInactiveToggle
