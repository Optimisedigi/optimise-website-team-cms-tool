'use client'

import { useEffect } from 'react'

const SidebarNavExtras = () => {
  useEffect(() => {
    const container = document.querySelector(
      '#nav-group-Settings .nav-group__content'
    )
    if (!container || container.querySelector('[data-injected="integrations"]'))
      return

    const link = document.createElement('a')
    link.href = '/admin/settings/integrations'
    link.className = 'nav__link sidebar-extras__link'
    link.setAttribute('data-injected', 'integrations')
    link.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg><span class="nav__link-label">Integrations</span>`
    container.prepend(link)
  }, [])

  return null
}

export default SidebarNavExtras
