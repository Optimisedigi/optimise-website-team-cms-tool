'use client'

/**
 * Prospects / All toggle for the Client Proposals list view.
 *
 * Reads ?showConverted from the URL and flips between two pill links.
 * The collection's baseListFilter on the server reads the same query
 * param and either keeps `proposalStatus != "client"` (default) or
 * returns null (show everything, including converted proposals).
 *
 * Mirrors ContractsTrashToggle in look + behaviour so the admin keeps
 * a consistent list-toolbar vocabulary.
 */
import { useSearchParams, usePathname, useRouter } from 'next/navigation'

function ProposalsShowConvertedToggle() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const showConverted = params.get('showConverted') === '1' || params.get('showConverted') === 'true'

  const setMode = (converted: boolean) => {
    const next = new URLSearchParams(Array.from(params.entries()))
    if (converted) next.set('showConverted', '1')
    else next.delete('showConverted')
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
      <button type="button" onClick={() => setMode(false)} style={pill(!showConverted)}>
        Prospects only
      </button>
      <button type="button" onClick={() => setMode(true)} style={pill(showConverted)}>
        Include converted
      </button>
      {showConverted && (
        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
          Showing proposals already converted to clients.
        </span>
      )}
    </div>
  )
}

export default ProposalsShowConvertedToggle
