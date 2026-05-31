'use client'

import { useEffect, useMemo, useState } from 'react'
import RocketSplash from './RocketSplash'
import SeoMigrationReviewPanel from './SeoMigrationReviewPanel'

/**
 * SEO hub — the single front door for all SEO tooling, nested under Growth
 * Tools (mirrors the Google Ads hub pattern). Renders a tabbed UI:
 *  - Post-Migration SEO Review (live tool — runs the migration health check)
 *  - deep-links to each SEO collection / page
 */

type TabKey = 'migration' | 'links'

interface SubLink {
  label: string
  description: string
  href: string
}

const COLLECTION_LINKS: SubLink[] = [
  { label: 'SEO Audit Score', description: 'Full SEO audit reports + scores', href: '/admin/collections/seo-audits' },
  { label: 'SEO Audit Proposals', description: 'Audit-backed client proposals', href: '/admin/collections/seo-audit-proposals' },
  { label: 'GSC Indexing Audits', description: 'URL Inspection coverage audits', href: '/admin/collections/gsc-indexing-audits' },
  { label: 'Indexing Helper', description: 'Bulk indexing / content refresh', href: '/admin/growth-tools/indexing-helper' },
  { label: 'GSC Alerts', description: 'Search Console monitoring alerts', href: '/admin/collections/gsc-alerts' },
  { label: 'Site Health Reports', description: 'Periodic site-health snapshots', href: '/admin/collections/site-health-reports' },
  { label: 'Internal Link Suggestions', description: 'AI internal-linking suggestions', href: '/admin/collections/internal-link-suggestions' },
]

const SeoHubPage = () => {
  const [tab, setTab] = useState<TabKey>('migration')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Honour a #migration / #links hash for deep-linking into a tab.
    const hash = window.location.hash.replace('#', '')
    if (hash === 'links' || hash === 'migration') setTab(hash)
    setReady(true)
  }, [])

  const tabs = useMemo(
    () =>
      [
        { key: 'migration' as const, label: 'Post-Migration SEO Review' },
        { key: 'links' as const, label: 'SEO Tools' },
      ],
    [],
  )

  if (!ready) return <RocketSplash />

  return (
    <div className="od-settings">
      <h2 className="od-settings__title">SEO</h2>
      <p className="od-settings__subtitle">
        SEO tooling across all clients — run a post-migration health review and
        jump into audits, indexing, alerts, and internal linking.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key)
              window.history.replaceState(null, '', `#${t.key}`)
            }}
            className={
              tab === t.key
                ? 'od-settings__btn od-settings__btn--primary'
                : 'od-settings__btn'
            }
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'migration' && <SeoMigrationReviewPanel />}

      {tab === 'links' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {COLLECTION_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="od-box"
              style={{
                display: 'block',
                padding: 16,
                textDecoration: 'none',
                color: 'inherit',
                transition: 'box-shadow 150ms, transform 150ms',
              }}
            >
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                {l.label}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{l.description}</div>
              <div style={{ marginTop: 10, color: '#2563eb', fontSize: 13, fontWeight: 500 }}>
                Open →
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default SeoHubPage
