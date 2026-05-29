'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type TopicPost = {
  id: string | number
  title: string
  slug: string
  status: string
  category: string
  internalLinks: string[]
}

type TopicGroup = {
  topic: string
  posts: TopicPost[]
  linkedPages: string[]
}

const statusColors: Record<string, string> = {
  published: '#22c55e',
  review: '#eab308',
  draft: '#94a3b8',
}

const ClientTopicMap = () => {
  const { id } = useDocumentInfo()
  const [topics, setTopics] = useState<TopicGroup[]>([])
  const [totalPosts, setTotalPosts] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(`/api/blog-posts/topic-map?clientId=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setTopics(data.topics ?? [])
          setTotalPosts(data.totalPosts ?? 0)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (!id) return null

  if (loading) {
    return <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14 }}>Building topic map…</p>
  }

  if (totalPosts === 0) {
    return (
      <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14 }}>
        No blog posts yet — topic associations will appear here once posts are tagged.
      </p>
    )
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--theme-elevation-500)', margin: '0 0 16px' }}>
        Articles grouped by tag (topic cluster). Each topic shows its posts and the internal pages they link to —
        a view of how this client builds authority on a topic and how it connects to service pages.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {topics.map((group) => (
          <div
            key={group.topic}
            style={{
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: 'var(--theme-elevation-50)',
                borderBottom: '1px solid var(--theme-elevation-100)',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: group.topic === 'Untagged' ? 'var(--theme-elevation-200)' : '#3b82f6',
                  color: group.topic === 'Untagged' ? 'var(--theme-elevation-600)' : '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {group.topic}
              </span>
              <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
                {group.posts.length} article{group.posts.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ padding: '8px 14px' }}>
              {group.posts.map((post) => (
                <div
                  key={String(post.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: '1px solid var(--theme-elevation-50)',
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: statusColors[post.status] ?? '#94a3b8',
                    }}
                    title={post.status}
                  />
                  <a
                    href={`/admin/collections/blog-posts/${post.id}`}
                    style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 500, fontSize: 13, flex: 1 }}
                  >
                    {post.title}
                  </a>
                  {post.internalLinks.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--theme-elevation-400)' }}>
                      {post.internalLinks.length} internal link{post.internalLinks.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}

              {group.linkedPages.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--theme-elevation-150)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-elevation-500)', marginBottom: 6 }}>
                    Linked internal pages
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {group.linkedPages.map((page) => (
                      <span
                        key={page}
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: 'var(--theme-elevation-100)',
                          color: 'var(--theme-elevation-600)',
                        }}
                      >
                        {page}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ClientTopicMap
