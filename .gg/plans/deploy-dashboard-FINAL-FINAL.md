# Deploy Dashboard — FINAL FINAL STATE (March 30, 2026)

## WHAT JUST HAPPENED
1. Removed views config from `src/payload.config.ts` (reverted to original)
2. Recreated `src/app/(payload)/admin/deployments/page.tsx` using DefaultTemplate (same as integrations page)
3. `src/components/DeploymentDashboardView.tsx` EXISTS but is no longer referenced — SHOULD BE DELETED
4. Need to regenerate importmap and restart dev server

## REMAINING STEPS
1. Delete `src/components/DeploymentDashboardView.tsx` (unused)
2. Stop dev server (port 3004, background task c8fe0792)
3. Run `npx payload generate:importmap` to clean up
4. Read `src/app/(payload)/admin/importMap.js` — check VercelBlobClientUploadHandler preserved
5. Run `npx tsc --noEmit`
6. Restart dev server: `npm run dev`
7. Test at http://localhost:3004/admin/deployments

## THE SIDEBAR ISSUE REALITY
- The DefaultTemplate approach IS how integrations page works — IDENTICAL code
- Production shows sidebar, local dev may not
- This is likely a Turbopack/dev mode issue, NOT a code issue
- The user should test in production (deploy to Vercel) to confirm sidebar works
- OR try `npm run build && npm start` locally to test with production build

## ALL FILES FOR THIS FEATURE
1. `src/components/DeploymentDashboard.tsx` — Main client component (WORKING)
   - Team ID: `peters-projects-589d7e29` hardcoded
   - normalizeProjectName() strips `-\d{10,}-[A-Za-z0-9]{4}$`
   - Uses `Tags.ProjectName` from Vercel billing FOCUS JSONL
   - 3 sections: Project Status table, MTD Costs table, Stacked Bar Chart
2. `src/app/(payload)/admin/deployments/page.tsx` — JUST RECREATED with DefaultTemplate
3. `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (no auth, 4 actions)
4. `src/components/SidebarNavExtras.tsx` — Has Deployments nav link under Settings
5. `src/components/MiniSidebar.tsx` — z-index: 100 (was 1)
6. `src/components/DeploymentDashboardView.tsx` — UNUSED, should be deleted
7. `.env` — Has VERCEL_API_TOKEN
8. `src/payload.config.ts` — views config REMOVED (reverted to original)

## KEY WARNINGS
- importMap.js drops VercelBlobClientUploadHandler on regeneration — check and re-add
- Kill dev server BEFORE editing importMap.js
- Dev port: 3004
- `npx tsc --noEmit` and `npm test` after all changes
