# Deploy Dashboard — WORKING CONTEXT

## IMMEDIATE TODO
1. Fix sidebar issue on `/admin/deployments` page
2. Fix duplicate project names in billing data (e.g., "website-we-can-quit" appears with suffixed versions)

## KEY FILES (all paths from project root)
- `src/components/DeploymentDashboard.tsx` — Main client component (project status table, MTD costs table, stacked bar chart)
- `src/app/(frontend)/api/vercel/deployments/route.ts` — API route (no auth). Actions: projects, deployments, billing, billing-history
- `src/app/(payload)/admin/deployments/page.tsx` — Server page using DefaultTemplate
- `src/components/SidebarNavExtras.tsx` — Deployments nav link injected under Settings
- `src/components/MiniSidebar.tsx` — Custom mini sidebar provider (z-index: 100, was 1)
- `src/app/(payload)/custom.scss` — Lines 400-408: hides nav toggler, adds 48px margin. Line 223: --nav-width: 240px
- `payload.config.ts` — Line ~77: providers array includes MiniSidebar

## SIDEBAR ISSUE DETAILS
- `DefaultTemplate` from `@payloadcms/next/templates` renders the full Payload nav + Wrapper with navOpen class
- The Wrapper component uses `useNav()` and adds `template-default--nav-open` when navOpen=true
- When navOpen=true: full sidebar SHOULD show, MiniSidebar does NOT render mini strip
- When navOpen=false: full sidebar hidden, MiniSidebar renders mini strip, CSS adds margin-left:48px
- User has navOpen=true but full sidebar is NOT visible — content takes full width
- This happens on local dev but NOT production
- The DefaultTemplate NavComponent IS rendered (it's in the JSX) but may be hidden
- Payload's default `<nav>` element uses its own CSS with translate/transition to show/hide
- custom.scss line 222-223: `.nav { --nav-width: 240px; }` 
- Our page is byte-for-byte identical to working integrations page
- POSSIBLE: The Payload nav CSS isn't applying correctly in dev mode, or Turbopack handles CSS differently

## BILLING DUPLICATE ISSUE
- Vercel billing `Tags.ProjectName` sometimes has suffixed versions like "website-we-can-quit-abc123"
- Need to normalize by stripping trailing `-[hash]` patterns when grouping costs
- In `DeploymentDashboard.tsx`, the mtdCostsByProject and monthlyProjectCosts derivations need normalization

## CURRENT DeploymentDashboard.tsx STRUCTURE
- Uses `Tags?.ProjectName || 'Platform / Shared'` for grouping billing charges
- Team ID hardcoded: `peters-projects-589d7e29`
- Three sections: Project Status table, MTD Costs table, Monthly Cost History stacked bar chart
- All fetches use `/api/vercel/deployments?action=X&teamId=Y`
- No auth on API route (page-level auth only via DefaultTemplate server component)

## API ROUTE STRUCTURE (src/app/(frontend)/api/vercel/deployments/route.ts)
- `vercelFetch(path, teamId)` — base fetch with Bearer token
- `fetchProjects(teamId)` — GET /v9/projects?limit=100
- `fetchDeployments(teamId, projectId, limit)` — GET /v6/deployments
- `fetchBillingCharges(teamId, from, to)` — GET /v1/billing/charges (returns JSONL, parsed line-by-line)
- `fetchBillingHistory(teamId, months)` — calls fetchBillingCharges for each of last N months
- GET handler routes by `action` query param: projects, deployments, billing, billing-history

## ENV
- VERCEL_API_TOKEN in .env
- Dev port: 3004
- Background dev server may be running
