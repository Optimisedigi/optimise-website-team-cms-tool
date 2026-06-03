'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { Icon, type IconKey } from './Icon'

type NavItem = { key: string; label: string; icon: IconKey; badge?: string }
type NavGroup = { heading: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Performance',
    items: [
      { key: 'analytics', label: 'Google Analytics', icon: 'analytics' },
      { key: 'search-console', label: 'Search Console', icon: 'search-console' },
      { key: 'deployments', label: 'Deployments', icon: 'deployments' },
    ],
  },
  {
    heading: 'Clients',
    items: [
      { key: 'clients', label: 'Clients', icon: 'clients', badge: '24' },
      { key: 'proposals', label: 'Proposals', icon: 'proposals' },
      { key: 'processes', label: 'Client Processes', icon: 'processes' },
    ],
  },
  {
    heading: 'Growth Tools',
    items: [
      { key: 'google-ads', label: 'Google Ads', icon: 'google-ads' },
      { key: 'seo', label: 'SEO', icon: 'seo' },
      { key: 'indexing', label: 'Indexing Helper', icon: 'indexing' },
      { key: 'negative-keywords', label: 'Negative Keyword Lists', icon: 'negative-keywords' },
    ],
  },
  {
    heading: 'Content',
    items: [
      { key: 'blog-posts', label: 'Blog Posts', icon: 'blog-posts' },
      { key: 'blog-prompter', label: 'Blog Prompter', icon: 'blog-prompter' },
      { key: 'job-posts', label: 'Job Posts', icon: 'job-posts' },
      { key: 'media', label: 'Media', icon: 'media' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { key: 'invoices', label: 'Invoices', icon: 'invoices' },
      { key: 'invoice-statements', label: 'Invoice Statements', icon: 'invoice-statements', badge: '3' },
      { key: 'business-costs', label: 'Business Costs', icon: 'business-costs' },
    ],
  },
  {
    heading: 'Agent',
    items: [
      { key: 'agent-approvals', label: 'Agent Approvals', icon: 'agent-approvals', badge: '5' },
      { key: 'agent-auth', label: 'Agent Auth', icon: 'agent-auth' },
    ],
  },
]

// Mini rail items (collapsed sidebar) — matches mockup 2's icon+label rail.
const MINI_ITEMS: { key: string; label: string; icon: IconKey }[] = [
  { key: 'home', label: 'Home', icon: 'grid' },
  { key: 'perf', label: 'Perf', icon: 'analytics' },
  { key: 'clients', label: 'Clients', icon: 'clients' },
  { key: 'ads', label: 'Ads', icon: 'google-ads' },
  { key: 'seo', label: 'SEO', icon: 'seo' },
  { key: 'content', label: 'Content', icon: 'blog-posts' },
  { key: 'finance', label: 'Finance', icon: 'invoice-statements' },
  { key: 'agent', label: 'Agent', icon: 'agent-approvals' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
]

function ExpandedNav({ activeKey }: { activeKey?: string }): React.ReactElement {
  return (
    <>
      <div className={`sb-dash${activeKey === 'dashboard' ? ' active' : ''}`}>Dashboard</div>
      <div className="sb-scroll">
        {NAV_GROUPS.map((group) => (
          <div className="sb-group" key={group.heading}>
            <div className="sb-group-h">{group.heading}</div>
            {group.items.map((item) => (
              <div className={`sb-link${activeKey === item.key ? ' active' : ''}`} key={item.key}>
                <span className="ic">
                  <Icon name={item.icon} />
                </span>{' '}
                {item.label}
                {item.badge ? <span className="sb-badge">{item.badge}</span> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="sb-foot">
        <div className="avatar">PT</div>
        <div className="who">
          <b>Peter Tu</b>
          <br />
          <small>Admin</small>
        </div>
      </div>
    </>
  )
}

function LogoHeader(): React.ReactElement {
  return (
    <div className="sb-logo">
      <Image
        className="sb-logo-img"
        src="/optimise-digital-logo-white-no-rocket.png"
        alt="Optimise Digital"
        width={170}
        height={30}
        priority
      />
      <button type="button" className="sb-collapse" title="Collapse sidebar">
        <Icon name="collapse" size={20} />
      </button>
    </div>
  )
}

/** Expanded sidebar with a fixed active item — used by dashboard, client-record, google-ads. */
export function Sidebar({ activeKey }: { activeKey?: string }): React.ReactElement {
  return (
    <aside className="sidebar">
      <LogoHeader />
      <ExpandedNav activeKey={activeKey} />
    </aside>
  )
}

/** Collapsed (mini) sidebar with click-to-expand overlay — used by the Clients list. */
export function MiniSidebar({ activeKey }: { activeKey?: string }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <aside className="sidebar mini" style={{ display: expanded ? 'none' : 'flex' }}>
        <div
          className="sb-logo"
          style={{ justifyContent: 'center', padding: 0, cursor: 'pointer' }}
          onClick={() => setExpanded(true)}
          title="Expand sidebar"
        >
          <div className="rocket">🚀</div>
        </div>
        <div className="mini-rail">
          {MINI_ITEMS.map((item) => (
            <div
              className={`mini-item${activeKey === item.key ? ' active' : ''}`}
              key={item.key}
              onClick={() => setExpanded(true)}
            >
              <span className="ic">
                <Icon name={item.icon} size={16} />
              </span>
              <span className="lbl">{item.label}</span>
            </div>
          ))}
        </div>
        <div
          className="sb-foot"
          style={{ justifyContent: 'center', padding: '12px 0', flexDirection: 'column', gap: 10 }}
        >
          <div className="avatar" style={{ cursor: 'pointer' }} onClick={() => setExpanded(true)} title="Expand sidebar">
            PT
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="Expand sidebar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <Icon name="collapse" size={16} />
          </button>
        </div>
      </aside>

      <aside
        className="sidebar"
        style={{
          display: expanded ? 'flex' : 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 100,
          height: '100vh',
        }}
      >
        <div className="sb-logo">
          <div className="rocket" style={{ flex: '0 0 auto' }}>
            🚀
          </div>
          <button type="button" className="sb-collapse" onClick={() => setExpanded(false)} title="Collapse sidebar">
            <Icon name="collapse" size={20} />
          </button>
        </div>
        <ExpandedNav activeKey="clients" />
      </aside>

      {expanded ? (
        <div
          onClick={() => setExpanded(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,.25)' }}
        />
      ) : null}
    </>
  )
}
