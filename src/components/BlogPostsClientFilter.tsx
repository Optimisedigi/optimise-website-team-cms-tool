'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation.js'

type Client = { id: string; name: string }

const BlogPostsClientFilter = () => {
  const [clients, setClients] = useState<Client[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeClientId = searchParams.get('where[client][equals]') ?? ''
  const didNavigate = useRef(false)

  useEffect(() => {
    fetch('/api/clients?limit=100&sort=name')
      .then((res) => res.json())
      .then((data) => setClients(data.docs ?? []))
      .catch(() => {})
  }, [])

  // Collapse the filter panel that Payload auto-opens when where params are present
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

  if (clients.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <label style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
        Client:
      </label>
      <select
        value={activeClientId}
        onChange={(e) => {
          didNavigate.current = true
          const url = e.target.value
            ? `/admin/collections/blog-posts?where[client][equals]=${e.target.value}`
            : '/admin/collections/blog-posts'
          router.push(url)
        }}
        style={{
          padding: '8px 12px',
          fontSize: 14,
          borderRadius: 6,
          border: '1px solid var(--theme-elevation-250, #ccc)',
          background: 'var(--theme-elevation-50, #fff)',
          color: 'var(--theme-elevation-800, #333)',
          cursor: 'pointer',
          minWidth: 200,
        }}
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export default BlogPostsClientFilter
