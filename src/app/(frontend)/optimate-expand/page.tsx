import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import OptiMateExpandClient from './OptiMateExpandClient'

/**
 * Full-window OptiMate UI. Opened from the launcher's expand button so the
 * user can pick agents and chat in a standalone browser window without the
 * CMS sidebar. Auth is still enforced via the shared Payload session cookie.
 */
export default async function OptiMateExpandPage() {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { user } = await payload.auth({ headers })
  if (!user) {
    redirect('/admin/login?redirect=/optimate-expand')
  }

  return <OptiMateExpandClient userRole={(user as { role?: string }).role ?? ''} />
}
