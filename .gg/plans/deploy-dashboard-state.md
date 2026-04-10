# Deploy Dashboard — Implementation State (UPDATED)

## Files Created/Modified
1. `src/components/DeploymentDashboard.tsx` — Client component with 3 sections: project status table, MTD costs by project table, stacked bar chart. Team ID `peters-projects-589d7e29` hardcoded. Uses `Tags.ProjectName` from Vercel billing FOCUS JSONL data.
2. `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (NO Payload auth - page-level auth only). Supports actions: projects, deployments, billing, billing-history.
3. `src/app/(payload)/admin/deployments/page.tsx` — Server page using `DefaultTemplate` from `@payloadcms/next/templates`. IDENTICAL structure to integrations page.
4. `src/components/SidebarNavExtras.tsx` — Added "Deployments" `injectLink()` call under Settings nav group.
5. `.env` — Has `VERCEL_API_TOKEN`
6. `src/components/MiniSidebar.tsx` — z-index bumped from 1 to 100

## TWO ISSUES TO FIX NOW

### Issue 1: Sidebar not showing on deployments page
- User confirmed: production CMS shows sidebar, local dev `/admin/deployments` does NOT
- Our page at `src/app/(payload)/admin/deployments/page.tsx` is IDENTICAL to `src/app/(payload)/admin/settings/integrations/page.tsx`
- Both use `DefaultTemplate` from `@payloadcms/next/templates`
- `DefaultTemplate` renders: Wrapper (with navOpen class) > NavComponent (full sidebar) + template-default__wrap (content)
- The NavComponent IS rendered by DefaultTemplate — it's Payload's full nav
- `MiniSidebar.tsx` is a Payload provider (wraps children), renders mini strip when `navOpen===false`
- `custom.scss` lines 400-408: hides Payload's nav toggler, adds 48px margin when nav closed
- `custom.scss` line 223: `.nav { --nav-width: 240px; }`
- The issue is likely that `navOpen` state defaults to `true` (stored in cookie/localStorage), so:
  - MiniSidebar doesn't render mini strip (condition: `!navOpen`)
  - Payload's full nav should show (condition: `template-default--nav-open` class)
  - But the full nav might not be visible due to CSS issues in dev mode
- POSSIBLE FIX: This may be a pre-existing dev-mode issue on ALL custom pages, not specific to deployments
- CHECK: Does the user see the sidebar on `/admin` (dashboard) locally? Or is it only custom pages that are affected?

### Issue 2: Duplicate project names in billing
- Projects like "website-we-can-quit" appear multiple times with suffixed versions (e.g., "website-we-can-quit-abc123")
- Need to normalize/group these in the billing display
- The `Tags.ProjectName` field in Vercel billing data sometimes includes deployment-specific suffixes
- FIX: In `DeploymentDashboard.tsx`, normalize project names by stripping trailing hash/ID suffixes when grouping

## Key Patterns
- Custom admin pages: `src/app/(payload)/admin/[path]/page.tsx` using `DefaultTemplate`
- API routes: `src/app/(frontend)/api/[path]/route.ts`
- Payload config providers: `payload.config.ts` line ~77: `providers: ["./components/ViewportMeta", "./components/RocketLoader", "./components/FirstLoginSetup", "./components/NavigationRecovery", "./components/MiniSidebar", "./components/PomodoroTimer"]`
- `src/app/(payload)/custom.scss` has all sidebar styling

## Background
- Dev port: 3004
- Background dev server running (may need restart)
- TypeScript and tests pass clean
