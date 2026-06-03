'use client'

/**
 * Makes collection list rows clickable. Custom Payload list cells do not receive
 * the default first-column edit link, so this delegated handler navigates from a
 * row's `data-id` while leaving real controls alone.
 *
 * Renders nothing visible; it is mounted globally as an admin provider.
 */
import { type ReactNode, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useConfig } from '@payloadcms/ui'

const COLLECTION_CLASS_PREFIX = 'collection-list--'

function collectionSlugFromList(list: Element): string | null {
  for (const className of list.classList) {
    if (className.startsWith(COLLECTION_CLASS_PREFIX)) {
      const slug = className.slice(COLLECTION_CLASS_PREFIX.length)
      return slug || null
    }
  }
  return null
}

function findCollectionTable(): Element | null {
  return document.querySelector('.collection-list .table')
}

function isCollectionListPath(pathname: string | null, adminRoute: string): boolean {
  if (!pathname) return false
  const adminBase = adminRoute.replace(/\/+$/, '') || '/admin'
  const collectionPath = `${adminBase}/collections/`
  if (!pathname.startsWith(collectionPath)) return false

  const rest = pathname.slice(collectionPath.length).replace(/\/+$/, '')
  return rest.length > 0 && !rest.includes('/')
}

function ListRowClick({ children }: { children?: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { config } = useConfig()
  const adminRoute = config?.routes?.admin || '/admin'

  useEffect(() => {
    if (!isCollectionListPath(pathname, adminRoute)) return

    let table: Element | null = null
    let observer: MutationObserver | null = null

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

      const list = table?.closest('.collection-list')
      const collectionSlug = list ? collectionSlugFromList(list) : null
      if (!collectionSlug) return

      const url = `${adminRoute}/collections/${collectionSlug}/${encodeURIComponent(id)}`

      // Cmd/Ctrl-click or middle-click (auxclick, button 1) → open a new tab,
      // matching normal link behaviour. Plain left-click → in-app navigation.
      if (event.metaKey || event.ctrlKey || event.button === 1) {
        window.open(url, '_blank', 'noopener')
        return
      }
      router.push(url)
    }

    const attach = (): boolean => {
      const match = findCollectionTable()
      if (!match) return false

      table = match
      table.addEventListener('click', handler as EventListener)
      table.addEventListener('auxclick', handler as EventListener)
      // Visually signal the rows are clickable.
      table.classList.add('od-rows-clickable')
      return true
    }

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) {
          observer?.disconnect()
          observer = null
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      observer?.disconnect()
      if (!table) return
      table.removeEventListener('click', handler as EventListener)
      table.removeEventListener('auxclick', handler as EventListener)
      table.classList.remove('od-rows-clickable')
    }
  }, [router, adminRoute, pathname])

  return children ?? null
}

export default ListRowClick
