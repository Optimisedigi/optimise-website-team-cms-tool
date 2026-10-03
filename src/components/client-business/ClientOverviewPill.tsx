'use client'

/**
 * "Who is this client?" pill + popover for the client header (design handoff).
 *
 * Hover opens the popover, leaving closes it, click pins it open (click again
 * unpins). Keyboard: the pill is a button (Enter/Space pins), Escape closes.
 * When `editable`, an Edit link swaps the read view for Payload's own Lexical
 * editor: `ClientOverviewEditorPortal` (rendered by the Business tab) portals
 * the real `clientOverview` field into the slot rendered here, so edits go
 * straight to form state and mark the document dirty.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'

export const OVERVIEW_EDITOR_SLOT_ID = 'od-client-overview-editor-slot'

type Props = {
  content: ReactNode
  editable: boolean
}

function ClientOverviewPill({ content, editable }: Props): ReactNode {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [editing, setEditing] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()
  const titleId = useId()
  const open = hover || pinned || editing

  const close = useCallback((): void => {
    setHover(false)
    setPinned(false)
    setEditing(false)
  }, [])

  // Escape closes; a click outside unpins (but never while editing, so a stray
  // click cannot throw away the editor mid-sentence).
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      close()
      pillRef.current?.focus()
    }
    const onPointer = (event: PointerEvent): void => {
      if (editing) return
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target)) return
      setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, editing, close])

  return (
    <span
      ref={rootRef}
      className="od-overview"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        ref={pillRef}
        type="button"
        className="od-overview__pill"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-pressed={pinned || editing}
        onClick={() => {
          if (editing) return
          setPinned((v) => !v)
        }}
      >
        <span className="od-overview__icon" aria-hidden>
          ?
        </span>
        Who is this client?
      </button>

      <div
        id={popoverId}
        className="od-overview__popover"
        role="dialog"
        aria-labelledby={titleId}
        hidden={!open}
      >
        <div className="od-overview__head">
          <strong id={titleId} className="od-overview__title">
            Who is this client?
          </strong>
          {editable && !editing && (
            <button
              type="button"
              className="od-biz-link"
              onClick={() => {
                setEditing(true)
                setPinned(true)
              }}
            >
              Edit
            </button>
          )}
          {editing && (
            <button
              type="button"
              className="od-biz-btn od-biz-btn--primary od-biz-btn--sm"
              onClick={() => {
                close()
                pillRef.current?.focus()
              }}
            >
              Done
            </button>
          )}
        </div>

        {editing ? (
          <>
            <div id={OVERVIEW_EDITOR_SLOT_ID} className="od-overview__editor" />
            <p className="od-biz-hint">
              Supports bold, bullets and pasted markdown. Also shown in the Google Ads header.
            </p>
          </>
        ) : (
          <div className="od-overview__body">
            {content ?? (
              <span className="od-overview__empty">
                No overview yet.{editable ? ' Use Edit to add one.' : ''}
              </span>
            )}
          </div>
        )}
      </div>
    </span>
  )
}

export default ClientOverviewPill
