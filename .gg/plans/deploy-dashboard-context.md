# Deploy Dashboard — Critical Context

## Existing CMS Patterns for Custom Views

### SidebarNavExtras.tsx Pattern
The CMS uses `src/components/SidebarNavExtras.tsx` to inject nav links via DOM manipulation:
```typescript
'use client'
import { useEffect } from 'react'

function injectLink(containerSelector, key, href, svgIcon, label, position = 'prepend') {
  const container = document.querySelector(containerSelector)
  if (!container || container.querySelector(`[data-injected="${key}"]`)) return
  const link = document.createElement('a')
  link.href = href
  link.className = 'nav__link sidebar-extras__link'
  link.setAttribute('data-injected', key)
  link.innerHTML = `${svgIcon}<span class="nav__link-label">${label}</span>`
  if (position === 'prepend') container.prepend(link)
  else container.appendChild(link)
}
```

**To add Deployments link:** Add another `injectLink()` call in SidebarNavExtras.tsx targeting the Settings nav group.

### Payload Config (payload.config.ts) Lines 60-100
```typescript
admin: {
  user: Users.slug,
  importMap: { baseDir: path.resolve(dirname) },
  meta: { titleSuffix: " | Optimise Digital", icons: [...] },
  components: {
    graphics: { Logo: "./components/Logo", Icon: "./components/Icon" },
    actions: ["./components/UserDisplayName"],
    beforeNavLinks: ["./components/SidebarLogo"],
    afterNavLinks: ["./components/SidebarNavExtras"],
    afterLogin: ["./components/ShowPasswordToggle"],
    providers: ["./components/ViewportMeta", "./components/RocketLoader", ...],
    beforeDashboard: ["./components/Dashboard"],
  },
},
```

### Custom Views in This CMS
Existing custom page routes (not Payload `views` config, but Next.js app router pages):
- `src/app/(payload)/admin/settings/integrations/page.tsx`
- `src/app/(payload)/admin/growth-tools/indexing-helper/page.tsx`

These are Next.js pages under the `(payload)` route group, NOT Payload's `admin.components.views`. This is the pattern to follow for the Deployments page.

### Existing Custom Admin Page Pattern
To add a new admin page at `/admin/deployments`:
1. Create `src/app/(payload)/admin/deployments/page.tsx` — Server component wrapper
2. Create `src/components/DeploymentDashboard.tsx` — Client component with the actual UI
3. Add nav link via `SidebarNavExtras.tsx` — inject link into Settings nav group
4. NO need to modify `payload.config.ts` views — just use Next.js App Router

### API Route Auth Pattern
From existing routes like `src/app/(frontend)/api/tag-setup-audits/[id]/route.ts`:
```typescript
const payloadConfig = await config;
const payload = await getPayload({ config: payloadConfig });
const { user } = await payload.auth({ headers: req.headers });
if (!user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Environment
- VERCEL_API_TOKEN needed in `.env.local` and Vercel project settings
- Dev port: 3004
- Database: SQLite via Turso
- Deploy: Vercel

## Vercel API Token
User needs to generate a Vercel API token at https://vercel.com/account/tokens
The token should have read access to projects, deployments, and usage/billing.

## Screenshot Context
Previous monthly Vercel cost was $135.50 on Pro plan (Turbo). Now downgraded to Standard plan.
User wants to monitor MTD costs per project to keep track of spending after the plan change.
