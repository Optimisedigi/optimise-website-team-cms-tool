# Deploy Dashboard — FINAL STATE (READ THIS FIRST)

## TWO FIXES REMAINING

### Fix 1: normalizeProjectName in monthly history — EXACT EDIT NEEDED
In `src/components/DeploymentDashboard.tsx` at lines 482-484, change:
```
      const name =
        charge.Tags?.ProjectName || 'Platform / Shared'
```
to:
```
      const raw = charge.Tags?.ProjectName || 'Platform / Shared'
      const name = normalizeProjectName(raw)
```
The `normalizeProjectName` function ALREADY EXISTS at line ~57:
```typescript
function normalizeProjectName(name: string): string {
  return name.replace(/-\d{10,}-[A-Za-z0-9]{4}$/, '')
}
```
The mtdCostsByProject section (line ~462) was ALREADY fixed to use normalizeProjectName.

### Fix 2: Sidebar not showing — USE PAYLOAD VIEWS CONFIG
The page at `src/app/(payload)/admin/deployments/page.tsx` uses `DefaultTemplate` but the sidebar doesn't render on local dev.

**SOLUTION:** Register the dashboard as a Payload admin custom view in `payload.config.ts`. This lets Payload handle the full admin shell (sidebar, nav, header).

In `payload.config.ts`, find the `admin` config section. Add a `views` property:
```typescript
admin: {
  // ... existing config ...
  components: {
    // ... existing components ...
    views: {
      deployments: {
        Component: './components/DeploymentDashboardView',
        path: '/deployments',
      },
    },
  },
},
```

Create `src/components/DeploymentDashboardView.tsx`:
```typescript
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

Then DELETE `src/app/(payload)/admin/deployments/page.tsx` — the Payload views config handles routing.

After adding views config, run: `npx payload generate:importmap` then manually re-add VercelBlobClientUploadHandler to importMap.js if needed.

## ALL FILES FOR THIS FEATURE
1. `src/components/DeploymentDashboard.tsx` — Main client component (project status, MTD costs, stacked bar chart). Team ID `peters-projects-589d7e29` hardcoded. normalizeProjectName function at line ~57.
2. `src/components/DeploymentDashboardView.tsx` — NEEDS TO BE CREATED. Wrapper for Payload views config.
3. `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (no auth). Actions: projects, deployments, billing, billing-history.
4. `src/app/(payload)/admin/deployments/page.tsx` — NEEDS TO BE DELETED after views config is set up.
5. `src/components/SidebarNavExtras.tsx` — Has "Deployments" injectLink() under Settings nav group.
6. `payload.config.ts` — NEEDS views config added under admin.components.
7. `src/components/MiniSidebar.tsx` — z-index changed from 1 to 100 (may not be needed after views fix).
8. `src/app/(payload)/custom.scss` — Lines 400-408: sidebar CSS.
9. `.env` — Has VERCEL_API_TOKEN.
10. `src/app/(payload)/admin/importMap.js` — Will need regeneration after views config change.

## IMPORTANT NOTES
- Dev port: 3004
- After modifying payload.config.ts views, MUST run `npx payload generate:importmap`
- importMap.js drops VercelBlobClientUploadHandler — re-add manually after generation
- Kill dev server before editing importMap.js
- `npx tsc --noEmit` and `npm test` after all changes
