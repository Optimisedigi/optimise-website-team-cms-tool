/**
 * Goal Baseline page, rendered inside the Payload admin shell.
 *
 * Visual pre-run baseline for a goal-agent run: conversions / traffic / spend
 * before the run, spend allocation by campaign, and three frozen baseline
 * points (last week, one month, three months before the run) alongside live
 * progress. Scope with ?clientId= (latest run for that client) or
 * ?goalRunId=; with neither it lists runs to pick from.
 */
import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload, createLocalReq } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import GoalBaselinePanel from '@/components/GoalBaselinePanel'
import { getVisibleEntities, getCustomViewActions } from '@/lib/visible-entities'
import AdminStepNavSetter from '@/components/AdminStepNavSetter'
import { userHasFeature } from '@/lib/access'

export const dynamic = 'force-dynamic'

const PAGE_STYLE: React.CSSProperties = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: 1100,
  margin: '0 auto',
  padding: '24px 0 40px',
  color: 'var(--theme-elevation-900, #222)',
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; goalRunId?: string }>
}) {
  const { clientId, goalRunId } = await searchParams
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { permissions, user } = await payload.auth({ headers })

  if (!user) redirect('/admin/login?redirect=/admin/google-ads/goal-baseline')
  if (!userHasFeature(user, 'nav:google-ads')) redirect('/admin')

  const req = await createLocalReq({ user: user ?? undefined }, payload)

  return (
    <DefaultTemplate
      i18n={req.i18n}
      payload={payload}
      permissions={permissions}
      req={req}
      user={user ?? undefined}
      viewActions={getCustomViewActions(payload)}
      visibleEntities={getVisibleEntities(payload, user)}
    >
      <AdminStepNavSetter
        items={[{ label: 'Google Ads', url: '/admin/google-ads' }, { label: 'Goal Baseline' }]}
      />
      <div className="gutter--left gutter--right">
        <div style={PAGE_STYLE}>
          <h1 style={{ fontSize: 22, marginTop: 0, marginBottom: 4 }}>Goal-run performance baseline</h1>
          <p style={{ fontSize: 12, color: '#666', marginTop: 0, marginBottom: 20 }}>
            What the account looked like before the goal run started, frozen once so progress is
            measured against a fixed anchor. Live columns are fetched from Google Ads on every open.
          </p>
          <GoalBaselinePanel clientId={clientId} goalRunId={goalRunId} />
        </div>
      </div>
    </DefaultTemplate>
  )
}
