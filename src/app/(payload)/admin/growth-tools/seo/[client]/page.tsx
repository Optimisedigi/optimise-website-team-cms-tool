import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload, createLocalReq } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import { getVisibleEntities, getCustomViewActions } from '../../../../../../lib/visible-entities'
import { userHasFeature } from '../../../../../../lib/access'
import SeoClientWorkspace from '../../../../../../components/SeoClientWorkspace'

interface PageProps {
  params: Promise<{ client: string }>
}

export default async function Page({ params }: PageProps) {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { permissions, user } = await payload.auth({ headers })
  if (!user) redirect('/admin/login')
  if (!userHasFeature(user, 'nav:seo')) redirect('/admin')

  const { client: clientParam } = await params
  const byId = /^\d+$/.test(clientParam)
    ? await payload.findByID({ collection: 'clients', id: clientParam, depth: 0, overrideAccess: false, select: { name: true, gscConnected: true } }).catch(() => null)
    : null
  const client =
    byId ??
    (
      await payload.find({
        collection: 'clients',
        where: { slug: { equals: clientParam } },
        limit: 1,
        depth: 0,
        select: { name: true, gscConnected: true },
      })
    ).docs[0]

  if (!client) redirect('/admin/growth-tools/seo')

  const req = await createLocalReq({ user: user ?? undefined }, payload)
  const visibleEntities = getVisibleEntities(payload, user)
  const viewActions = getCustomViewActions(payload)

  return (
    <DefaultTemplate
      i18n={req.i18n}
      payload={payload}
      permissions={permissions}
      req={req}
      user={user ?? undefined}
      viewActions={viewActions}
      visibleEntities={visibleEntities}
    >
      <div className="gutter--left gutter--right" style={{ maxWidth: 1440 }}>
        <SeoClientWorkspace client={{ id: client.id, name: client.name, gscConnected: !!client.gscConnected }} />
      </div>
    </DefaultTemplate>
  )
}
