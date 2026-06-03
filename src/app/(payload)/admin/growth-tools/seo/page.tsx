import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload, createLocalReq } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import SeoHubPage from '../../../../../components/SeoHubPage'
import { getVisibleEntities, getCustomViewActions } from '../../../../../lib/visible-entities'
import AdminStepNavSetter from "@/components/AdminStepNavSetter";
import { userHasFeature } from '../../../../../lib/access'

export default async function Page() {
  const payload = await getPayload({ config })
  const headers = await getHeaders()

  const { permissions, user } = await payload.auth({ headers })
  if (!user) {
    redirect('/admin/login')
  }
  if (!userHasFeature(user, 'nav:seo')) {
    redirect('/admin')
  }

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
      <AdminStepNavSetter items={[{ label: "Growth Tools" }, { label: "SEO" }]} />
      <div className="gutter--left gutter--right" style={{ maxWidth: 1440 }}>
        <SeoHubPage />
      </div>
    </DefaultTemplate>
  )
}
