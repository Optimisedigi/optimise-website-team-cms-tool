# Deploy Dashboard — CRITICAL STATE (March 30, 2026)

## COMPLETED
- ✅ Fix 1: normalizeProjectName applied to BOTH mtdCostsByProject AND monthlyProjectCosts in `src/components/DeploymentDashboard.tsx`
- ✅ `normalizeProjectName()` function strips `-\d{10,}-[A-Za-z0-9]{4}$` suffix from project names

## STILL TODO — Fix 2: Sidebar not showing on deployments page

### Root Cause
The page at `src/app/(payload)/admin/deployments/page.tsx` uses `DefaultTemplate` from `@payloadcms/next/templates` but the sidebar/nav doesn't render properly on local dev. Production works fine.

### Solution: Use Payload's views config instead of standalone Next.js page
1. Read `src/payload.config.ts` (NOT at root — at `src/payload.config.ts`)
2. Find the `admin.components` section
3. Add `views` config:
```typescript
views: {
  deployments: {
    Component: './components/DeploymentDashboardView',
    path: '/deployments',
  },
},
```
4. Create `src/components/DeploymentDashboardView.tsx` — simple wrapper:
```typescript
'use client'
import DeploymentDashboard from './DeploymentDashboard'

const DeploymentDashboardView = () => {
  return (
    <div className="gutter--left gutter--right" style={{ maxWidth: 1440 }}>
      <DeploymentDashboard />
    </div>
  )
}

export default DeploymentDashboardView
```
5. DELETE `src/app/(payload)/admin/deployments/page.tsx`
6. Stop dev server, run `npx payload generate:importmap`
7. Read `src/app/(payload)/admin/importMap.js` — check if `VercelBlobClientUploadHandler` was dropped. If so, re-add it manually.
8. Restart dev server

### Files for this feature (ALL paths from project root /Users/Pe/my-projects/content-cms)
1. `src/components/DeploymentDashboard.tsx` — Main client component. Team ID `peters-projects-589d7e29` hardcoded.
2. `src/components/DeploymentDashboardView.tsx` — NEEDS TO BE CREATED
3. `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (no auth)
4. `src/app/(payload)/admin/deployments/page.tsx` — NEEDS TO BE DELETED
5. `src/components/SidebarNavExtras.tsx` — Has "Deployments" injectLink() under Settings
6. `src/payload.config.ts` — NEEDS views config added
7. `src/components/MiniSidebar.tsx` — z-index changed from 1 to 100
8. `src/app/(payload)/custom.scss` — Sidebar CSS
9. `.env` — Has VERCEL_API_TOKEN
10. `src/app/(payload)/admin/importMap.js` — Will need regeneration

### IMPORTANT WARNINGS
- Config file is at `src/payload.config.ts` (NOT root)
- After modifying payload.config.ts, MUST run `npx payload generate:importmap`
- importMap.js ALWAYS drops `VercelBlobClientUploadHandler` on regeneration — MUST re-add manually
- Kill dev server BEFORE editing importMap.js
- Dev port: 3004
- Run `npx tsc --noEmit` and `npm test` after ALL changes
