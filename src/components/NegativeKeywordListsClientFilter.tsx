'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation.js'

type Client = { id: string; name: string }

const pillBase: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-200, #d7dce3)',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 120ms, border-color 120ms, color 120ms',
}

const NegativeKeywordListsClientFilter = () => {
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeClientId = searchParams.get('where[client][equals]') ?? ''
  const didNavigate = useRef(false)

  useEffect(() => {
    fetch('/api/clients?limit=200&sort=name&depth=0')
      .then((res) => res.json())
      .then((data) => setClients(data.docs ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!didNavigate.current) return
    didNavigate.current = false
    const timer = setTimeout(() => {
      const filterToggle = document.getElementById('toggle-list-filters')
      if (filterToggle?.getAttribute('aria-expanded') === 'true') {
        filterToggle.click()
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [activeClientId])

  const visibleClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((client) => client.name.toLowerCase().includes(q))
  }, [clients, clientSearch])

  const selectClient = (clientId: string) => {
    didNavigate.current = true
    const url = clientId
      ? `/admin/collections/negative-keyword-lists?where[client][equals]=${clientId}`
      : '/admin/collections/negative-keyword-lists'
    router.push(url)
  }

  if (clients.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: 16,
        padding: 14,
        border: '1px solid var(--theme-elevation-100, #eef0f3)',
        borderRadius: 10,
        background: 'var(--theme-elevation-50, #f8f8f8)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Filter by client
        </label>
        <input
          type="text"
          value={clientSearch}
          onChange={(event) => setClientSearch(event.target.value)}
          placeholder="Type a client name…"
          style={{
            flex: '1 1 240px',
            maxWidth: 360,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--theme-elevation-200, #d7dce3)',
            background: '#fff',
            color: 'inherit',
            fontSize: 13,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => selectClient('')}
          style={{
            ...pillBase,
            background: activeClientId ? '#fff' : '#1d4ed8',
            borderColor: activeClientId ? 'var(--theme-elevation-200, #d7dce3)' : '#1d4ed8',
            color: activeClientId ? 'var(--theme-elevation-800, #333)' : '#fff',
          }}
        >
          All clients
        </button>
        {visibleClients.map((client) => {
          const active = String(client.id) === activeClientId
          return (
            <button
              key={client.id}
              type="button"
              onClick={() => selectClient(String(client.id))}
              style={{
                ...pillBase,
                background: active ? '#1d4ed8' : '#fff',
                borderColor: active ? '#1d4ed8' : 'var(--theme-elevation-200, #d7dce3)',
                color: active ? '#fff' : 'var(--theme-elevation-800, #333)',
              }}
            >
              {client.name}
            </button>
          )
        })}
        {visibleClients.length === 0 && (
          <span style={{ fontSize: 13, color: 'var(--theme-elevation-400, #777)', padding: '6px 0' }}>
            No clients match “{clientSearch}”.
          </span>
        )}
      </div>
    </div>
  )
}

export default NegativeKeywordListsClientFilter
