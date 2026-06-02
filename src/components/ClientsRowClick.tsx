'use client'

/**
 * Makes every row in the Clients list view clickable — clicking anywhere on a
 * row (except on a genuinely interactive element) opens that client's edit page.
 *
 * Why this exists: every column in the Clients list uses a custom `Cell`
 * component, and Payload only wraps its *default* cell rendering in the
 * edit-page `<Link>`. Custom cells therefore lose the built-in first-column
 * link, leaving rows unclickable. Rather than wrap each cell, we attach one
 * delegated click handler to the list table and navigate by the row's
 * `data-id`, which Payload sets on every `<tr>`.
 *
 * Renders nothing visible; it's mounted via `admin.components.beforeListTable`.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useConfig } from '@payloadcms/ui'

function ClientsRowClick() {
  const router = useRouter()
  const { config } = useConfig()
  const adminRoute = config?.routes?.admin || '/admin'

  useEffect(() => {
    const table = document.querySelector('.collection-list--clients .table')
    if (!table) return

    const handler = (event: MouseEvent) => {
      // Only act on left-click (0) and middle-click (1). Ignore right-click (2)
      // so the browser context menu still works — `auxclick` fires for it too.
      if (event.button !== 0 && event.button !== 1) return

      const target = event.target as HTMLElement | null
      if (!target) return

      // Don't hijack clicks on real interactive controls (checkbox select,
      // existing links/buttons inside cells, the row actions menu, etc.).
      if (target.closest('a, button, input, label, select, textarea, [role="button"]')) {
        return
      }

      const row = target.closest('tr[data-id]') as HTMLElement | null
      const id = row?.getAttribute('data-id')
      if (!id) return

      const url = `${adminRoute}/collections/clients/${encodeURIComponent(id)}`

      // Cmd/Ctrl-click or middle-click (auxclick, button 1) → open a new tab,
      // matching normal link behaviour. Plain left-click → in-app navigation.
      if (event.metaKey || event.ctrlKey || event.button === 1) {
        window.open(url, '_blank', 'noopener')
        return
      }
      router.push(url)
    }

    table.addEventListener('click', handler as EventListener)
    table.addEventListener('auxclick', handler as EventListener)
    // Visually signal the rows are clickable.
    table.classList.add('od-rows-clickable')

    return () => {
      table.removeEventListener('click', handler as EventListener)
      table.removeEventListener('auxclick', handler as EventListener)
      table.classList.remove('od-rows-clickable')
    }
  }, [router, adminRoute])

  return null
}

export default ClientsRowClick
