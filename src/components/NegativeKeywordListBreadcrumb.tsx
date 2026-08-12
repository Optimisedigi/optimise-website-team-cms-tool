'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

type NegativeKeywordList = {
  id: number | string
  name: string
}

type Client = {
  id: number | string
  name: string
}

function relationshipId(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' || typeof id === 'number' ? id : null
  }
  return null
}

export default function NegativeKeywordListBreadcrumb() {
  const { id } = useDocumentInfo()
  const { client: clientValue, name } = useFormFields(([fields]) => ({
    client: fields.client?.value,
    name: typeof fields.name?.value === 'string' ? fields.name.value : '',
  }))
  const clientId = relationshipId(clientValue)
  const [client, setClient] = useState<Client | null>(null)
  const [lists, setLists] = useState<NegativeKeywordList[]>([])

  useEffect(() => {
    if (clientId === null) {
      setClient(null)
      setLists([])
      return
    }

    let cancelled = false
    const clientPath = `/api/clients/${encodeURIComponent(String(clientId))}?depth=0`
    const listsPath = `/api/negative-keyword-lists/for-client?clientId=${encodeURIComponent(String(clientId))}`

    Promise.all([
      fetch(clientPath).then((response) => (response.ok ? response.json() : null)),
      fetch(listsPath).then((response) => (response.ok ? response.json() : null)),
    ])
      .then(([clientData, listsData]: [unknown, unknown]) => {
        if (cancelled) return
        const nextClient = clientData as Client | null
        setClient(typeof nextClient?.name === 'string' ? nextClient : null)
        const nextLists = (listsData as { nkls?: unknown })?.nkls
        setLists(
          Array.isArray(nextLists)
            ? nextLists.filter(
                (list): list is NegativeKeywordList =>
                  list !== null &&
                  typeof list === 'object' &&
                  (typeof (list as NegativeKeywordList).id === 'string' ||
                    typeof (list as NegativeKeywordList).id === 'number') &&
                  typeof (list as NegativeKeywordList).name === 'string',
              )
            : [],
        )
      })
      .catch(() => {
        if (!cancelled) {
          setClient(null)
          setLists([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [clientId])

  const sortedLists = useMemo(
    () => [...lists].sort((a, b) => a.name.localeCompare(b.name, 'en-AU')),
    [lists],
  )

  useEffect(() => {
    if (!id || !client) return

    const breadcrumb = document.querySelector<HTMLElement>('nav.step-nav')
    const currentCrumb = breadcrumb?.querySelector<HTMLElement>('.step-nav__last')
    if (!breadcrumb || !currentCrumb || currentCrumb.dataset.negativeKeywordListBreadcrumb === 'true') return

    const originalLabel = currentCrumb.textContent ?? name
    const clientCrumb = document.createElement('span')
    clientCrumb.className = 'od-negative-keyword-list-breadcrumb__client'
    clientCrumb.textContent = client.name

    const divider = document.createElement('span')
    divider.textContent = '/'

    const listSelect = document.createElement('select')
    listSelect.className = 'od-google-ads-client-switcher od-google-ads-client-switcher--breadcrumb'
    listSelect.setAttribute('aria-label', `Switch negative keyword list for ${client.name}`)

    for (const list of sortedLists) {
      const option = document.createElement('option')
      option.value = String(list.id)
      option.textContent = list.name
      option.selected = String(list.id) === String(id)
      listSelect.append(option)
    }

    if (!listSelect.value) {
      const currentOption = document.createElement('option')
      currentOption.value = String(id)
      currentOption.textContent = name || originalLabel
      currentOption.selected = true
      listSelect.prepend(currentOption)
    }

    listSelect.addEventListener('change', () => {
      window.location.assign(`/admin/collections/negative-keyword-lists/${encodeURIComponent(listSelect.value)}`)
    })

    currentCrumb.replaceChildren(listSelect)
    currentCrumb.dataset.negativeKeywordListBreadcrumb = 'true'
    breadcrumb.insertBefore(clientCrumb, currentCrumb)
    breadcrumb.insertBefore(divider, currentCrumb)

    return () => {
      clientCrumb.remove()
      divider.remove()
      if (currentCrumb.dataset.negativeKeywordListBreadcrumb === 'true') {
        currentCrumb.replaceChildren(document.createTextNode(originalLabel))
        delete currentCrumb.dataset.negativeKeywordListBreadcrumb
      }
    }
  }, [client, id, name, sortedLists])

  return null
}
