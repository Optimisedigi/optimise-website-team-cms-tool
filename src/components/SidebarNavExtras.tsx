'use client'

import { useEffect } from 'react'
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
  link.innerHTML = `${svgIcon}<span class="nav__link-label">${label}</span>`

  if (position === 'prepend') {
    container.prepend(link)
  } else {
    container.appendChild(link)
  }
}

const ICONS = {
  deployments:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
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
}

const SidebarNavExtras = () => {
  const { user } = useAuth()
  const canIntegrations = userHasFeature(user, 'nav:integrations')
  const canDeployments = userHasFeature(user, 'nav:deployments')
  const canIndexingHelper = userHasFeature(user, 'nav:indexing-helper')
  const canInvoices = userHasFeature(user, 'nav:invoices')
  const canGoogleAds = userHasFeature(user, 'nav:google-ads')
  const canSeo = userHasFeature(user, 'nav:seo')
  const canContractorCosts = userHasFeature(user, 'nav:contractor-costs') || userHasFeature(user, 'contractors')

  // Watch for active nav link and apply highlight + keep icon visible
  useEffect(() => {
    let prevPath = ''

    function applyActiveStyles() {
      const currentPath = window.location.pathname
      if (currentPath === prevPath) return
      prevPath = currentPath

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

    applyActiveStyles()
    const interval = setInterval(applyActiveStyles, 500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (canIntegrations) {
      injectLink(
        '#nav-group-Integrations .nav-group__content',
        'integrations',
        '/admin/settings/integrations',
        ICONS.integrations,
        'Integrations',
      )
    }

    if (canDeployments) {
      injectLink(
        '#nav-group-Performance .nav-group__content',
        'deployments',
        '/admin/deployments',
        ICONS.deployments,
        'Deployments',
        'append',
      )
    }

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

    // Growth Tools hub links sit at the top of the group, ordered:
    //   Google Ads → SEO → (auto collection links below).
    // Both prepend to index 0, so inject SEO FIRST, then Google Ads, so
    // Google Ads lands on top and SEO directly beneath it.
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

    // Hide auto-generated collection links that already have a custom hub
    // page injected above them. The records remain reachable by URL — the
    // hubs deep-link into individual records, and the contractor hub also
    // surfaces these collections in its tables.
    const HIDDEN_COLLECTION_HREFS = [
      '/admin/collections/google-ads-audits',
      '/admin/collections/contractors',
      '/admin/collections/contractor-payments',
    ]
    const hideAutoCollectionLinks = () => {
      for (const href of HIDDEN_COLLECTION_HREFS) {
        const link = document.querySelector(`a.nav__link[href="${href}"]`) as HTMLElement | null
        if (link && link.style.display !== 'none') {
          link.style.display = 'none'
        }
      }
    }
    hideAutoCollectionLinks()
    const hideInterval = setInterval(hideAutoCollectionLinks, 500)

    // Finance sidebar order:
    //   Invoices → Invoice Statements → Contractors → [auto] Contractor Time Entries
    //
    // Each prepend goes to index 0, so we inject bottom-up: Contractors first
    // (sits above the auto contractor-time-entries link), then Invoice
    // Statements, then Invoices (which lands at the very top).
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
      // Hide the auto-generated collection link — we have a custom page.
      const autoLink = document.querySelector(
        'a.nav__link[href="/admin/collections/invoice-statement-drafts"]',
      ) as HTMLElement | null
      if (autoLink) autoLink.style.display = 'none'
    }

    // Agent fleet — surfaced under the Agent group for any logged-in user. The
    // approvals queue and auth setup pages live under /admin and render inside
    // the admin shell, doing their own auth checks.
    injectLink(
      '#nav-group-Agent .nav-group__content',
      'agent-approvals',
      '/admin/agent-approvals',
      ICONS.agentApprovals,
      'Agent Approvals',
      'append',
    )
    injectLink(
      '#nav-group-Agent .nav-group__content',
      'agent-auth',
      '/admin/agent-auth',
      ICONS.agentAuth,
      'Agent Auth',
      'append',
    )

    // Icons for collection/global nav links are now handled via CSS ::before in custom.scss

    return () => {
      clearInterval(hideInterval)
    }
  }, [canIntegrations, canDeployments, canIndexingHelper, canInvoices, canGoogleAds, canSeo, canContractorCosts])

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
