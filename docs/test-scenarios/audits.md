# Test Scenarios — SEO/CRO/Keyword/Competitor/Content Audits (`AUD`)

Standalone scenarios keyed to FEAT-IDs `AUD-001`…`AUD-047` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads customer id `6591013898`), proposal
`zz-test-proposal` (PIN `5836`).

> **GSC note:** the test client's GSC/GA4 tokens are **disconnected** in dev. Any
> scenario that touches GSC and returns a "not connected" / missing-token response is
> classified **DEV-CONFIG**, not a bug.
>
> **Growth Tools note:** `GROWTH_TOOLS_URL` is **live prod**. Failures that are not
> key/config problems → PROD-BUG.
>
> **Scrapling note:** `SCRAPLING_SERVICE_URL` is wired but known-flaky. Intermittent
> failures → UNKNOWN unless deterministic.

---

## AUD-001 — SeoAudits collection · CMS-WRITE

### AUD-001-happy — Create an SEO audit record manually
- **Entry point:** `POST /api/seo-audits` (Payload REST, admin session) or
  `/admin/collections/seo-audits/create` in a browser.
- **Inputs:** `client: <zz-test-client id>`, `reportSlug: "zz-seo-audit-test"`,
  `score: 72`, `status: "completed"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-audits", { method: "POST", body: { client: <id>, reportSlug: "zz-seo-audit-test", score: 72, status: "completed" } })`.
  3. Assert 201/200 with a created `id`.
  4. `GET /api/seo-audits/<id>` and confirm `score: 72` and `reportSlug` match.
  5. Append `{ collection: "seo-audits", id, op: "delete", timestamp }` to teardown manifest.
- **Expected:** Record created; `reportSlug` unique; record retrievable by id.
- **Env/service deps:** Payload admin session (`TEST_ADMIN_PASSWORD`); local test DB. No external services for a manual create.
- **Triage:** 400 on slug collision → PROD-BUG (slug uniqueness expected). Any 500 with session → PROD-BUG.

### AUD-001-edge — Duplicate reportSlug rejected
- **Entry point:** `POST /api/seo-audits`.
- **Inputs:** `reportSlug: "zz-seo-audit-test"` (already created in the happy path above, or the fixture slug if one exists).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-audits", { method: "POST", body: { reportSlug: "zz-seo-audit-test" } })`.
  3. Assert response is 400/409 (validation error); confirm no second record created by listing with that slug.
- **Expected:** Validation rejects the duplicate slug; exactly one record with that slug exists.
- **Env/service deps:** admin session; local DB.
- **Triage:** If duplicate silently created → PROD-BUG.

---

## AUD-002 — CroAudits collection · CMS-WRITE

### AUD-002-happy — Create a CRO audit record manually
- **Entry point:** `POST /api/cro-audits` (admin session).
- **Inputs:** `client: <zz-test-client id>`, `reportSlug: "zz-cro-audit-test"`,
  `overallScore: 65`, `status: "completed"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/cro-audits", { method: "POST", body: { client: <id>, reportSlug: "zz-cro-audit-test", overallScore: 65, status: "completed" } })`.
  3. Assert 201/200 with a created `id`.
  4. `GET /api/cro-audits/<id>` and confirm fields match.
  5. Log id to teardown manifest.
- **Expected:** Record created with unique `reportSlug`; `overallScore` persisted.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with session → PROD-BUG.

---

## AUD-003 — KeywordSnapshots collection · CMS-WRITE

### AUD-003-happy — Create a keyword snapshot record
- **Entry point:** `POST /api/keyword-snapshots` (admin session).
- **Inputs:** `website: "https://example.com"`, `label: "zz-kw-test"`,
  `totalKeywords: 120`, linked to `zz-test-client`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/keyword-snapshots", { method: "POST", body: { website: "https://example.com", label: "zz-kw-test", totalKeywords: 120, client: <id> } })`.
  3. Assert 201/200; confirm `totalKeywords: 120` on the returned record.
  4. Log id to teardown manifest.
- **Expected:** Record created; `totalKeywords` and `website` persisted.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with session → PROD-BUG.

---

## AUD-004 — CompetitorAnalyses collection · CMS-WRITE

### AUD-004-happy — Create a competitor analysis record
- **Entry point:** `POST /api/competitor-analyses` (admin session).
- **Inputs:** `proposal: <zz-test-proposal id>`, `competitors: [{ domain: "competitor-a.com", organicTraffic: 5000 }]`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/competitor-analyses", { method: "POST", body: { proposal: <id>, competitors: [{ domain: "competitor-a.com", organicTraffic: 5000 }] } })`.
  3. Assert 201/200 with created id.
  4. `GET /api/competitor-analyses/<id>` — confirm `competitors[0].domain === "competitor-a.com"`.
  5. Log id to teardown manifest.
- **Expected:** Record created; competitor array persisted.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with session → PROD-BUG.

---

## AUD-005 — ContentResearches collection · CMS-WRITE

### AUD-005-happy — Create a content research record
- **Entry point:** `POST /api/content-researches` (admin session).
- **Inputs:** `keyword: "plumber sydney"`, `location: "au"`, `totalQuestions: 42`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/content-researches", { method: "POST", body: { keyword: "plumber sydney", location: "au", totalQuestions: 42 } })`.
  3. Assert 201/200; confirm `keyword` and `totalQuestions` on the returned body.
  4. Log id to teardown manifest.
- **Expected:** Record created; `keyword`, `location`, `totalQuestions` persisted.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with session → PROD-BUG.

---

## AUD-006 — SeoAuditProposals collection · CMS-WRITE

### AUD-006-happy — Create an SEO audit proposal record
- **Entry point:** `POST /api/seo-audit-proposals` (admin session).
- **Inputs:** `client: <zz-test-client id>`, `status: "pending"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-audit-proposals", { method: "POST", body: { client: <id>, status: "pending" } })`.
  3. Assert 201/200; note returned `id`.
  4. `GET /api/seo-audit-proposals/<id>` — confirm `status: "pending"`.
  5. Log id to teardown manifest.
- **Expected:** Record created with `status: "pending"`; GSC is not required for a manual record create.
- **Env/service deps:** admin session; local DB. (Growth Tools + GSC required only when running the audit engine, not for the record create.)
- **Triage:** 500 with session → PROD-BUG.

---

## AUD-007 — SiteHealthReports collection · CMS-WRITE

### AUD-007-happy — Create a site health report record
- **Entry point:** `POST /api/site-health-reports` (admin session).
- **Inputs:** `client: <zz-test-client id>`, `siteUrl: "https://example.com"`, `status: "pending"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/site-health-reports", { method: "POST", body: { client: <id>, siteUrl: "https://example.com", status: "pending" } })`.
  3. Assert 201/200; note `id`.
  4. Log id to teardown manifest.
- **Expected:** Record created with `siteUrl` and `status: "pending"` persisted.
- **Env/service deps:** admin session; local DB. (Growth Tools + GSC required for running, not creating.)
- **Triage:** 500 with session → PROD-BUG.

---

## AUD-008 — KeywordDeepDiveSessions collection · CMS-WRITE

### AUD-008-happy — Create a keyword deep-dive session record
- **Entry point:** `POST /api/keyword-deep-dive-sessions` (admin session).
- **Inputs:** `keywords: ["roofing sydney", "roof repair cost"]`, `status: "pending"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/keyword-deep-dive-sessions", { method: "POST", body: { keywords: ["roofing sydney", "roof repair cost"], status: "pending" } })`.
  3. Assert 201/200; confirm `keywords` array and `status: "pending"` on the returned record.
  4. Log id to teardown manifest.
- **Expected:** Record created; `keywords` array and initial `status` persisted.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with session → PROD-BUG.

### AUD-008-edge — Apply-to-NKL without a target NKL id
- **Entry point:** `POST /api/keyword-deep-dive-sessions/<id>/apply-to-nkl` (see also AUD-042).
- **Inputs:** body omits `nklId`.
- **Steps:**
  1. Create a session record as above.
  2. `authedFetch("/api/keyword-deep-dive-sessions/<id>/apply-to-nkl", { method: "POST", body: { keywords: ["roofing sydney"] } })`.
  3. Assert 400/422 with a clear "missing nklId" message; session status remains `"pending"`.
- **Expected:** Validation error; no partial write to any NKL.
- **Triage:** Crash or silent partial apply → PROD-BUG.

---

## AUD-009 — TagSetupAudits collection · CMS-WRITE

### AUD-009-happy — Create a tag setup audit record and inspect stored schema
- **Entry point:** `POST /api/tag-setup-audits` (admin session).
- **Inputs:** `client: <zz-test-client id>`, `url: "https://example.com"`, `status: "pending"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/tag-setup-audits", { method: "POST", body: { client: <id>, url: "https://example.com", status: "pending" } })`.
  3. Assert 201/200; confirm `url` and `status: "pending"` on response.
  4. Log id to teardown manifest.
- **Expected:** Record created; schema fields (`status`, `url`, `issues`) present.
- **Env/service deps:** admin session; local DB. (Scrapling required only for the live audit trigger via AUD-044.)
- **Triage:** 500 with session → PROD-BUG. Scrapling not needed here.

---

## AUD-010 — SeoMigrationChecks collection · CMS-WRITE

### AUD-010-happy — Create a post-migration SEO review record
- **Entry point:** `POST /api/seo-migration-checks` (admin session).
- **Inputs:** `client: <zz-test-client id>`, `cutoverDate: "2025-01-15"`, `status: "pending"`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-migration-checks", { method: "POST", body: { client: <id>, cutoverDate: "2025-01-15", status: "pending" } })`.
  3. Assert 201/200; confirm fields on response.
  4. Log id to teardown manifest.
- **Expected:** Record created with `cutoverDate` and `status: "pending"` stored.
- **Env/service deps:** admin session; local DB. (GSC needed for the live review run, not for record create.)
- **Triage:** 500 with session → PROD-BUG.

---

## AUD-011 — RunAuditsButton · EXTERNAL-SAFE

### AUD-011-happy — Trigger proposal audit pipeline and poll to completion
- **Entry point:** `POST /api/proposals/<zz-test-proposal id>/run-audits` (admin session);
  component: `src/components/RunAuditsButton.tsx`.
- **Inputs:** `{ proposalId: <zz-test-proposal id> }` (body may be empty; id is in path).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/proposals/<id>/run-audits", { method: "POST" })`.
  3. Assert 200 (pipeline accepted); note returned `runId` or status field.
  4. Poll `GET /api/proposals/<id>/audit-status` every 3 s.
  5. Assert `status` progresses through stages and eventually reaches `"completed"` (or a Growth Tools error is surfaced with a non-500 payload).
- **Expected:** Pipeline accepted; status polling returns incremental stage labels and percent; Growth Tools calls succeed (live prod). Any Growth Tools failure surfaces as a `status: "failed"` with `error` field, not an unhandled 500.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`, live prod); **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`).
- **Triage:** Growth Tools 5xx → UNKNOWN (live service issue). Unhandled platform 500 → PROD-BUG. Blob write failure → PROD-BUG (token is wired).

### AUD-011-edge — Audit pipeline status for a proposal with no prior run
- **Entry point:** `GET /api/proposals/<zz-test-proposal id>/audit-status`.
- **Steps:**
  1. `loginAdmin()` (no run triggered first).
  2. `authedFetch("/api/proposals/<id>/audit-status")`.
  3. Assert 200 with `{ status: "idle" }` or equivalent "no run" state; assert no 500.
- **Expected:** Graceful idle/not-started response; no crash.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG.

---

## AUD-012 — RunSeoProposalButton · EXTERNAL-SAFE

### AUD-012-happy — Create-and-run SEO proposal then poll status
- **Entry point:** `POST /api/seo-audit-proposals/create-and-run` then
  `POST /api/seo-audit-proposals/<id>/run`; component: `src/components/RunSeoProposalButton.tsx`.
- **Inputs:** `{ clientId: <zz-test-client id> }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-audit-proposals/create-and-run", { method: "POST", body: { clientId: <id> } })`.
  3. Assert 200; extract returned `id`.
  4. `authedFetch("/api/seo-audit-proposals/<id>/run", { method: "POST" })`.
  5. Poll `GET /api/seo-audit-proposals/<id>/status` every 3 s.
  6. Assert status progresses (stage label, percent); eventual terminal state is `"completed"` or `"failed"` with an error message (not an unhandled 500).
  7. Log created record id to teardown manifest.
- **Expected:** Record created or resolved; run triggered; status polling works; Growth Tools call succeeds. GSC "not connected" for the test client is acceptable (AUD-035 may handle gracefully).
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`); **GSC** (per-client OAuth token — disconnected for test client → expected DEV-CONFIG on GSC sub-calls).
- **Triage:** "not connected" GSC errors → DEV-CONFIG. Growth Tools 5xx → UNKNOWN. Platform 500 → PROD-BUG.

---

## AUD-013 — RunSiteHealthButton · EXTERNAL-SAFE

### AUD-013-happy — Trigger site health audit and poll status
- **Entry point:** `POST /api/site-health-reports/<id>/run` then poll
  `GET /api/site-health-reports/<id>/audit-status`; component: `src/components/RunSiteHealthButton.tsx`.
- **Inputs:** Use the record created in AUD-007-happy (or create a new one for
  `zz-test-client`, `siteUrl: "https://example.com"`).
- **Steps:**
  1. `loginAdmin()`.
  2. Ensure a SiteHealthReport record exists; note its `id`.
  3. `authedFetch("/api/site-health-reports/<id>/run", { method: "POST" })`.
  4. Assert 200 (trigger accepted).
  5. Poll `GET /api/site-health-reports/<id>/audit-status` every 3 s.
  6. Assert response contains `{ status, stage, percent }`; terminal state is `"completed"` or surfaced `"failed"` (not a bare 500).
- **Expected:** Run accepted; polling works; Growth Tools returns crawl data and it is persisted to the record.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`, live); **GSC** (disconnected for test client — DEV-CONFIG if GSC sub-call fails).
- **Triage:** GSC sub-call failure → DEV-CONFIG. Growth Tools 5xx → UNKNOWN. Unhandled 500 → PROD-BUG.

---

## AUD-014 — SeoHubPage · READ

### AUD-014-happy — SEO hub renders with client list
- **Entry point:** `/admin/growth-tools/seo` (browser, admin session); backed by
  `GET /api/clients/seo-list`; component: `src/components/SeoHubPage.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Navigate to `http://localhost:3004/admin/growth-tools/seo`.
  3. Assert the page renders without crash.
  4. Assert `zz-test-client` appears in the list.
  5. Assert its GSC connection status is shown as **disconnected** (expected for test client).
  6. Assert search filter by name reduces the visible list.
- **Expected:** Hub renders; test client present; GSC disconnected state shown (not an error); filter works.
- **Env/service deps:** admin session; local DB. `GET /api/clients/seo-list` needs no external deps.
- **Triage:** Render crash → PROD-BUG. Missing test client → PROD-BUG. "Disconnected" GSC state → DEV-CONFIG (expected).

---

## AUD-015 — SeoClientWorkspace · READ

### AUD-015-happy — Workspace renders all tabs for the test client
- **Entry point:** `/admin/growth-tools/seo/zz-test-client` (browser, admin session);
  component: `src/components/SeoClientWorkspace.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Navigate to `http://localhost:3004/admin/growth-tools/seo/zz-test-client`.
  3. Assert the workspace renders; each tab (Audits, Migration, Internal Links, Quarterly, Health, GSC) is clickable.
  4. Click each tab and assert no render crash.
  5. Assert GSC tab shows "not connected" (expected for test client).
- **Expected:** Workspace loads; all tabs render without crash; GSC tab gracefully shows disconnected state.
- **Env/service deps:** admin session; local DB.
- **Triage:** Render crash on any tab → PROD-BUG. GSC "not connected" on GSC tab → DEV-CONFIG.

---

## AUD-016 — ClientSeoTab · EXTERNAL-SAFE

### AUD-016-happy — SEO tab renders on client record
- **Entry point:** `/admin/collections/clients/<zz-test-client id>` → SEO tab (browser);
  component: `src/components/ClientSeoTab.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Navigate to the test client's admin edit page → SEO tab.
  3. Assert the tab renders without crash; "Run Migration Review" button is visible.
  4. Assert that past migration reviews (if any) are listed.
- **Expected:** Tab renders; runner UI is present; GSC-gated fields gracefully handle disconnected state.
- **Env/service deps:** admin session; **GSC** (disconnected for test client).
- **Triage:** Render crash → PROD-BUG. GSC-related "not connected" indication → DEV-CONFIG.

### AUD-016-edge — Run migration check with disconnected GSC
- **Entry point:** `POST /api/gsc/migration-check` (see also AUD-047).
- **Inputs:** `{ clientId: <zz-test-client id>, cutoverDate: "2025-01-15", isDomainMove: false }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/migration-check", { method: "POST", body: { clientId: <id>, cutoverDate: "2025-01-15", isDomainMove: false } })`.
  3. Assert the response is a structured error (e.g. 400/422 or `{ error: "GSC not connected" }`), **not** a bare 500.
- **Expected:** Graceful "not connected" error; no unhandled crash.
- **Env/service deps:** admin session; **GSC** (OAuth token absent for test client).
- **Triage:** Structured "not connected" → DEV-CONFIG (expected). Unhandled 500 → PROD-BUG.

---

## AUD-017 — ClientSeoProposalActions · READ

### AUD-017-happy — Latest SEO audit proposal loads and shows actions
- **Entry point:** Client or Client Proposal admin record → SEO Audit Proposal tab;
  backed by `GET /api/seo-audit-proposals/latest?clientId=<id>`;
  component: `src/components/ClientSeoProposalActions.tsx`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-audit-proposals/latest?clientId=<zz-test-client id>")`.
  3. Assert 200; if `found: true`, confirm `id`, `status`, `reportSlug` are present.
  4. If `found: false` (no run yet), assert `{ found: false }` — no crash.
  5. In browser: navigate to client admin → SEO Audit Proposal tab; assert View/Copy buttons render (or a "no run" placeholder).
- **Expected:** Either a completed run is shown with View + Copy buttons, or a graceful "no audit yet" state. No crash.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 on the API → PROD-BUG. Missing UI action buttons when a completed record exists → PROD-BUG.

---

## AUD-018 — CopySeoProposalEmailButton · READ

### AUD-018-happy — Copy SEO proposal email to clipboard (HTML)
- **Entry point:** SEO Audit Proposal record or Client SEO Audit Proposal tab →
  "Copy Email" button → choose HTML; component: `src/components/CopySeoProposalEmailButton.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Open a completed `seo-audit-proposals` record (or use the latest from AUD-017; create a completed stub if none exists).
  3. Click "Copy Email" → select "HTML".
  4. Assert the button triggers a clipboard write (toast/confirmation message renders).
  5. Paste into a text editor and assert the content is valid HTML containing the proposal domain or client name.
- **Expected:** Button copies HTML email to clipboard; no external send is triggered.
- **Env/service deps:** admin session; local DB. No external services (email is NOT sent).
- **Triage:** Button crash → PROD-BUG. Content empty → PROD-BUG.

---

## AUD-019 — SeoMigrationCheckView · READ

### AUD-019-happy — Migration check results render from stored JSON
- **Entry point:** Completed `SeoMigrationChecks` admin record → Results section;
  component: `src/components/SeoMigrationCheckView.tsx`.
- **Steps:**
  1. `loginAdmin()`.
  2. If a completed migration check exists: open it in admin and assert the Results section renders (phase scores, checklist items, before/after GSC metrics).
  3. If none exists: create a stub `seo-migration-checks` record with a synthetic `results` JSON blob (phase scores + checklist); open in admin and assert the renderer parses and displays it without crash.
- **Expected:** Phase scorecard, checklist pass/warn/fail items, and action plan render correctly from stored JSON.
- **Env/service deps:** admin session; local DB.
- **Triage:** Render crash → PROD-BUG.

---

## AUD-020 — SeoMigrationCheckResults · READ

### AUD-020-happy — Results Payload UI field renders on a migration check record
- **Entry point:** `/admin/collections/seo-migration-checks/<id>` (browser, admin session);
  component: `src/components/SeoMigrationCheckResults.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Open a completed (or synthetically seeded) `seo-migration-checks` record.
  3. Assert the "Results" custom field renders — not an empty box — and delegates to `SeoMigrationCheckView`.
  4. Assert no JS console error thrown by the field component.
- **Expected:** UI field reads the JSON columns and renders the view component inline.
- **Env/service deps:** admin session; local DB.
- **Triage:** Render crash or blank field with data present → PROD-BUG.

---

## AUD-021 — SiteHealthReportView · READ

### AUD-021-happy — Site health report view renders from stored data
- **Entry point:** `/admin/collections/site-health-reports/<id>` (browser, admin);
  component: `src/components/SiteHealthReportView.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Open a completed `site-health-reports` record (or seed one with synthetic `issues`, `pages`, `summary` JSON).
  3. Assert the view renders: health score, issue breakdown by severity/category, page inventory table, crawl stats.
  4. Assert no crash when `issues` array is empty (zero-issue case).
- **Expected:** Full report renders; health score and issue counts displayed; page inventory table shows rows or a graceful "no pages" state.
- **Env/service deps:** admin session; local DB.
- **Triage:** Render crash → PROD-BUG.

---

## AUD-022 — KeywordSunburst · READ

### AUD-022-happy — Sunburst chart renders in a public audit/proposal report
- **Entry point:** `/audits/<reportSlug>` or `/proposals/zz-test-proposal` (public or admin session);
  component: `src/components/KeywordSunburst.tsx`.
- **Steps:**
  1. Navigate to `http://localhost:3004/audits/<reportSlug>` (or the proposal page) that has a `KeywordSnapshot` with cluster data attached.
  2. Enter the correct PIN if prompted.
  3. Assert the sunburst SVG/canvas element renders without crash.
  4. Assert cluster labels (What, How, Who, etc.) appear around the chart.
  5. Hover a segment; assert a tooltip or detail panel shows the keyword + search volume.
- **Expected:** Sunburst renders from `KeywordSnapshot` cluster data; interactive; no crash.
- **Env/service deps:** None (rendered from stored CMS data). Public route — no admin session required.
- **Triage:** Render crash → PROD-BUG. Missing cluster data for test fixtures → DEV-CONFIG (seed needed).

---

## AUD-023 — KeywordCategoryExcluder · CMS-WRITE

### AUD-023-happy — Hide a keyword category from the proposal report
- **Entry point:** `/admin/collections/client-proposals/<zz-test-proposal id>` →
  Hidden Keyword Categories field; component: `src/components/KeywordCategoryExcluder.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Open the `zz-test-proposal` admin record.
  3. Locate the "Hidden Keyword Categories" field; assert the available categories are listed (populated from `keywordCategories`).
  4. Toggle one category checkbox to hidden; save the record.
  5. Reload the record; assert the toggled category is still marked hidden.
  6. Revert (un-hide) the category; save; log to teardown manifest.
- **Expected:** Checkbox state persists to `hiddenKeywordCategories` on the proposal; reflected on reload.
- **Env/service deps:** admin session; local DB.
- **Triage:** Toggle state not persisted → PROD-BUG.

### AUD-023-edge — Excluder renders gracefully when keywordCategories is empty
- **Entry point:** Same component on a proposal with no `keywordCategories`.
- **Steps:**
  1. Open a proposal with an empty `keywordCategories` array.
  2. Assert the `KeywordCategoryExcluder` renders a "no categories" placeholder — no crash.
- **Expected:** Graceful empty state.
- **Triage:** Crash on empty array → PROD-BUG.

---

## AUD-024 — CompetitorExcluder · CMS-WRITE

### AUD-024-happy — Exclude a competitor domain from the proposal report
- **Entry point:** `/admin/collections/client-proposals/<zz-test-proposal id>` →
  Excluded Competitor Domains field; component: `src/components/CompetitorExcluder.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Open `zz-test-proposal`; navigate to the Excluded Competitor Domains section.
  3. Assert competitor domains (from linked `CompetitorAnalyses`) are listed as checkboxes.
  4. Uncheck `competitor-a.com`; save.
  5. Reload; assert `competitor-a.com` is in `excludedCompetitorDomains`.
  6. Revert (re-check); save; log to teardown manifest.
- **Expected:** Exclusion persists; domain no longer appears in the public-facing proposal after exclusion.
- **Env/service deps:** admin session; local DB.
- **Triage:** Exclusion not persisted → PROD-BUG.

---

## AUD-025 — ClientTopicMap · READ

### AUD-025-happy — Topic map renders blog clusters for the test client
- **Entry point:** `/admin/collections/clients/<zz-test-client id>` → Content tab → Topic Map;
  backed by `GET /api/blog-posts/topic-map`; component: `src/components/ClientTopicMap.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Navigate to the test client's admin record → Content tab → Topic Map.
  3. Assert the component renders without crash.
  4. Assert cluster cards display with status colour coding.
  5. If no blog posts exist for the test client: assert a graceful "no posts" state (not a crash).
- **Expected:** Topic map renders; blog posts grouped by topic cluster; empty state handled gracefully.
- **Env/service deps:** admin session; local DB (`GET /api/blog-posts/topic-map` — local only).
- **Triage:** Render crash → PROD-BUG. Empty state crash → PROD-BUG.

---

## AUD-026 — GoogleAdsKeywordDeepDiveSessions · CMS-WRITE

### AUD-026-happy — View deep-dive sessions on an Ads audit and trigger apply flow
- **Entry point:** Google Ads Audit admin record → Negative Keyword Submits tab;
  component: `src/components/GoogleAdsKeywordDeepDiveSessions.tsx`.
- **Steps:**
  1. `loginAdmin()` in browser.
  2. Open a `google-ads-audits` record linked to `zz-test-client`.
  3. Navigate to the Negative Keyword Submits tab.
  4. Assert the tab renders; existing `KeywordDeepDiveSession` rows (if any) are listed with keyword count and status.
  5. If a session row exists: click it to expand; assert the keyword list and "Apply to NKL" action button are visible.
  6. Do **not** click Apply (that is covered by AUD-042).
- **Expected:** Tab renders; sessions listed; expand action works; Apply button visible but not pressed in this scenario.
- **Env/service deps:** admin session; local DB.
- **Triage:** Tab crash → PROD-BUG. Missing sessions when records exist → PROD-BUG.

---

## AUD-027 — DownloadMarkdownButton · READ

### AUD-027-happy — Download markdown export of an SEO audit
- **Entry point:** SEO Audit Scores admin record → Download Markdown button;
  backed by `GET /api/audit-markdown?id=<auditId>`;
  component: `src/components/DownloadMarkdownButton.tsx`.
- **Steps:**
  1. `loginAdmin()`.
  2. Ensure a completed `seo-audits` record exists (use or adapt the one from AUD-001-happy).
  3. First authenticate the PIN: `POST /api/audit-auth` with `{ slug: "zz-seo-audit-test", password: "4729" }` — assert `{ ok: true }` (PIN set on audit matches client PIN; adjust if audit has its own PIN).
  4. `authedFetch("/api/audit-markdown?id=<auditId>")` with the PIN cookie set.
  5. Assert 200; `Content-Type: text/markdown` or `application/octet-stream`; body contains markdown headings and score data.
- **Expected:** `.md` file downloaded; content is valid markdown with audit findings.
- **Env/service deps:** admin session; PIN auth cookie; local DB.
- **Triage:** 401 without valid PIN → expected. 500 with valid PIN + session → PROD-BUG.

---

## AUD-028 — AuditPasswordGate · READ

### AUD-028-happy — Unlock a PIN-gated audit page with correct PIN
- **Entry point:** `/audits/<reportSlug>` (public, no session);
  component: `src/components/AuditPasswordGate.tsx`; auth API: `/api/audit-auth`.
- **Inputs:** `reportSlug` of a PIN-gated audit; PIN `4729` (test client PIN).
- **Steps:**
  1. Navigate to `http://localhost:3004/audits/<reportSlug>` (unauthenticated browser tab).
  2. Assert the PIN-gate overlay renders; report content is not visible.
  3. Enter PIN `4729`; submit.
  4. Assert `POST /api/audit-auth { slug, password: "4729" }` returns `{ ok: true }`.
  5. Assert gate lifts; audit report content renders.
- **Expected:** Gate enforces PIN; correct PIN unlocks in one attempt; report visible after unlock.
- **Env/service deps:** None — PIN auth is local DB only.
- **Triage:** Correct PIN rejected → PROD-BUG (security). Gate not rendering → PROD-BUG.

### AUD-028-edge — Wrong PIN keeps gate locked and rate-limits on repeated failure
- **Inputs:** PIN `0000` (wrong).
- **Steps:**
  1. Navigate to the PIN-gated audit page.
  2. Enter `0000`; submit.
  3. Assert `POST /api/audit-auth` returns `{ ok: false }` / 401; gate stays up; content hidden.
  4. Repeat 5 more times; assert a 429 rate-limit response after threshold.
- **Expected:** Wrong PIN always fails; rate-limiting kicks in; no audit content exposed.
- **Triage:** Wrong PIN unlocks → PROD-BUG (security). No rate-limiting → PROD-BUG.

---

## AUD-029 — CheckTagSetupButton · EXTERNAL-SAFE

### AUD-029-happy — Trigger a tag setup audit and poll for result
- **Entry point:** `POST /api/clients/<zz-test-client id>/check-tag-setup` then poll
  `GET /api/tag-setup-audits/<auditId>`; component: `src/components/CheckTagSetupButton.tsx`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/clients/<id>/check-tag-setup", { method: "POST" })`.
  3. Assert 200; extract `auditId` from response.
  4. Poll `GET /api/tag-setup-audits/<auditId>` every 3 s.
  5. Assert each poll returns `{ status, summary, issues }` — no 500.
  6. Terminal state: `status: "completed"` or `"failed"` with a structured `error` (Scrapling may be flaky).
  7. If completed: assert `issues` array is present (may be empty if no issues found).
  8. Log `auditId` to teardown manifest.
- **Expected:** Audit record created immediately; background task populates it; Scrapling result stored. Flaky Scrapling → structured failure, not a bare 500.
- **Env/service deps:** admin session; **Scrapling** (`SCRAPLING_SERVICE_URL`, wired but flaky).
- **Triage:** Scrapling timeout/flake → UNKNOWN (retry before classifying). Platform 500 → PROD-BUG.

---

## AUD-030 — Public SEO/CRO audit viewer · READ

### AUD-030-happy — View public audit page with correct PIN
- **Entry point:** `/audits/<reportSlug>` (public, no session);
  component: `src/app/(frontend)/audits/[slug]/page.tsx`.
- **Inputs:** A `seo-audits` record with `reportSlug: "zz-seo-audit-test"` (from AUD-001).
- **Steps:**
  1. Navigate to `http://localhost:3004/audits/zz-seo-audit-test` (unauthenticated).
  2. If PIN-gated: enter `4729`; assert gate lifts.
  3. Assert SEO score, CRO score (if present), findings sections, and keyword sunburst all render.
  4. Assert competitor data section renders (or graceful "no competitors" if none linked).
  5. Assert no JS errors on the page.
- **Expected:** Full public report renders from stored CMS data; scores and findings visible.
- **Env/service deps:** None at render time (data stored in local DB); PIN auth local.
- **Triage:** Render crash → PROD-BUG. 404 for a known slug → PROD-BUG.

### AUD-030-edge — Unknown slug returns 404
- **Entry point:** `/audits/zz-nonexistent-slug` (public).
- **Steps:**
  1. Navigate to `http://localhost:3004/audits/zz-nonexistent-slug`.
  2. Assert the page returns 404 (Next.js `notFound()`) — not a 500.
- **Expected:** Graceful 404; no crash.
- **Triage:** 500 for unknown slug → PROD-BUG.

---

## AUD-031 — Public reports viewer · READ

### AUD-031-happy — View open-access report page
- **Entry point:** `/reports/<reportSlug>` (public, no auth required);
  component: `src/app/(frontend)/reports/[slug]/page.tsx`.
- **Inputs:** A `seo-audits` record with known slug.
- **Steps:**
  1. Navigate to `http://localhost:3004/reports/zz-seo-audit-test` (no PIN, no session).
  2. Assert page renders without auth gate.
  3. Assert SEO/CRO scores, findings, and recommendations sections are present.
  4. Assert no JS errors.
- **Expected:** Report renders without PIN gate; all sections visible.
- **Env/service deps:** None (stored data).
- **Triage:** Render crash → PROD-BUG. Unexpected PIN gate on this route → PROD-BUG.

### AUD-031-edge — Unknown slug returns 404
- **Entry point:** `/reports/zz-no-such-report`.
- **Steps:**
  1. Navigate to the URL; assert 404, not 500.
- **Expected:** Graceful 404.
- **Triage:** 500 → PROD-BUG.

---

## AUD-032 — SEO Audit Proposal report (v1) · READ

### AUD-032-happy — View v1 SEO Audit Proposal report
- **Entry point:** `/seo-audit-proposals/<id>` (public, PIN-gated if PIN set);
  component: `src/app/(frontend)/seo-audit-proposals/[id]/page.tsx`.
- **Inputs:** A completed `seo-audit-proposals` record (from AUD-006 + AUD-036 runs, or a synthetic stub with `report` JSON).
- **Steps:**
  1. Navigate to `http://localhost:3004/seo-audit-proposals/<id>`.
  2. If PIN-gated: enter the PIN.
  3. Assert the report page renders: GSC performance section, keyword demand, CRO section, on-page findings, ROI uplift.
  4. Assert no JS errors on the page.
- **Expected:** All report sections render from the stored `report` JSON; no crash.
- **Env/service deps:** None (stored data).
- **Triage:** Render crash → PROD-BUG. 404 for a known id → PROD-BUG.

---

## AUD-033 — SEO Audit Proposal report (v2 deck) · READ

### AUD-033-happy — View v2 presentation deck
- **Entry point:** `/seo-audit-proposals/<id>/v2` (public, PIN-gated if PIN set);
  component: `src/app/(frontend)/seo-audit-proposals/[id]/v2/page.tsx`.
- **Inputs:** Same completed record as AUD-032.
- **Steps:**
  1. Navigate to `http://localhost:3004/seo-audit-proposals/<id>/v2`.
  2. If PIN-gated: enter the PIN.
  3. Assert deck renders at 1920×1080 (or viewport-scaled equivalent); first slide is visible.
  4. Press right-arrow or scroll to advance to the next slide; assert the transition works.
  5. Assert SEO health slide, CRO health slide, and closing slide all render.
- **Expected:** Fullscreen deck renders; slides advance; no crash.
- **Env/service deps:** None (stored data).
- **Triage:** Deck crash → PROD-BUG. Slide advance broken → PROD-BUG.

---

## AUD-034 — Run proposal audits API · EXTERNAL-SAFE

### AUD-034-happy — POST triggers the full audit pipeline
- **Entry point:** `POST /api/proposals/<zz-test-proposal id>/run-audits` (admin session);
  route: `src/app/(frontend)/api/proposals/[id]/run-audits/route.ts`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/proposals/<id>/run-audits", { method: "POST" })`.
  3. Assert 200 (pipeline fanned out); check body for a pipeline id or status indicator.
  4. Poll `GET /api/proposals/<id>/audit-status` to confirm progress updates are received.
  5. Assert Growth Tools sub-calls (SEO, CRO, keyword, competitor, content) are all triggered — check that CMS records (`seo-audits`, `cro-audits`, `keyword-snapshots`, `competitor-analyses`, `content-researches`) are created or updated.
  6. Log all created record ids to teardown manifest.
- **Expected:** Five Growth Tools calls fan out; all five CMS record types are written; Vercel Blob used for intermediate storage; no unhandled 500.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`, live); **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`).
- **Triage:** Individual Growth Tools sub-call failure → UNKNOWN (live service). All five fail → likely Growth Tools outage → UNKNOWN. Platform routing failure → PROD-BUG.

### AUD-034-edge — Run audits for a proposal with no website
- **Inputs:** A proposal with no `website` field set.
- **Steps:**
  1. POST to `run-audits` for a proposal missing the `website` field.
  2. Assert the response is a structured 400/422 with a "missing website" message; no Growth Tools calls made.
- **Expected:** Early validation prevents fanout; no partial records created.
- **Triage:** Crash or partial fanout → PROD-BUG.

---

## AUD-035 — SEO Audit Proposal create-and-run API · CMS-WRITE

### AUD-035-happy — Resolves or creates an SEO Audit Proposal record
- **Entry point:** `POST /api/seo-audit-proposals/create-and-run` (admin session);
  route: `src/app/(frontend)/api/seo-audit-proposals/create-and-run/route.ts`.
- **Inputs:** `{ clientId: <zz-test-client id> }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-audit-proposals/create-and-run", { method: "POST", body: { clientId: <id> } })`.
  3. Assert 200 with `{ id }` in the response.
  4. `GET /api/seo-audit-proposals/<id>` — confirm the record exists and is linked to the test client.
  5. Call the same endpoint again with the same `clientId`; assert the same `id` is returned (idempotent resolve).
  6. Log id to teardown manifest.
- **Expected:** Existing record resolved (not duplicated); new record created if none exists; `id` always returned.
- **Env/service deps:** admin session; **GSC** (token snapshotted — disconnected for test client, gracefully handled); local DB.
- **Triage:** "Not connected" GSC → DEV-CONFIG. Duplicate record created → PROD-BUG. 500 → PROD-BUG.

### AUD-035-edge — Missing clientId and missing proposalId
- **Inputs:** `{}` (neither `clientId` nor `proposalId`).
- **Steps:**
  1. `authedFetch("/api/seo-audit-proposals/create-and-run", { method: "POST", body: {} })`.
  2. Assert 400/422 with a clear validation error; no record created.
- **Expected:** Validation rejects the request.
- **Triage:** Crash or phantom record → PROD-BUG.

---

## AUD-036 — SEO Audit Proposal run API · EXTERNAL-SAFE

### AUD-036-happy — Run the SEO proposal engine for an existing record
- **Entry point:** `POST /api/seo-audit-proposals/<id>/run` (admin session);
  route: `src/app/(frontend)/api/seo-audit-proposals/[id]/run/route.ts`.
- **Inputs:** Use the record id from AUD-035-happy.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-audit-proposals/<id>/run", { method: "POST" })`.
  3. Assert 200 (trigger accepted); poll status per AUD-037-happy.
  4. On terminal state `"completed"`: `GET /api/seo-audit-proposals/<id>` — assert `report` JSON is populated.
  5. On `"failed"` with GSC error: classify as DEV-CONFIG (disconnected test client).
- **Expected:** Growth Tools `seo-proposal` called; `report` JSON stored; status transitions from `running` to `completed`/`failed`.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`); **GSC** (disconnected → DEV-CONFIG if it blocks completion).
- **Triage:** GSC failure → DEV-CONFIG. Growth Tools 5xx → UNKNOWN. `report` not written on `"completed"` → PROD-BUG.

---

## AUD-037 — SEO Audit Proposal status API · READ

### AUD-037-happy — Poll status of a running SEO audit proposal
- **Entry point:** `GET /api/seo-audit-proposals/<id>/status` (admin session);
  route: `src/app/(frontend)/api/seo-audit-proposals/[id]/status/route.ts`.
- **Steps:**
  1. `loginAdmin()`.
  2. Trigger a run (AUD-036) or use any in-progress record.
  3. `authedFetch("/api/seo-audit-proposals/<id>/status")`.
  4. Assert 200 with `{ status, stage, percent }`.
  5. Confirm `percent` is a number 0–100; `stage` is a non-empty string.
  6. Poll 3× and assert the values update (or hold steady if completed).
- **Expected:** Status endpoint always returns 200 with the three fields; no 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 on poll → PROD-BUG. Missing `percent` field → PROD-BUG.

### AUD-037-edge — Status for unknown record id
- **Inputs:** `id` that does not exist.
- **Steps:**
  1. `authedFetch("/api/seo-audit-proposals/999999999/status")`.
  2. Assert 404 or `{ error: "not found" }` — not a 500.
- **Expected:** Graceful not-found.
- **Triage:** 500 → PROD-BUG.

---

## AUD-038 — SEO Audit Proposal latest API · READ

### AUD-038-happy — Fetch the latest completed proposal for the test client
- **Entry point:** `GET /api/seo-audit-proposals/latest?clientId=<id>` (admin session);
  route: `src/app/(frontend)/api/seo-audit-proposals/latest/route.ts`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/seo-audit-proposals/latest?clientId=<zz-test-client id>")`.
  3. Assert 200.
  4. If a completed record exists: assert `{ found: true, id, reportSlug, status: "completed", report }`.
  5. If none exists: assert `{ found: false }` — not a 500.
- **Expected:** Returns the latest completed record or a graceful `found: false`.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with or without records → PROD-BUG.

### AUD-038-edge — Missing query param
- **Inputs:** `GET /api/seo-audit-proposals/latest` (no `clientId` or `proposalId`).
- **Steps:**
  1. `authedFetch("/api/seo-audit-proposals/latest")`.
  2. Assert 400/422 with a clear "missing clientId or proposalId" message.
- **Expected:** Validation error; no crash.
- **Triage:** 500 → PROD-BUG.

---

## AUD-039 — Site health report run API · EXTERNAL-SAFE

### AUD-039-happy — Trigger site-health run for an existing report record
- **Entry point:** `POST /api/site-health-reports/<id>/run` (admin session);
  route: `src/app/(frontend)/api/site-health-reports/[id]/run/route.ts`.
- **Inputs:** Record id from AUD-007-happy.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/site-health-reports/<id>/run", { method: "POST" })`.
  3. Assert 200 (trigger accepted).
  4. Poll `GET /api/site-health-reports/<id>/audit-status` every 3 s (AUD-040).
  5. On terminal state `"completed"`: `GET /api/site-health-reports/<id>` — assert `issues`, `pages`, `summary`, and `healthScore` are populated.
- **Expected:** Growth Tools `site-health/run` called; crawl results stored in the CMS record.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`); **GSC** (disconnected for test client — some GSC metrics may be absent).
- **Triage:** GSC sub-call failure → DEV-CONFIG. Growth Tools 5xx → UNKNOWN. Record not updated on completion → PROD-BUG.

---

## AUD-040 — Site health report audit-status API · READ

### AUD-040-happy — Poll audit-status for a site health report
- **Entry point:** `GET /api/site-health-reports/<id>/audit-status` (admin session);
  route: `src/app/(frontend)/api/site-health-reports/[id]/audit-status/route.ts`.
- **Steps:**
  1. `loginAdmin()`.
  2. Trigger a run (AUD-039) or use any in-progress record.
  3. `authedFetch("/api/site-health-reports/<id>/audit-status")`.
  4. Assert 200 with `{ status, stage, percent }`.
  5. Poll 3× and confirm values update or stabilise at terminal.
- **Expected:** Endpoint always 200 with the three fields during/after a run.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG. Missing fields → PROD-BUG.

### AUD-040-edge — Status for record with no run started
- **Steps:**
  1. Create a fresh `site-health-reports` record (AUD-007-happy).
  2. Immediately poll `GET /api/site-health-reports/<id>/audit-status` (no run triggered).
  3. Assert 200 with `status: "idle"` or `"pending"` — not a 500.
- **Expected:** Graceful pre-run state.
- **Triage:** 500 → PROD-BUG.

---

## AUD-041 — Site health cron API · EXTERNAL-SAFE

### AUD-041-happy — Cron fires with valid CRON_SECRET and triggers audits
- **Entry point:** `GET /api/site-health/cron` with header `Authorization: Bearer <CRON_SECRET>`;
  route: `src/app/(frontend)/api/site-health/cron/route.ts`.
- **Steps:**
  1. Read `CRON_SECRET` from the environment.
  2. `fetch("http://localhost:3004/api/site-health/cron", { headers: { Authorization: "Bearer <CRON_SECRET>" } })`.
  3. Assert 200; response body confirms the number of eligible clients queued/processed.
  4. Assert no 401/403.
- **Expected:** Cron accepted; iterates eligible clients; triggers Growth Tools `site-health/run` for each.
- **Env/service deps:** `CRON_SECRET` env key; **Growth Tools** (`GROWTH_TOOLS_URL`, live).
- **Triage:** Missing `CRON_SECRET` in dev → DEV-CONFIG. Growth Tools failure → UNKNOWN. Platform 500 with valid secret → PROD-BUG.

### AUD-041-edge — Cron without CRON_SECRET returns 401
- **Steps:**
  1. `fetch("http://localhost:3004/api/site-health/cron")` (no `Authorization` header).
  2. Assert HTTP 401.
- **Expected:** Unauthenticated requests unconditionally rejected.
- **Triage:** Returns 200 without the secret → PROD-BUG (security).

---

## AUD-042 — Keyword deep-dive apply-to-NKL API · CMS-WRITE

### AUD-042-happy — Apply a keyword session to a Negative Keyword List
- **Entry point:** `POST /api/keyword-deep-dive-sessions/<id>/apply-to-nkl` (admin session);
  route: `src/app/(frontend)/api/keyword-deep-dive-sessions/[id]/apply-to-nkl/route.ts`.
- **Inputs:** Session id from AUD-008-happy; an existing `nklId` from the local DB.
- **Steps:**
  1. `loginAdmin()`.
  2. Resolve a valid NKL id: `authedFetch("/api/negative-keyword-lists")` and pick the first result's id.
  3. `authedFetch("/api/keyword-deep-dive-sessions/<sessionId>/apply-to-nkl", { method: "POST", body: { nklId: <nklId>, keywords: ["roofing sydney", "roof repair cost"] } })`.
  4. Assert 200; confirm the session `status` is now `"applied"` and `targetNkl` is linked.
  5. `GET /api/negative-keyword-lists/<nklId>` — confirm the keywords appear in the NKL.
  6. Log changes to teardown manifest (revert NKL keywords added).
- **Expected:** Session status updated to `"applied"`; keywords appended to the NKL record.
- **Env/service deps:** admin session; local DB.
- **Triage:** Session status not updated → PROD-BUG. NKL not updated → PROD-BUG.

### AUD-042-edge — Apply with no keywords in body
- **Inputs:** `{ nklId: <id>, keywords: [] }`.
- **Steps:**
  1. POST with empty `keywords` array.
  2. Assert 400/422 with "no keywords provided" message.
- **Expected:** Validation error; session status unchanged.
- **Triage:** Empty array silently applied → PROD-BUG.

---

## AUD-043 — Tag setup audit fetch API · READ

### AUD-043-happy — Fetch a stored tag setup audit result
- **Entry point:** `GET /api/tag-setup-audits/<id>` (admin session);
  route: `src/app/(frontend)/api/tag-setup-audits/[id]/route.ts`.
- **Inputs:** An audit id created via AUD-009-happy or AUD-044-happy.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/tag-setup-audits/<id>")`.
  3. Assert 200 with `{ status, summary, issues, events }` — all fields present.
  4. For a pending record: `status: "pending"`, `issues: []`; for a completed one: `issues` array may have entries.
- **Expected:** Stored audit record returned in full; shape matches expected fields.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG. Missing `status` field → PROD-BUG.

### AUD-043-edge — Unknown audit id returns 404
- **Steps:**
  1. `authedFetch("/api/tag-setup-audits/999999999")`.
  2. Assert 404 — not a 500.
- **Expected:** Graceful not-found.
- **Triage:** 500 → PROD-BUG.

---

## AUD-044 — Check tag setup API · EXTERNAL-SAFE

### AUD-044-happy — POST triggers a Scrapling tag audit and returns auditId immediately
- **Entry point:** `POST /api/clients/<zz-test-client id>/check-tag-setup` (admin session);
  route: `src/app/(frontend)/api/clients/[id]/check-tag-setup/route.ts`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/clients/<id>/check-tag-setup", { method: "POST" })`.
  3. Assert 200 immediately; extract `{ auditId }` from the response.
  4. Assert a `tag-setup-audits` record with that `auditId` now exists and has `status: "pending"` or `"running"`.
  5. Poll `GET /api/tag-setup-audits/<auditId>` until terminal state (completed or failed — Scrapling is flaky).
  6. Log `auditId` to teardown manifest.
- **Expected:** Route returns `{ auditId }` synchronously; background task runs Scrapling; record populated asynchronously.
- **Env/service deps:** admin session; **Scrapling** (`SCRAPLING_SERVICE_URL`, wired but flaky).
- **Triage:** Scrapling flake → UNKNOWN (retry). Route returns 500 before even creating the record → PROD-BUG.

---

## AUD-045 — Audit PIN auth API · READ

### AUD-045-happy — Verify correct audit PIN
- **Entry point:** `POST /api/audit-auth` (no auth header);
  route: `src/app/(frontend)/api/audit-auth/route.ts`.
- **Inputs:** `{ slug: "zz-seo-audit-test", password: "4729" }` (use the audit's configured PIN; may need to set it on the record first).
- **Steps:**
  1. `POST http://localhost:3004/api/audit-auth` with `Content-Type: application/json` body `{ slug: "zz-seo-audit-test", password: "4729" }`.
  2. Assert 200 `{ ok: true }`.
  3. Assert the response sets a session cookie for the slug.
- **Expected:** Correct PIN returns `{ ok: true }` with a session cookie; no admin session needed.
- **Env/service deps:** Local DB (PIN stored on the audit record).
- **Triage:** Correct PIN returns false → PROD-BUG (security). No session cookie set → PROD-BUG.

### AUD-045-edge — Wrong PIN returns 401 and rate-limits on repeat
- **Inputs:** `{ slug: "zz-seo-audit-test", password: "0000" }`.
- **Steps:**
  1. POST with `password: "0000"`.
  2. Assert 401 `{ ok: false }` (or `{ error: "..." }`).
  3. Repeat 5× more; assert 429 rate-limit response after the threshold.
- **Expected:** Wrong PIN always fails; rate-limiting enforced; audit content never exposed.
- **Triage:** Wrong PIN returns `ok: true` → PROD-BUG (security). No rate-limit → PROD-BUG.

---

## AUD-046 — Audit markdown export API · READ

### AUD-046-happy — Download markdown export via PIN-gated route
- **Entry point:** `GET /api/audit-markdown?id=<auditId>` (PIN session cookie required);
  route: `src/app/(frontend)/api/audit-markdown/route.ts`.
- **Inputs:** `auditId` from AUD-001-happy; PIN session obtained via AUD-045-happy.
- **Steps:**
  1. First set the PIN session: `POST /api/audit-auth { slug: "zz-seo-audit-test", password: "4729" }` — save the session cookie.
  2. `fetch("http://localhost:3004/api/audit-markdown?id=<auditId>", { headers: { Cookie: <session cookie> } })`.
  3. Assert 200.
  4. Assert `Content-Type` is `text/markdown` or `application/octet-stream`.
  5. Assert `Content-Disposition` includes a `.md` filename.
  6. Assert the body is non-empty markdown containing at least one heading and the audit score.
- **Expected:** Markdown file download; valid markdown content from the stored audit record.
- **Env/service deps:** PIN session cookie; local DB.
- **Triage:** 401 without PIN session → expected (correct). 401 or 500 with valid session → PROD-BUG.

### AUD-046-edge — Request without PIN session cookie returns 401
- **Steps:**
  1. `GET /api/audit-markdown?id=<auditId>` with no cookie.
  2. Assert 401.
- **Expected:** Unauthenticated access denied.
- **Triage:** 200 returned without PIN session → PROD-BUG (security).

---

## AUD-047 — GSC migration check API · EXTERNAL-SAFE

### AUD-047-happy — List past migration reviews for the test client
- **Entry point:** `GET /api/gsc/migration-check?clientId=<zz-test-client id>` (admin session);
  route: `src/app/(frontend)/api/gsc/migration-check/route.ts`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/migration-check?clientId=<id>")`.
  3. Assert 200 with an array (may be empty if no reviews run yet).
  4. Each item (if present) has `id`, `cutoverDate`, `status`, `createdAt`.
- **Expected:** Past reviews returned as an array (empty is fine); no crash.
- **Env/service deps:** admin session; local DB (list query is local).
- **Triage:** 500 → PROD-BUG.

### AUD-047-edge — POST migration check with disconnected GSC returns structured error
- **Entry point:** `POST /api/gsc/migration-check` (admin session).
- **Inputs:** `{ clientId: <zz-test-client id>, cutoverDate: "2025-01-15", isDomainMove: false }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/migration-check", { method: "POST", body: { clientId: <id>, cutoverDate: "2025-01-15", isDomainMove: false } })`.
  3. Assert the response is **not** a bare 500; assert a structured response like `{ error: "GSC not connected" }` / 400/422.
  4. Confirm no partial `seo-migration-checks` record was created (or it was created with `status: "failed"`).
- **Expected:** Graceful error for disconnected GSC; no unhandled crash; any created record has `status: "failed"`.
- **Env/service deps:** admin session; **GSC** (OAuth token absent for test client — this is **expected DEV-CONFIG**, not a bug).
- **Triage:** "Not connected" structured error → DEV-CONFIG (correct). Unhandled 500 → PROD-BUG. Partial CMS record with wrong status → PROD-BUG.
