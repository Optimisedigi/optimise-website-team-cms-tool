import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import OptimatePopoutClient from './OptimatePopoutClient'

interface PageProps {
  searchParams: Promise<{
    audits?: string
    sessionIds?: string
    mode?: string
    portfolio?: string
    agent?: string
    phase?: string
  }>
}

/**
 * Stand-alone Optimate chat window.
 *
 * Opened via `window.open(...)` from the OptiMateLauncher pop-out button so
 * the user can chat with Optimate independently of the CMS — useful when
 * they want to keep the chat visible while navigating other pages.
 *
 * Lives under (frontend) — not (payload) — so the Payload admin chrome
 * (sidebar, nav, floating launcher) doesn't wrap the window. Previously
 * this page rendered inside Payload's RootLayout which (a) showed the
 * admin sidebar on the left and (b) trapped our `position: fixed` chat
 * container inside an ancestor with a transform, causing the content to
 * clip on the left and not expand when the window was resized. Auth is
 * still enforced via the shared Payload session cookie.
 *
 * URL: /optimate-popout?audits=12,34&sessionIds=abc,def
 *   - audits = comma-separated google-ads-audit ids.
 *   - sessionIds = optional, parallel list of chat sessionIds (one per
 *     audit, by position). Empty entries mean "start a fresh thread for
 *     that audit". Set by the launcher popout button so the new window
 *     resumes the same conversations the launcher had open.
 */
export default async function OptimatePopoutPage({ searchParams }: PageProps) {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })
  if (!user) {
    redirect('/admin/login?redirect=/optimate-popout')
  }

  const { audits, sessionIds: sessionIdsParam, mode, portfolio, agent, phase } = await searchParams

  // Standalone agents (no audit/account picker) just re-mount full-window.
  if (agent === 'invoices') {
    return <OptimatePopoutClient agent="invoices" />
  }

  if (agent === 'gmail') {
    return <OptimatePopoutClient agent="gmail" phase={phase === 'reply' ? 'reply' : 'compose'} />
  }

  const portfolioMode = mode === 'portfolio' || portfolio === '1'

  if (portfolioMode) {
    const initialSessionId = sessionIdsParam?.split(',')[0]?.trim()
    return (
      <OptimatePopoutClient
        targets={[
          {
            mode: 'portfolio',
            id: 'portfolio',
            businessName: 'Portfolio',
            ...(initialSessionId ? { initialSessionId } : {}),
          },
        ]}
      />
    )
  }

  const ids = (audits ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (ids.length === 0) {
    return <NoAudits />
  }

  // sessionIds is paired with `audits` by index — a parallel list where the
  // i-th sessionId belongs to the i-th audit id. Empty entries mean "no
  // thread to resume, start a fresh one".
  const sessionIdsByAuditId = new Map<string, string>()
  if (sessionIdsParam) {
    const sids = sessionIdsParam.split(',').map((s) => s.trim())
    ids.forEach((auditId, i) => {
      const sid = sids[i]
      if (sid) sessionIdsByAuditId.set(auditId, sid)
    })
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

  type Target = {
    mode: 'audit'
    id: number | string
    customerId: string
    businessName?: string
    initialSessionId?: string
  }
  const targets: Target[] = (result.docs as unknown as Array<Record<string, unknown>>)
    .map((d) => {
      const id = d.id as number | string
      const sid = sessionIdsByAuditId.get(String(id))
      return {
        mode: 'audit' as const,
        id,
        customerId: typeof d.customerId === 'string' ? d.customerId : '',
        businessName: typeof d.businessName === 'string' ? d.businessName : undefined,
        ...(sid ? { initialSessionId: sid } : {}),
      }
    })
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
