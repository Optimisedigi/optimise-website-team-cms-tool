'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@payloadcms/ui'
import { userHasFeature } from '../lib/access'

/**
 * Tab bar that joins related admin screens under one sidebar entry.
 * The sidebar shows only the first screen of each section (the rest are
 * hidden in custom.scss); these tabs reach the others. Hiding a nav link never
 * changes access: each tab still respects its collection's own permissions.
 *
 * Mounted via `admin.components.beforeList` on collections and
 * `admin.components.elements.beforeDocumentControls` on globals; it works out
 * which section it is in from the URL, so the same component goes everywhere.
 */

type Tab = { label: string; href: string; feature?: string; adminOnly?: boolean }

export const SECTIONS: Record<string, Tab[]> = {
  processes: [
    { label: 'Client Processes', href: '/admin/collections/client-processes', feature: 'client-processes' },
    { label: 'Process Templates', href: '/admin/collections/process-templates', feature: 'process-templates' },
  ],
  hosting: [
    { label: 'Payment offers', href: '/admin/collections/hosting-payment-offers', feature: 'clients' },
    { label: 'One-off payments', href: '/admin/collections/hosting-one-off-payments', feature: 'hosting-billing-settings' },
    { label: 'Billing settings', href: '/admin/globals/hosting-billing-settings', feature: 'hosting-billing-settings' },
  ],
  costs: [
    { label: 'Overview', href: '/admin/collections/business-costs', feature: 'business-costs' },
    { label: 'Categories', href: '/admin/collections/cost-categories', feature: 'cost-categories' },
    { label: 'Rules', href: '/admin/collections/cost-rules', feature: 'cost-rules' },
  ],
  blog: [
    { label: 'Blog Posts', href: '/admin/collections/blog-posts', feature: 'blog-posts' },
    { label: 'Blog Settings', href: '/admin/globals/blog-settings', feature: 'blog-settings' },
  ],
  users: [
    { label: 'Users', href: '/admin/collections/users', adminOnly: true },
    { label: 'Permission Profiles', href: '/admin/collections/permission-profiles', adminOnly: true },
  ],
}

/** The section and active tab for a path, matching list and global screens only. */
export function findSection(pathname: string): { tabs: Tab[]; active: string } | null {
  for (const tabs of Object.values(SECTIONS)) {
    const hit = tabs.find((tab) => pathname === tab.href)
    if (hit) return { tabs, active: hit.href }
  }
  return null
}

export default function SectionTabs() {
  const pathname = usePathname() ?? ''
  const { user } = useAuth()
  const section = findSection(pathname)
  if (!section) return null

  const tabs = section.tabs.filter((tab) =>
    tab.adminOnly ? (user as { role?: string } | null)?.role === 'admin' : !tab.feature || userHasFeature(user, tab.feature),
  )
  if (tabs.length < 2) return null

  return (
    <nav className="od-section-tabs" aria-label="Section">
      {tabs.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          className={`od-section-tabs__tab${tab.href === section.active ? ' od-section-tabs__tab--active' : ''}`}
          aria-current={tab.href === section.active ? 'page' : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  )
}

/** Global edit screens: section tabs plus the global's own description line. */
export function SectionTabsWithDescription({ text }: { text?: string }) {
  return (
    <>
      <SectionTabs />
      {text ? <div className="custom-view-description">{text}</div> : null}
    </>
  )
}
