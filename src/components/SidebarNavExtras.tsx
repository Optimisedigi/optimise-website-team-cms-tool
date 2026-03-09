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

const SidebarNavExtras = () => {
  useEffect(() => {
    // Integrations link under Settings
    injectLink(
      '#nav-group-Settings .nav-group__content',
      'integrations',
      '/admin/settings/integrations',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>',
      'Integrations',
    )

    // GSC Indexing Helper link under Growth Tools
    injectLink(
      '#nav-group-Growth\\ Tools .nav-group__content',
      'indexing-helper',
      '/admin/growth-tools/indexing-helper',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M10 21h4M12 3v4M4.93 4.93l2.83 2.83M1 12h4M4.93 19.07l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>',
      'Indexing Helper',
      'append',
    )
  }, [])

  return null
}

export default SidebarNavExtras
