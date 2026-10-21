'use client'

/**
 * Phones only (≤768px): the client record's 26 tabs become a sticky
 * "Section ▾" button that opens a grouped list, instead of a 2,000px sideways
 * tab strip. Picking a tab clicks Payload's own (visually hidden) tab button,
 * so tab state, URL and validation behave exactly as on desktop.
 *
 * Also on phones: long tab intros (e.g. Integrations) are shown as one line
 * with a "How this works" toggle that reveals the full text.
 */

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobileViewport } from '../../lib/swipe'

type TabEntry = { index: number; label: string; active: boolean }

/** Groups for the tab list; labels not listed fall under "More". */
export const CLIENT_TAB_GROUPS: ReadonlyArray<{ title: string; labels: readonly string[] }> = [
  {
    title: 'Client',
    labels: ['Business', 'Notes', 'Discovery Briefing', 'Emails', 'Account Timeline', 'Processes'],
  },
  {
    title: 'Marketing',
    labels: [
      'Analysis',
      'Google Ads',
      'SEO',
      'Forecast Scenarios',
      'Search',
      'SEO Audit Proposal',
      'Tracking',
      'Google Analytics',
    ],
  },
  { title: 'Content', labels: ['Blog Settings', 'Blog Posts', 'Authors'] },
  {
    title: 'Sharing',
    labels: ['Proposal', 'Client Hub', 'Working Docs', 'Presentations', 'Integrations'],
  },
  { title: 'Billing', labels: ['Retainer', 'Projects', 'Commissions', 'History & targets'] },
]

export function groupClientTabs(
  tabs: readonly TabEntry[],
): Array<{ title: string; tabs: TabEntry[] }> {
  const used = new Set<number>()
  const groups = CLIENT_TAB_GROUPS.map((group) => {
    const inGroup = tabs.filter((tab) => group.labels.includes(tab.label))
    inGroup.forEach((tab) => used.add(tab.index))
    return { title: group.title, tabs: inGroup }
  })
  const rest = tabs.filter((tab) => !used.has(tab.index))
  return [...groups, { title: 'More', tabs: rest }].filter((group) => group.tabs.length > 0)
}

const LONG_DESCRIPTION = 120

function topTabButtons(): HTMLButtonElement[] {
  const strip = document.querySelector('.document-fields .tabs-field__tabs')
  return strip
    ? Array.from(strip.querySelectorAll<HTMLButtonElement>(':scope > .tabs-field__tab-button'))
    : []
}

function readTabs(): TabEntry[] {
  return topTabButtons().map((button, index) => ({
    index,
    label: (button.textContent ?? '').trim(),
    active: button.classList.contains('tabs-field__tab-button--active'),
  }))
}

function sameTabs(a: TabEntry[], b: TabEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((tab, i) => tab.label === b[i]?.label && tab.active === b[i]?.active)
  )
}

/** One-line clamp + "How this works" on long tab descriptions (phones). */
function clampDescriptions(): void {
  document
    .querySelectorAll<HTMLElement>('.document-fields .tabs-field__tab > .field-description')
    .forEach((desc) => {
      if (desc.dataset.odClamp || (desc.textContent ?? '').length < LONG_DESCRIPTION) return
      desc.dataset.odClamp = 'closed'
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'od-desc-toggle'
      toggle.textContent = 'How this works'
      toggle.setAttribute('aria-expanded', 'false')
      toggle.addEventListener('click', () => {
        const open = desc.dataset.odClamp !== 'open'
        desc.dataset.odClamp = open ? 'open' : 'closed'
        toggle.textContent = open ? 'Show less' : 'How this works'
        toggle.setAttribute('aria-expanded', String(open))
      })
      desc.insertAdjacentElement('afterend', toggle)
    })
}

export default function ClientTabPicker(): ReactNode {
  const isPhone = useIsMobileViewport(768)
  const [tabs, setTabs] = useState<TabEntry[]>([])
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const listId = useId()

  useEffect(() => {
    if (!isPhone) return
    document.body.classList.add('od-client-tab-picker')
    const sync = (): void => {
      const next = readTabs()
      setTabs((prev) => (sameTabs(prev, next) ? prev : next))
      const wrap = document.querySelector<HTMLElement>('.document-fields .tabs-field__tabs-wrap')
      setHost((prev) => (prev === wrap ? prev : wrap))
      clampDescriptions()
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => {
      observer.disconnect()
      document.body.classList.remove('od-client-tab-picker')
    }
  }, [isPhone])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const pick = useCallback((index: number) => {
    topTabButtons()[index]?.click()
    setOpen(false)
    const wrap = document.querySelector('.document-fields .tabs-field__tabs-wrap')
    wrap?.scrollIntoView({ block: 'start' })
  }, [])

  if (!isPhone || !host || tabs.length < 2) return null
  const current = tabs.find((tab) => tab.active)?.label ?? tabs[0]?.label ?? ''

  return createPortal(
    <div className="od-tab-picker">
      <button
        type="button"
        className="od-tab-picker__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(true)}
      >
        <span className="od-tab-picker__eyebrow">Section</span>
        <span className="od-tab-picker__current">{current}</span>
        <span className="od-tab-picker__chev" aria-hidden>
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <>
            <div className="od-tab-picker__scrim" aria-hidden onClick={() => setOpen(false)} />
            <div
              id={listId}
              className="od-tab-picker__sheet"
              role="dialog"
              aria-label="Choose a section"
            >
              <div className="od-tab-picker__sheet-head">
                <span>Sections</span>
                <button
                  type="button"
                  aria-label="Close"
                  className="od-tab-picker__close"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="od-tab-picker__groups">
                {groupClientTabs(tabs).map((group) => (
                  <div key={group.title} className="od-tab-picker__group">
                    <div className="od-tab-picker__group-title">{group.title}</div>
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.index}
                        type="button"
                        className="od-tab-picker__item"
                        aria-current={tab.active ? 'true' : undefined}
                        onClick={() => pick(tab.index)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>,
    host,
  )
}
