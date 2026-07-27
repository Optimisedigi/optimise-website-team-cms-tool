'use client'

import { useEffect, useMemo, useState } from 'react'

export type GoogleAdsClient = {
  id: number
  name: string
  googleAdsCustomerId: string | null
  latestAudit: { id: number } | null
}

type GoogleAdsClientSwitcherProps = {
  currentClientId: string | number
  currentClientName: string
}

const CLIENTS_ENDPOINT = '/api/clients/google-ads-list'
const GOOGLE_ADS_TAB = 5

export function destinationFor(client: GoogleAdsClient): string {
  return client.latestAudit
    ? `/admin/collections/google-ads-audits/${client.latestAudit.id}`
    : `/admin/collections/clients/${client.id}#tab-${GOOGLE_ADS_TAB}`
}

export default function GoogleAdsClientSwitcher({
  currentClientId,
  currentClientName,
}: GoogleAdsClientSwitcherProps) {
  const [clients, setClients] = useState<GoogleAdsClient[]>([])

  useEffect(() => {
    let cancelled = false

    fetch(CLIENTS_ENDPOINT)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return
        setClients(
          data.filter(
            (client): client is GoogleAdsClient =>
              typeof client?.id === 'number' && typeof client?.name === 'string',
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
    if (!currentCrumb || currentCrumb.dataset.googleAdsClientSwitcher === 'true') return

    const originalLabel = currentCrumb.textContent ?? currentClientName
    const mount = document.createElement('span')
    mount.className = 'od-google-ads-client-switcher__breadcrumb-mount'
    currentCrumb.replaceChildren(mount)
    currentCrumb.dataset.googleAdsClientSwitcher = 'true'

    const select = document.createElement('select')
    select.className = 'od-google-ads-client-switcher od-google-ads-client-switcher--breadcrumb'
    select.setAttribute('aria-label', 'Switch Google Ads client')

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
      const client = sortedClients.find((candidate) => String(candidate.id) === select.value)
      if (client) window.location.assign(destinationFor(client))
    })
    mount.append(select)

    return () => {
      if (currentCrumb.dataset.googleAdsClientSwitcher === 'true') {
        currentCrumb.replaceChildren(document.createTextNode(originalLabel))
        delete currentCrumb.dataset.googleAdsClientSwitcher
      }
    }
  }, [currentClientId, currentClientName, sortedClients])

  return null
}
