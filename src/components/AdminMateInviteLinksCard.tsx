'use client'

import { useState } from 'react'
import type { InviteLink } from '@/lib/meeting-scheduler-invites'

interface Props {
  title: string
  links: InviteLink[]
  adminUrl: string
  onDismiss: () => void
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Each invitee's private scheduling link, shown when the admin chose not to
 * email invites, so they can copy and share the links themselves.
 */
export default function AdminMateInviteLinksCard({
  title,
  links,
  adminUrl,
  onDismiss,
}: Props): React.ReactElement {
  // Which link was last copied ('all' for every link); null when none yet.
  const [copied, setCopied] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)

  const copy = async (key: string, text: string): Promise<void> => {
    const ok = await copyText(text)
    setCopyFailed(!ok)
    setCopied(ok ? key : null)
  }

  return (
    <section
      aria-label="Meeting invite links"
      style={{
        border: '1px solid #6ee7b7',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(16,185,129,.08)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>Invite links for {title}</strong>
        <a href={adminUrl} target="_blank" rel="noreferrer" style={linkStyle}>
          Open
        </a>
      </div>
      <span style={{ fontSize: 13 }}>
        No emails were sent. Each person has their own private link, so send each one only to
        that person.
      </span>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {links.map((link) => (
          <li key={link.email} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {link.name ? `${link.name} <${link.email}>` : link.email}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                readOnly
                aria-label={`Invite link for ${link.email}`}
                value={link.url}
                onFocus={(event) => event.currentTarget.select()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                aria-label={`Copy invite link for ${link.email}`}
                onClick={() => void copy(link.email, link.url)}
                style={secondaryButtonStyle}
              >
                {copied === link.email ? 'Copied' : 'Copy'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {copyFailed && (
        <div role="alert" style={{ fontSize: 13, color: '#991b1b' }}>
          Could not copy. Select the link and copy it manually.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {links.length > 1 && (
          <button
            type="button"
            onClick={() =>
              void copy(
                'all',
                links
                  .map((link) => `${link.name || link.email} (${link.email}): ${link.url}`)
                  .join('\n'),
              )
            }
            style={{ ...secondaryButtonStyle, flex: 1 }}
          >
            {copied === 'all' ? 'Copied all' : 'Copy all links'}
          </button>
        )}
        <button type="button" onClick={onDismiss} style={secondaryButtonStyle}>
          Done
        </button>
      </div>
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 7,
  padding: '8px 9px',
  background: 'var(--theme-bg)',
  color: 'var(--theme-text)',
  font: 'inherit',
  fontSize: 12,
}
const linkStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'inherit',
  textDecoration: 'underline',
}
const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 8,
  padding: '9px 12px',
  background: 'var(--theme-bg)',
  color: 'var(--theme-text)',
  fontWeight: 700,
  cursor: 'pointer',
}
