# Deploy Dashboard — MUST READ BEFORE ANY WORK

## FILES TO MODIFY
1. `src/components/DeploymentDashboard.tsx` — Fix duplicate project names in billing
2. `src/app/(payload)/admin/deployments/page.tsx` — Fix sidebar issue

## SIDEBAR ISSUE
- Our page uses `DefaultTemplate` from `@payloadcms/next/templates` — IDENTICAL to integrations page
- Production shows sidebar, local dev does NOT
- `DefaultTemplate` renders NavComponent + content, both inside a Wrapper with navOpen class
- `MiniSidebar.tsx` is a provider (z-index: 100) that renders mini strip when navOpen=false
- When navOpen=true, Payload's full nav should show but doesn't on local dev
- `custom.scss` line 401-403: hides Payload nav toggler
- `custom.scss` line 406-408: adds margin-left:48px when nav closed
- custom.scss line 223: `.nav { --nav-width: 240px; }`
- The Payload nav CSS may not be loading in dev (Turbopack issue)

## BILLING DUPLICATE PROJECT NAMES
Actual data from Vercel billing API:
```
optimise-website-team-cms-tool: $39.92
website-optimise-digital: $14.56
seo-template-service-business: $13.58
website-we-can-quit: $6.24
impact-list: $2.94
Platform / Shared: $2.02
by-order-of-phi-40th: $0.87
website-growth-tools-1773342345471-LVCp: $0.12
website-we-can-quit-1773384767366-IuGn: $0.05
website-we-can-quit-1773384390933-TMXZ: $0.05
```
Pattern: `[project-name]-[13-digit-timestamp]-[4-char-hash]`
Need to strip trailing `-\d{13}-[A-Za-z0-9]{4}$` pattern and group into base project name.
e.g., "website-we-can-quit-1773384767366-IuGn" → "website-we-can-quit"
e.g., "website-growth-tools-1773342345471-LVCp" → "website-growth-tools"

## ENV
- VERCEL_API_TOKEN in .env
- Dev port: 3004
- Team ID hardcoded in DeploymentDashboard.tsx: `peters-projects-589d7e29`

## KEY CODE PATTERNS
- API route at `src/app/(frontend)/api/vercel/deployments/route.ts`
- Billing data uses `Tags.ProjectName` field from JSONL response
- DeploymentDashboard groups by: `charge.Tags?.ProjectName || 'Platform / Shared'`
- Both mtdCostsByProject and monthlyProjectCosts derivations need the normalization fix
- Stacked bar chart: StackedBarChart component at top of DeploymentDashboard.tsx
- Pure SVG chart, no external dependencies
