import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import OptimatePopoutClient from './OptimatePopoutClient'

interface PageProps {
  searchParams: Promise<{ audits?: string }>
}

/**
 * Stand-alone Optimate chat window.
 *
 * Opened via `window.open(...)` from the OptiMateLauncher pop-out button so
 * the user can chat with Optimate independently of the CMS — useful when
 * they want to keep the chat visible while navigating other pages.
 *
 * Bypasses the Payload admin chrome (no sidebar / nav) so the chat takes
 * the whole window. Auth is still required.
 *
 * URL: /admin/optimate-popout?audits=12,34
 *   - audits = comma-separated google-ads-audit ids.
 */
export default async function OptimatePopoutPage({ searchParams }: PageProps) {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })
  if (!user) {
    redirect('/admin/login?redirect=/admin/optimate-popout')
  }

  const { audits } = await searchParams
  const ids = (audits ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (ids.length === 0) {
    return <NoAudits />
  }

  // Resolve audit docs so the chat has businessName + customerId per target.
  const result = await payload.find({
    collection: 'google-ads-audits',
    where: { id: { in: ids } },
    limit: 50,
    overrideAccess: false,
    user: user ?? undefined,
    depth: 0,
  })

  type Target = { id: number | string; customerId: string; businessName?: string }
  const targets: Target[] = (result.docs as unknown as Array<Record<string, unknown>>)
    .map((d) => ({
      id: d.id as number | string,
      customerId: typeof d.customerId === 'string' ? d.customerId : '',
      businessName: typeof d.businessName === 'string' ? d.businessName : undefined,
    }))
    .filter((t) => Boolean(t.customerId))

  if (targets.length === 0) {
    return <NoAudits />
  }

  return <OptimatePopoutClient targets={targets} />
}

function NoAudits() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--theme-bg, #f9fafb)',
        color: 'var(--theme-text, #1f2937)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          No accounts selected
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Open this window from the OptiMate launcher in the CMS &mdash; the
          launcher passes the accounts to chat with.
        </p>
        <a
          href="/admin"
          style={{
            display: 'inline-block',
            padding: '8px 14px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Open CMS
        </a>
      </div>
    </div>
  )
}
