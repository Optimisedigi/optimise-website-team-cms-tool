'use client'

import { useEffect, useState } from 'react'

type Client = { id: string; name: string }

const ViewClientPostsLink = () => {
  const [clients, setClients] = useState<Client[]>([])

  useEffect(() => {
    fetch('/api/clients?limit=100&sort=name')
      .then((res) => res.json())
      .then((data) => setClients(data.docs ?? []))
      .catch(() => {})
  }, [])

  if (clients.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <label
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        View posts by client
      </label>
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            window.location.href = `/admin/collections/blog-posts?where[client][equals]=${e.target.value}`
          }
        }}
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 13,
          borderRadius: 6,
          border: '1px solid var(--theme-elevation-250, #ccc)',
          background: 'var(--theme-elevation-50, #fff)',
          color: 'var(--theme-elevation-800, #333)',
          cursor: 'pointer',
        }}
      >
        <option value="" disabled>
          Select a client…
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export default ViewClientPostsLink
