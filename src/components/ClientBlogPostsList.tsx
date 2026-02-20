'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type BlogPost = {
  id: string
  title: string
  slug: string
  status: string
  author: string
  publishedDate: string
}

const statusColors: Record<string, string> = {
  published: '#22c55e',
  review: '#eab308',
  draft: '#94a3b8',
}

const ClientBlogPostsList = () => {
  const { id } = useDocumentInfo()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(
      `/api/blog-posts?where[client][equals]=${id}&sort=-publishedDate&limit=100`
    )
      .then((res) => res.json())
      .then((data) => setPosts(data.docs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (!id) return null

  if (loading) {
    return <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14 }}>Loading blog posts…</p>
  }

  if (posts.length === 0) {
    return (
      <div>
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, marginBottom: 12 }}>
          No blog posts yet for this client.
        </p>
        <a
          href="/admin/collections/blog-posts/create"
          style={{
            display: 'inline-flex',
            padding: '8px 16px',
            background: '#3b82f6',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Create Blog Post
        </a>
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 14, color: 'var(--theme-elevation-500)' }}>
          {posts.length} post{posts.length !== 1 ? 's' : ''}
        </span>
        <a
          href="/admin/collections/blog-posts/create"
          style={{
            display: 'inline-flex',
            padding: '6px 14px',
            background: '#3b82f6',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          + New Post
        </a>
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: '2px solid var(--theme-elevation-150, #e5e7eb)',
              textAlign: 'left',
            }}
          >
            <th style={{ padding: '8px 8px 8px 0', fontWeight: 600 }}>Title</th>
            <th style={{ padding: 8, fontWeight: 600 }}>Status</th>
            <th style={{ padding: 8, fontWeight: 600 }}>Author</th>
            <th style={{ padding: 8, fontWeight: 600 }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr
              key={post.id}
              style={{
                borderBottom: '1px solid var(--theme-elevation-100, #f0f0f0)',
              }}
            >
              <td style={{ padding: '10px 8px 10px 0' }}>
                <a
                  href={`/admin/collections/blog-posts/${post.id}`}
                  style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}
                >
                  {post.title || 'Untitled'}
                </a>
              </td>
              <td style={{ padding: 8 }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#fff',
                    background: statusColors[post.status] ?? '#94a3b8',
                    textTransform: 'capitalize',
                  }}
                >
                  {post.status}
                </span>
              </td>
              <td style={{ padding: 8, color: 'var(--theme-elevation-600)' }}>
                {post.author || '—'}
              </td>
              <td style={{ padding: 8, color: 'var(--theme-elevation-500)' }}>
                {post.publishedDate
                  ? new Date(post.publishedDate).toLocaleDateString()
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ClientBlogPostsList
