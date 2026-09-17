import config from '@payload-config'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { headers as getHeaders } from 'next/headers'
import { createLocalReq, getPayload } from 'payload'
import { redirect } from 'next/navigation'
import AdminStepNavSetter from '../../../../../components/AdminStepNavSetter'
import ClientPulsePage from '../../../../../components/ClientPulsePage'
import { getClientPulseSummaries, recordClientPulseHistory } from '../../../../../lib/client-pulse'
import { userHasFeature } from '../../../../../lib/access'
import { getCustomViewActions, getVisibleEntities } from '../../../../../lib/visible-entities'

export default async function Page() {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { permissions, user } = await payload.auth({ headers })
  if (!user) {
    redirect('/admin/login')
  }
  if (!userHasFeature(user, 'nav:client-pulse')) {
    redirect('/admin')
  }
  const req = await createLocalReq({ user }, payload)
  const visibleEntities = getVisibleEntities(payload, user)
  const viewActions = getCustomViewActions(payload)
  const [summaries, availableClientsResult] = await Promise.all([
    getClientPulseSummaries(payload),
    payload.find({
      collection: 'clients',
      depth: 0,
      limit: 1000,
      sort: 'name',
      where: {
        and: [{ isActive: { not_equals: false } }, { 'clientPulse.enabled': { not_equals: true } }],
      },
      select: { id: true, name: true },
      overrideAccess: false,
      req,
    }),
  ])
  await recordClientPulseHistory(payload, summaries)
  const availableClients = availableClientsResult.docs.map((client) => ({
    id: client.id,
    name: client.name,
  }))

  return (
    <DefaultTemplate
      i18n={req.i18n}
      payload={payload}
      permissions={permissions}
      req={req}
      user={user}
      viewActions={viewActions}
      visibleEntities={visibleEntities}
    >
      <AdminStepNavSetter items={[{ label: 'Clients' }, { label: 'Client Pulse' }]} />
      <div className="gutter--left gutter--right" style={{ maxWidth: 1480 }}>
        <ClientPulsePage initialData={summaries} availableClients={availableClients} />
      </div>
    </DefaultTemplate>
  )
}
