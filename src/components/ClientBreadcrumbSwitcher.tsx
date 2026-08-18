'use client'

import { useEffect, useMemo, useState } from 'react'

type ClientOption = {
  id: number
  name: string
}

type ClientBreadcrumbSwitcherProps = {
  currentClientId: string | number
  currentClientName: string
}

export default function ClientBreadcrumbSwitcher({
  currentClientId,
  currentClientName,
}: ClientBreadcrumbSwitcherProps) {
  const [clients, setClients] = useState<ClientOption[]>([])

  useEffect(() => {
    let cancelled = false

    fetch('/api/clients?limit=2000&depth=0&sort=name&select[id]=true&select[name]=true')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (cancelled) return
        const docs = (data as { docs?: unknown })?.docs
        if (!Array.isArray(docs)) return
        setClients(
          docs.filter(
            (doc): doc is ClientOption =>
              typeof (doc as ClientOption)?.id !== 'undefined' &&
              typeof (doc as ClientOption)?.name === 'string',
          ),
        )
      })
      .catch(() => {
        if (!cancelled) setClients([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'en-AU')),
    [clients],
  )

  useEffect(() => {
    if (sortedClients.length === 0) return

    const breadcrumb = document.querySelector<HTMLElement>('nav.step-nav')
    const currentCrumb = breadcrumb?.querySelector<HTMLElement>('.step-nav__last')
    if (!currentCrumb || currentCrumb.dataset.clientBreadcrumbSwitcher === 'true') return

    const originalLabel = currentCrumb.textContent ?? currentClientName
    const mount = document.createElement('span')
    mount.className = 'od-google-ads-client-switcher__breadcrumb-mount'
    currentCrumb.replaceChildren(mount)
    currentCrumb.dataset.clientBreadcrumbSwitcher = 'true'

    const select = document.createElement('select')
    select.className = 'od-google-ads-client-switcher od-google-ads-client-switcher--breadcrumb'
    select.setAttribute('aria-label', 'Switch client')

    const currentOption = document.createElement('option')
    currentOption.value = String(currentClientId)
    currentOption.textContent = originalLabel
    select.append(currentOption)

    for (const client of sortedClients) {
      if (String(client.id) === String(currentClientId)) {
        currentOption.textContent = client.name
        continue
      }
      const option = document.createElement('option')
      option.value = String(client.id)
      option.textContent = client.name
      select.append(option)
    }

    select.addEventListener('change', () => {
      window.location.assign(`/admin/collections/clients/${encodeURIComponent(select.value)}`)
    })
    mount.append(select)

    return () => {
      if (currentCrumb.dataset.clientBreadcrumbSwitcher === 'true') {
        currentCrumb.replaceChildren(document.createTextNode(originalLabel))
        delete currentCrumb.dataset.clientBreadcrumbSwitcher
      }
    }
  }, [currentClientId, currentClientName, sortedClients])

  return null
}
