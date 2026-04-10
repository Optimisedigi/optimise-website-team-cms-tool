# Deploy Dashboard — CMS Integration Plan

## Current State of deploy-dashboard

**Location:** `/Users/Pe/my-projects/new-ideas/deploy-dashboard`

### Structure
- Cloudflare Pages + Functions (serverless API proxy)
- `public/index.html` — Dark theme, card-based grid layout, filter tabs (All/Vercel/Railway)
- `public/app.js` — Fetches from `/api/vercel/projects` + `/api/vercel/deployments/{id}` + Railway, renders cards with status badges, auto-refresh 30s, click-to-expand drawer
- `public/style.css` — Dark theme CSS, card grid, status badges, drawer, responsive
- `public/sw.js` + `manifest.json` — PWA support
- `functions/api/health.js` — Returns which tokens are configured
- `functions/api/vercel/projects.js` — Proxies `GET https://api.vercel.com/v9/projects?limit=50`
- `functions/api/vercel/deployments/[projectId].js` — Proxies `GET https://api.vercel.com/v6/deployments?projectId=X&limit=10`
- `functions/api/railway/projects.js` — GraphQL query for Railway projects
- `functions/api/railway/deployments/[projectId]/[serviceId]/[environmentId].js` — Railway deployments
- `wrangler.toml` — Cloudflare config, `.dev.vars` for local secrets

### What's Missing
1. **No cost tracking** — no Vercel usage/billing data
2. **No table view** — only card grid layout
3. **Not integrated into CMS** — standalone Cloudflare Pages app

### What User Wants
1. **Table view** (not cards) showing all projects with:
   - Project name
   - Last deployment status (simple success/failed/building badge)
   - When last deployed
   - MTD cost per project
   - Toggle: MTD / Last Month / All-time cost
2. **Embedded in CMS** as a standalone deployment tab
3. **Vercel-only focus** (user was paying $135.50/mo on Pro Turbo, now downgraded to Standard)
4. **Simple** — just see if deployed successfully, not detailed error logs

---

## Vercel Usage/Cost API Research

### Key Finding: Vercel has a billing usage API
From Vercel changelog ("Access billing usage and cost data via API"):
- Endpoint supports **1-day granularity** with max 1-year date range
- Responses streamed as **newline-delimited JSON (JSONL)**
- Also available via CLI: `vercel usage --from 2025-01-01 --to 2025-01-31`
- Shows credit-use and costs for each service
- Need to find exact REST endpoint URL (check Vercel REST API docs)

### Vercel API Endpoints Needed

1. **Projects:** `GET https://api.vercel.com/v9/projects?limit=50`
2. **Deployments:** `GET https://api.vercel.com/v6/deployments?projectId=X&limit=5&target=production`
   - `state`: BUILDING, READY, ERROR, QUEUED, CANCELED
3. **Usage/Billing:** Exact endpoint TBD — need to fetch Vercel REST API docs
   - Likely `GET https://api.vercel.com/v1/usage` or similar
   - May need teamId from `GET https://api.vercel.com/v2/teams`

### Per-Project Cost — May Not Be Available
The Vercel API may only provide account-level usage. Fallback options:
- Use deployment `buildDuration` to estimate build cost per project
- Show account-level total with note
- Track function execution time per project if available

---

## Implementation Plan

### Phase 1: API Route for Vercel Data

**New file:** `src/app/(frontend)/api/deployments/route.ts`

```typescript
// GET /api/deployments?period=mtd|last_month|all_time
// Auth: Payload user auth required
// Returns: { projects: [{id, name, framework, latestDeployment, cost}] }
```

- Proxy Vercel projects + latest deployment for each
- Include Payload auth check (`payload.auth({ headers })`)
- In-memory cache for 30s to avoid rate limits
- Pass `VERCEL_API_TOKEN` from env

### Phase 2: Usage/Cost Route

**New file:** `src/app/(frontend)/api/deployments/usage/route.ts`

- Proxy Vercel usage/billing data
- Handle JSONL streaming response
- Aggregate by project if possible, otherwise account total
- Support `period` query param: `mtd`, `last_month`, `all_time`

### Phase 3: Dashboard Component

**New file:** `src/components/DeploymentDashboard.tsx`

React component (`'use client'`):
- **Table layout** (not cards) matching Payload admin styling
- Columns: Project Name | Status | Last Deployed | Branch | Cost
- Status badges: ✅ Ready (green) | 🔨 Building (yellow) | ❌ Error (red) | ⏳ Queued (gray)
- Cost period toggle button group: **MTD** | **Last Month** | **All-time**
- Auto-refresh every 30s
- Use Payload's CSS variables (`--theme-elevation-*`, `--theme-text`, etc.)
- Loading skeleton, error states

### Phase 4: Register in Payload Admin

**Update:** `src/payload.config.ts` — Add custom admin view:
```typescript
admin: {
  components: {
    views: {
      deployments: {
        Component: '/components/DeploymentDashboard',
        path: '/deployments',
      }
    }
  }
}
```

**New file:** `src/components/DeploymentsNavLink.tsx` — Sidebar nav link

**Update:** `src/payload.config.ts` — Add `afterNavLinks`

**Regenerate:** `src/app/(payload)/admin/importMap.js` — Must manually re-add `VercelBlobClientUploadHandler` after regeneration

---

## Files to Create/Modify

### New Files
1. `src/app/(frontend)/api/deployments/route.ts` — Vercel projects + deployments proxy
2. `src/app/(frontend)/api/deployments/usage/route.ts` — Vercel usage/cost data
3. `src/components/DeploymentDashboard.tsx` — Table dashboard component
4. `src/components/DeploymentsNavLink.tsx` — Admin sidebar nav link

### Modified Files
1. `src/payload.config.ts` — Custom view + afterNavLinks
2. `src/app/(payload)/admin/importMap.js` — Regenerated
3. `.env.local` — Add `VERCEL_API_TOKEN`

---

## Task Execution Order

1. **Fetch Vercel REST API docs** for exact usage/billing endpoint URL
2. **Create `/api/deployments/route.ts`** — Projects + latest deployment with auth + caching
3. **Create `/api/deployments/usage/route.ts`** — Usage/cost data with period support
4. **Create `DeploymentDashboard.tsx`** — Table with status badges + cost toggle
5. **Create `DeploymentsNavLink.tsx`** — Sidebar link
6. **Update `payload.config.ts`** — Register view + nav link
7. **Regenerate importMap** — Kill dev, regenerate, re-add VercelBlob handler
8. **Add `VERCEL_API_TOKEN`** to `.env.local` and Vercel dashboard
9. **Test** — `npx tsc --noEmit`, `npm test`, manual admin testing
10. **Deploy** — Commit, push, run migration if needed

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Vercel Usage API may not have per-project cost | Show account-level totals + per-project build minutes |
| Rate limiting on Vercel API | In-memory cache (30s TTL), batch queries |
| importMap.js drops VercelBlob handler | Kill dev server first, manually re-add after |
| VERCEL_API_TOKEN exposure | Server-side only route, Payload auth required |
| Large number of projects | Limit to 50, sort by most recently updated |

## Verification

- [ ] Table shows all Vercel projects with correct deployment status
- [ ] Status badges accurately reflect READY/BUILDING/ERROR/QUEUED/CANCELED
- [ ] Relative time shows correctly (e.g., "2 minutes ago")
- [ ] Cost data displays for MTD period (or account total if per-project unavailable)
- [ ] Toggle switches between MTD / Last Month / All-time
- [ ] Auto-refresh works every 30s without page reload
- [ ] Dashboard accessible at `/admin/deployments`
- [ ] Nav link appears in admin sidebar
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] All tests pass (`npm test`)
- [ ] Works in production after deploy + VERCEL_API_TOKEN set
