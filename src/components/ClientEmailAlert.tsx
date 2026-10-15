'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@payloadcms/ui'
import { userHasFeature } from '@/lib/access'

/**
 * "Client email – please read" slide-up.
 *
 * Mounted by OptiMateLauncher so it can sit with the OptiMate button:
 *  - panel closed: bottom-right, stacked just above the OptiMate orb;
 *  - panel open: bottom-right, to the left of the OptiMate panel
 *    (hidden on narrow screens, where the panel fills the width).
 *
 * Shows the newest undismissed alert for the signed-in user's own mailbox
 * (see src/lib/mail/client-email-alerts.ts). A new alert slides up fully
 * open, collapses to a small chip after EXPANDED_MS, and stays until the
 * user opens or dismisses it. Dismissing marks the notification read on the
 * server, so it never comes back in any tab.
 *
 * Polls GET /api/mail/client-alerts?sync=1 every POLL_MS, only while the tab
 * is visible; the server throttles the Gmail sync itself.
 */

export const POLL_MS = 60_000
export const EXPANDED_MS = 20_000
const MAIL_FEATURE = 'nav:mail'

// Matches the OptiMate launcher geometry (OptiMateLauncher.tsx).
const EDGE = 24
const ORB_SIZE = 72
const PANEL_WIDTH = 412
const GAP = 12
const NARROW_QUERY = '(max-width: 900px)'

export interface ClientEmailAlertRow {
  id: number | string
  title: string
  body: string
  url: string
  createdAt: string
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const sec = Math.floor((Date.now() - then) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

/** "Client email – please read: Acme" -> "Acme". */
function clientNameFromTitle(title: string): string {
  const idx = title.indexOf(':')
  return idx >= 0 ? title.slice(idx + 1).trim() : title
}

export default function ClientEmailAlert({ panelOpen }: { panelOpen: boolean }): ReactElement | null {
  const { user } = useAuth()
  const router = useRouter()
  const enabled = Boolean(user) && userHasFeature(user, MAIL_FEATURE)

  const [alerts, setAlerts] = useState<ClientEmailAlertRow[]>([])
  const [total, setTotal] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const seenIds = useRef<Set<string>>(new Set())
  const collapseTimer = useRef<number | null>(null)

  const expandFor = useCallback((ms: number) => {
    setExpanded(true)
    if (collapseTimer.current) window.clearTimeout(collapseTimer.current)
    collapseTimer.current = window.setTimeout(() => setExpanded(false), ms)
  }, [])

  useEffect(() => () => {
    if (collapseTimer.current) window.clearTimeout(collapseTimer.current)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const update = (): void => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const load = useCallback(
    async (sync: boolean) => {
      try {
        const res = await fetch(`/api/mail/client-alerts${sync ? '?sync=1' : ''}`, { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as { alerts?: ClientEmailAlertRow[]; total?: number }
        const next = Array.isArray(data.alerts) ? data.alerts : []
        const hasNew = next.some((a) => !seenIds.current.has(String(a.id)))
        next.forEach((a) => seenIds.current.add(String(a.id)))
        setAlerts(next)
        setTotal(typeof data.total === 'number' ? data.total : next.length)
        // Something new arrived: open fully, then fall back to the chip.
        // Alerts already waiting at page load open too, once per page.
        if (hasNew) expandFor(EXPANDED_MS)
      } catch {
        // Silent: keep showing what we have.
      }
    },
    [expandFor],
  )

  useEffect(() => {
    if (!enabled) return
    void load(true)
    const tick = (): void => {
      if (document.visibilityState === 'visible') void load(true)
    }
    const id = window.setInterval(tick, POLL_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void load(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, load])

  const markRead = useCallback(async (ids: Array<number | string>) => {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/notifications/${encodeURIComponent(String(id))}/mark-read`, {
          method: 'POST',
          credentials: 'include',
        }).catch(() => undefined),
      ),
    )
  }, [])

  const current = alerts[0]
  const remaining = Math.max(total, alerts.length) - 1

  const dismiss = useCallback(() => {
    if (!current) return
    setAlerts((list) => list.filter((a) => a.id !== current.id))
    setTotal((t) => Math.max(0, t - 1))
    setExpanded(false)
    void markRead([current.id])
  }, [current, markRead])

  const dismissAll = useCallback(() => {
    const ids = alerts.map((a) => a.id)
    setAlerts([])
    setTotal(0)
    setExpanded(false)
    void markRead(ids)
  }, [alerts, markRead])

  const open = useCallback(() => {
    if (!current) return
    setAlerts((list) => list.filter((a) => a.id !== current.id))
    setTotal((t) => Math.max(0, t - 1))
    setExpanded(false)
    void markRead([current.id])
    router.push(current.url || '/admin/mail')
  }, [current, markRead, router])

  if (!enabled || !current) return null
  if (panelOpen && narrow) return null

  const position = panelOpen
    ? { right: EDGE + PANEL_WIDTH + GAP, bottom: EDGE }
    : { right: EDGE, bottom: EDGE + ORB_SIZE + GAP }
  const clientName = clientNameFromTitle(current.title)

  return (
    <div
      className="cea-root"
      data-testid="client-email-alert"
      data-state={expanded ? 'expanded' : 'chip'}
      style={{ position: 'fixed', zIndex: 99999, ...position }}
    >
      <style>{CSS}</style>
      <div role="status" aria-live="polite" className="cea-live">
        {expanded ? `Client email from ${clientName}` : ''}
      </div>
      {expanded ? (
        <section className="cea-card" aria-label="Client email – please read">
          <header className="cea-head">
            <span className="cea-dot" aria-hidden="true" />
            <span className="cea-label">Client email – please read</span>
            <button type="button" className="cea-x" onClick={dismiss} aria-label="Dismiss client email alert" title="Dismiss">
              ×
            </button>
          </header>
          <div className="cea-client">{clientName}</div>
          {current.body && <div className="cea-body">{current.body}</div>}
          <div className="cea-meta">
            {relativeTime(current.createdAt)}
            {remaining > 0 && ` · +${remaining} more`}
          </div>
          <div className="cea-actions">
            <button type="button" className="cea-primary" onClick={open}>
              Open email
            </button>
            <button type="button" className="cea-secondary" onClick={dismiss}>
              Dismiss
            </button>
            {remaining > 0 && (
              <button type="button" className="cea-link" onClick={dismissAll}>
                Dismiss all
              </button>
            )}
          </div>
        </section>
      ) : (
        <div className="cea-chip">
          <button
            type="button"
            className="cea-chip-main"
            onClick={() => expandFor(EXPANDED_MS)}
            aria-label={`Client email from ${clientName}. Show details`}
          >
            <span className="cea-dot" aria-hidden="true" />
            <span className="cea-chip-text">Client email{remaining > 0 ? ` (${remaining + 1})` : ''}: {clientName}</span>
          </button>
          <button type="button" className="cea-x" onClick={dismiss} aria-label="Dismiss client email alert" title="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
  )
}

const CSS = `
.cea-root { font-family: 'Manrope', Helvetica, Arial, sans-serif; max-width: calc(100vw - 48px); }
.cea-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.cea-card {
  width: 320px; max-width: 100%; box-sizing: border-box;
  background: #fff; color: #11141a; border-radius: 14px; padding: 14px 16px;
  border-left: 4px solid #dc2626;
  box-shadow: 0 14px 40px rgba(16, 20, 28, 0.22);
  animation: cea-up 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.cea-head { display: flex; align-items: center; gap: 8px; }
.cea-label { flex: 1; font-size: 12px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; color: #b91c1c; }
.cea-dot { width: 8px; height: 8px; border-radius: 999px; background: #dc2626; flex: 0 0 8px; animation: cea-pulse 1.6s ease-in-out 3; }
.cea-x { border: none; background: none; cursor: pointer; font-size: 18px; line-height: 1; color: #6b7280; padding: 2px 4px; border-radius: 6px; }
.cea-x:hover, .cea-x:focus-visible { color: #11141a; background: #f3f4f6; outline: none; }
.cea-client { margin-top: 8px; font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
.cea-body { margin-top: 2px; font-size: 13px; color: #374151; line-height: 1.4; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cea-meta { margin-top: 6px; font-size: 11px; color: #6b7280; }
.cea-actions { margin-top: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cea-primary { border: none; cursor: pointer; background: #dc2626; color: #fff; font-weight: 700; font-size: 13px; padding: 7px 12px; border-radius: 8px; }
.cea-primary:hover, .cea-primary:focus-visible { background: #b91c1c; outline: none; }
.cea-secondary { border: 1px solid #d1d5db; cursor: pointer; background: #fff; color: #11141a; font-weight: 600; font-size: 13px; padding: 6px 12px; border-radius: 8px; }
.cea-secondary:hover, .cea-secondary:focus-visible { background: #f3f4f6; outline: none; }
.cea-link { border: none; background: none; cursor: pointer; color: #6b7280; font-size: 12px; text-decoration: underline; padding: 0; margin-left: auto; }
.cea-chip {
  display: flex; align-items: center; gap: 2px; max-width: 280px;
  background: #fff; border-radius: 999px; padding: 4px 4px 4px 10px;
  border: 1px solid rgba(220, 38, 38, 0.35);
  box-shadow: 0 6px 20px rgba(16, 20, 28, 0.16);
  animation: cea-up 200ms ease-out;
}
.cea-chip-main { display: flex; align-items: center; gap: 8px; min-width: 0; border: none; background: none; cursor: pointer; padding: 4px 2px; color: #11141a; font-size: 12px; font-weight: 700; }
.cea-chip-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes cea-up { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes cea-pulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.5) } }
@media (prefers-reduced-motion: reduce) { .cea-card, .cea-chip, .cea-dot { animation: none } }
`
