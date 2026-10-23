'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@payloadcms/ui'
import { userHasFeature } from '../lib/access'

function injectLink(
  containerSelector: string,
  key: string,
  href: string,
  svgIcon: string,
  label: string,
  position: 'prepend' | 'append' = 'prepend',
) {
  const container = document.querySelector(containerSelector)
  if (!container || container.querySelector(`[data-injected="${key}"]`)) return

  const link = document.createElement('a')
  link.href = href
  link.className = 'nav__link sidebar-extras__link'
  link.setAttribute('data-injected', key)
  link.setAttribute('aria-label', label)
  link.setAttribute('title', label)
  link.innerHTML = `${svgIcon}<span class="nav__link-label">${label}</span>`

  if (position === 'prepend') {
    container.prepend(link)
  } else {
    container.appendChild(link)
  }
}

const ICONS = {
  integrations:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>',
  indexingHelper:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
  invoices:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  googleAds:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  seo:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  contractorCosts:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  agentApprovals:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  agentAuth:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  invoiceStatements:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M3 5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="14 3 14 8 19 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  costs:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  topicLinking:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="10" cy="18" r="2.5"/><line x1="8.2" y1="7" x2="15.6" y2="7.6"/><line x1="7" y1="8.2" x2="9.2" y2="15.6"/><line x1="16.4" y1="10" x2="11.8" y2="16.2"/></svg>',
  clientPulse:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M3 12h4l3 8 4-16 3 8h4"/><circle cx="12" cy="12" r="10" opacity="0.25"/></svg>',
}

function useStickyFeature(user: any, feature: string): boolean {
  const [seen, setSeen] = useState<{ userId: string | number | null; hasFeature: boolean }>({
    userId: null,
    hasFeature: false,
  })
  const userId = user?.id ?? null
  const hasFeature = userHasFeature(user, feature)

  useEffect(() => {
    setSeen((current) => {
      if (userId == null) return current
      if (current.userId !== userId) return { userId, hasFeature }
      if (hasFeature && !current.hasFeature) return { userId, hasFeature: true }
      return current
    })
  }, [hasFeature, userId])

  if (userId == null) return seen.hasFeature
  return seen.userId === userId && (seen.hasFeature || hasFeature)
}

/** Highlight the active nav link (and keep its icon visible). */
function applyActiveStyles() {
  const currentPath = window.location.pathname

  // Payload v3 renders active nav items as <div class="nav__link"> (no href),
  // and inactive items as <a class="nav__link" href="...">.
  // Select only direct .nav__link elements (not child spans like .nav__link-label).
  const allLinks = document.querySelectorAll('.nav .nav__link')
  allLinks.forEach((link) => {
    const el = link as HTMLElement
    const href = el.getAttribute('href') || ''
    // Active items: rendered as <div> with .nav__link-indicator child, OR href matches pathname
    const hasIndicator = !!el.querySelector('.nav__link-indicator')
    const isActive = hasIndicator || (href.length > 7 && currentPath.startsWith(href) && ["/", undefined].includes(currentPath[href.length]))

    if (isActive) {
      el.style.background = 'rgba(56, 189, 248, 0.12)'
      el.style.borderRadius = '6px'
      el.style.color = '#38bdf8'
      el.classList.add('od-nav-active')
    } else {
      el.style.background = ''
      el.style.borderRadius = ''
      el.style.color = ''
      el.classList.remove('od-nav-active')
    }
  })
}

/** Runs `fn` at most once per animation frame. */
function oncePerFrame(fn: () => void): { run: () => void; cancel: () => void } {
  let frame = 0
  return {
    run: () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        fn()
      })
    },
    cancel: () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    },
  }
}

const SidebarNavExtras = () => {
  const { user } = useAuth()
  const canIntegrations = useStickyFeature(user, 'nav:integrations')
  const canIndexingHelper = useStickyFeature(user, 'nav:indexing-helper')
  const canInvoices = useStickyFeature(user, 'nav:invoices')
  const canGoogleAds = useStickyFeature(user, 'nav:google-ads')
  const canSeo = useStickyFeature(user, 'nav:seo')
  const canContractorCostsNav = useStickyFeature(user, 'nav:contractor-costs')
  const canContractorsCollection = useStickyFeature(user, 'contractors')
  const canContractorCosts = canContractorCostsNav || canContractorsCollection
  const canClientPulse = useStickyFeature(user, 'nav:client-pulse')
  const canCosts = useStickyFeature(user, 'business-costs')
  const pathname = usePathname()


  useEffect(() => {
    const injectCustomNavLinks = () => {
      if (canIntegrations) {
        injectLink(
          '#nav-group-Settings .nav-group__content',
          'integrations',
          '/admin/settings/integrations',
          ICONS.integrations,
          'Integrations',
          'append',
        )
      }

      // Deployments is hidden from the sidebar (page still reachable at /admin/deployments).

      if (canIndexingHelper) {
        injectLink(
          '#nav-group-Growth\\ Tools .nav-group__content',
          'indexing-helper',
          '/admin/growth-tools/indexing-helper',
          ICONS.indexingHelper,
          'Indexing Helper',
          'append',
        )
      }

      if (canClientPulse) {
        injectLink(
          '#nav-group-Clients .nav-group__content',
          'client-pulse',
          '/admin/clients/pulse',
          ICONS.clientPulse,
          'Client Pulse',
          'prepend',
        )
      }

      // Watchtower sits directly under the Google Ads hub link. Injected
      // before the hub itself because both prepend to index 0.
      if (canGoogleAds) {
        injectLink(
          '#nav-group-Growth\\ Tools .nav-group__content',
          'google-ads-automation',
          '/admin/google-ads-automation',
          ICONS.googleAds,
          'Ads Watchtower',
          'prepend',
        )
      }

      // Growth Tools hub links sit at the top of the group, ordered:
      //   Google Ads → SEO → Topic association linking → (auto collection links below).
      // All prepend to index 0, so inject bottom-up: Topic association
      // linking, then SEO, then Google Ads (which lands on top).
      if (canSeo) {
        injectLink(
          '#nav-group-Growth\\ Tools .nav-group__content',
          'topic-association-linking',
          '/SEO/Topic-association-linking',
          ICONS.topicLinking,
          'Topic association linking',
          'prepend',
        )
      }

      if (canSeo) {
        injectLink(
          '#nav-group-Growth\\ Tools .nav-group__content',
          'seo-hub',
          '/admin/growth-tools/seo',
          ICONS.seo,
          'SEO',
          'prepend',
        )
      }

      if (canGoogleAds) {
        injectLink(
          '#nav-group-Growth\\ Tools .nav-group__content',
          'google-ads-hub',
          '/admin/google-ads',
          ICONS.googleAds,
          'Google Ads',
          'prepend',
        )
      }

      // Finance sidebar order:
      //   Invoices → Invoice Statements → Costs → Contractors → [auto] Contractor Time Entries
      //
      // Each prepend goes to index 0, so we inject bottom-up: Contractors first
      // (sits above the auto contractor-time-entries link), then Costs, then
      // Invoice Statements, then Invoices (which lands at the very top).
      if (canContractorCosts) {
        injectLink(
          '#nav-group-Finance .nav-group__content',
          'contractor-costs',
          '/admin/contractor-costs',
          ICONS.contractorCosts,
          'Contractors',
          'prepend',
        )
      }

      // Costs hub (Sales vs Costs, CSV import, categories). Replaces the auto
      // "Costs Overview" collection link, which renders the same page.
      if (canCosts) {
        injectLink(
          '#nav-group-Finance .nav-group__content',
          'costs',
          '/admin/finance/costs',
          ICONS.costs,
          'Costs',
          'prepend',
        )
      }

      if (canInvoices) {
        injectLink(
          '#nav-group-Finance .nav-group__content',
          'invoice-statements',
          '/admin/finance/invoice-statements',
          ICONS.invoiceStatements,
          'Invoice Statements',
          'prepend',
        )
        injectLink(
          '#nav-group-Finance .nav-group__content',
          'invoices',
          '/admin/finance/invoices',
          ICONS.invoices,
          'Invoices',
          'prepend',
        )
      }

      // OptiMate fleet — surfaced under the OptiMate group for any logged-in user.
      // The approvals queue page lives under /admin and renders inside the admin
      // shell, doing its own auth checks. Auth now lives inside OptiMate Settings.
      injectLink(
        '#nav-group-OptiMate .nav-group__content',
        'agent-approvals',
        '/admin/agent-approvals',
        ICONS.agentApprovals,
        'OptiMate Approvals',
        'append',
      )
    }


    // Hide auto-generated collection links that already have a custom hub
    // page injected above them. The records remain reachable by URL — the
    // hubs deep-link into individual records, and the contractor hub also
    // surfaces these collections in its tables.
    const HIDDEN_COLLECTION_HREFS = [
      '/admin/collections/google-ads-audits',
      '/admin/collections/seo-audits',
      '/admin/collections/seo-audit-proposals',
      '/admin/collections/seo-migration-checks',
      '/admin/collections/internal-link-suggestions',
      '/admin/collections/quarterly-organic-growth-snapshots',
      '/admin/collections/site-health-reports',
      '/admin/collections/gsc-snapshots',
      '/admin/collections/gsc-daily',
      '/admin/collections/gsc-alerts',
      '/admin/collections/gsc-indexing-audits',
      '/admin/collections/forecast-scenarios',
      '/admin/collections/ai-visibility-snapshots',
      '/admin/collections/serp-displacement-snapshots',
      '/admin/collections/serp-displacement-alerts',
      '/admin/collections/contractors',
      '/admin/collections/contractor-payments',
      '/admin/collections/invoice-statement-drafts',
      '/admin/collections/business-costs',
    ]
    const hideAutoCollectionLinks = () => {
      for (const href of HIDDEN_COLLECTION_HREFS) {
        const link = document.querySelector(`a.nav__link[href="${href}"]`) as HTMLElement | null
        if (link && link.style.display !== 'none') {
          link.style.display = 'none'
        }
      }

      const reportsGroup = document.querySelector('#nav-group-Reports') as HTMLElement | null
      if (reportsGroup && reportsGroup.style.display !== 'none') {
        reportsGroup.style.display = 'none'
      }
    }

    // Icons for collection/global nav links are now handled via CSS ::before in custom.scss

    const syncNav = () => {
      injectCustomNavLinks()
      hideAutoCollectionLinks()
      applyActiveStyles()
    }
    syncNav()
    // Re-apply only when Payload re-renders the nav (or it first appears), at most
    // once a frame. Style and class changes are attribute mutations, which this
    // does not watch, so our own writes never re-trigger it.
    const frame = oncePerFrame(syncNav)
    let navSeen = Boolean(document.querySelector('.nav'))
    const observer = new MutationObserver((records) => {
      const nav = document.querySelector('.nav')
      const navAppeared = Boolean(nav) && !navSeen
      navSeen = Boolean(nav)
      if (navAppeared || records.some((record) => nav?.contains(record.target))) frame.run()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      frame.cancel()
    }
  }, [canIntegrations, canIndexingHelper, canInvoices, canGoogleAds, canSeo, canContractorCosts, canClientPulse, canCosts])

  // A client-side navigation changes which link is active.
  useEffect(() => {
    applyActiveStyles()
  }, [pathname])

  // Mobile: bounce-back zoom — allow pinch zoom but snap back to 1x when released
  useEffect(() => {
    if (typeof window === 'undefined') return
    const isMobile = window.innerWidth <= 768 || 'ontouchstart' in window

    if (!isMobile) return

    let bounceTimer: ReturnType<typeof setTimeout> | null = null

    function resetZoom() {
      const viewport = document.querySelector('meta[name="viewport"]')
      if (viewport) {
        // Briefly allow zoom reset
        viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1')
        requestAnimationFrame(() => {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1')
        })
      }
    }

    function onTouchEnd() {
      if (bounceTimer) clearTimeout(bounceTimer)
      bounceTimer = setTimeout(resetZoom, 300)
    }

    function onTouchStart() {
      if (bounceTimer) {
        clearTimeout(bounceTimer)
        bounceTimer = null
      }
    }

    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchstart', onTouchStart, { passive: true })

    return () => {
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchstart', onTouchStart)
      if (bounceTimer) clearTimeout(bounceTimer)
    }
  }, [])

  return null
}

export default SidebarNavExtras
