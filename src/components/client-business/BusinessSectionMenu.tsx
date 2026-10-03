'use client'

/**
 * "On this tab" menu for the client Business tab (design handoff "Section
 * menu"). Lists the rendered `BusinessSection` cards in DOM order, so sections
 * hidden by a field condition (e.g. Billing when `isAgency`) drop out of the
 * menu automatically. Click smooth-scrolls with a 76px offset for the sticky
 * top bar; scroll-spy marks the last section whose top is above 140px.
 */

import { useFormFields } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

type Item = { id: string; label: string }

const SCROLL_OFFSET = 76
const SPY_LINE = 140

function readSections(root: ParentNode): Item[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-od-section]'))
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ id: el.dataset.odSection ?? '', label: el.dataset.odMenuLabel ?? '' }))
    .filter((item) => item.id && item.label)
}

function sameItems(a: Item[], b: Item[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i]?.id && item.label === b[i]?.label)
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function BusinessSectionMenu(): ReactNode {
  const navRef = useRef<HTMLElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [active, setActive] = useState<string | undefined>(undefined)
  // Re-scan when the agency flag flips (it shows/hides three sections).
  const isAgency = useFormFields(([fields]) => Boolean(fields.isAgency?.value))

  const tabRoot = useCallback((): ParentNode => {
    return navRef.current?.closest('.tabs-field__tab') ?? document
  }, [])

  useEffect(() => {
    const root = tabRoot()
    const sync = (): void => {
      const next = readSections(root)
      setItems((prev) => (sameItems(prev, next) ? prev : next))
    }
    sync()
    const observer = new MutationObserver(sync)
    if (root instanceof Node) observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [tabRoot, isAgency])

  useEffect(() => {
    if (!items.length) return
    let frame = 0
    const spy = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        let current = items[0]?.id
        for (const item of items) {
          const el = document.getElementById(`od-section-${item.id}`)
          if (el && el.getBoundingClientRect().top < SPY_LINE) current = item.id
        }
        setActive(current)
      })
    }
    spy()
    window.addEventListener('scroll', spy, { passive: true })
    window.addEventListener('resize', spy)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', spy)
      window.removeEventListener('resize', spy)
    }
  }, [items])

  const go = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>): void => {
    const el = document.getElementById(`od-section-${id}`)
    if (!el) return
    event.preventDefault()
    const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    setActive(id)
    // Move focus for keyboard and screen-reader users without a second jump.
    el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: true })
  }

  return (
    <nav ref={navRef} className="od-biz-menu" aria-label="On this tab">
      <div className="od-biz-menu__eyebrow" aria-hidden>
        On this tab
      </div>
      <ul className="od-biz-menu__list">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#od-section-${item.id}`}
              className="od-biz-menu__item"
              aria-current={item.id === active ? 'location' : undefined}
              onClick={go(item.id)}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default BusinessSectionMenu
