'use client'

const links = {
  auth: {
    title: 'OptiMate Auth',
    body: 'Connect and manage provider sign-ins used by OptiMate models.',
    href: '/admin/agent-auth',
    cta: 'Open OptiMate Auth',
  },
  memory: {
    title: 'OptiMate Memory',
    body: 'Review long-term facts OptiMate has learned about clients and the agency.',
    href: '/admin/collections/agent-memory',
    cta: 'Open OptiMate Memory',
  },
  soul: {
    title: 'OptiMate Soul',
    body: 'Edit communication rules, tone, formatting, and behaviour guidelines for OptiMate.',
    href: '/admin/collections/agent-soul',
    cta: 'Open OptiMate Soul',
  },
} as const

type LinkKind = keyof typeof links

export default function OptiMateSettingsLinksPanel({ kind }: { kind: LinkKind }) {
  const link = links[kind]

  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 18, background: 'var(--theme-elevation-0)' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>{link.title}</h3>
      <p style={{ margin: '0 0 14px', color: 'var(--theme-elevation-600)', maxWidth: 680 }}>{link.body}</p>
      <a
        href={link.href}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 6,
          padding: '8px 12px',
          background: 'var(--theme-success-500)',
          color: 'var(--theme-success-50)',
          textDecoration: 'none',
          fontWeight: 700,
        }}
      >
        {link.cta}
      </a>
    </div>
  )
}
