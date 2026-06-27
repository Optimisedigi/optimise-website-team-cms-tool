'use client'

import { useEffect, useMemo, useState } from 'react'

type UserRef = {
  id: string | number
  email?: string | null
  name?: string | null
}

type WishlistItem = {
  id: string | number
  idealClient?: string | null
  website?: string | null
  why?: string | null
  addedBy?: UserRef | string | number | null
  updatedAt?: string | null
}

type DraftRow = {
  idealClient: string
  website: string
  why: string
  addedBy: string
}

const emptyDraft: DraftRow = { idealClient: '', website: '', why: '', addedBy: '' }

function userLabel(user: WishlistItem['addedBy'] | UserRef | null | undefined): string {
  if (!user) return '—'
  if (typeof user === 'string' || typeof user === 'number') return String(user)
  return user.name || user.email || String(user.id)
}

function normaliseWebsite(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function addTopBreadcrumb() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('nav[aria-label="Breadcrumb"], .step-nav'))
  const target = candidates.find((node) => !node.closest('.client-wishlist-panel'))
  if (!target || target.querySelector('[data-client-wishlist-top-crumb="true"]')) return

  const crumb = document.createElement('span')
  crumb.dataset.clientWishlistTopCrumb = 'true'
  crumb.style.display = 'inline-flex'
  crumb.style.alignItems = 'center'
  crumb.style.gap = '12px'
  crumb.style.marginLeft = '14px'

  const slash = document.createElement('span')
  slash.textContent = '/'
  slash.style.color = '#667085'

  const clients = document.createElement('a')
  clients.href = '/admin/collections/clients'
  clients.textContent = 'Client'
  clients.style.color = '#344054'
  clients.style.textDecoration = 'none'

  const divider = document.createElement('span')
  divider.textContent = '/'
  divider.style.color = '#667085'

  const current = document.createElement('span')
  current.textContent = 'Client Wishlist'
  current.style.color = '#344054'

  crumb.append(slash, clients, divider, current)
  target.appendChild(crumb)
}

export default function ClientWishlistGrid() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [draft, setDraft] = useState<DraftRow>(emptyDraft)
  const [currentUser, setCurrentUser] = useState<UserRef | null>(null)
  const [users, setUsers] = useState<UserRef[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | number | 'new' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const canCreate = useMemo(() => draft.idealClient.trim().length > 0, [draft.idealClient])

  const load = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const [itemsRes, meRes, usersRes] = await Promise.all([
        fetch('/api/client-wishlist-items?limit=200&sort=-createdAt&depth=1', { credentials: 'include' }),
        fetch('/api/users/me', { credentials: 'include' }),
        fetch('/api/users?limit=200&sort=email&depth=0', { credentials: 'include' }),
      ])
      const [itemsJson, meJson, usersJson] = await Promise.all([
        itemsRes.json().catch(() => ({})),
        meRes.json().catch(() => ({})),
        usersRes.json().catch(() => ({})),
      ])
      if (!itemsRes.ok) throw new Error(itemsJson?.errors?.[0]?.message || 'Failed to load client wishlist')
      setItems(Array.isArray(itemsJson?.docs) ? itemsJson.docs : [])
      const me = meJson?.user || null
      setCurrentUser(me)
      setUsers(Array.isArray(usersJson?.docs) ? usersJson.docs : [])
      setDraft((current) => current.addedBy || !me?.id ? current : { ...current, addedBy: String(me.id) })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load client wishlist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    addTopBreadcrumb()
    const observer = new MutationObserver(addTopBreadcrumb)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      document.querySelectorAll('[data-client-wishlist-top-crumb="true"]').forEach((node) => node.remove())
    }
  }, [])

  const createRow = async () => {
    if (!canCreate || savingId) return
    setSavingId('new')
    setMessage(null)
    try {
      const res = await fetch('/api/client-wishlist-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          idealClient: draft.idealClient.trim(),
          website: normaliseWebsite(draft.website),
          why: draft.why.trim(),
          addedBy: draft.addedBy || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.errors?.[0]?.message || 'Failed to add wishlist row')
      setDraft(emptyDraft)
      await load()
      setMessage('Wishlist row added.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add wishlist row')
    } finally {
      setSavingId(null)
    }
  }

  const updateRow = async (item: WishlistItem, patch: Partial<DraftRow>) => {
    const next = {
      idealClient: patch.idealClient ?? item.idealClient ?? '',
      website: patch.website ?? item.website ?? '',
      why: patch.why ?? item.why ?? '',
      addedBy: patch.addedBy ?? String(typeof item.addedBy === 'object' && item.addedBy ? item.addedBy.id : item.addedBy || ''),
    }
    const optimisticAddedBy = users.find((user) => String(user.id) === next.addedBy) || next.addedBy || null
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, ...next, addedBy: optimisticAddedBy } : row)))
    setSavingId(item.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/client-wishlist-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          idealClient: next.idealClient.trim(),
          website: normaliseWebsite(next.website),
          why: next.why.trim(),
          addedBy: next.addedBy || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.errors?.[0]?.message || 'Failed to save wishlist row')
      setItems((current) => current.map((row) => (row.id === item.id ? { ...json, addedBy: optimisticAddedBy } : row)))
      setMessage('Saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save wishlist row')
      await load()
    } finally {
      setSavingId(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid #d7dce3',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 14,
    background: '#fff',
    color: '#1f2937',
  }

  return (
    <section className="client-wishlist-panel" aria-labelledby="client-wishlist-title">
      <div className="client-wishlist-panel__header">
        <div>
          <h1 id="client-wishlist-title">Client Wishlist</h1>
          <p>Add one ideal client per row. This works like a spreadsheet and saves each row as its own wishlist item.</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {message ? <p className="client-wishlist-panel__message" role="status">{message}</p> : null}

      <div className="client-wishlist-grid" role="region" aria-label="Client wishlist spreadsheet" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Website</th>
              <th>Person adding it</th>
              <th>Why</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="client-wishlist-grid__new-row">
              <td>
                <label className="sr-only" htmlFor="wishlist-new-name">New wishlist client name</label>
                <input
                  id="wishlist-new-name"
                  value={draft.idealClient}
                  onChange={(event) => setDraft((current) => ({ ...current, idealClient: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canCreate) void createRow()
                  }}
                  placeholder="e.g. Carma"
                  style={inputStyle}
                />
              </td>
              <td>
                <label className="sr-only" htmlFor="wishlist-new-website">New wishlist website</label>
                <input
                  id="wishlist-new-website"
                  value={draft.website}
                  onChange={(event) => setDraft((current) => ({ ...current, website: event.target.value }))}
                  placeholder="https://example.com"
                  style={inputStyle}
                />
              </td>
              <td>
                <label className="sr-only" htmlFor="wishlist-new-added-by">Person adding new wishlist client</label>
                <select
                  id="wishlist-new-added-by"
                  value={draft.addedBy || (currentUser?.id ? String(currentUser.id) : '')}
                  onChange={(event) => setDraft((current) => ({ ...current, addedBy: event.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Select person…</option>
                  {users.map((user) => <option key={user.id} value={String(user.id)}>{userLabel(user)}</option>)}
                </select>
              </td>
              <td>
                <label className="sr-only" htmlFor="wishlist-new-why">Why this client is wanted</label>
                <textarea
                  id="wishlist-new-why"
                  value={draft.why}
                  onChange={(event) => setDraft((current) => ({ ...current, why: event.target.value }))}
                  placeholder="Why would they be a great client?"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </td>
              <td>
                <button type="button" onClick={createRow} disabled={!canCreate || savingId === 'new'}>
                  {savingId === 'new' ? 'Adding…' : 'Add row'}
                </button>
              </td>
            </tr>

            {loading ? (
              <tr><td colSpan={5}>Loading wishlist…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5}>No wishlist rows yet. Add the first one above.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id}>
                <td>
                  <label className="sr-only" htmlFor={`wishlist-name-${item.id}`}>Client name</label>
                  <input
                    id={`wishlist-name-${item.id}`}
                    defaultValue={item.idealClient || ''}
                    onBlur={(event) => {
                      const value = event.target.value
                      if (value !== (item.idealClient || '')) void updateRow(item, { idealClient: value })
                    }}
                    style={inputStyle}
                  />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`wishlist-website-${item.id}`}>Website</label>
                  <input
                    id={`wishlist-website-${item.id}`}
                    defaultValue={item.website || ''}
                    onBlur={(event) => {
                      const value = event.target.value
                      if (value !== (item.website || '')) void updateRow(item, { website: value })
                    }}
                    placeholder="https://example.com"
                    style={inputStyle}
                  />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`wishlist-added-by-${item.id}`}>Person adding it</label>
                  <select
                    id={`wishlist-added-by-${item.id}`}
                    defaultValue={String(typeof item.addedBy === 'object' && item.addedBy ? item.addedBy.id : item.addedBy || '')}
                    onChange={(event) => void updateRow(item, { addedBy: event.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Select person…</option>
                    {users.map((user) => <option key={user.id} value={String(user.id)}>{userLabel(user)}</option>)}
                  </select>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`wishlist-why-${item.id}`}>Why</label>
                  <textarea
                    id={`wishlist-why-${item.id}`}
                    defaultValue={item.why || ''}
                    onBlur={(event) => {
                      const value = event.target.value
                      if (value !== (item.why || '')) void updateRow(item, { why: value })
                    }}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </td>
                <td>{savingId === item.id ? 'Saving…' : 'Saved'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
