'use client'

import { useEffect } from 'react'

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

function injectIconToExistingLink(href: string, svgIcon: string) {
  const link = document.querySelector(`a.nav__link[href="${href}"]`) as HTMLAnchorElement
  if (!link || link.querySelector('[data-injected-icon]')) return

  const icon = document.createElement('span')
  icon.setAttribute('data-injected-icon', 'true')
  icon.innerHTML = svgIcon
  icon.style.display = 'inline-flex'
  icon.style.alignItems = 'center'
  icon.style.flexShrink = '0'
  link.insertBefore(icon, link.firstChild)
}

const ICONS = {
  deployments:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  integrations:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>',
  indexingHelper:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
  processTemplates:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h6"/></svg>',
  clientProcesses:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  emailTemplates:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  negativeKeywords:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  siteHealth:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
}

const SidebarNavExtras = () => {
  // Watch for active nav link and apply highlight + keep icon visible
  useEffect(() => {
    let prevPath = ''

    function applyActiveStyles() {
      const currentPath = window.location.pathname
      if (currentPath === prevPath) return
      prevPath = currentPath

      // Find all nav links (Payload uses a.nav__link inside .nav)
      const allLinks = document.querySelectorAll('.nav a[href]')
      allLinks.forEach((link) => {
        const el = link as HTMLAnchorElement
        const href = el.getAttribute('href') || ''
        // Active if current path starts with the link href (and href is specific enough)
        const isActive = href.length > 7 && currentPath.startsWith(href)

        if (isActive) {
          el.style.background = 'rgba(56, 189, 248, 0.12)'
          el.style.borderRadius = '6px'
          el.style.color = '#38bdf8'
          // Ensure the ::before icon stays visible by adding a class
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
    // Integrations link under Settings
    injectLink(
      '#nav-group-Settings .nav-group__content',
      'integrations',
      '/admin/settings/integrations',
      ICONS.integrations,
      'Integrations',
    )

    // Deployments link under Performance (alongside Google Analytics & Search Console)
    injectLink(
      '#nav-group-Performance .nav-group__content',
      'deployments',
      '/admin/deployments',
      ICONS.deployments,
      'Deployments',
      'append',
    )

    // GSC Indexing Helper link under Growth Tools
    injectLink(
      '#nav-group-Growth\\ Tools .nav-group__content',
      'indexing-helper',
      '/admin/growth-tools/indexing-helper',
      ICONS.indexingHelper,
      'Indexing Helper',
      'append',
    )

    // Add icons to existing collection/global nav links that are missing them
    injectIconToExistingLink('/admin/collections/process-templates', ICONS.processTemplates)
    injectIconToExistingLink('/admin/collections/client-processes', ICONS.clientProcesses)
    injectIconToExistingLink('/admin/globals/email-templates', ICONS.emailTemplates)
    injectIconToExistingLink('/admin/collections/negative-keyword-lists', ICONS.negativeKeywords)
    injectIconToExistingLink('/admin/collections/site-health-reports', ICONS.siteHealth)
  }, [])

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
