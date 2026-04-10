# Deploy Dashboard — REMAINING STEPS (March 30, 2026)

## COMPLETED SO FAR
- ✅ normalizeProjectName applied in DeploymentDashboard.tsx (both billing sections)
- ✅ views config added to src/payload.config.ts under admin.components.views
- ✅ src/components/DeploymentDashboardView.tsx created (wrapper component)

## REMAINING STEPS TO COMPLETE
1. DELETE `src/app/(payload)/admin/deployments/page.tsx` — no longer needed (Payload views config handles routing)
2. Stop dev server (background task, port 3004)
3. Run `npx payload generate:importmap` — regenerates src/app/(payload)/admin/importMap.js
4. Read `src/app/(payload)/admin/importMap.js` — check if VercelBlobClientUploadHandler was dropped
5. If VercelBlobClientUploadHandler is missing from importMap.js, re-add it manually
6. Run `npx tsc --noEmit` — verify no type errors
7. Run `npm test` — verify tests pass
8. Restart dev server: `npm run dev`
9. Verify at http://localhost:3004/admin/deployments — sidebar should now show

## IMPORTANT
- The VercelBlobClientUploadHandler line in importMap.js looks like:
  `"@payloadcms/storage-vercel-blob/client#VercelBlobClientUploadHandler": ...`
- It gets dropped every time importMap is regenerated
- Must read the CURRENT importMap.js BEFORE regeneration to know what the line looks like
- Dev port: 3004
- Team ID hardcoded in DeploymentDashboard.tsx: peters-projects-589d7e29

## ALL FILES FOR THIS FEATURE
1. src/components/DeploymentDashboard.tsx — Main client component ✅
2. src/components/DeploymentDashboardView.tsx — View wrapper ✅ (just created)
3. src/app/(frontend)/api/vercel/deployments/route.ts — API route ✅
4. src/components/SidebarNavExtras.tsx — Nav link ✅
5. src/payload.config.ts — views config added ✅
6. src/app/(payload)/admin/deployments/page.tsx — NEEDS DELETION ❌
7. src/app/(payload)/admin/importMap.js — NEEDS REGENERATION ❌
8. src/components/MiniSidebar.tsx — z-index changed to 100 ✅
