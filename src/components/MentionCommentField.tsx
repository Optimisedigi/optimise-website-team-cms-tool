'use client'

import { useRef, useState } from 'react'
import {
  filterMentionSuggestions,
  insertMention as insertMentionText,
  mentionTokenAt,
} from '@/lib/monthly-keyword-mention-text'

export type MentionTeammate = { id: string; label: string }

export function MentionCommentField({
  value,
  onChange,
  teammates,
  taggedIds,
  onTaggedIdsChange,
  placeholder,
  rows = 2,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  teammates: MentionTeammate[]
  taggedIds: string[]
  onTaggedIdsChange: (ids: string[]) => void
  placeholder?: string
  rows?: number
  autoFocus?: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number | null>(null)

  const refreshMentionState = (next: string, caret: number): void => {
    const token = mentionTokenAt(next, caret)
    if (token) {
      setMentionStart(token.start)
      setMentionQuery(token.query)
    } else {
      setMentionStart(null)
      setMentionQuery(null)
    }
  }

  const suggestions = mentionQuery === null ? [] : filterMentionSuggestions(teammates, mentionQuery)

  const pick = (mate: MentionTeammate): void => {
    const caret = textareaRef.current?.selectionStart ?? value.length
    const start = mentionStart ?? caret
    const inserted = insertMentionText(value, caret, start, mate.label)
    onChange(inserted.next)
    onTaggedIdsChange(taggedIds.includes(mate.id) ? taggedIds : [...taggedIds, mate.id])
    setMentionStart(null)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      const node = textareaRef.current
      if (node) { node.focus(); node.setSelectionRange(inserted.caret, inserted.caret) }
    })
  }

  const taggedLabels = taggedIds
    .map((id) => teammates.find((mate) => mate.id === id)?.label)
    .filter(Boolean) as string[]

  return (
    <div style={{ flex: '1 1 100%', position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value)
          refreshMentionState(event.target.value, event.target.selectionStart ?? event.target.value.length)
        }}
        onKeyUp={(event) => refreshMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
        onClick={(event) => refreshMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
        onBlur={() => { window.setTimeout(() => { setMentionStart(null); setMentionQuery(null) }, 150) }}
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, resize: 'vertical', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}
      />
      {suggestions.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, minWidth: 200, maxWidth: 320, background: 'var(--theme-elevation-0)', border: '1px solid var(--theme-elevation-200)', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
          {suggestions.map((mate) => (
            <button
              key={mate.id}
              type="button"
              onMouseDown={(event) => { event.preventDefault(); pick(mate) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 12, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--theme-text)' }}
            >@{mate.label}</button>
          ))}
        </div>
      )}
      {taggedLabels.length > 0 && (
        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#0f766e' }}>Tagging {taggedLabels.map((label) => `@${label}`).join(', ')}</span>
      )}
    </div>
  )
}
