import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload, createLocalReq } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import ContractorCostsPage from '../../../../components/ContractorCostsPage'
import { getVisibleEntities } from '../../../../lib/visible-entities'
import { userHasFeature } from '../../../../lib/access'

export default async function Page() {
  const payload = await getPayload({ config })
  const headers = await getHeaders()

  const { permissions, user } = await payload.auth({ headers })
  if (!user) {
    redirect('/admin/login')
  }
  if (!userHasFeature(user, 'nav:contractor-costs') && !userHasFeature(user, 'contractors')) {
    redirect('/admin')
  }

  const req = await createLocalReq({ user: user ?? undefined }, payload)
  const visibleEntities = getVisibleEntities(payload, user)

  return (
    <DefaultTemplate
      i18n={req.i18n}
      payload={payload}
      permissions={permissions}
      req={req}
      user={user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <div className="gutter--left gutter--right" style={{ maxWidth: 1440 }}>
        <ContractorCostsPage />
      </div>
    </DefaultTemplate>
  )
}
