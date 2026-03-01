# Content CMS — Optimise Digital

## Purpose

Master agency platform for Optimise Digital — a single hub for managing both client growth and agency growth.

**Client performance management:** Manage and optimise client campaigns across Google Ads, Google Analytics, Meta Ads, SEO, and future platforms. Not just reporting — the platform will action optimisations directly, becoming the primary tool the team works from day-to-day.

**AI agent orchestration:** Manage expert AI agents (like OptiMate for Google Ads) that run optimisations autonomously. The CMS is where the team reviews agent recommendations, gives feedback, and approves actions — a human-in-the-loop control center.

**Client-facing delivery:** Feeds prospects and clients PIN-protected proposals, audit reports, and performance dashboards. Handles the full lifecycle from prospect → proposal → audits → client onboarding → ongoing management.

**Agency operations:** Financial tracking, content generation, time management, and business analytics to manage the growth of the agency itself alongside client growth.

Still actively expanding — core audit/proposal/content/GSC features are built, with campaign management, analytics integration, and agent orchestration coming next.

## Stack

- **Framework:** Payload CMS v3 + Next.js 16 (App Router, Turbopack)
- **Database:** SQLite via Turso (libSQL) — `push: false`, manual migrations
- **Storage:** Vercel Blob (media, screenshots)
- **Email:** Postmark (audit report emails)
- **AI:** Google Gemini (blog prompts, blog images)
- **Deploy:** Vercel (production: `optimise-website-team-cms-tool.vercel.app`)
- **Dev port:** 3001

## External Services

| Service | Env Var | Purpose |
|---------|---------|---------|
| **Growth Tools** | `GROWTH_TOOLS_URL` | SEO/CRO/keyword/competitor/content audits, cost categorization AI |
| **Scrapling** | `SCRAPLING_SERVICE_URL` | Screenshots, social links extraction, Meta Ads detection |
| **Google Search Console** | `GOOGLE_CLIENT_ID/SECRET` | OAuth-based GSC data (clicks, impressions, rankings, alerts) |
| **Google Ads** | Via Growth Tools | Google Ads audit data (requires MCC access grant from client) |
| **Google Gemini** | `GOOGLE_GENERATIVE_AI_API_KEY` | Blog prompt generation, blog cover image generation |
| **PageSpeed Insights** | `GOOGLE_PAGESPEED_API_KEY` | Screenshot fallback |
| **Postmark** | `POSTMARK_API_KEY` | Audit email delivery |
| **Vercel Blob** | `BLOB_READ_WRITE_TOKEN` | Media and screenshot storage |
| **Turso** | `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Production database |

## Project Structure

```
src/
  collections/            # 23 Payload collection configs
  globals/                # ApiCostRates (per-unit API costs)
  migrations/             # Drizzle migration files
  lib/                    # Service clients and utilities
    gsc-service.ts          # GSC OAuth + analytics queries
    gsc-monitor.ts          # Automated GSC monitoring for all clients
    scrapling-service.ts    # Scrapling service client (screenshots, social, meta ads)
    screenshots.ts          # Tiered screenshot: PageSpeed → Scrapling → fallback
    blob-upload.ts          # Vercel Blob upload utility
    activity-log.ts         # System event logging
    google-ads-email-generator.ts  # Styled HTML email from audit results
    google-ads-types.ts     # Google Ads audit TypeScript types
    proposalEditor.ts       # Proposal editing utilities
  components/             # ~46 custom admin UI components
  app/
    (payload)/admin/      # Payload admin (importMap.js lives here)
    (frontend)/
      api/                # ~38 API routes (19 route groups)
      audits/[slug]       # Public audit report (PIN-gated)
      proposals/[slug]    # Public proposal report (PIN-gated)
      reports/[slug]      # SEO/CRO report viewer
      mockup/[slug]       # Client mockup previewer
tests/                    # Vitest tests (~340 tests, <1s)
  lib/                      # Unit tests for src/lib/
  collections/              # Collection config + hook tests
  components/               # React component tests
  api/                      # API route handler tests
scripts/                  # Utility scripts (e.g. migrate-richtext)
```

## Collections (23)

**Core:** `clients`, `client-proposals`, `users`, `media`
**Audits:** `seo-audits`, `cro-audits`, `keyword-snapshots`, `competitor-analyses`, `content-researches`, `google-ads-audits`
**GSC:** `gsc-snapshots`, `gsc-daily`, `gsc-alerts`
**Content:** `blog-posts`, `blog-prompts`, `job-posts`, `internal-link-suggestions`
**Finance:** `business-costs`, `cost-categories`, `cost-rules`
**Utility:** `activity-log`, `usage-reports`, `api-key-access`

### Key Relationships

```
Client
  ├→ ClientProposal (prospect → client conversion toggle)
  │   ├→ SeoAudit, CroAudit, KeywordSnapshot, CompetitorAnalysis
  │   ├→ ContentResearches (hasMany)
  │   └→ GoogleAdsAudit
  ├→ GoogleAdsAudit (also linkable from proposal)
  ├→ GscSnapshot → GscAlert
  ├→ BlogPost
  └→ JobPost
```

## Key API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/proposals/[id]/run-audits` | POST | Trigger full audit pipeline (SEO+CRO+keywords+competitors+content) |
| `/api/google-ads-audits/[id]/run-audit` | POST | Trigger Google Ads audit |
| `/api/google-ads-audits/[id]/send-email` | POST | Send audit email via Postmark |
| `/api/google-ads-audits/[id]/regenerate-email` | POST | Regenerate email from curated findings |
| `/api/gsc/connect` | GET | Initiate GSC OAuth flow |
| `/api/gsc/cron` | GET | Scheduled GSC monitoring (CRON_SECRET) |
| `/api/blog-posts/generate-prompt` | POST | Generate blog brief via Gemini |
| `/api/blog-posts/generate-image` | POST | Generate blog cover via Gemini |
| `/api/blog-prompts` | GET/POST/PATCH/DELETE | Blog prompter CRUD + archive |
| `/api/costs/categorise` | POST | AI cost categorization |
| `/api/migrate` | POST | Manual schema migration (x-api-key: AUDIT_API_KEY) |
| `/api/audit-auth` | POST | PIN auth for public reports (rate-limited) |

## Key Workflows

**Proposal → Audit → Report:**
1. Create ClientProposal with keywords, location, competitors
2. "Run Audits" triggers SEO/CRO/keyword/competitor/content research via Growth Tools
3. Optional: add Google Ads customer ID → "Run Google Ads Audit"
4. Team curates findings in "Finding Curation" tab
5. Share PIN-protected report with prospect
6. "Convert to Client" toggle creates a Client record

**GSC Monitoring (re-application in progress — steps 1-3 of 6 done):**
1. Client connects GSC via OAuth
2. Cron creates monthly snapshots
3. Alerts generated from snapshot comparisons

## Code Quality — Zero Tolerance

After editing ANY file, run:

```bash
npx tsc --noEmit          # Type check — fix ALL errors
npm test                  # Run tests — fix ALL failures (ignore pre-existing scrapling failures)
```

Fix all errors before committing or continuing.

## Deployment Gotchas

- **New collections require manual migration:** `POST /api/migrate` with `x-api-key` header after every deploy that adds tables/columns. Missing tables blank out the entire admin.
- **`payload_locked_documents_rels`:** Must add FK columns for every new collection or record views crash.
- **importMap.js:** `payload generate:importmap` always drops `VercelBlobClientUploadHandler`. Kill dev server before editing. Re-add manually.
- **Commit everything:** `payload-types.ts`, new globals, new routes — local build passes without them but Vercel fails.
- **Stale RSC after deploy:** `NavigationRecovery` component works around missing Vercel Skew Protection.

## Testing

- **Framework:** Vitest 4 with jsdom, @testing-library/react
- **Run:** `npm test` (all), `npm run test:watch`, `npm run test:coverage`
- **Pattern:** Tests mock `payload` object and `fetch`. Collection hook tests extract hooks from config and call them with mock data.

## Conventions

- Git: stage specific files (never `git add .`), conventional commits, never push unless asked
- Prefer editing existing files over creating new ones
- New collections need: collection file, migration entry, locked_docs_rels column, importMap regeneration
- API routes → `src/app/(frontend)/api/`, one directory per resource
- Components → `src/components/`, one component per file
- Service clients → `src/lib/`, grouped by external service
- Collection configs → `src/collections/`, one file per collection
