'use client'

/**
 * Active / Trash toggle for the Contracts list view. Reads ?showTrash
 * from the URL and renders two pill links. The collection's
 * baseListFilter on the server reads the same query param and flips
 * the where clause.
 */
import { useSearchParams, usePathname, useRouter } from 'next/navigation'

function ContractsTrashToggle() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const showTrash = params.get('showTrash') === 'true'

  const setMode = (trash: boolean) => {
    const next = new URLSearchParams(Array.from(params.entries()))
    if (trash) next.set('showTrash', 'true')
    else next.delete('showTrash')
    // Reset pagination when switching modes
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
      <button type="button" onClick={() => setMode(false)} style={pill(!showTrash)}>
        Active
      </button>
      <button type="button" onClick={() => setMode(true)} style={pill(showTrash)}>
        🗑 Trash
      </button>
      {showTrash && (
        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
          Trashed contracts auto-purge 30 days after deletion.
        </span>
      )}
    </div>
  )
}

export default ContractsTrashToggle
