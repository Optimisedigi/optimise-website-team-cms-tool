# Deploy Dashboard — SIDEBAR FIX (March 30, 2026)

## CURRENT PROBLEM
The Payload views config approach (`admin.components.views`) did NOT fix the sidebar.
The page renders at `/admin/deployments` (200 response) but shows NO sidebar — even when window is expanded.

## WHAT WAS TRIED
1. First approach: standalone Next.js page at `src/app/(payload)/admin/deployments/page.tsx` using `DefaultTemplate` — NO sidebar
2. Second approach: Payload views config in `payload.config.ts` under `admin.components.views` — STILL NO sidebar
3. MiniSidebar z-index bumped from 1 to 100 — NO effect

## CURRENT FILE STATE
- `src/app/(payload)/admin/deployments/page.tsx` — DELETED (was using DefaultTemplate approach)
- `src/payload.config.ts` — Has views config:
  ```
  views: {
    deployments: {
      Component: './components/DeploymentDashboardView',
      path: '/deployments',
    },
  },
  ```
- `src/components/DeploymentDashboardView.tsx` — 'use client' wrapper that renders DeploymentDashboard
- `src/components/DeploymentDashboard.tsx` — Main client component (working, has normalizeProjectName)
- `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (working)
- `src/components/SidebarNavExtras.tsx` — Has Deployments nav link
- `src/components/MiniSidebar.tsx` — z-index: 100
- `src/app/(payload)/admin/importMap.js` — Has DeploymentDashboardView + VercelBlobClientUploadHandler
- `.env` — Has VERCEL_API_TOKEN

## NEXT APPROACH TO TRY
The Payload views config approach renders inside the Payload admin shell — which SHOULD include the sidebar.
If it's not showing, the issue might be:

1. The views config format might be wrong. Check Payload v3 docs for correct format.
   - Might need `exact: true` or different structure
   - Might need to be under `admin.views` not `admin.components.views`

2. Maybe the `[[...segments]]` catch-all at `src/app/(payload)/admin/[[...segments]]/page.tsx` is handling `/deployments` and using the views config properly — but the sidebar relies on client-side hydration that's broken.

3. SIMPLEST FIX: Go back to the Next.js page approach BUT recreate it properly:
   - Create `src/app/(payload)/admin/deployments/page.tsx` 
   - Use the EXACT same code as `src/app/(payload)/admin/[[...segments]]/page.tsx` catch-all
   - That catch-all uses `RootPage` and `generatePageMetadata` from `@payloadcms/next/views`
   - This is the "real" Payload page renderer that properly renders everything

4. Check what `src/app/(payload)/admin/[[...segments]]/page.tsx` actually does:
   ```typescript
   import type { Metadata } from 'next'
   import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
   import { importMap } from '../importMap.js'
   import configPromise from '@payload-config'
   
   type Args = { params: Promise<{ segments: string[] }>, searchParams: Promise<{ [key: string]: string | string[] }> }
   
   export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
     generatePageMetadata({ config: configPromise, params, searchParams })
   
   const Page = ({ params, searchParams }: Args) =>
     RootPage({ config: configPromise, importMap, params, searchParams })
   
   export default Page
   ```
   This is what renders ALL Payload admin pages. If the views config is set up, 
   the catch-all should pick up `/deployments` and render it with the full admin shell.

5. THE PROBLEM MIGHT BE: The `[[...segments]]` catch-all IS rendering the deployments view
   (because the views config is set), but our DeploymentDashboardView component is 'use client'
   and the sidebar hydration is failing in dev mode.

6. OR: The views config needs a different format. Try:
   ```
   views: {
     deployments: {
       Component: './components/DeploymentDashboardView',
       path: '/deployments',
       exact: true,
     },
   },
   ```

## KEY INFO
- Dev port: 3004
- Background dev server task: c8fe0792
- Team ID: peters-projects-589d7e29
- TypeScript passes clean
- The dashboard DATA works (projects, deployments, billing all load correctly)
- ONLY the sidebar/nav is missing

## OTHER WORKING CUSTOM PAGES (for reference)
- `src/app/(payload)/admin/settings/integrations/page.tsx` — Uses DefaultTemplate, works on PRODUCTION
- `src/app/(payload)/admin/growth-tools/indexing-helper/page.tsx` — Uses DefaultTemplate, works on PRODUCTION
- Both use IDENTICAL pattern to what we had before
- The user confirmed sidebar works on PRODUCTION but not LOCAL DEV
- This might just be a local dev / Turbopack issue that only gets fixed in production build
