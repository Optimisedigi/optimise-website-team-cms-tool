'use client'

import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { matchMailContacts, type MailContact } from '@/lib/mail/contacts-shared'

interface Props {
  value: string
  onChange: (email: string) => void
  /** Picking a suggestion: the contact's email and header name. */
  onPick: (contact: MailContact) => void
  /** People from the admin's own mail; null while still loading. */
  contacts: readonly MailContact[] | null
  /** Called on focus so the list loads before the first letters are typed. */
  onWantContacts: () => void
  /** Addresses already invited, left out of the suggestions. */
  exclude: ReadonlySet<string>
  label: string
  style?: CSSProperties
}

/**
 * Invitee email field with suggestions from the admin's sent and received
 * Gmail. Suggestions show from the second letter, matching the start of the
 * address, the domain, the name or a word of it. Enter, Tab or a click picks
 * the highlighted one; arrows move the highlight; Escape closes the list.
 */
export default function AdminMateInviteeEmailInput({
  value,
  onChange,
  onPick,
  contacts,
  onWantContacts,
  exclude,
  label,
  style,
}: Props): React.ReactElement {
  const listId = useId()
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(0)

  const suggestions =
    contacts && focused && !dismissed ? matchMailContacts(contacts, value, exclude) : []
  const open = suggestions.length > 0
  const highlighted = Math.min(active, Math.max(0, suggestions.length - 1))

  const pick = (contact: MailContact): void => {
    onPick(contact)
    setDismissed(true)
    setActive(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (!open) return
    const choice = suggestions[highlighted]
    if ((event.key === 'Tab' && !event.shiftKey) || event.key === 'Enter') {
      if (!choice) return
      event.preventDefault()
      pick(choice)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((highlighted + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((highlighted - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setDismissed(true)
    }
  }

  return (
    <div style={{ position: 'relative', minWidth: 0, ...style }}>
      <input
        aria-label={label}
        placeholder="Email"
        type="email"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${highlighted}` : undefined}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        maxLength={200}
        onChange={(event) => {
          onChange(event.target.value)
          setDismissed(false)
          setActive(0)
        }}
        onFocus={() => {
          setFocused(true)
          onWantContacts()
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        style={inputStyle}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} style={listStyle}>
          {suggestions.map((contact, index) => (
            <li
              key={contact.email}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
              // Keep focus in the field so the click lands as a pick, not a blur.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(contact)}
              style={{
                ...optionStyle,
                background: index === highlighted ? 'var(--theme-elevation-100)' : 'transparent',
              }}
            >
              {contact.name && <span style={nameStyle}>{contact.name}</span>}
              <span style={emailStyle}>{contact.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 7,
  padding: '8px 9px',
  background: 'var(--theme-bg)',
  color: 'var(--theme-text)',
  font: 'inherit',
}
const listStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 20,
  maxHeight: 240,
  overflowY: 'auto',
  margin: '2px 0 0',
  padding: '4px 0',
  listStyle: 'none',
  background: 'var(--theme-elevation-0)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  boxShadow: '0 6px 18px rgba(0,0,0,.15)',
}
const optionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  padding: '7px 10px',
  minHeight: 36,
  justifyContent: 'center',
  cursor: 'pointer',
}
const nameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--theme-text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const emailStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--theme-elevation-650)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
