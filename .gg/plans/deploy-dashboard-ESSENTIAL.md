# Deploy Dashboard — ESSENTIAL STATE (LATEST)

## THE PROBLEM
Sidebar/nav not showing on `/admin/deployments` page in local dev. Production works fine.

## WHAT HAS BEEN TRIED (ALL FAILED)
1. Next.js page at `src/app/(payload)/admin/deployments/page.tsx` using `DefaultTemplate` from `@payloadcms/next/templates` — NO sidebar. File was DELETED.
2. Payload views config in `src/payload.config.ts` under `admin.components.views` — STILL NO sidebar. Config IS currently in place (lines 79-84).
3. MiniSidebar z-index bumped from 1 to 100 in `src/components/MiniSidebar.tsx` — NO effect.

## CURRENT FILE STATE
- `src/payload.config.ts` lines 79-84: HAS views config (deployments → DeploymentDashboardView, path: /deployments)
- `src/components/DeploymentDashboardView.tsx` EXISTS — 'use client' wrapper rendering DeploymentDashboard
- `src/app/(payload)/admin/deployments/page.tsx` — DELETED
- `src/components/DeploymentDashboard.tsx` — Main component (WORKING, data loads fine)
- `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (WORKING)
- `src/components/SidebarNavExtras.tsx` — Has Deployments nav link
- `src/components/MiniSidebar.tsx` — z-index: 100
- `.env` — Has VERCEL_API_TOKEN

## NEXT APPROACH: Go back to DefaultTemplate page approach
Since integrations page works on PRODUCTION with DefaultTemplate, do the same for deployments.
The sidebar issue is likely a LOCAL DEV / Turbopack issue that resolves in production.

Steps:
1. Remove views config from payload.config.ts (lines 79-84)
2. Recreate `src/app/(payload)/admin/deployments/page.tsx` using DefaultTemplate (copy exact pattern from integrations page)
3. Delete `src/components/DeploymentDashboardView.tsx` (no longer needed)
4. Regenerate importmap: `npx payload generate:importmap` (kill dev server first)
5. Check importMap.js for VercelBlobClientUploadHandler (re-add if dropped)
6. Restart dev server

## REFERENCE: Working integrations page pattern (src/app/(payload)/admin/settings/integrations/page.tsx):
```typescript
import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload, createLocalReq } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import IntegrationsPage from '../../../../../components/IntegrationsPage'

export default async function Page() {
  const payload = await getPayload({ config })
  const headers = await getHeaders()
  const { permissions, user } = await payload.auth({ headers })
  const req = await createLocalReq({ user: user ?? undefined }, payload)
  const visibleEntities = {
    collections: payload.config.collections.filter((c) => !c.admin?.hidden).map((c) => c.slug),
    globals: payload.config.globals.filter((g) => !g.admin?.hidden).map((g) => g.slug),
  }
  return (
    <DefaultTemplate
      i18n={req.i18n} payload={payload} permissions={permissions}
      req={req} user={user ?? undefined} visibleEntities={visibleEntities}
    >
      <div className="gutter--left gutter--right" style={{ maxWidth: 1440 }}>
        <IntegrationsPage />
      </div>
    </DefaultTemplate>
  )
}
```

## KEY INFO
- Dev port: 3004
- Background dev server task: c8fe0792
- Team ID: peters-projects-589d7e29 (hardcoded in DeploymentDashboard.tsx)
- Billing fix DONE: normalizeProjectName strips `-\d{10,}-[A-Za-z0-9]{4}$`
- importMap.js drops VercelBlobClientUploadHandler on regeneration — must re-add
- Kill dev server BEFORE editing importMap.js
- Run `npx tsc --noEmit` and `npm test` after changes
