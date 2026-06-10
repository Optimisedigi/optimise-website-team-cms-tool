# Test Scenarios — Client-facing Portals (`POR`)

Standalone scenarios keyed to FEAT-IDs `POR-001`…`POR-027` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads `6591013898`), proposal
`zz-test-proposal` (PIN `5836`).

---

> ⛔ **CONTRACT FLOW — OUT OF SCOPE (Safety Interlock §4)**
>
> The user confirmed contracts already work. Per `docs/test-runs/README.md` §4:
> **"NO contract testing at all — Do not exercise the contract flow."**
>
> - **POR-014 / POR-015** (Contracts collection, preview/download): minimal
>   READ-only render scenarios are included below, but **no signing, sending, or
>   mutation of contract records may be exercised**. Each carries a prominent
>   out-of-scope banner.
> - **POR-016** (lifecycle), **POR-017** (agency-sign), **POR-018** (send
>   contract), **POR-019** (sign page), **POR-020** (reminders cron): all marked
>   **SKIPPED — out of scope**. No executable steps are provided.

---

> ⚠️ **DANGER — Live email / calendar writes are harness-blocked.**
>
> POR-003 verify (email dep), POR-004 requests (email dep), POR-018 send
> contract, POR-020 reminders cron, POR-023 send invites, POR-024 confirm
> meeting all involve email or Google Calendar writes. The test harness **must**
> block these at the network level. Scenarios that touch these surfaces **must
> NOT call send/confirm in the harness**; any such call must be intercepted and
> asserted as harness-blocked rather than let through.

---

## POR-001 — Client hub page · READ

### POR-001-happy — Render hub with correct PIN

- **Entry point:** `GET http://localhost:3004/client/zz-test-client/hub`
  (no session — public route, PIN-gated via `DashboardGate`).
- **Inputs:** client slug `zz-test-client`; PIN `4729`.
- **Steps:**
  1. Open `/client/zz-test-client/hub` in a Playwright browser (no admin session).
  2. Observe the PIN gate (`DashboardGate`) renders and prompts for the client PIN.
  3. Enter PIN `4729` — the gate calls `POST /api/client-hub/verify`.
  4. Assert the hub dashboard content renders: performance section, requests widget,
     value ledger, forecast lab.
  5. Assert no 500 errors in the console.
- **Expected:** Hub renders fully with its sections visible after correct PIN entry.
  `DashboardGate` unmounts.
- **Env/service deps:** Local test DB (`zz-test-client` fixture). No external services
  required for the page shell; data sections may depend on Growth Tools / GA4 (see
  POR-002 / POR-006) — absence of data is acceptable, crash is not.
- **Triage:** PIN gate not rendering → PROD-BUG. Correct PIN rejected → PROD-BUG
  (security). Crash after PIN accepted → PROD-BUG. Missing data from Growth Tools
  while page otherwise renders → UNKNOWN.

### POR-001-edge — Wrong PIN blocked on hub gate

- **Entry point:** `/client/zz-test-client/hub` (no session).
- **Inputs:** PIN `0000` (wrong).
- **Steps:**
  1. Open `/client/zz-test-client/hub`.
  2. Enter PIN `0000`.
  3. Assert the gate remains locked; error message "incorrect PIN" (or similar) shown.
  4. Submit three further wrong PINs (`1111`, `2222`, `3333`) in quick succession.
  5. Assert the fourth attempt is rate-limited (HTTP 429 from `/api/client-hub/verify`
     or equivalent UI lockout message).
- **Expected:** Wrong PIN does not unlock the hub. After threshold attempts, further
  requests are rate-limited (429). Hub content is never exposed.
- **Env/service deps:** Local test DB; `PinRateLimits` collection (see POR-026).
- **Triage:** Wrong PIN unlocks hub → PROD-BUG (critical security). No lockout after
  repeated failures → PROD-BUG (security). 429 arrives earlier than expected →
  check rate-limit window configuration → UNKNOWN.

---

## POR-002 — Client hub data API · READ

### POR-002-happy — Fetch aggregated hub data

- **Entry point:** `GET /api/client-hub/zz-test-client` (admin session).
- **Inputs:** `loginAdmin()` + `authedFetch("/api/client-hub/zz-test-client")`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/client-hub/zz-test-client")`.
  3. Assert HTTP 200.
  4. Assert response JSON contains expected top-level keys (e.g. `client`, `requests`
     or equivalent aggregated fields).
  5. Assert `client.slug === "zz-test-client"`.
- **Expected:** 200 JSON with client identity and hub aggregate data; no 500.
- **Env/service deps:** Admin session; local test DB. Growth Tools and GA4 data may be
  absent (test client has GA4 disconnected) — "not connected" or empty sections are
  expected as DEV-CONFIG, not failures.
- **Triage:** 401 without session is expected. 500 with session → PROD-BUG. Empty hub
  data while client exists → check if data deps are correctly handled when disconnected
  → likely DEV-CONFIG.

---

## POR-003 — Client hub verify API · READ

### POR-003-happy — Verify correct hub PIN via API

- **Entry point:** `POST /api/client-hub/verify`.
- **Inputs:**
  ```json
  { "slug": "zz-test-client", "pin": "4729" }
  ```
- **Steps:**
  1. `POST /api/client-hub/verify` (no admin session; public endpoint).
  2. Assert HTTP 200 and `{ ok: true }` (or equivalent success shape).
- **Expected:** Correct PIN returns a success response. No email is sent (email dep is
  harness-blocked).
- **Env/service deps:** Local test DB; `PinRateLimits` collection. **Email dep
  (Brevo) — harness-blocked; email send must NOT reach the network.**
- **Triage:** Correct PIN returns `ok: false` → PROD-BUG. Email send unblocked →
  harness failure (not a scenario failure). 500 on correct PIN → PROD-BUG.

### POR-003-edge — Wrong PIN + rate-limit lockout

- **Entry point:** `POST /api/client-hub/verify`.
- **Inputs:**
  ```json
  { "slug": "zz-test-client", "pin": "9999" }
  ```
  Repeated 5 times.
- **Steps:**
  1. Send `POST /api/client-hub/verify` with `pin: "9999"` five times in succession.
  2. First attempt: assert 200/401 with `{ ok: false }` (wrong PIN rejected).
  3. Subsequent attempts: assert progressively that the rate-limit kicks in (429).
  4. After lockout, send the **correct** PIN `4729` — assert it is also locked out
     (lockout applies per-slug/IP, not per-PIN).
- **Expected:** Wrong PIN consistently rejected. After the threshold, requests return
  429 with a rate-limit error. Correct PIN is also blocked while locked out.
- **Env/service deps:** Local test DB; `PinRateLimits` collection.
- **Triage:** Wrong PIN accepted → PROD-BUG (security). No 429 after repeated failures
  → PROD-BUG (security). Rate-limit threshold very different from expected (e.g. 1 or
  1000) → check `PinRateLimits` config → UNKNOWN.

---

## POR-004 — Client hub requests API · CMS-WRITE

### POR-004-happy — List then submit a portal request

- **Entry point:** `GET /api/client-hub/zz-test-client/requests` then
  `POST /api/client-hub/zz-test-client/requests`.
- **Inputs:**
  - GET: no body.
  - POST body:
    ```json
    { "title": "ZZ Test Request", "description": "Scenario test request — teardown after." }
    ```
- **Steps:**
  1. `GET /api/client-hub/zz-test-client/requests` (no admin session, public — PIN
     may be required; if so, obtain a PIN token first via `POST /api/client-hub/verify`
     with PIN `4729` and include any resulting auth cookie).
  2. Assert 200 and an array (may be empty for a fresh fixture).
  3. `POST /api/client-hub/zz-test-client/requests` with the body above.
  4. Assert HTTP 200/201; response includes the created request id.
  5. Re-run GET and assert the new request appears in the list.
  6. Log created record `{ collection: "client-portal-requests", id: <id>, op: "create" }`
     to teardown manifest.
- **Expected:** GET returns a list; POST creates a `ClientPortalRequests` record and
  it appears in the subsequent GET. **No notification email is sent** (email dep
  harness-blocked).
- **Env/service deps:** Local test DB; `ClientPortalRequests` collection.
  **Email dep (Brevo) — harness-blocked.**
- **Triage:** GET 500 → PROD-BUG. POST 422 (bad body) → PROD-BUG. Record not persisted
  after POST → PROD-BUG. Email unblocked → harness failure.

---

## POR-005 — Client portal requests collection · READ

### POR-005-happy — Admin list of portal requests

- **Entry point:** `GET /api/client-portal-requests` (Payload REST, admin session) or
  `/admin/collections/client-portal-requests` (browser).
- **Inputs:** `loginAdmin()` + `authedFetch("GET", "/api/client-portal-requests?limit=20")`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/client-portal-requests?limit=20")`.
  3. Assert 200 and a `docs` array (Payload REST envelope).
  4. Assert each item has expected fields (e.g. `title`, `client`, `createdAt`).
- **Expected:** 200 with the collection listing; test fixture request from POR-004
  (if run first) should appear.
- **Env/service deps:** Admin session; local test DB.
- **Triage:** 401 with session → PROD-BUG. 500 → PROD-BUG. Missing fields in shape →
  collection schema change → PROD-BUG.

---

## POR-006 — Client hub value-ledger / forecast API · READ

### POR-006-happy — Fetch value-ledger and forecast-scenario data

- **Entry point:**
  `GET /api/client-hub/zz-test-client/value-ledger` and
  `GET /api/client-hub/zz-test-client/forecast-scenarios`
  (PIN-gated or admin session; try admin session first).
- **Inputs:** `loginAdmin()` + two `authedFetch` calls.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/client-hub/zz-test-client/value-ledger")`.
  3. Assert 200; response is an array or `{ items: [...] }` shape (may be empty for
     the test fixture).
  4. `authedFetch("GET", "/api/client-hub/zz-test-client/forecast-scenarios")`.
  5. Assert 200; response is an array or `{ scenarios: [...] }` shape (may be empty).
  6. Assert neither call returns 500.
- **Expected:** Both endpoints return 200 with structured data (empty arrays are fine
  for a fresh fixture). No crash.
- **Env/service deps:** Admin session; local test DB; `ClientValueLedgerItems` and
  `ForecastScenarios` collections. No external services.
- **Triage:** 500 on either endpoint → PROD-BUG. Unexpected shape → PROD-BUG.

---

## POR-007 — Google dashboard page · READ

### POR-007-happy — Render dashboard with correct PIN

- **Entry point:** `GET http://localhost:3004/google-dashboard/zz-test-client`
  (public route, PIN-gated via `DashboardGate`).
- **Inputs:** Client slug `zz-test-client`; PIN `4729`.
- **Steps:**
  1. Open `/google-dashboard/zz-test-client` in Playwright (no admin session).
  2. Assert PIN gate (`DashboardGate`) renders with a PIN input.
  3. Enter PIN `4729` — triggers `POST /api/dashboard/verify`.
  4. Assert the dashboard renders: `DashboardWelcome` or performance charts/sections
     visible. GA4 section may show "not connected" — this is expected (DEV-CONFIG).
  5. Also open `/google-dashboard/zz-test-client/simple` — assert a simplified
     dashboard view renders without crash.
- **Expected:** Both full and simple dashboard routes render after correct PIN. "Not
  connected" for GA4 is expected and is not a failure.
- **Env/service deps:** Local test DB. Growth Tools live (EXTERNAL-SAFE for data reads
  once unlocked); GA4 disconnected on test client → "not connected" is expected
  (DEV-CONFIG).
- **Triage:** Correct PIN rejected → PROD-BUG. Crash after unlock → PROD-BUG.
  GA4 "not connected" or empty data → DEV-CONFIG (expected). Growth Tools data absent
  while wired → UNKNOWN.

### POR-007-edge — Wrong PIN blocked on dashboard gate

- **Entry point:** `/google-dashboard/zz-test-client` (no session).
- **Inputs:** PIN `1234` (wrong).
- **Steps:**
  1. Open `/google-dashboard/zz-test-client`.
  2. Enter PIN `1234`.
  3. Assert gate remains locked; error message displayed.
  4. Submit three more wrong PINs in quick succession.
  5. Assert rate-limit (429) triggers on the `/api/dashboard/verify` endpoint.
- **Expected:** Wrong PIN does not unlock dashboard. Rate-limit 429 after threshold.
  Dashboard content never exposed.
- **Env/service deps:** Local test DB; `PinRateLimits`.
- **Triage:** Wrong PIN unlocks → PROD-BUG (security). No rate-limit → PROD-BUG.

---

## POR-008 — Dashboard data APIs · EXTERNAL-SAFE

### POR-008-happy — Fetch dashboard data for connected account

- **Entry point:** `GET /api/dashboard/data?slug=zz-test-client` (PIN-authenticated;
  obtain token via `POST /api/dashboard/verify`).
- **Inputs:** PIN `4729`; slug `zz-test-client`; Ads customer ID `6591013898`.
- **Steps:**
  1. `POST /api/dashboard/verify` with `{ slug: "zz-test-client", pin: "4729" }` and
     capture any auth cookie/token returned.
  2. `GET /api/dashboard/data?slug=zz-test-client` with the auth cookie from step 1.
  3. Assert 200. Assert response contains recognised keys (e.g. `adPerformance`,
     `keywordSelections`, or equivalent). GA4 section should indicate "not connected"
     (test client has GA4 disconnected) — this is expected **DEV-CONFIG**, not a bug.
  4. `GET /api/dashboard/keyword-selections?slug=zz-test-client` — assert 200.
  5. `GET /api/dashboard/quality-scores?slug=zz-test-client` — assert 200.
- **Expected:** All three data endpoints return 200. Growth Tools Ads data may be
  present (whitelisted account `659-101-3898`). GA4 shows "not connected" —
  **this is expected DEV-CONFIG, not a failure**.
- **Env/service deps:** Local test DB; **Growth Tools** (`GROWTH_TOOLS_URL`, live prod);
  GA4 (disconnected — "not connected" expected).
- **Triage:** 500 on any endpoint with valid PIN → PROD-BUG. Growth Tools 5xx →
  UNKNOWN. GA4 "not connected" response → DEV-CONFIG (expected). Missing Growth
  Tools data while service is wired → UNKNOWN.

### POR-008-edge — Dashboard verify with wrong PIN rate-limited

- **Entry point:** `POST /api/dashboard/verify`.
- **Inputs:** `{ slug: "zz-test-client", pin: "0000" }` repeated.
- **Steps:**
  1. POST five times with wrong PIN `0000`.
  2. Assert first response is a rejection (`ok: false` or 401).
  3. Assert 429 is returned after the threshold.
- **Expected:** Wrong PIN consistently rejected; 429 after threshold.
- **Env/service deps:** Local test DB; `PinRateLimits`.
- **Triage:** Wrong PIN accepted → PROD-BUG (security). No rate-limit → PROD-BUG.

---

## POR-009 — Account structure (client) page · EXTERNAL-SAFE

### POR-009-happy — Render account structure for test client

- **Entry point:** `GET http://localhost:3004/client/zz-test-client/google-ads/account-structure`
  (PIN or API-key gated public route).
- **Inputs:** Client slug `zz-test-client`; PIN `4729`; Ads customer ID `6591013898`.
- **Steps:**
  1. Open the URL in Playwright.
  2. If PIN-gated, enter `4729`.
  3. Assert the page renders the account structure — campaigns, ad groups, or a
     "loading" state followed by data from Growth Tools.
  4. Assert no 500 crash. If Growth Tools data is unavailable, the page should show a
     graceful empty/error state.
- **Expected:** Page renders account structure data from Growth Tools for the
  whitelisted account `659-101-3898`. Graceful handling if the data query fails.
- **Env/service deps:** Local test DB; **Growth Tools** (live prod, EXTERNAL-SAFE
  read). PIN `4729` or API-key gate (check route implementation).
- **Triage:** Page crash → PROD-BUG. Growth Tools data absent while service is wired
  → UNKNOWN. Auth gate broken (access without PIN) → PROD-BUG (security).

---

## POR-010 — Discovery briefing pages · CMS-WRITE

### POR-010-happy — Load and autosave a discovery answer (client route)

- **Entry point:** `/client/zz-test-client/discovery/<briefingId>` (PIN-gated public
  route). Obtain `briefingId` for `zz-test-client` via
  `GET /api/client-discovery-briefings/by-scope?scope=client&id=<zz-id>` with admin
  session first.
- **Inputs:** Client slug `zz-test-client`; PIN `4729`; a valid `briefingId` linked
  to the test client.
- **Steps:**
  1. `loginAdmin()` + `authedFetch("GET", "/api/client-discovery-briefings/by-scope?scope=client&id=<zz-id>")`.
     Record the returned `id` as `<briefingId>`.
  2. Open `/client/zz-test-client/discovery/<briefingId>` in Playwright (no admin
     session).
  3. The `DiscoveryPinGate` renders — enter PIN `4729`.
  4. Assert the discovery briefing form (`DiscoveryBriefingForm`) loads with its
     question sections.
  5. Edit one field (e.g. a short-text answer); wait for the autosave debounce.
  6. Reload the page, re-enter PIN `4729`.
  7. Assert the edited answer is still present (persisted to CMS/Blob).
  8. Revert the field to its original value (or blank it); autosave again. Log the
     briefing id to teardown manifest.
- **Expected:** PIN gate unlocks. Form renders. Answer autosaves and survives reload.
  Vercel Blob write succeeds (if the panel saves to Blob).
- **Env/service deps:** Local test DB; **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`);
  PIN `4729`; `PinRateLimits`.
- **Triage:** PIN gate non-functional → PROD-BUG. Autosave failure → check Blob token
  → PROD-BUG if `BLOB_READ_WRITE_TOKEN` is wired. Blob token missing → DEV-CONFIG.

### POR-010-edge — Wrong PIN blocks discovery form

- **Entry point:** `/client/zz-test-client/discovery/<briefingId>`.
- **Inputs:** PIN `8888` (wrong).
- **Steps:**
  1. Open the discovery URL.
  2. Enter PIN `8888`.
  3. Assert form stays locked; error displayed.
  4. Repeat three times; assert rate-limit 429 triggers.
- **Expected:** Wrong PIN denied. Rate-limit 429 after threshold. Form content never
  exposed.
- **Env/service deps:** Local test DB; `PinRateLimits`.
- **Triage:** Wrong PIN unlocks form → PROD-BUG (security).

---

## POR-011 — Mockup previewer page · READ

### POR-011-happy — Render a mockup page

- **Entry point:** `/mockup/zz-test-client` (public route — no PIN, serves a Blob
  asset).
- **Inputs:** A mockup must have been uploaded for `zz-test-client` via
  `POST /api/mockup-upload` (admin, POR-012) — upload a placeholder PNG first if not
  already present.
- **Steps:**
  1. `loginAdmin()`.
  2. Upload a small test PNG: `authedFetch("POST", "/api/mockup-upload", { slug: "zz-test-client", file: <test.png blob> })`.
     Assert 200 / `{ url }` returned.
  3. Open `/mockup/zz-test-client` in Playwright.
  4. Assert the page renders an image (the uploaded mockup) without crash.
  5. Assert the image src points to a Vercel Blob URL.
- **Expected:** Mockup page renders the uploaded PNG from Blob. No crash, 404, or
  broken image.
- **Env/service deps:** **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`); local test DB.
- **Triage:** Upload 500 → check Blob token → PROD-BUG if wired. Page 404 → slug
  resolution broken → PROD-BUG. Blob token missing → DEV-CONFIG.

---

## POR-012 — Mockup serve / upload API · CMS-WRITE

### POR-012-happy — Upload then serve a mockup via API

- **Entry point:** `POST /api/mockup-upload` (admin) + `GET /api/mockup-serve?slug=zz-test-client`.
- **Inputs:**
  - Upload: `{ slug: "zz-test-client" }` + a small test PNG file (multipart or base64
    depending on implementation).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("POST", "/api/mockup-upload", { slug: "zz-test-client", … })`.
  3. Assert 200; response contains a Blob URL or `{ url: "https://…blob.vercel-storage.com/…" }`.
  4. `authedFetch("GET", "/api/mockup-serve?slug=zz-test-client")`.
  5. Assert 200 or a redirect (3xx) to the Blob URL; asset is accessible.
- **Expected:** Upload succeeds; serve returns or redirects to the correct Blob asset.
- **Env/service deps:** Admin session; **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`);
  local test DB.
- **Triage:** Upload 500 → check Blob token → PROD-BUG if wired. Serve 404 after
  upload → key/slug mismatch → PROD-BUG. Blob token absent → DEV-CONFIG.

---

## POR-013 — Contractor portal page · CMS-WRITE

### POR-013-happy — Load contractor portal with valid token

- **Entry point:** `/contractor/<token>` (public, token-gated).
  Obtain a token by inspecting the `Contractors` collection in admin for a test record
  (or create a throwaway contractor with a token via Payload admin first).
- **Inputs:** A valid contractor token from the `Contractors` collection in the local
  test DB. If none exists, create a throwaway contractor via
  `POST /api/contractors` (admin) with `{ name: "ZZ Test Contractor", token: "zz-test-token-portal" }`.
- **Steps:**
  1. `loginAdmin()`.
  2. Create or locate a contractor: `authedFetch("POST", "/api/contractors", { name: "ZZ Test Contractor", token: "zz-test-token-portal" })`.
     Log id to teardown manifest.
  3. Open `/contractor/zz-test-token-portal` in Playwright (no admin session).
  4. Assert `ContractorPortal` renders: shows contractor name, time-entry submission
     form.
  5. Submit a time entry (hours, description) via the form.
  6. Assert submission succeeds (200/201 from `POST /api/contractor/zz-test-token-portal`).
  7. Verify the entry appears on reload.
- **Expected:** Portal renders for a valid token. Time entry submits and persists.
- **Env/service deps:** Local test DB; `Contractors` and `ContractorTimeEntries`
  collections. No external services.
- **Triage:** Invalid token → 404 expected. Valid token → 500 → PROD-BUG. Submission
  not persisted → PROD-BUG. Log time entry id to teardown manifest.

### POR-013-edge — Invalid token returns 404

- **Entry point:** `/contractor/zz-nonexistent-token-xyz`.
- **Steps:**
  1. Open `/contractor/zz-nonexistent-token-xyz` in Playwright.
  2. Assert a 404 page renders (or a "not found" / "invalid token" message).
- **Expected:** 404 / "not found" — no portal content exposed.
- **Triage:** Portal renders for a nonexistent token → PROD-BUG (security).

---

## POR-014 — Contracts collection · READ

> ⛔ **CONTRACT SEND/SIGN FLOW IS OUT OF SCOPE — do not exercise.**
> Per Safety Interlock §4: no contract signing, sending, or DANGER-class contract
> mutations may be performed. This scenario covers READ-only admin inspection only.

### POR-014-happy — Admin list contracts collection (READ only)

- **Entry point:** `GET /api/contracts` (Payload REST, admin session) or
  `/admin/collections/contracts` (browser).
- **Inputs:** `loginAdmin()` + `authedFetch("GET", "/api/contracts?limit=5")`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/contracts?limit=5")`.
  3. Assert 200 and a `docs` array.
  4. Assert each item has expected fields (e.g. `id`, `status`, `client`,
     `signingToken`).
  5. Do **NOT** attempt to sign, send, duplicate, trash, or mutate any contract.
- **Expected:** 200 with a listing of contracts. READ-only pass.
- **Env/service deps:** Admin session; local test DB.
- **Triage:** 401 with session → PROD-BUG. 500 → PROD-BUG.

---

## POR-015 — Contract preview / download API · READ

> ⛔ **CONTRACT SEND/SIGN FLOW IS OUT OF SCOPE — do not exercise.**
> These preview/download endpoints are READ-only and do not trigger emails or
> signing flows; they are safe to test in isolation. **Do not exercise**
> `/send-to-client`, `/send-email`, `/sign/[token]` (POR-018, POR-019).

### POR-015-happy — Preview-PDF and download for an existing contract

- **Entry point:** `GET /api/contracts/<id>/preview-pdf` and
  `GET /api/contracts/<id>/download-pdf` (admin session).
  Use the first contract id returned by the POR-014 listing (or any known contract id
  from the local test DB snapshot).
- **Inputs:** Admin session; a contract `id` from the local test DB.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/contracts?limit=1")` → capture `docs[0].id` as `<id>`.
  3. `authedFetch("GET", "/api/contracts/<id>/preview-pdf")`.
  4. Assert 200 with `Content-Type: application/pdf` (or a redirect to a Blob PDF URL).
  5. `authedFetch("GET", "/api/contracts/<id>/download-pdf")`.
  6. Assert 200 / redirect; response is a downloadable PDF.
  7. `authedFetch("GET", "/api/contracts/<id>/download-docx")`.
  8. Assert 200 / redirect; response is a downloadable DOCX.
  9. Do **NOT** call `/send-to-client`, `/agency-sign`, or `/sign/[token]`.
- **Expected:** PDF and DOCX download/preview endpoints return the contract document
  without errors.
- **Env/service deps:** Admin session; local test DB. No external services for document
  rendering.
- **Triage:** 404 (no contract in test DB) → ensure the local DB snapshot has at least
  one contract → DEV-CONFIG. 500 on render → PROD-BUG.

---

## POR-016 — Contract lifecycle API · SKIPPED

> ⛔ **OUT OF SCOPE — contract flow (Safety Interlock §4).**
>
> POR-016 covers duplicate/trash/restore/purge of contracts plus email-triggered
> lifecycle changes. Per the Safety Interlock §4: **"NO contract testing at all."**
> This scenario is intentionally **not implemented**. No executable steps are
> provided. If regression coverage of the contract lifecycle is needed in future,
> revisit after explicit user opt-in.

---

## POR-017 — Agency sign API · SKIPPED

> ⛔ **OUT OF SCOPE — contract flow (Safety Interlock §4).**
>
> POR-017 exercises the agency's own signature step on a contract. Per the Safety
> Interlock §4: **"NO contract testing at all."** This scenario is intentionally
> **not implemented**.

---

## POR-018 — Send contract API · SKIPPED (DANGER)

> ⛔ **OUT OF SCOPE — contract flow (Safety Interlock §4) + DANGER class.**
>
> POR-018 sends a contract to the client by email. This is:
> - **DANGER** (irreversible client-visible email send).
> - Explicitly prohibited by Safety Interlock §4: **"NO contract testing at all."**
>
> **Live email/calendar write is harness-blocked; scenario must NOT call
> send/confirm.** This scenario is intentionally **not implemented**.

---

## POR-019 — Contract sign page (token) · SKIPPED (DANGER)

> ⛔ **OUT OF SCOPE — contract flow (Safety Interlock §4) + DANGER class.**
>
> POR-019 exercises the token-gated client signing page (`/contracts/sign/[token]`)
> which captures a signature and triggers email + Blob writes. This is:
> - **DANGER** (irreversible client-visible signature + email).
> - Explicitly prohibited by Safety Interlock §4: **"NO contract testing at all."**
>
> **Live email/calendar write is harness-blocked; scenario must NOT call
> send/confirm.** This scenario is intentionally **not implemented**.

---

## POR-020 — Contract reminders cron API · SKIPPED (DANGER)

> ⛔ **OUT OF SCOPE — contract flow (Safety Interlock §4) + DANGER class.**
>
> POR-020 is the cron job that sends contract signing reminders by email. This is:
> - **DANGER** (client-visible reminder email send).
> - Explicitly prohibited by Safety Interlock §4: **"NO contract testing at all."**
>
> **Live email/calendar write is harness-blocked; scenario must NOT call
> send/confirm.** This scenario is intentionally **not implemented**.
>
> For reference: the route is `GET /api/contract-reminders/tick` and requires a
> `CRON_SECRET` bearer header. Without `CRON_SECRET`, it returns 401 — that
> behaviour is expected and does not need to be tested.

---

## POR-021 — Meeting schedulers collection · READ

### POR-021-happy — Admin list meeting schedulers

- **Entry point:** `GET /api/meeting-schedulers` (Payload REST, admin session) or
  `/admin/collections/meeting-schedulers` (browser).
- **Inputs:** `loginAdmin()` + `authedFetch("GET", "/api/meeting-schedulers?limit=10")`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/meeting-schedulers?limit=10")`.
  3. Assert 200 and a `docs` array (may be empty in the test DB snapshot).
  4. Assert each item (if present) has expected fields: `id`, `title`, `availability`,
     `attendees`.
  5. Open `/admin/collections/meeting-schedulers` in Playwright (admin session).
  6. Assert the collection list renders without crash.
- **Expected:** Collection list accessible to admin; shape correct; no 500.
- **Env/service deps:** Admin session; local test DB.
- **Triage:** 401 with session → PROD-BUG. 500 → PROD-BUG. Empty list in test DB →
  expected (no fixtures for schedulers) → not a failure.

---

## POR-022 — Generate slots API · CMS-WRITE

### POR-022-happy — Generate booking slots for a scheduler

- **Entry point:** `POST /api/meeting-schedulers/<id>/generate-slots`.
- **Inputs:**
  - Create a throwaway scheduler via `POST /api/meeting-schedulers` with minimal
    config: `{ title: "ZZ Test Scheduler", availability: [...], duration: 30 }`.
  - Log its id to teardown manifest.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("POST", "/api/meeting-schedulers", { title: "ZZ Test Scheduler", duration: 30, availability: [{ day: "Monday", startTime: "09:00", endTime: "17:00" }] })`.
     Assert 200/201; capture `id`.
     Log `{ collection: "meeting-schedulers", id, op: "create" }` to teardown manifest.
  3. `authedFetch("POST", "/api/meeting-schedulers/<id>/generate-slots", {})`.
  4. Assert 200; response contains an array of generated slot objects (date/time pairs)
     or a `slots` key.
  5. Assert the `MeetingSchedulers` record is updated with the generated slots.
- **Expected:** Generate-slots writes slot records to the CMS. Response is structured
  slot array. No email is sent (no invites triggered here).
- **Env/service deps:** Admin session; local test DB. No external services for slot
  generation itself.
- **Triage:** 422 from bad payload → PROD-BUG. 500 → PROD-BUG. Slots not persisted to
  record → PROD-BUG.

---

## POR-023 — Send invites API · SKIPPED (DANGER)

> ⛔ **DANGER — Live email send (harness-blocked).**
>
> POR-023 (`POST /api/meeting-schedulers/[id]/send-invites`) sends meeting invites
> to attendees by email. This is a **DANGER** class action.
>
> **Live email/calendar write is harness-blocked; scenario must NOT call
> send/confirm.** This scenario is intentionally **not executed as a live send**.
>
> If you need to validate the route exists: assert `POST /api/meeting-schedulers/<id>/send-invites`
> with a **missing** or **invalid** scheduler id returns a 404/400 (safe boundary
> check), and verify the harness intercepts and blocks any email transport call before
> it reaches the network.

---

## POR-024 — Confirm meeting API · SKIPPED (DANGER)

> ⛔ **DANGER — Google Calendar event creation + live email (harness-blocked).**
>
> POR-024 (`POST /api/meeting-schedulers/[id]/confirm`) creates a Google Calendar
> event and sends confirmation emails. This is a **DANGER** class action touching
> two blocked channels.
>
> **Live email/calendar write is harness-blocked; scenario must NOT call
> send/confirm.** This scenario is intentionally **not executed**.
>
> Calendar event creation is blocked at the harness level (see `CalendarAuth` in
> `docs/test-runs/README.md`). If you need to assert the guard: call the endpoint
> with an invalid token and assert 400/404 before any calendar/email write is
> attempted.

---

## POR-025 — Schedule respond page (token) · CMS-WRITE

### POR-025-happy — Invitee selects a slot via token

- **Entry point:** `/schedule/<token>` (public, token-gated via
  `ScheduleResponseClient`); backend at `GET/POST /api/meeting-schedulers/respond/<token>`.
  Obtain a token by creating a scheduler in POR-022 and accessing its token field, or
  use a token from any existing `MeetingSchedulers` record in the local test DB.
- **Inputs:** A valid scheduler token from the local test DB (or from the throwaway
  created in POR-022 if that scenario ran first).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/meeting-schedulers?limit=10")` — find a scheduler with
     a `respondToken` (or generate one). If none, create one per POR-022 and obtain
     its token.
  3. `GET /api/meeting-schedulers/respond/<token>` (no admin session — public) and
     assert 200; response contains available slots.
  4. Open `/schedule/<token>` in Playwright (no admin session).
  5. Assert `ScheduleResponseClient` renders the slot picker.
  6. Select an available slot and submit.
  7. Assert the `POST /api/meeting-schedulers/respond/<token>` returns 200/201 and
     the selection is persisted (scheduler record updated, no calendar event or email
     yet — those are POR-024 DANGER).
  8. Reload and assert the chosen slot is reflected.
- **Expected:** Token-gated response page renders available slots. Invitee can select
  and submit a slot; CMS write succeeds. No email or calendar event is triggered at
  this stage (those require POR-024 confirm which is harness-blocked).
- **Env/service deps:** Local test DB; `MeetingSchedulers` collection. **Email dep —
  harness-blocked** if the respond route sends a notification.
- **Triage:** Token not found → 404 expected. Valid token → page crash → PROD-BUG.
  Slot selection not persisted → PROD-BUG. Email unblocked → harness failure.

### POR-025-edge — Invalid token returns 404

- **Entry point:** `/schedule/zz-invalid-token-xyz` (no session).
- **Steps:**
  1. Open `/schedule/zz-invalid-token-xyz` in Playwright.
  2. Assert a 404 or "invalid/not found" message.
  3. `GET /api/meeting-schedulers/respond/zz-invalid-token-xyz` — assert 404.
- **Expected:** Invalid token → 404. No content exposed.
- **Triage:** Valid content shown for invalid token → PROD-BUG (security).

---

## POR-026 — PIN rate limits collection · READ

### POR-026-happy — Rate-limit records created after failed PIN attempts

- **Entry point:** `GET /api/pin-rate-limits` (Payload REST, admin session) — or
  indirectly: inspect `PinRateLimits` after triggering failed PINs in POR-003-edge or
  POR-007-edge.
- **Inputs:** Run POR-003-edge first (sends 5 wrong PINs to `/api/client-hub/verify`)
  to populate the table.
- **Steps:**
  1. Run the wrong-PIN steps from POR-003-edge (at least 3 wrong PIN submissions to
     `/api/client-hub/verify` for slug `zz-test-client`).
  2. `loginAdmin()`.
  3. `authedFetch("GET", "/api/pin-rate-limits?limit=20")` (Payload REST; collection
     name may vary — check `src/collections/PinRateLimits.ts` for the exact slug).
  4. Assert 200 and `docs` array.
  5. Assert at least one record exists for `zz-test-client` or its IP, showing
     `attemptCount ≥ 3` (or equivalent fields).
  6. Assert the record has a `lockedUntil` or `expiresAt` timestamp in the future
     after the lockout threshold is reached.
- **Expected:** `PinRateLimits` collection has a row tracking failed PIN attempts for
  the test slug. After threshold, `lockedUntil`/`expiresAt` is set.
- **Env/service deps:** Admin session; local test DB; `PinRateLimits` collection.
- **Triage:** No records created after wrong PINs → rate-limit not persisting → PROD-BUG.
  `attemptCount` not incrementing → PROD-BUG. 404 on the collection endpoint → verify
  exact collection slug in code → PROD-BUG.

### POR-026-edge — Lockout expires and PIN works again

- **Entry point:** `POST /api/client-hub/verify`.
- **Steps:**
  1. Manually expire or delete the `PinRateLimits` record for `zz-test-client` in the
     local test DB via `authedFetch("DELETE", "/api/pin-rate-limits/<id>")` (or direct
     SQLite delete: `DELETE FROM pin_rate_limits WHERE slug = 'zz-test-client';`).
  2. `POST /api/client-hub/verify` with correct PIN `4729`.
  3. Assert 200 `{ ok: true }` — lockout cleared, correct PIN accepted.
- **Expected:** Once the rate-limit record is removed/expired, correct PIN works again.
- **Triage:** Correct PIN still rejected after manual clear → rate-limit logic reading
  stale cache → PROD-BUG.

---

## POR-027 — Public PIN gates · READ

### POR-027-happy — AuditPasswordGate unlocks with correct PIN

- **Entry point:** A PIN-gated audit URL, e.g. `/audits/<reportSlug>` using a slug
  from the `SeoAudits` collection in the local test DB (find via
  `GET /api/seo-audits?limit=1&where[reportSlug][exists]=true`).
- **Inputs:** The `reportSlug` and its associated PIN (from the linked client or
  proposal — use `zz-test-client` PIN `4729` or `zz-test-proposal` PIN `5836` if a
  matching audit exists).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/seo-audits?limit=1&where[reportSlug][exists]=true")` —
     capture `docs[0].reportSlug` and the linked client/proposal slug.
  3. Open `/audits/<reportSlug>` in Playwright (no admin session).
  4. Assert `AuditPasswordGate` renders — a PIN input form is visible; `PinGateLogo`
     is present.
  5. Enter the correct PIN for the linked client/proposal.
  6. Assert gate calls `POST /api/audit-auth` with `{ slug: <reportSlug>, password: <pin> }`.
  7. Assert the audit report renders after correct PIN.
- **Expected:** All PIN gate components (`AuditPasswordGate`, `DiscoveryPinGate`,
  `NegativeKeywordPinGate`, `AdCopyPinGate`) render and unlock on correct PIN via
  `/api/audit-auth`. `PinGateLogo` is shown. Report content visible after unlock.
- **Env/service deps:** Local test DB; `PinRateLimits` collection; `SeoAudits` with
  at least one `reportSlug` in the snapshot DB.
- **Triage:** Gate does not render → PROD-BUG. Correct PIN rejected via `audit-auth`
  → PROD-BUG. Gate unlocks without PIN → PROD-BUG (security).

### POR-027-edge — Wrong PIN on AuditPasswordGate + lockout

- **Entry point:** `/audits/<reportSlug>` as above.
- **Inputs:** PIN `0000` (wrong), repeated.
- **Steps:**
  1. Open `/audits/<reportSlug>` in Playwright.
  2. Enter PIN `0000` five times.
  3. First attempt: `POST /api/audit-auth` returns `{ ok: false }` or 401.
  4. Fifth attempt: assert 429 (rate-limited lockout).
  5. Assert audit content is never rendered.
- **Expected:** Wrong PIN denied consistently. 429 after threshold. Audit content
  never exposed.
- **Env/service deps:** Local test DB; `PinRateLimits`; `/api/audit-auth`.
- **Triage:** Wrong PIN unlocks → PROD-BUG (critical security). No 429 → PROD-BUG.
  Rate-limit threshold fire too early (< 3 attempts) → check config → UNKNOWN.

### POR-027-edge — NegativeKeywordPinGate unlocks correctly

- **Entry point:** `/[clientSlug]/negative-keywords/[listSlug]` for a known NKL in
  the local DB. Find via `GET /api/negative-keyword-lists?limit=1` (admin session).
- **Inputs:** Client slug and NKL slug from the DB; client PIN `4729` if the list
  belongs to `zz-test-client`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("GET", "/api/negative-keyword-lists?limit=1")` — get `clientSlug`
     and `listSlug`.
  3. Open `/zz-test-client/negative-keywords/<listSlug>` (or the resolved slug) in
     Playwright without session.
  4. Assert `NegativeKeywordPinGate` renders.
  5. Enter the correct PIN (`4729` if `zz-test-client`).
  6. Assert the NKL view renders with keyword list.
- **Expected:** `NegativeKeywordPinGate` renders and unlocks on correct PIN. NKL
  content visible.
- **Triage:** Gate missing → PROD-BUG. Wrong PIN unlocks → PROD-BUG (security).
  NKL not found in test DB → find any suitable record → not a failure if DB is sparse.
