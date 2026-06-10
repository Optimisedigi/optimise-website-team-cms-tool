# Test Scenarios — GSC / SERP / AI-visibility / Indexing (`GSC`)

Standalone scenarios keyed to FEAT-IDs `GSC-001`…`GSC-034` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads `6591013898`), proposal
`zz-test-proposal` (PIN `5836`).

> ⚠️ **GSC / GA4 disconnected on the test client.**  
> The fixture client `zz-test-client` has **no per-client OAuth token** for
> Google Search Console or GA4. Any route that performs a live GSC or GA4 query
> against this client will return a "not connected" / empty / 400 response.
> **That is the correct dev outcome** — triage it as **DEV-CONFIG**, not a
> PROD-BUG. Scenarios that are affected call this out explicitly and, where
> possible, offer an alternative assertion against a real connected client if
> one is available in the dev DB.

---

## GSC-001 — GSC Snapshots collection · READ

### GSC-001-happy — Browse the GSC Snapshots collection
- **Entry point:** `/admin/collections/gsc-snapshots` (admin session).
- **Inputs:** none — view-only browse.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `http://localhost:3004/admin/collections/gsc-snapshots`.
  3. Confirm the list page renders (zero or more rows).
  4. If at least one record exists, open it and verify the record has `client`,
     `month`, `clicks`, `impressions` fields.
- **Expected:** 200; list renders without crash. Zero rows is acceptable in a
  fresh dev DB. Record detail page shows snapshot fields.
- **Env/service deps:** admin session; local test DB. No external services.
- **Triage:** render crash or 500 with valid session → PROD-BUG.

### GSC-001-edge — Unauthenticated access blocked
- **Entry point:** `GET /admin/collections/gsc-snapshots` (no session).
- **Steps:** perform the request without the `loginAdmin()` cookie.
- **Expected:** redirect to `/admin/login` or 401.
- **Triage:** data visible without auth → PROD-BUG (security).

---

## GSC-002 — GSC Daily collection · READ

### GSC-002-happy — Browse the GSC Daily collection
- **Entry point:** `/admin/collections/gsc-daily` (admin session).
- **Inputs:** none.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `http://localhost:3004/admin/collections/gsc-daily`.
  3. Confirm list renders; if rows exist, open one and verify `client`, `date`,
     `clicks`, `impressions`, `position` fields.
- **Expected:** 200; list renders; record fields visible.
- **Env/service deps:** admin session; local test DB.
- **Triage:** crash with valid session → PROD-BUG.

---

## GSC-003 — GSC Alerts collection · READ

### GSC-003-happy — Browse the GSC Alerts collection
- **Entry point:** `/admin/collections/gsc-alerts` (admin session).
- **Inputs:** none.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `http://localhost:3004/admin/collections/gsc-alerts`.
  3. Confirm list renders; if rows exist, open one and verify `client`, `type`,
     `severity`, `message` fields are present.
- **Expected:** 200; list renders. Empty list acceptable in fresh dev DB.
- **Env/service deps:** admin session; local test DB.
- **Triage:** crash with valid session → PROD-BUG.

---

## GSC-004 — Connect GSC (OAuth) · EXTERNAL-SAFE

### GSC-004-happy — Initiate GSC OAuth redirect
- **Entry point:** `GET /api/gsc/connect?clientId=<zz-test-client id>` (admin session).
- **Inputs:** `clientId` = ID of `zz-test-client` (look up via
  `GET /api/clients/list`).
- **Steps:**
  1. `loginAdmin()`.
  2. Resolve the `zz-test-client` ID from `authedFetch("/api/clients/list")`.
  3. `authedFetch("/api/gsc/connect?clientId=<id>", { redirect: "manual" })`.
  4. Assert the response is a `3xx` redirect whose `Location` header begins with
     `https://accounts.google.com/o/oauth2/`.
- **Expected:** 302/307 redirect to Google's OAuth consent page. The test does
  **not** follow the redirect (no real OAuth is completed).
- **Env/service deps:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; admin
  session. No per-client GSC token required for this step.
- **Triage:** redirect not issued / wrong URL → PROD-BUG. `GOOGLE_CLIENT_ID`
  missing → DEV-CONFIG.

### GSC-004-edge — Missing clientId rejected
- **Entry point:** `GET /api/gsc/connect` (no `clientId` param).
- **Steps:** call without any query param.
- **Expected:** 400 with a descriptive error; no redirect.
- **Triage:** crash (500) → PROD-BUG.

---

## GSC-005 — GSC OAuth callback · CMS-WRITE

### GSC-005-happy — Callback route exists and rejects an invalid code gracefully
- **Entry point:** `GET /api/gsc/callback?code=INVALID&state=<encoded-client-id>`
  (admin session).
- **Inputs:** dummy `code=INVALID`; `state` must encode a valid `clientId` in the
  format the connect route uses (inspect the redirect URL from GSC-004 to read the
  real `state` format, then craft a matching value).
- **Steps:**
  1. `loginAdmin()`.
  2. From GSC-004 redirect `Location`, extract the `state` parameter.
  3. `authedFetch("/api/gsc/callback?code=INVALID&state=<extracted-state>")`.
  4. Assert the response is a 4xx or a redirect-to-error, **not** a 200 with
     tokens stored.
- **Expected:** Google rejects the invalid code; callback returns a graceful
  error response (400/401/redirect with error param). No OAuth token is written
  to the `zz-test-client` record.
- **Env/service deps:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; admin
  session; Google token endpoint (external call expected to fail gracefully).
- **Triage:** token stored despite invalid code → PROD-BUG. Network error to
  Google token endpoint in dev → DEV-CONFIG.

---

## GSC-006 — Disconnect GSC · CMS-WRITE

### GSC-006-happy — Disconnect GSC token (idempotent on already-disconnected client)
- **Entry point:** `POST /api/gsc/disconnect` (admin session).
- **Inputs:** `{ clientId: <zz-test-client id> }`.
- **Steps:**
  1. `loginAdmin()`.
  2. Resolve `zz-test-client` ID.
  3. `authedFetch("/api/gsc/disconnect", { method: "POST", body: JSON.stringify({ clientId }) })`.
  4. Assert 200 and a success payload.
  5. Verify the client record still exists (no accidental delete).
- **Expected:** 200 `{ ok: true }` (or equivalent). Since the client is already
  disconnected, this is a no-op disconnect — the route must handle it gracefully.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 on already-disconnected client → PROD-BUG.

### GSC-006-edge — Missing clientId rejected
- **Entry point:** `POST /api/gsc/disconnect` with empty body.
- **Expected:** 400 with a clear "clientId required" error.
- **Triage:** crash → PROD-BUG.

---

## GSC-007 — GSC Query API · EXTERNAL-SAFE

### GSC-007-happy — Query against disconnected client returns "not connected"
- **Entry point:** `POST /api/gsc/query` (admin session).
- **Inputs:**
  ```json
  {
    "clientId": "<zz-test-client id>",
    "siteUrl": "https://example.com",
    "dateRange": { "startDate": "2025-01-01", "endDate": "2025-01-31" },
    "dimensions": ["query"]
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. Resolve `zz-test-client` ID.
  3. `authedFetch("/api/gsc/query", { method: "POST", body })`.
  4. Assert response indicates "not connected" / no token / 400 or 401.
- **Expected:** ⚠️ `zz-test-client` has **no GSC token**, so the route must
  return a graceful error such as `{ error: "GSC not connected" }` or HTTP 400.
  This is the **correct dev outcome** — triage as DEV-CONFIG. A PROD-BUG would
  be a 500 / unhandled crash.
- **Env/service deps:** per-client GSC OAuth token (absent for test client) →
  DEV-CONFIG; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Triage:** clean 4xx "not connected" → DEV-CONFIG (expected). 500/crash →
  PROD-BUG.

### GSC-007-edge — Missing required fields rejected
- **Entry point:** `POST /api/gsc/query` with body `{}`.
- **Expected:** 400 validation error; no GSC call attempted.
- **Triage:** crash → PROD-BUG.

---

## GSC-008 — GSC Snapshot API · EXTERNAL-SAFE

### GSC-008-happy — Snapshot for disconnected client returns graceful error
- **Entry point:** `GET /api/gsc/snapshot?clientId=<zz-test-client id>&month=2025-01`
  (admin session).
- **Inputs:** `clientId` of `zz-test-client`, a recent month.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/snapshot?clientId=<id>&month=2025-01")`.
  3. Assert response is a graceful "not connected" / empty result, not a 500.
- **Expected:** ⚠️ Test client has no GSC token. Expected: 400/empty `{ data: null }`
  or similar "not connected" response. **DEV-CONFIG** — not a PROD-BUG.
- **Env/service deps:** per-client GSC token (absent) → DEV-CONFIG.
- **Triage:** "not connected" clean response → DEV-CONFIG. 500/crash → PROD-BUG.

### GSC-008-edge — Missing month parameter
- **Entry point:** `GET /api/gsc/snapshot?clientId=<id>` (no `month`).
- **Expected:** 400 validation error.
- **Triage:** crash → PROD-BUG.

---

## GSC-009 — GSC Run / Seed API · EXTERNAL-SAFE

### GSC-009-happy — Run/seed against disconnected client returns graceful error
- **Entry point:** `POST /api/gsc/run` then `POST /api/gsc/seed` (admin session).
- **Inputs:** `{ clientId: <zz-test-client id> }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/run", { method: "POST", body: JSON.stringify({ clientId }) })`.
  3. Assert graceful "not connected" / 400 response (no crash).
  4. Repeat with `POST /api/gsc/seed`.
- **Expected:** ⚠️ Both routes should return a clean 400/error object for a
  client without a GSC token. **DEV-CONFIG** — not a bug.
- **Env/service deps:** per-client GSC token (absent) → DEV-CONFIG.
- **Triage:** clean error → DEV-CONFIG. 500 → PROD-BUG.

---

## GSC-010 — GSC Monitoring Cron · EXTERNAL-SAFE

### GSC-010-happy — Cron with valid secret responds (no clients connected, no alert emails)
- **Entry point:** `GET /api/gsc/cron` (bearer `CRON_SECRET`).
- **Inputs:** `Authorization: Bearer <CRON_SECRET>` header.
- **Steps:**
  1. `fetch("http://localhost:3004/api/gsc/cron", { headers: { Authorization: "Bearer " + process.env.CRON_SECRET } })`.
  2. Assert 200 response with a summary payload (e.g. `{ processed: N, alerts: M }`
     or `{ ok: true }`).
  3. Since no clients have a GSC token in dev, expect `processed: 0` or an empty
     run — not a crash.
  4. Alert emails are **harness-blocked** (Brevo live but harness-intercepted);
     assert no error thrown from the email path.
- **Expected:** 200 with a summary. Zero clients processed is the expected dev
  outcome. Email-send attempts are blocked by test harness — that is not a failure.
- **Env/service deps:** `CRON_SECRET`; GSC per-client tokens (none in dev →
  zero processed); Brevo (harness-blocked).
- **Triage:** 200 with zero processed → DEV-CONFIG (expected). 500 → PROD-BUG.
  Alert-email block → not a failure.

### GSC-010-edge — Missing CRON_SECRET returns 401
- **Entry point:** `GET /api/gsc/cron` with no auth header.
- **Expected:** 401; cron does not execute.
- **Triage:** executes without secret → PROD-BUG (security).

---

## GSC-011 — Search Console Page · READ

### GSC-011-happy — Admin Search Console page renders for disconnected client
- **Entry point:** the Search Console admin component (browser or server-side render).
  Likely accessed via the SEO workspace: `http://localhost:3004/admin/growth-tools/seo/zz-test-client`
  → GSC tab, or the `SearchConsolePage` component surface.
- **Inputs:** `zz-test-client` slug.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the GSC tab for `zz-test-client` in the SEO admin workspace.
  3. Confirm the page renders (does not crash) and displays a "not connected" or
     "connect GSC" prompt.
- **Expected:** ⚠️ No GSC token → page renders a "not connected" state with a
  connect button, not a crash. **DEV-CONFIG** — correct behaviour.
- **Env/service deps:** admin session; per-client GSC token (absent) → DEV-CONFIG.
- **Triage:** render crash / 500 → PROD-BUG. "Not connected" UI → DEV-CONFIG.

---

## GSC-012 — GSC Migration Check · EXTERNAL-SAFE

### GSC-012-happy — List prior migration checks for the test client
- **Entry point:** `GET /api/gsc/migration-check?clientId=<zz-test-client id>` (admin session).
- **Inputs:** `clientId` of `zz-test-client`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/migration-check?clientId=<id>")`.
  3. Assert 200 with an array (may be empty in a fresh dev DB).
- **Expected:** 200 `{ checks: [] }` or `{ checks: [...] }`. Empty array is
  valid.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 → PROD-BUG.

### GSC-012-edge — Trigger migration check for disconnected client
- **Entry point:** `POST /api/gsc/migration-check` (admin session).
- **Inputs:**
  ```json
  { "clientId": "<zz-test-client id>", "cutoverDate": "2025-01-01", "isDomainMove": false }
  ```
- **Steps:**
  1. POST as above.
  2. Assert graceful "not connected" / partial result (GSC data absent); no crash.
- **Expected:** ⚠️ Route runs redirect-tracing without GSC but may return empty
  GSC sections. A "not connected" error for the GSC portion is expected →
  **DEV-CONFIG**. Full 500 crash → PROD-BUG.
- **Triage:** partial result with clear GSC-absent message → DEV-CONFIG. Crash → PROD-BUG.

---

## GSC-013 — Migration Checks collection · READ

### GSC-013-happy — Browse the SEO Migration Checks collection
- **Entry point:** `/admin/collections/seo-migration-checks` (admin session).
- **Inputs:** none.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the collection.
  3. Confirm list renders; open a record if any exist.
- **Expected:** 200; list renders. Zero rows acceptable.
- **Env/service deps:** admin session; local test DB.
- **Triage:** crash → PROD-BUG.

---

## GSC-014 — Indexing Audits collection · READ

### GSC-014-happy — Browse the GSC Indexing Audits collection
- **Entry point:** `/admin/collections/gsc-indexing-audits` (admin session).
- **Inputs:** none.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the collection.
  3. Confirm list renders; if records exist, open one and verify `client`, `siteUrl`,
     `status`, `urls` fields present.
- **Expected:** 200; list renders. Empty list OK.
- **Env/service deps:** admin session; local test DB.
- **Triage:** crash → PROD-BUG.

---

## GSC-015 — Indexing Audit API · EXTERNAL-SAFE

### GSC-015-happy — List indexing audits and create a new one (no GSC needed for create)
- **Entry point:** `GET /api/gsc/indexing-audit` then `POST /api/gsc/indexing-audit`
  (admin session).
- **Inputs:**
  ```json
  { "clientId": "<zz-test-client id>", "siteUrl": "https://example.com" }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/indexing-audit")` — assert 200 array.
  3. `authedFetch("/api/gsc/indexing-audit", { method: "POST", body })` — assert
     200/201 with a new `{ id }`.
  4. Log the new id to the teardown manifest.
- **Expected:** GET returns list (possibly empty). POST creates a stub record
  with `status: "pending"` or similar — the actual GSC inspection will fail
  gracefully because the client is disconnected.
- **Env/service deps:** admin session; local test DB. Per-client GSC token absent
  → inspection step will return "not connected" (DEV-CONFIG).
- **Triage:** POST fails to create CMS record → PROD-BUG. GSC inspection error
  (post-create) → DEV-CONFIG.

### GSC-015-edge — Inspect URL for disconnected client
- **Entry point:** `POST /api/gsc/indexing-audit/<id>/inspect` (admin session).
- **Inputs:** `{ url: "https://example.com/test-page" }`.
- **Steps:** POST to the inspect sub-route for the record created above.
- **Expected:** graceful "not connected" / error JSON — not a 500 crash.
- **Triage:** crash → PROD-BUG. Clean "not connected" → DEV-CONFIG.

---

## GSC-016 — Indexing Audit UI · READ

### GSC-016-happy — Indexing audit admin components render
- **Entry point:** admin record page for a `gsc-indexing-audits` record (browser).
- **Inputs:** any existing indexing audit record (create one via GSC-015 if none
  exists).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `/admin/collections/gsc-indexing-audits/<id>`.
  3. Confirm `GscIndexingAuditInfo` and `GscIndexingAuditResults` components
     render without crash.
- **Expected:** components render; shows metadata and (empty/pending) results
  section.
- **Env/service deps:** admin session; local test DB.
- **Triage:** render crash → PROD-BUG.

---

## GSC-017 — Indexing Helper Page · EXTERNAL-SAFE

### GSC-017-happy — Indexing helper page renders and lists sites (may be empty)
- **Entry point:** `GscIndexingHelperPage` — accessible via admin Growth Tools
  navigation or a direct admin route.
- **Inputs:** none.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the Indexing Helper admin page.
  3. Confirm the page renders with a site-selector or "no sites" state.
  4. Do **not** click Run — only verify the page loads and the site list
     (populated from GSC-018) renders.
- **Expected:** page renders; sites list shows 0 or more entries. If the helper
  relies on GSC-018 and GSC is disconnected, an empty/error state renders — not
  a crash.
- **Env/service deps:** admin session; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`;
  per-client GSC token (absent for `zz-test-client`) → site list may be empty.
- **Triage:** render crash → PROD-BUG. Empty site list → DEV-CONFIG.

---

## GSC-018 — Indexing Helper Sites API · EXTERNAL-SAFE

### GSC-018-happy — List GSC sites available to the helper
- **Entry point:** `GET /api/gsc/indexing-helper/sites` (admin session).
- **Inputs:** none (or `?clientId=<id>` if required by the route).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/indexing-helper/sites")`.
  3. Assert 200 with an array (may be empty if no client has a GSC token).
- **Expected:** 200 `{ sites: [] }` or `{ sites: [...] }`. Empty array is the
  expected dev outcome — **DEV-CONFIG**.
- **Env/service deps:** per-client GSC tokens (none in dev DB for `zz-test-client`);
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; Growth Tools.
- **Triage:** 500 → PROD-BUG. Empty sites → DEV-CONFIG.

---

## GSC-019 — Indexing Helper Run API · EXTERNAL-SAFE

### GSC-019-happy — GET run (read/list mode) for disconnected client
- **Entry point:** `GET /api/gsc/indexing-helper/run?siteUrl=https://example.com`
  (admin session).
- **Inputs:** a safe dummy `siteUrl`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/indexing-helper/run?siteUrl=https://example.com")`.
  3. Assert response is a 200 with results/empty array **or** a graceful "not
     connected" error — **not** a crash.
- **Expected:** ⚠️ GET (read/list) mode. Since no client has a GSC token in
  dev, an empty result or "not connected" is expected → **DEV-CONFIG**. Do
  **not** use POST in this scenario — POST may submit URLs to Google Indexing
  API (an **external write**) and must only be run in dev if the implementation
  guards against real submission; otherwise treat POST as harness-blocked.
- **Env/service deps:** per-client GSC token (absent); Google Indexing API
  (POST path would be external write — avoid in test); Growth Tools.
- **Triage:** GET returns graceful empty/error → DEV-CONFIG. 500 → PROD-BUG.
  **Do not trigger POST in automated test** without confirming the route has a
  dev/dry-run guard.

### GSC-019-edge — POST run flagged as external write (harness-blocked)
- **Entry point:** `POST /api/gsc/indexing-helper/run`.
- **Inputs:** `{ siteUrl: "https://example.com" }`.
- **Steps:** issue POST; assert the response indicates either "not connected"
  (no GSC token) or that the submission was blocked by harness / dev guard.
- **Expected:** no real URL submitted to Google Indexing API. Response is a
  graceful error or "not connected". If the route submits despite no token →
  PROD-BUG.
- **Triage:** "not connected" graceful → DEV-CONFIG. Successful submission to
  Google without a real token → PROD-BUG.

---

## GSC-020 — Indexing Helper Content-Refresh API · EXTERNAL-SAFE

### GSC-020-happy — Trigger content-refresh for a stale page
- **Entry point:** `POST /api/gsc/indexing-helper/content-refresh` (admin session).
- **Inputs:** `{ siteUrl: "https://example.com", urls: ["https://example.com/page"] }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gsc/indexing-helper/content-refresh", { method: "POST", body })`.
  3. Assert 200 or a clear Growth Tools error (not a 500 crash).
- **Expected:** Growth Tools is live prod — may return a success or a "site not
  found" error for the dummy URL. Both are acceptable; a crash (500) is not.
- **Env/service deps:** admin session; **Growth Tools** (live prod,
  `GROWTH_TOOLS_URL`).
- **Triage:** Growth Tools 4xx on dummy URL → UNKNOWN (correct behaviour if GT
  validates the site). Growth Tools 5xx → UNKNOWN. App-level 500 → PROD-BUG.

---

## GSC-021 — GA4 Connect (OAuth) · EXTERNAL-SAFE

### GSC-021-happy — Initiate GA4 OAuth redirect
- **Entry point:** `GET /api/ga4/connect?clientId=<zz-test-client id>` (admin session).
- **Inputs:** `clientId` of `zz-test-client`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/ga4/connect?clientId=<id>", { redirect: "manual" })`.
  3. Assert `3xx` redirect with `Location` beginning `https://accounts.google.com/`.
- **Expected:** 302/307 to Google OAuth consent page. Do **not** follow the
  redirect.
- **Env/service deps:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; admin session.
- **Triage:** no redirect or wrong Location → PROD-BUG. Missing env key →
  DEV-CONFIG.

### GSC-021-edge — Missing clientId rejected
- **Entry point:** `GET /api/ga4/connect` (no params).
- **Expected:** 400 with clear error.
- **Triage:** crash → PROD-BUG.

---

## GSC-022 — GA4 OAuth Callback · CMS-WRITE

### GSC-022-happy — Callback rejects invalid code gracefully
- **Entry point:** `GET /api/ga4/callback?code=INVALID&state=<encoded-state>`
  (admin session).
- **Inputs:** dummy code; state extracted from GSC-021 redirect URL.
- **Steps:**
  1. From GSC-021 redirect Location, extract `state`.
  2. `authedFetch("/api/ga4/callback?code=INVALID&state=<state>")`.
  3. Assert 4xx or redirect-to-error; **no** GA4 token written.
- **Expected:** Google rejects the invalid code; callback handles gracefully.
  No token stored.
- **Env/service deps:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; Google
  token endpoint.
- **Triage:** token stored despite invalid code → PROD-BUG. Network error to
  Google → DEV-CONFIG.

---

## GSC-023 — GA4 Disconnect · CMS-WRITE

### GSC-023-happy — Disconnect GA4 (no-op on already-disconnected client)
- **Entry point:** `POST /api/ga4/disconnect` (admin session).
- **Inputs:** `{ clientId: <zz-test-client id> }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/ga4/disconnect", { method: "POST", body: JSON.stringify({ clientId }) })`.
  3. Assert 200 `{ ok: true }` (idempotent no-op since client is already disconnected).
- **Expected:** 200 success. Client record unchanged (no accidental delete).
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 on already-disconnected client → PROD-BUG.

### GSC-023-edge — Missing clientId rejected
- **Inputs:** `POST /api/ga4/disconnect` with empty body.
- **Expected:** 400 with clear "clientId required" message.
- **Triage:** crash → PROD-BUG.

---

## GSC-024 — GA4 Query API · EXTERNAL-SAFE

### GSC-024-happy — GA4 query for disconnected client returns graceful error
- **Entry point:** `GET /api/ga4/query?clientId=<zz-test-client id>&metric=sessions&startDate=2025-01-01&endDate=2025-01-31`
  (admin session).
- **Inputs:** `clientId` of `zz-test-client`, standard date range and metric.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/ga4/query?clientId=<id>&metric=sessions&startDate=2025-01-01&endDate=2025-01-31")`.
  3. Assert graceful "not connected" / empty response — not a 500.
- **Expected:** ⚠️ `zz-test-client` has no GA4 token. Expected: 400/empty `{ data: null }`
  or `{ error: "GA4 not connected" }`. **DEV-CONFIG** — not a bug.
- **Env/service deps:** per-client GA4 OAuth token (absent) → DEV-CONFIG.
- **Triage:** "not connected" clean response → DEV-CONFIG. 500/crash → PROD-BUG.

### GSC-024-edge — Missing metric parameter
- **Entry point:** `GET /api/ga4/query?clientId=<id>` (no metric).
- **Expected:** 400 validation error.
- **Triage:** crash → PROD-BUG.

---

## GSC-025 — GA4 Performance Page · READ

### GSC-025-happy — GA4 performance admin page renders for disconnected client
- **Entry point:** `Ga4PerformancePage` component, accessible via the admin
  Growth Tools SEO workspace for `zz-test-client`.
- **Inputs:** `zz-test-client` slug.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the GA4 performance tab in the SEO workspace for `zz-test-client`.
  3. Confirm the page renders without crash and shows a "not connected" or
     "connect GA4" call-to-action.
- **Expected:** ⚠️ No GA4 token → page renders a "not connected" state, not a
  crash. **DEV-CONFIG** — correct behaviour.
- **Env/service deps:** admin session; per-client GA4 token (absent) → DEV-CONFIG.
- **Triage:** render crash → PROD-BUG. "Not connected" UI → DEV-CONFIG.

---

## GSC-026 — GA4 Channels API · READ

### GSC-026-happy — GA4 channels for disconnected client returns graceful error
- **Entry point:** `GET /api/dashboard/ga4-channels?clientId=<zz-test-client id>&pin=4729`
  (PIN-gated; no admin session required if PIN valid).
- **Inputs:** `clientId` of `zz-test-client`, PIN `4729`.
- **Steps:**
  1. `GET http://localhost:3004/api/dashboard/ga4-channels?clientId=<id>&pin=4729`.
  2. Assert graceful response — either "not connected" / empty channels array, or
     a 400, **not** a 500.
- **Expected:** ⚠️ No GA4 token → graceful "not connected" / empty `{ channels: [] }`.
  **DEV-CONFIG**.
- **Env/service deps:** per-client GA4 token (absent); client PIN `4729`.
- **Triage:** clean empty/error → DEV-CONFIG. 500 → PROD-BUG.

### GSC-026-edge — Wrong PIN blocked
- **Entry point:** `GET /api/dashboard/ga4-channels?clientId=<id>&pin=0000`.
- **Expected:** 401 / `{ error: "Unauthorized" }`.
- **Triage:** wrong PIN grants access → PROD-BUG (security).

---

## GSC-027 — SERP Displacement Snapshots / Alerts collections · READ

### GSC-027-happy — Browse SERP Displacement Snapshots and Alerts collections
- **Entry point:**
  - `/admin/collections/serp-displacement-snapshots` (admin session)
  - `/admin/collections/serp-displacement-alerts` (admin session)
- **Inputs:** none.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to each collection.
  3. Confirm list renders; zero rows acceptable in a fresh dev DB.
- **Expected:** 200; both lists render without crash.
- **Env/service deps:** admin session; local test DB.
- **Triage:** crash with valid session → PROD-BUG.

---

## GSC-028 — Run SERP Displacement · EXTERNAL-SAFE

### GSC-028-happy — Trigger SERP displacement from proposal via API
- **Entry point:** `POST /api/proposals/<zz-test-proposal id>/run-serp-displacement`
  (admin session).
- **Inputs:** `zz-test-proposal` ID (look up via `GET /api/client-proposals`).
- **Steps:**
  1. `loginAdmin()`.
  2. Resolve `zz-test-proposal` ID.
  3. `authedFetch("/api/proposals/<id>/run-serp-displacement", { method: "POST" })`.
  4. Assert 200 or a Growth Tools error response — not a 500 crash.
- **Expected:** ⚠️ Growth Tools is live prod. The proposal is a fixture with
  minimal/dummy data — Growth Tools may return a "no keywords" or similar error.
  Both 200 and a structured GT error are acceptable. A crash (500) is not.
- **Env/service deps:** admin session; **Growth Tools** (live prod); proposal
  fixture data.
- **Triage:** Growth Tools 4xx on dummy data → UNKNOWN. App-level 500 → PROD-BUG.

### GSC-028-edge — Unauthenticated access blocked
- **Entry point:** `POST /api/proposals/<id>/run-serp-displacement` with no session.
- **Expected:** 401.
- **Triage:** data returned without auth → PROD-BUG.

---

## GSC-029 — AI-Visibility Snapshots collection · READ

### GSC-029-happy — Browse the AI Visibility Snapshots collection
- **Entry point:** `/admin/collections/ai-visibility-snapshots` (admin session).
- **Inputs:** none.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the collection.
  3. Confirm list renders; open a record if any exist and verify `client`, `probe`,
     `sources` fields.
- **Expected:** 200; list renders. Zero rows acceptable.
- **Env/service deps:** admin session; local test DB.
- **Triage:** crash → PROD-BUG.

---

## GSC-030 — Run AI Visibility · EXTERNAL-SAFE

### GSC-030-happy — Trigger AI visibility probe from proposal via API
- **Entry point:** `POST /api/proposals/<zz-test-proposal id>/run-ai-visibility`
  (admin session).
- **Inputs:** `zz-test-proposal` ID.
- **Steps:**
  1. `loginAdmin()`.
  2. Resolve `zz-test-proposal` ID.
  3. `authedFetch("/api/proposals/<id>/run-ai-visibility", { method: "POST" })`.
  4. Assert 200 or a structured Growth Tools error — not a 500 crash.
- **Expected:** ⚠️ Growth Tools is live prod. Dummy proposal may return a "no
  brand / no keywords" error from Growth Tools — acceptable. A crash (500) is
  not acceptable.
- **Env/service deps:** admin session; **Growth Tools** (live prod).
- **Triage:** GT structured error → UNKNOWN. App 500 → PROD-BUG.

### GSC-030-edge — Unauthenticated access blocked
- **Entry point:** `POST /api/proposals/<id>/run-ai-visibility` with no session.
- **Expected:** 401.
- **Triage:** data returned without auth → PROD-BUG.

---

## GSC-031 — Organic Growth Snapshots collection · READ

### GSC-031-happy — Browse the Quarterly Organic Growth Snapshots collection
- **Entry point:** `/admin/collections/quarterly-organic-growth-snapshots` (admin session).
- **Inputs:** none.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the collection.
  3. Confirm list renders; open a record if any exist and verify `client`, `quarter`,
     `clicks`, `impressions` fields present.
- **Expected:** 200; list renders. Zero rows acceptable.
- **Env/service deps:** admin session; local test DB.
- **Triage:** crash → PROD-BUG.

---

## GSC-032 — Create Organic Snapshot · CMS-WRITE

### GSC-032-happy — Create an organic growth snapshot manually
- **Entry point:** `POST /api/organic-growth-snapshots/create` (admin session)
  or via the `CreateOrganicSnapshotButton` in the admin SEO workspace.
- **Inputs:**
  ```json
  {
    "clientId": "<zz-test-client id>",
    "quarter": "2025-Q1",
    "clicks": 1200,
    "impressions": 45000
  }
  ```
  (Adjust fields to match the actual route schema.)
- **Steps:**
  1. `loginAdmin()`.
  2. Resolve `zz-test-client` ID.
  3. `authedFetch("/api/organic-growth-snapshots/create", { method: "POST", body })`.
  4. Assert 200/201 with `{ id }` of new snapshot.
  5. `GET /api/organic-growth-snapshots/latest-gsc?clientId=<id>` and confirm
     the new snapshot appears.
  6. Log the new record ID to the teardown manifest.
- **Expected:** 201 record created; latest-gsc endpoint reflects it.
- **Env/service deps:** admin session; local test DB.
- **Triage:** create fails → PROD-BUG. Log id for teardown.

### GSC-032-edge — Missing required fields rejected
- **Inputs:** POST with empty body.
- **Expected:** 400 validation error; no record created.
- **Triage:** silent create with nulls → PROD-BUG.

---

## GSC-033 — Organic Snapshot Sweep / Latest-GSC API · EXTERNAL-SAFE

### GSC-033-happy — Latest-GSC read returns empty for disconnected client
- **Entry point:** `GET /api/organic-growth-snapshots/latest-gsc?clientId=<zz-test-client id>`
  (admin session).
- **Inputs:** `clientId` of `zz-test-client`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/organic-growth-snapshots/latest-gsc?clientId=<id>")`.
  3. Assert 200 with `{ snapshot: null }` or empty result — not a crash.
- **Expected:** ⚠️ No GSC token → latest-gsc may return `null` or an empty
  snapshot. **DEV-CONFIG** — not a bug.
- **Env/service deps:** per-client GSC token (absent); admin session.
- **Triage:** `null` snapshot → DEV-CONFIG. 500 → PROD-BUG.

### GSC-033-edge — Sweep cron requires CRON_SECRET
- **Entry point:** `GET /api/organic-growth-snapshots/sweep` with no auth header.
- **Steps:** call without `Authorization: Bearer <CRON_SECRET>`.
- **Expected:** 401; sweep does not execute.
- **Triage:** executes without secret → PROD-BUG (security).

### GSC-033-sweep — Sweep cron with valid secret (no GSC tokens in dev)
- **Entry point:** `GET /api/organic-growth-snapshots/sweep` (bearer `CRON_SECRET`).
- **Steps:**
  1. `fetch("http://localhost:3004/api/organic-growth-snapshots/sweep", { headers: { Authorization: "Bearer " + process.env.CRON_SECRET } })`.
  2. Assert 200 with summary (`{ processed: 0 }` expected since no clients have
     GSC tokens).
- **Expected:** 200 with zero processed. No crash.
- **Env/service deps:** `CRON_SECRET`; per-client GSC tokens (none in dev).
- **Triage:** 200 with `processed: 0` → DEV-CONFIG. 500 → PROD-BUG.

---

## GSC-034 — Organic Growth Tracker · READ

### GSC-034-happy — Organic growth tracker widget renders in client hub
- **Entry point:** `OrganicGrowthTracker` component, rendered inside the client
  hub for `zz-test-client`. Accessible via the admin SEO workspace or any
  client-hub page that embeds it.
- **Inputs:** `zz-test-client` slug / ID.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the client hub or SEO workspace for `zz-test-client`.
  3. Locate the Organic Growth Tracker widget.
  4. Confirm it renders without crash — may show empty/zero state if no
     snapshots exist for the test client.
- **Expected:** component renders; shows zero/empty chart state if no
  `QuarterlyOrganicGrowthSnapshots` records exist for `zz-test-client`. No crash.
- **Env/service deps:** admin session; local test DB (snapshots optional).
- **Triage:** render crash → PROD-BUG. Empty chart for zero snapshots → expected.

### GSC-034-edge — Widget with snapshot data (after GSC-032)
- **Prerequisite:** run GSC-032-happy first to create a snapshot for `zz-test-client`.
- **Steps:**
  1. After GSC-032 creates a snapshot, reload the client hub / SEO workspace.
  2. Confirm the Organic Growth Tracker now renders the newly created quarter's
     data point.
- **Expected:** chart updates to reflect the new snapshot record.
- **Env/service deps:** admin session; test DB containing the snapshot from
  GSC-032.
- **Triage:** chart not updated after snapshot creation → PROD-BUG.
