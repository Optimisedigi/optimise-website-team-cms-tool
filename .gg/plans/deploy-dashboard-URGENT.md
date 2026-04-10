# URGENT — Deploy Dashboard Remaining Fixes

## STATUS: TWO FIXES NEEDED

### Fix 1: normalizeProjectName in monthly history (NOT YET DONE)
In `src/components/DeploymentDashboard.tsx`, the monthly history grouping still uses raw project names.
Find this code (around line 477):
```
const name = charge.Tags?.ProjectName || 'Platform / Shared'
costs[name] = ...
```
Change to:
```
const raw = charge.Tags?.ProjectName || 'Platform / Shared'
const name = normalizeProjectName(raw)
costs[name] = ...
```
The mtdCostsByProject section was ALREADY fixed (uses `normalizeProjectName`).

### Fix 2: Sidebar not showing on deployments page
The page at `src/app/(payload)/admin/deployments/page.tsx` uses `DefaultTemplate` — same as integrations page.
The sidebar is NOT showing on local dev. Production works fine.
The Payload nav renders client-side. The issue is that `navOpen` might be in an inconsistent state.

**APPROACH:** Look at how the `[[...segments]]` catch-all page works (`src/app/(payload)/admin/[[...segments]]/page.tsx`). It uses `generatePageMetadata` and `RootPage` from `@payloadcms/next/views`. Our custom page should use the SAME approach, OR we should register it as a Payload admin `view` in `payload.config.ts`.

**Payload custom views approach (RECOMMENDED):**
In `payload.config.ts`, under `admin.components.views`, add:
```
views: {
  deployments: {
    Component: './components/DeploymentDashboard',
    path: '/deployments',
  },
}
```
This would let Payload handle the full admin shell (sidebar, nav, etc.) and just render our component in the content area.
If this approach is used, DELETE `src/app/(payload)/admin/deployments/page.tsx`.

## FILES
1. `src/components/DeploymentDashboard.tsx` — Client component. normalizeProjectName exists but NOT used in monthly history section.
2. `src/app/(payload)/admin/deployments/page.tsx` — Server page (sidebar broken)
3. `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (working)
4. `src/components/SidebarNavExtras.tsx` — Nav link (working)
5. `src/components/MiniSidebar.tsx` — z-index changed from 1 to 100
6. `payload.config.ts` — May need views config added
7. `src/app/(payload)/custom.scss` — Sidebar CSS

## DEV
- Port: 3004
- TypeScript passes clean
- Team ID hardcoded: `peters-projects-589d7e29`
