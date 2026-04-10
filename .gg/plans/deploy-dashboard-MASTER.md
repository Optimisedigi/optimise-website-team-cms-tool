# Deploy Dashboard — MASTER STATE (March 30, 2026)

## CURRENT PROBLEM
Sidebar not showing on `/admin/deployments` page. Two approaches tried, both failed.

## CURRENT FILE STATE

### payload.config.ts lines 68-86:
```typescript
    components: {
      graphics: {
        Logo: "./components/Logo",
        Icon: "./components/Icon",
      },
      actions: ["./components/UserDisplayName"],
      beforeNavLinks: ["./components/SidebarLogo"],
      afterNavLinks: ["./components/SidebarNavExtras"],
      afterLogin: ["./components/ShowPasswordToggle"],
      providers: ["./components/ViewportMeta", "./components/RocketLoader", "./components/FirstLoginSetup", "./components/NavigationRecovery", "./components/MiniSidebar", "./components/PomodoroTimer"],
      beforeDashboard: ["./components/Dashboard"],
      views: {
        deployments: {
          Component: './components/DeploymentDashboardView',
          path: '/deployments',
        },
      },
    },
```

### Catch-all page (src/app/(payload)/admin/[[...segments]]/page.tsx):
Uses `RootPage` and `generatePageMetadata` from `@payloadcms/next/views` with `importMap`.
This is the REAL Payload page renderer — handles all admin routes including custom views.

### importMap.js entry for DeploymentDashboardView:
The importMap was auto-regenerated and includes our component.

### Files:
1. `src/components/DeploymentDashboard.tsx` — Main client component (WORKING, has normalizeProjectName)
2. `src/components/DeploymentDashboardView.tsx` — 'use client' wrapper (renders DeploymentDashboard inside a div with gutter classes)
3. `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (WORKING, no auth)
4. `src/components/SidebarNavExtras.tsx` — Has Deployments nav link under Settings
5. `src/payload.config.ts` — Has views config (lines 79-84)
6. `src/components/MiniSidebar.tsx` — z-index: 100 (was 1)
7. `src/app/(payload)/admin/importMap.js` — Regenerated, has DeploymentDashboardView
8. `src/app/(payload)/admin/deployments/page.tsx` — DELETED
9. `.env` — Has VERCEL_API_TOKEN

### Other existing custom pages (WORKING on production):
- `src/app/(payload)/admin/settings/integrations/page.tsx` — Uses DefaultTemplate
- `src/app/(payload)/admin/growth-tools/indexing-helper/page.tsx` — Uses DefaultTemplate

## APPROACHES TRIED
1. Standalone Next.js page with `DefaultTemplate` — sidebar missing (page deleted)
2. Payload views config under `admin.components.views` — sidebar STILL missing

## WHAT TO TRY NEXT

### Option A: Go back to Next.js page approach (what works for integrations)
The integrations page WORKS on production with DefaultTemplate. The sidebar issue might be LOCAL DEV ONLY (Turbopack).
1. Remove the views config from payload.config.ts (lines 79-84)
2. Recreate `src/app/(payload)/admin/deployments/page.tsx` using DefaultTemplate (copy from integrations page)
3. Delete `src/components/DeploymentDashboardView.tsx`
4. Regenerate importmap
5. Test: the sidebar might work in production even if broken in local dev

### Option B: Check if the views approach has wrong format
Payload v3 custom views might need different config. Check if `exact: true` is needed or if the path should be different.

### Option C: Check if this is purely a Turbopack dev mode issue
Maybe the sidebar works fine in production build. Try `npm run build && npm start` locally.

## KEY INFO
- Dev port: 3004
- Background dev server task: c8fe0792
- Team ID: peters-projects-589d7e29
- VERCEL_API_TOKEN in .env
- TypeScript passes clean
- The dashboard DATA works perfectly (projects, deployments, billing all load)
- ONLY the sidebar/nav is missing on local dev
- Production CMS shows sidebar fine on all pages

## BILLING FIX (COMPLETED)
- `normalizeProjectName()` in DeploymentDashboard.tsx strips deployment suffixes like `-1773384767366-IuGn`
- Applied to both mtdCostsByProject and monthlyProjectCosts derivations
- Pattern: `-\d{10,}-[A-Za-z0-9]{4}$`
