'use client'

import { Fragment, useRef, useState } from 'react'
import { cellKey, dateLabel, minutesLabel, type CellKey } from '@/lib/meeting-availability'
import styles from './AvailabilityGrid.module.css'

export interface GridDay {
  date: string
  label?: string
  /** Draw Cipher's thin Saturday/Sunday columns after this day. */
  weekendAfter?: boolean
}

interface Props {
  days: readonly GridDay[]
  rows: readonly number[]
  /** Cells that cannot be picked (busy, past, or not offered). */
  isLocked: (date: string, minutes: number) => string | null
  /** The set a drag adds to or removes from. */
  selected: ReadonlySet<CellKey>
  onChange: (next: Set<CellKey>) => void
  /**
   * Cells a drag may change. Defaults to every unlocked cell; the admin's
   * favourites mode limits it to open cells.
   */
  canSelect?: (key: CellKey) => boolean
  /** Shown filled under the selection (e.g. open times while starring). */
  filled?: ReadonlySet<CellKey>
  favourites?: ReadonlySet<CellKey>
  variant?: 'admin' | 'client'
  favouriteMode?: boolean
  disabled?: boolean
  ariaLabel: string
  /** Screen-reader state for a selected cell, e.g. "available". */
  selectedLabel: string
  unselectedLabel: string
  /** Label for unlocked cells `canSelect` rejects (e.g. unticked while starring). */
  unavailableLabel?: string
}

interface Drag {
  anchorDay: number
  anchorRow: number
  day: number
  row: number
  erasing: boolean
}

const dragCapturePx = 6

/**
 * Drag-to-select availability grid, ported from Cipher Health's "Calendar
 * block times" week grid: mouse and pen drag a rectangle (starting on a
 * selected cell erases), touch taps one cell at a time so the page still
 * scrolls, and arrow keys move between cells.
 */
export default function AvailabilityGrid({
  days,
  rows,
  isLocked,
  selected,
  onChange,
  canSelect,
  filled,
  favourites,
  variant = 'admin',
  favouriteMode = false,
  disabled = false,
  ariaLabel,
  selectedLabel,
  unselectedLabel,
  unavailableLabel = 'unavailable',
}: Props): React.ReactElement {
  const gridRef = useRef<HTMLDivElement>(null)
  const pressAt = useRef<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const keyAt = (dayIndex: number, rowIndex: number): CellKey =>
    cellKey(days[dayIndex]?.date ?? '', rows[rowIndex] ?? -1)

  const selectable = (dayIndex: number, rowIndex: number): boolean => {
    const day = days[dayIndex]
    const minutes = rows[rowIndex]
    if (!day || minutes === undefined || isLocked(day.date, minutes)) return false
    return canSelect ? canSelect(keyAt(dayIndex, rowIndex)) : true
  }

  const inDrag = (dayIndex: number, rowIndex: number, from: Drag | null = drag): boolean => {
    if (!from) return false
    const [dayLow, dayHigh] = [from.anchorDay, from.day].sort((a, b) => a - b)
    const [rowLow, rowHigh] = [from.anchorRow, from.row].sort((a, b) => a - b)
    return (
      dayIndex >= (dayLow ?? 0) &&
      dayIndex <= (dayHigh ?? 0) &&
      rowIndex >= (rowLow ?? 0) &&
      rowIndex <= (rowHigh ?? 0)
    )
  }

  function toggle(dayIndex: number, rowIndex: number): void {
    if (!selectable(dayIndex, rowIndex)) return
    const next = new Set(selected)
    const key = keyAt(dayIndex, rowIndex)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  function commit(from: Drag): void {
    const next = new Set(selected)
    days.forEach((_, dayIndex) =>
      rows.forEach((_minutes, rowIndex) => {
        if (!inDrag(dayIndex, rowIndex, from) || !selectable(dayIndex, rowIndex)) return
        const key = keyAt(dayIndex, rowIndex)
        if (from.erasing) next.delete(key)
        else next.add(key)
      }),
    )
    onChange(next)
  }

  function cellFromPoint(clientX: number, clientY: number): { day: number; row: number } | null {
    const element = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('[data-day][data-row]')
    if (!element || !gridRef.current?.contains(element)) return null
    return { day: Number(element.dataset.day), row: Number(element.dataset.row) }
  }

  // Mouse and pen drag a rectangle; touch taps one cell at a time. Capturing
  // a touch pointer would swallow page scrolling over the grid.
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.pointerType === 'touch' || event.button !== 0 || disabled) return
    pressAt.current = { x: event.clientX, y: event.clientY }
    const cell = cellFromPoint(event.clientX, event.clientY)
    if (!cell || !selectable(cell.day, cell.row)) return
    setDrag({
      anchorDay: cell.day,
      anchorRow: cell.row,
      day: cell.day,
      row: cell.row,
      erasing: selected.has(keyAt(cell.day, cell.row)),
    })
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drag) return
    // Hold the pointer once a drag clearly moves, so letting go just outside
    // the grid still counts. Not on press: that would retarget a plain click.
    const press = pressAt.current
    if (
      press &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > dragCapturePx &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const cell = cellFromPoint(event.clientX, event.clientY)
    if (!cell) return
    setDrag((current) =>
      current && (current.day !== cell.day || current.row !== cell.row)
        ? { ...current, day: cell.day, row: cell.row }
        : current,
    )
  }

  // A drag that never left its anchor cell is a plain click: the button's
  // own onClick toggles it, so committing here as well would cancel it out.
  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.pointerType === 'touch') return
    if (event.type === 'pointerleave' && event.currentTarget.hasPointerCapture(event.pointerId))
      return
    pressAt.current = null
    if (!drag) return
    const moved = drag.day !== drag.anchorDay || drag.row !== drag.anchorRow
    setDrag(null)
    if (moved) commit(drag)
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    dayIndex: number,
    rowIndex: number,
  ): void {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    gridRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-day="${dayIndex + move[0]}"][data-row="${rowIndex + move[1]}"]`,
      )
      ?.focus()
  }

  const columns = [
    variant === 'client' ? '4rem' : '4.5rem',
    ...days.flatMap((day) =>
      day.weekendAfter
        ? ['minmax(3rem, 1fr)', '0.625rem', '0.625rem']
        : [variant === 'client' ? 'minmax(3.25rem, 1fr)' : 'minmax(3rem, 1fr)'],
    ),
  ].join(' ')

  const gridClass = [
    styles.grid,
    variant === 'client' ? styles.client : '',
    favouriteMode ? styles.favouriteMode : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      aria-label={ariaLabel}
      className={gridClass}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={gridRef}
      role="group"
      style={{ gridTemplateColumns: columns }}
    >
      <span aria-hidden className={styles.corner} />
      {days.map((day) => (
        <Fragment key={day.date}>
          <span className={styles.dayHeader}>{day.label ?? dateLabel(day.date)}</span>
          {day.weekendAfter ? (
            <>
              <span aria-hidden className={styles.weekendHeader} title="Saturday">
                S
              </span>
              <span aria-hidden className={styles.weekendHeader} title="Sunday">
                S
              </span>
            </>
          ) : null}
        </Fragment>
      ))}
      {rows.map((minutes, rowIndex) => (
        <div className={styles.row} key={minutes}>
          <span className={styles.time}>{minutesLabel(minutes)}</span>
          {days.map((day, dayIndex) => {
            const key = keyAt(dayIndex, rowIndex)
            const label = `${day.label ?? dateLabel(day.date)} ${minutesLabel(minutes)}`
            const weekend = day.weekendAfter ? (
              <>
                <span aria-hidden className={styles.weekendCell} />
                <span aria-hidden className={styles.weekendCell} />
              </>
            ) : null
            const lockedReason = isLocked(day.date, minutes)
            if (lockedReason) {
              return (
                <Fragment key={day.date}>
                  <button
                    aria-label={`${label}, ${lockedReason}`}
                    className={`${styles.cell} ${styles.locked}`}
                    data-day={dayIndex}
                    data-row={rowIndex}
                    disabled
                    onKeyDown={(event) => handleKeyDown(event, dayIndex, rowIndex)}
                    title={lockedReason}
                    type="button"
                  />
                  {weekend}
                </Fragment>
              )
            }
            // While erasing, covered cells preview as unselected, so the
            // gesture shows its result before the pointer is released.
            const underDrag = inDrag(dayIndex, rowIndex) && selectable(dayIndex, rowIndex)
            const isSelected = drag?.erasing
              ? selected.has(key) && !underDrag
              : selected.has(key) || underDrag
            const isFilled = isSelected || Boolean(filled?.has(key))
            const isFavourite = Boolean(favourites?.has(key))
            const allowed = canSelect ? canSelect(key) : true
            const className = [
              styles.cell,
              isFilled ? styles.selected : '',
              isFavourite ? styles.favourite : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <Fragment key={day.date}>
                <button
                  aria-label={`${label}, ${
                    isSelected ? selectedLabel : allowed ? unselectedLabel : unavailableLabel
                  }${isFavourite && !favouriteMode ? ', favourite' : ''}`}
                  aria-pressed={isSelected}
                  className={className}
                  data-day={dayIndex}
                  data-row={rowIndex}
                  disabled={disabled}
                  onClick={() => toggle(dayIndex, rowIndex)}
                  onKeyDown={(event) => handleKeyDown(event, dayIndex, rowIndex)}
                  type="button"
                />
                {weekend}
              </Fragment>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function GridLegend({
  items,
  variant = 'admin',
}: {
  items: ReadonlyArray<{ label: string; kind: 'selected' | 'free' | 'locked' | 'favourite' }>
  variant?: 'admin' | 'client'
}): React.ReactElement {
  return (
    <div className={`${styles.legend} ${variant === 'client' ? styles.client : ''}`}>
      {items.map((item) => (
        <span className={styles.legendItem} key={item.label}>
          <span
            aria-hidden
            className={[
              styles.swatch,
              item.kind === 'selected' || item.kind === 'favourite' ? styles.selected : '',
              item.kind === 'locked' ? styles.locked : '',
              item.kind === 'favourite' ? styles.favourite : '',
            ].join(' ')}
            style={item.kind === 'free' ? { background: 'var(--ag-free)' } : undefined}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
