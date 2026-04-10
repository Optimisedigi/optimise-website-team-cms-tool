# Deploy Dashboard — ABSOLUTE FINAL STATE (March 30, 2026)

## STATUS
- ✅ Fix 1 DONE: normalizeProjectName applied in DeploymentDashboard.tsx (both mtdCostsByProject AND monthlyProjectCosts)
- 🔧 Fix 2 IN PROGRESS: Sidebar not showing — switching to Payload views config approach

## WHAT I WAS DOING:
I read `src/payload.config.ts` and confirmed the structure. Next steps:
1. Add `views` config under `admin.components` in `src/payload.config.ts`
2. Create `src/components/DeploymentDashboardView.tsx`
3. Delete `src/app/(payload)/admin/deployments/page.tsx`
4. Stop dev server, run `npx payload generate:importmap`
5. Read importMap.js, re-add VercelBlobClientUploadHandler if dropped
6. Restart dev server, verify sidebar works

## payload.config.ts STRUCTURE (src/payload.config.ts):
```
Line 59: admin: {
Line 60:   user: Users.slug,
Line 61-63: importMap config
Line 64-67: meta config
Line 68:   components: {
Line 69-72: graphics (Logo, Icon)
Line 73: actions: ["./components/UserDisplayName"]
Line 74: beforeNavLinks: ["./components/SidebarLogo"]
Line 75: afterNavLinks: ["./components/SidebarNavExtras"]
Line 76: afterLogin: ["./components/ShowPasswordToggle"]
Line 77: providers: [ViewportMeta, RocketLoader, FirstLoginSetup, NavigationRecovery, MiniSidebar, PomodoroTimer]
Line 78: beforeDashboard: ["./components/Dashboard"]
Line 79:   },  // closes components
Line 80: },    // closes admin
```

## EXACT EDIT FOR payload.config.ts:
Find: `beforeDashboard: ["./components/Dashboard"],`
Add AFTER it (before `},` that closes components):
```typescript
      views: {
        deployments: {
          Component: './components/DeploymentDashboardView',
          path: '/deployments',
        },
      },
```

## DeploymentDashboardView.tsx TO CREATE at src/components/DeploymentDashboardView.tsx:
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

## ALL FILES
1. `src/components/DeploymentDashboard.tsx` — Client component (DONE, has normalizeProjectName)
2. `src/components/DeploymentDashboardView.tsx` — NEEDS CREATION
3. `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (DONE)
4. `src/app/(payload)/admin/deployments/page.tsx` — NEEDS DELETION
5. `src/components/SidebarNavExtras.tsx` — Has nav link (DONE)
6. `src/payload.config.ts` — NEEDS views config
7. `src/app/(payload)/admin/importMap.js` — Will need regeneration

## CRITICAL WARNINGS
- After payload.config.ts change: MUST run `npx payload generate:importmap`
- importMap.js ALWAYS drops VercelBlobClientUploadHandler — re-add manually
- Kill dev server BEFORE editing importMap.js
- Dev port: 3004
- Team ID: peters-projects-589d7e29
