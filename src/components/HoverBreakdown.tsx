'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Keep a centred tooltip inside the viewport (same rule as the dashboard KPI tooltips). */
function clampTooltipCenter(center: number, width: number): number {
  if (typeof window === 'undefined') return center
  const margin = 8
  const vw = window.innerWidth
  if (width >= vw - margin * 2) return vw / 2
  const half = width / 2
  return Math.max(margin + half, Math.min(center, vw - margin - half))
}

export interface BreakdownRow {
  label: ReactNode
  value: string
  /** Smaller, muted line under the label. */
  note?: ReactNode
  /** Bold row with a top border, e.g. the total. */
  total?: boolean
}

/**
 * A value (e.g. a table cell number) that shows what it's made of on hover
 * or keyboard focus, in the dashboard's dark KPI tooltip style. The tooltip
 * is portalled to <body> so table overflow doesn't clip it.
 */
export function HoverBreakdown({ title, rows, children }: { title: string; rows: BreakdownRow[]; children: ReactNode }) {
  const hasRows = rows.length > 0
  const tipId = useId()
  const hostRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const [tipLeft, setTipLeft] = useState<number | null>(null)

  const updateCoords = () => {
    const el = hostRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords({ top: rect.bottom + 8, left: rect.left + rect.width / 2 })
  }
  const cancelHide = () => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }
  const show = () => {
    if (!hasRows) return
    cancelHide()
    updateCoords()
    setOpen(true)
  }
  const scheduleHide = () => {
    cancelHide()
    hideTimerRef.current = setTimeout(() => setOpen(false), 140)
  }

  useEffect(() => {
    if (!open) return
    const handler = () => updateCoords()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !coords || !tipRef.current) return
    setTipLeft(clampTooltipCenter(coords.left, tipRef.current.offsetWidth))
  }, [open, coords])

  useEffect(() => () => cancelHide(), [])

  if (!hasRows) return <>{children}</>

  return (
    <span
      ref={hostRef}
      tabIndex={0}
      aria-describedby={open ? tipId : undefined}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
      style={{ cursor: 'help', borderBottom: '1px dotted var(--theme-elevation-400)' }}
    >
      {children}
      {open && coords && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            className="od-stat-tooltip od-stat-tooltip--portal"
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{ top: coords.top, left: tipLeft ?? coords.left, minWidth: 260, fontStyle: 'normal' }}
          >
            <div className="od-stat-tooltip__head">{title}</div>
            <div className="od-stat-tooltip__body">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="od-stat-tooltip__row"
                  style={row.total ? { borderTop: '1px solid rgba(255, 255, 255, 0.25)', marginTop: 2 } : undefined}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span className="od-stat-tooltip__name" style={{ fontWeight: row.total ? 700 : 500 }}>{row.label}</span>
                    <span className="od-stat-tooltip__name" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: row.total ? 700 : 600 }}>
                      {row.value}
                    </span>
                  </span>
                  {row.note && <span className="od-stat-tooltip__detail">{row.note}</span>}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </span>
  )
}
