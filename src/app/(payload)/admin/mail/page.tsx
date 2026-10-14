import config from '@payload-config'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { headers as getHeaders } from 'next/headers'
import { createLocalReq, getPayload } from 'payload'
import { redirect } from 'next/navigation'
import AdminStepNavSetter from '../../../../components/AdminStepNavSetter'
import MailApp from '../../../../components/mail/MailApp'
import { userHasFeature } from '../../../../lib/access'
import { getCustomViewActions, getVisibleEntities } from '../../../../lib/visible-entities'

export default async function Page() {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { permissions, user } = await payload.auth({ headers })
  if (!user) redirect('/admin/login')
  if (!userHasFeature(user, 'nav:mail')) redirect('/admin')

  const req = await createLocalReq({ user }, payload)
  const clientsResult = await payload.find({
    collection: 'clients',
    depth: 0,
    limit: 1000,
    sort: 'name',
    select: { id: true, name: true },
    overrideAccess: false,
    req,
  })
  const clients = clientsResult.docs.map((client) => ({ id: client.id, name: client.name ?? `Client ${client.id}` }))

  return (
    <DefaultTemplate
      i18n={req.i18n}
      payload={payload}
      permissions={permissions}
      req={req}
      user={user}
      viewActions={getCustomViewActions(payload)}
      visibleEntities={getVisibleEntities(payload, user)}
    >
      <AdminStepNavSetter items={[{ label: 'Mail' }]} />
      <div className="gutter--left gutter--right" style={{ maxWidth: 1480 }}>
        <MailApp clients={clients} />
      </div>
    </DefaultTemplate>
  )
}
