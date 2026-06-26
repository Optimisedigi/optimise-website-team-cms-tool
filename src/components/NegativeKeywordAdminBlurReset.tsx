'use client'

import { useEffect } from 'react'

const TARGET_PATH = '/admin/collections/negative-keyword-lists'

const selectors = [
  '.collection-edit--negative-keyword-lists',
  '.collection-create--negative-keyword-lists',
  '#field-infoPanel',
  '#field-bulkAdd',
  '#field-keywordTable',
  '#field-campaignSelect',
]

function setImportantStyle(el: HTMLElement, property: string, value: string) {
  if (el.style.getPropertyValue(property) === value) return
  el.style.setProperty(property, value, 'important')
}

function clearNegativeKeywordBlur() {
  if (!window.location.pathname.startsWith(TARGET_PATH)) return

  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(`${selector}, ${selector} *`).forEach((el) => {
      setImportantStyle(el, 'filter', 'none')
      setImportantStyle(el, '-webkit-filter', 'none')
      setImportantStyle(el, 'backdrop-filter', 'none')
      setImportantStyle(el, '-webkit-backdrop-filter', 'none')
    })
  }
}

export default function NegativeKeywordAdminBlurReset() {
  useEffect(() => {
    clearNegativeKeywordBlur()

    const observer = new MutationObserver(clearNegativeKeywordBlur)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    window.addEventListener('popstate', clearNegativeKeywordBlur)

    return () => {
      observer.disconnect()
      window.removeEventListener('popstate', clearNegativeKeywordBlur)
    }
  }, [])

  return null
}
