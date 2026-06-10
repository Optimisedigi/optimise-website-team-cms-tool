# Test Scenarios — Platform / infra (`INF`)

Standalone scenarios keyed to FEAT-IDs `INF-001`…`INF-029` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the
binding DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin
scenarios use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads `6591013898`), proposal
`zz-test-proposal` (PIN `5836`).

> ⚠️ **HIGHEST-RISK ROUTE IN THIS FILE — INF-027 (goal-agent scheduler cron)**
> The `/api/goal-agents/cron` endpoint drives the goal-agent state machine.
> When a goal-run reaches the `executing` state it **pushes live Google Ads
> changes with NO approval gate for green-tier runs.** The scenario for INF-027
> therefore asserts the auth gate only (401 without `CRON_SECRET`) and **must
> never trigger a real tick against due goal-runs.** Full goal-agent runtime
> validation is owned by the gated Phase 5b track and is out of scope here.
> See the dedicated safety callout in the INF-027 section below.

---

## INF-001 — Users collection · READ

### INF-001-happy — List users and verify fixture user exists
- **Entry point:** `GET /api/users` (Payload REST) with admin session, or
  `/admin/collections/users` in a browser.
- **Inputs:** admin session only; no body required.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/users?limit=50")`.
  3. Confirm HTTP 200 and that at least one user matches `TEST_ADMIN_EMAIL`.
  4. Inspect that each returned record has `id`, `email`, `role`/`roles`, and
     any `permissionProfile` reference.
- **Expected:** 200 JSON `{ docs: [...] }`; admin user is present; no 500.
- **Env/service deps:** Payload admin session (`TEST_ADMIN_PASSWORD`); local
  test DB. No external services.
- **Triage:** 401 without session is expected. 200 with session + missing admin
  user → PROD-BUG. 500 → PROD-BUG.

### INF-001-edge — Unauthenticated access blocked
- **Entry point:** `GET /api/users` with **no** session cookie.
- **Inputs:** bare `fetch("/api/users")` (no auth).
- **Steps:** 1) Call without session. 2) Assert 401 or redirect to login.
- **Expected:** 401/403 or redirect; no user data leaked.
- **Env/service deps:** local test DB.
- **Triage:** if user list returns without auth → PROD-BUG (security).

---

## INF-002 — First-login setup · CMS-WRITE

### INF-002-happy — First-login flow completes and persists profile
- **Entry point:** `src/components/FirstLoginSetup.tsx` rendered in admin for a
  user whose `hasCompletedSetup` is `false`.
- **Inputs:** create a throwaway user via `POST /api/users` (admin session) with
  `email: "zz-test-first-login@example.com"`, `password: "ZZTestPw!1"`, role
  `user`; do **not** set `hasCompletedSetup`.
- **Steps:**
  1. `loginAdmin()`, create throwaway user, note `id`.
  2. Open `/admin` in a browser session logged in as the new user (or simulate
     via the component test harness).
  3. Fill and submit the first-login form (display name, timezone, etc.).
  4. Assert `hasCompletedSetup: true` on the user record via
     `authedFetch("/api/users/<id>")`.
- **Expected:** form submits; user record updated; on next load the setup flow
  is skipped.
- **Env/service deps:** admin session; local test DB.
- **Triage:** PROD-BUG on submit failure or `hasCompletedSetup` not toggled.
  Log throwaway user id to teardown manifest.

---

## INF-003 — Feature access picker · CMS-WRITE

### INF-003-happy — Assign feature access to a user
- **Entry point:** `src/components/FeatureAccessPicker.tsx` inside a User record
  in admin (`/admin/collections/users/<id>`).
- **Inputs:** open the throwaway user from INF-002 (or any non-admin user);
  toggle on one feature flag (e.g. `accessGoogleAdsHub`); save.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/users/<id>")` — record current feature flags.
  3. `PATCH /api/users/<id>` with updated feature access object.
  4. Re-fetch and assert the flag is persisted.
- **Expected:** 200; the flag appears in the user record on re-read.
- **Env/service deps:** admin session; local test DB.
- **Triage:** PROD-BUG on persist failure. Revert flag after scenario.

### INF-003-edge — Non-admin cannot self-escalate
- **Entry point:** `PATCH /api/users/<own id>` while logged in as a non-admin
  user.
- **Inputs:** attempt to set an elevated feature flag on own record.
- **Expected:** 403 or validation error; flag not persisted.
- **Triage:** self-escalation succeeds → PROD-BUG (security).

---

## INF-004 — Unlock user API · CMS-WRITE

### INF-004-happy — Unlock a locked user account
- **Entry point:** `POST /api/unlock-user` with `x-api-key: <AUDIT_API_KEY>`.
- **Inputs:** `{ email: "zz-test-first-login@example.com" }` (the throwaway user
  from INF-002, manually locked via admin or repeated bad-password calls).
- **Steps:**
  1. Simulate a locked account: either use Payload admin to set `lockUntil` on
     the throwaway user, or call the login endpoint with wrong passwords until
     locked.
  2. `fetch("/api/unlock-user", { method:"POST", headers:{ "x-api-key":
     process.env.AUDIT_API_KEY }, body: JSON.stringify({ email }) })`.
  3. Assert 200 and that `lockUntil` is cleared on the user record.
  4. Attempt login with correct credentials — must succeed.
- **Expected:** 200 `{ ok: true }`; account unlocked; any email notification is
  **harness-blocked** (Brevo live but intercepted — not a failure).
- **Env/service deps:** `AUDIT_API_KEY`; local test DB; Brevo (`BREVO_API_KEY`)
  — send harness-blocked.
- **Triage:** 401 without key is expected (see edge below). With valid key and
  a locked user, 500/failure → PROD-BUG.

### INF-004-edge — Missing API key returns 401
- **Entry point:** `POST /api/unlock-user` with **no** `x-api-key` header.
- **Inputs:** same body, key omitted.
- **Expected:** 401; account not unlocked.
- **Triage:** 200 without key → PROD-BUG (security).

---

## INF-005 — Managers list API · READ

### INF-005-happy — Retrieve assignable managers
- **Entry point:** `GET /api/users/managers` (admin session).
- **Inputs:** admin session only.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/users/managers")`.
  3. Assert 200 and that the array contains at least the admin user with `id`
     and `email` fields.
- **Expected:** 200 JSON array; each item has at minimum `id` and `email`; the
  admin test user is present.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 401 without session is expected. 500 with valid session → PROD-BUG.

---

## INF-006 — API key access collection · READ

### INF-006-happy — List API key access records in admin
- **Entry point:** `GET /api/api-key-access` (Payload REST, admin session), or
  `/admin/collections/api-key-access` in browser.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/api-key-access?limit=20")`.
  3. Assert 200; confirm at least one record exists (the key used by INF-004 etc).
  4. Confirm each record has `name` / `key` (hashed or present) fields.
- **Expected:** 200 `{ docs: [...] }` with one or more key-access records.
- **Env/service deps:** admin session; local test DB.
- **Triage:** PROD-BUG on 500 or empty response when records should exist.

---

## INF-007 — Notifications collection · READ

### INF-007-happy — Notifications records accessible in admin
- **Entry point:** `GET /api/notifications` (admin session), or
  `/admin/collections/notifications`.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/notifications?limit=20")`.
  3. Assert 200; confirm shape includes `id`, `message`, `read`, `createdAt`.
- **Expected:** 200 with zero-or-more notification records (empty is fine for a
  fresh test DB); no 500.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## INF-008 — Notifications bell · READ

### INF-008-happy — Bell widget renders and shows unread count
- **Entry point:** `src/components/NotificationsBell.tsx` in the admin
  nav — visible at `/admin` (any page).
- **Inputs:** admin session; one seeded unread notification (create via
  `POST /api/notifications` if the collection allows direct admin write).
- **Steps:**
  1. `loginAdmin()`, open `/admin` in browser screenshot.
  2. `authedFetch("/api/notifications/unread-count")` — assert 200 `{ count: N }`.
  3. Confirm the bell icon renders; if `count > 0`, assert the badge/number is
     visible in the DOM.
- **Expected:** `unread-count` returns 200 with a numeric `count`; bell renders
  without crash.
- **Env/service deps:** admin session; local test DB.
- **Triage:** PROD-BUG on render crash or 500 from unread-count.

---

## INF-009 — Notifications APIs · CMS-WRITE

### INF-009-happy — List, mark-read, mark-all-read
- **Entry point:**
  - `GET /api/notifications` — list.
  - `GET /api/notifications/unread-count` — count.
  - `POST /api/notifications/<id>/mark-read` — mark one.
  - `POST /api/notifications/mark-all-read` — mark all.
- **Inputs:** admin session; a seeded unread notification (create one via admin
  collection if needed; note id for teardown).
- **Steps:**
  1. `authedFetch("/api/notifications")` — note an unread id.
  2. `authedFetch("/api/notifications/unread-count")` — record baseline count N.
  3. `authedFetch("/api/notifications/<id>/mark-read", {method:"POST"})` — assert
     200.
  4. `authedFetch("/api/notifications/unread-count")` — assert count is N−1.
  5. `authedFetch("/api/notifications/mark-all-read", {method:"POST"})` — assert
     200.
  6. `authedFetch("/api/notifications/unread-count")` — assert 0.
- **Expected:** all endpoints return 200; count decrements correctly.
- **Env/service deps:** admin session; local test DB.
- **Triage:** PROD-BUG on any 500 or incorrect count.

### INF-009-edge — Mark-read on non-existent id returns 404
- **Inputs:** `POST /api/notifications/999999/mark-read`.
- **Expected:** 404 or a structured error; no crash/500.
- **Triage:** unhandled 500 → PROD-BUG.

---

## INF-010 — Activity log collection · READ

### INF-010-happy — Activity log is queryable
- **Entry point:** `GET /api/activity-log` (Payload REST, admin session), or
  `/admin/collections/activity-log`.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/activity-log?limit=20&sort=-createdAt")`.
  3. Assert 200; confirm each record has `action`, `entity`, `entityId`,
     `userId`, `createdAt`.
- **Expected:** 200 with zero-or-more records; schema fields present.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 → PROD-BUG. Empty log is acceptable for a fresh test DB.

---

## INF-011 — Media collection · CMS-WRITE

### INF-011-happy — Upload a media file via admin
- **Entry point:** `POST /api/media` (Payload REST multipart, admin session), or
  `/admin/collections/media/create`.
- **Inputs:** a small PNG fixture (`test-assets/zz-test-image.png`, ≤ 50 KB); admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. `POST /api/media` with `Content-Type: multipart/form-data`, file field
     `file`.
  3. Assert 201; confirm returned record has `url` (Vercel Blob URL) and `id`.
  4. `GET <url>` — assert 200 (blob accessible).
  5. Log record id to teardown manifest; `DELETE /api/media/<id>` in teardown.
- **Expected:** 201 with a Vercel Blob URL; blob is retrievable.
- **Env/service deps:** admin session; **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`);
  local test DB.
- **Triage:** 500 with `BLOB_READ_WRITE_TOKEN` wired → PROD-BUG. Missing token
  → DEV-CONFIG.

### INF-011-edge — Missing file body returns 400
- **Entry point:** `POST /api/media` with no file attached.
- **Expected:** 400/422 validation error; no record created.
- **Triage:** silent empty record created → PROD-BUG.

---

## INF-012 — Integrations page · READ

### INF-012-happy — Integrations page renders all integration statuses
- **Entry point:** `src/components/IntegrationsPage.tsx` rendered at the admin
  Integrations page.
- **Inputs:** admin session; no body (reads live integration status).
- **Steps:**
  1. `loginAdmin()`, open the Integrations admin page in a browser screenshot.
  2. `authedFetch("/api/integrations/status/growth-tools")` — assert 200.
  3. `authedFetch("/api/integrations/status/google")` — assert 200.
  4. Confirm each card shows a `connected` / `disconnected` / `error` state
     without a render crash.
- **Expected:** 200 from each integration status API; page renders with status
  indicators. Disconnected states (e.g. test-client GSC) are expected and not a
  failure.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`);
  **Google OAuth** (token may be absent in dev → `disconnected` is OK).
- **Triage:** render crash → PROD-BUG. Growth Tools 5xx → UNKNOWN.

---

## INF-013 — Integration status API · READ

### INF-013-happy — Fetch status for a known integration
- **Entry point:** `GET /api/integrations/status/growth-tools` (admin session).
- **Inputs:** integration slug `growth-tools`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/integrations/status/growth-tools")`.
  3. Assert 200 and that the body includes a `status` field (`connected` /
     `error` / `disconnected`).
- **Expected:** 200 with a status object; no 500.
- **Env/service deps:** admin session; Growth Tools (`GROWTH_TOOLS_URL`).
- **Triage:** Growth Tools unreachable → UNKNOWN. Route itself 500 → PROD-BUG.

### INF-013-edge — Unknown integration slug returns graceful error
- **Entry point:** `GET /api/integrations/status/bogus-integration`.
- **Expected:** 404 or `{ status: "unknown" }` — no crash/500.
- **Triage:** unhandled 500 → PROD-BUG.

---

## INF-014 — Gmail OAuth + tools API · EXTERNAL-SAFE

### INF-014-happy — Gmail connect flow initiates redirect
- **Entry point:** `GET /api/gmail/connect` (admin session).
- **Inputs:** admin session; no extra body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gmail/connect", { redirect: "manual" })`.
  3. Assert the response is a redirect (302/307) pointing to `accounts.google.com`
     OAuth URL containing `scope` and `redirect_uri` params.
- **Expected:** redirect to Google OAuth consent URL; no 500.
- **Env/service deps:** admin session; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  (wired in dev).
- **Triage:** missing Google credentials → DEV-CONFIG. Route 500 → PROD-BUG.

### INF-014-edge — Gmail status without token returns disconnected
- **Entry point:** `GET /api/gmail/status` (admin session; no Gmail token stored
  for the test admin user).
- **Expected:** 200 `{ connected: false }` or equivalent disconnected state; no
  crash.
- **Triage:** 500 → PROD-BUG; `connected: true` with no token → PROD-BUG.

---

## INF-015 — Gmail draft API · EXTERNAL-SAFE

### INF-015-happy — Create a Gmail draft (no send)
- **Entry point:** `POST /api/gmail/draft` (admin session, requires Gmail OAuth
  token stored for the admin user).
- **Inputs:**
  ```json
  {
    "to": "zz-test-recipient@example.com",
    "subject": "ZZ Test Draft — INF-015",
    "body": "This is a test draft. Do not send."
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. If Gmail is not connected for the admin user in dev, skip to edge (DEV-CONFIG).
  3. `authedFetch("/api/gmail/draft", { method:"POST", body })`.
  4. Assert 200 with a `draftId` in the response.
  5. **Do NOT send** — draft only. No teardown of the Gmail draft is required
     (Gmail drafts are isolated to the OAuth-connected account).
- **Expected:** 200 with `draftId`; no email delivered.
- **Env/service deps:** admin session; Gmail OAuth token for test user
  (per-user token — may be absent in dev → DEV-CONFIG); `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET`.
- **Triage:** missing Gmail token → DEV-CONFIG. Unexpected 500 with token →
  PROD-BUG.

### INF-015-edge — Draft without Gmail token returns 401/400
- **Entry point:** `POST /api/gmail/draft` when no Gmail token is stored for the
  user.
- **Expected:** 401 or structured error `{ error: "not connected" }`; no crash.
- **Triage:** 500 → PROD-BUG.

---

## INF-016 — Gmail AI reply API · EXTERNAL-SAFE (DEV-CONFIG for OpenAI)

### INF-016-happy — AI reply returns generated draft (requires OpenAI key)
- **Entry point:** `POST /api/gmail/ai-reply` (admin session).
- **Inputs:**
  ```json
  {
    "threadId": "fake-thread-id-INF016",
    "context": "Client asked about monthly report availability."
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/gmail/ai-reply", { method:"POST", body })`.
  3. If `OPENAI_API_KEY` is absent or invalid in dev → assert the route returns
     a clear error (not a crash 500); classify as DEV-CONFIG and stop.
  4. With a valid key, assert 200 with an `reply` / `draft` field in the body.
- **Expected (dev):** because `OPENAI_API_KEY` is not valid in dev, the route
  should return a structured error (e.g. 400/503 with `{ error: "..." }`).
  **This is classified DEV-CONFIG — not a PROD-BUG.**
- **Env/service deps:** admin session; Gmail OAuth token; **`OPENAI_API_KEY`**
  (❌ no valid key in dev → **DEV-CONFIG**).
- **Triage:** 5xx crash (not a structured error) → PROD-BUG. Structured error
  for missing key → DEV-CONFIG.

### INF-016-edge — Missing OpenAI key → structured error, not crash
- **Entry point:** `POST /api/gmail/ai-reply` in dev (no valid OpenAI key).
- **Expected:** 400/503 with `{ error: "..." }` or similar; no unhandled 500
  crash.
- **Triage:** unhandled 500 without a structured error body → PROD-BUG.

---

## INF-017 — Calendar OAuth API · CMS-WRITE

### INF-017-happy — Calendar connect flow initiates redirect
- **Entry point:** `GET /api/calendar/connect` (admin session).
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/calendar/connect", { redirect: "manual" })`.
  3. Assert redirect (302/307) to `accounts.google.com` OAuth URL with Calendar
     scope.
  4. **Do NOT complete the OAuth callback and do NOT create any calendar events.**
- **Expected:** redirect to Google OAuth consent URL; no 500.
- **Env/service deps:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (wired in
  dev); `src/globals/CalendarAuth.ts`.
- **Triage:** missing Google credentials → DEV-CONFIG. Route 500 → PROD-BUG.

### INF-017-edge — Calendar status without token returns disconnected
- **Entry point:** `GET /api/calendar/status` (admin session; no token).
- **Expected:** 200 `{ connected: false }` or equivalent; no crash.
- **Triage:** 500 → PROD-BUG.

---

## INF-018 — Sheets OAuth API · CMS-WRITE

### INF-018-happy — Sheets connect flow initiates redirect
- **Entry point:** `GET /api/sheets/connect` (admin session).
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/sheets/connect", { redirect: "manual" })`.
  3. Assert redirect (302/307) to Google OAuth consent URL with Sheets scope.
  4. **Do NOT complete the callback and do NOT write any sheet data.**
- **Expected:** redirect to Google OAuth consent URL; no 500.
- **Env/service deps:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; `src/globals/SheetsAuth.ts`.
- **Triage:** missing Google credentials → DEV-CONFIG. Route 500 → PROD-BUG.

### INF-018-edge — Sheets status without token returns disconnected
- **Entry point:** `GET /api/sheets/status` (admin session; no token).
- **Expected:** 200 `{ connected: false }` or equivalent; no crash.
- **Triage:** 500 → PROD-BUG.

---

## INF-019 — Deployments dashboard · READ

### INF-019-happy — Deployments dashboard renders recent deploys
- **Entry point:** `GET /api/vercel/deployments` (admin session), and
  `src/components/DeploymentDashboard.tsx` / `InfrastructureTable.tsx` in
  browser.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/vercel/deployments")`.
  3. Assert 200 and that the body is an array of deployment objects each
     containing `uid`, `state`, `url`, `createdAt`.
  4. Open the Deployments admin page (browser screenshot); assert the table
     renders rows without crash.
- **Expected:** 200 with a non-empty deployments array (Vercel prod read); table
  renders.
- **Env/service deps:** admin session; **Vercel API** (`VERCEL_API_TOKEN` or
  similar — read only).
- **Triage:** Vercel API key missing → DEV-CONFIG. Route 500 with key →
  PROD-BUG.

---

## INF-020 — Migration APIs · CMS-WRITE

> ⚠️ These endpoints add tables/columns or mutate the schema. Run **only
> against the local test DB** (`file:./content-voice-test.db`). All migration
> routes are gated by `x-api-key: <AUDIT_API_KEY>`.

### INF-020-happy — Call /api/migrate against local test DB reports success/no-op
- **Entry point:** `POST /api/migrate` with `x-api-key: <AUDIT_API_KEY>`.
- **Inputs:** `{ }` (empty body — route runs its own migration logic); local
  test DB only.
- **Steps:**
  1. Confirm `DATABASE_URI` points to the local test DB (not production).
  2. `fetch("http://localhost:3004/api/migrate", { method:"POST", headers:{
     "x-api-key": process.env.AUDIT_API_KEY } })`.
  3. Assert 200 and that the response body indicates `{ success: true }` or
     `{ status: "no-op" }` (idempotent — re-running should not error).
  4. Optionally verify `/api/schema-migrate` in the same way.
- **Expected:** 200; route reports success or no-op; local DB schema unchanged
  if migrations are already applied (idempotent).
- **Env/service deps:** `AUDIT_API_KEY`; **local test DB only** — never run
  against production.
- **Triage:** 500 on first run (new tables missing) → likely a schema mismatch
  → PROD-BUG. Idempotent re-run 500 → PROD-BUG.

### INF-020-edge — Missing API key returns 401
- **Entry point:** `POST /api/migrate` with **no** `x-api-key` header.
- **Expected:** 401; migration does not run.
- **Triage:** 200 without key → PROD-BUG (security).

---

## INF-021 — Email templates global · READ

### INF-021-happy — Email templates global is readable
- **Entry point:** `GET /api/globals/email-templates` (Payload REST, admin
  session), or `/admin/globals/email-templates`.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/globals/email-templates")`.
  3. Assert 200; confirm the response has a top-level `templates` array (or
     equivalent field) with at least one entry.
- **Expected:** 200 with the global email-templates document; schema valid.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 → PROD-BUG; empty when templates should exist → PROD-BUG.

---

## INF-022 — Cron settings global · READ

### INF-022-happy — Cron settings global is readable
- **Entry point:** `GET /api/globals/cron-settings` (admin session), or
  `/admin/globals/cron-settings`.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/globals/cron-settings")`.
  3. Assert 200; confirm the document contains cron-schedule fields (e.g.
     `siteHealthCron`, `goalAgentCron`, or equivalent).
- **Expected:** 200 with the global cron-settings document; fields readable.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 → PROD-BUG.

---

## INF-023 — Navigation recovery · READ

### INF-023-happy — NavigationRecovery component loads without error
- **Entry point:** `src/components/NavigationRecovery.tsx` /
  `src/components/AdminNavSetup.tsx` — rendered automatically on every admin
  page load.
- **Inputs:** admin session; any admin page (e.g. `/admin`).
- **Steps:**
  1. `loginAdmin()`, open `/admin` in a browser screenshot.
  2. Check browser console for errors related to navigation/RSC mismatch.
  3. Navigate to a second admin page (e.g. `/admin/collections/clients`).
  4. Assert no stale-RSC or missing-skew-protection errors appear.
- **Expected:** navigation works cleanly; no stale RSC error banners; no console
  crash from the navigation-recovery component.
- **Env/service deps:** admin session.
- **Triage:** stale RSC or missing-nav errors → PROD-BUG (may be deploy-specific;
  note Vercel Skew Protection status).

---

## INF-024 — Goal risk tiers collection · READ

### INF-024-happy — List goal risk tier records
- **Entry point:** `GET /api/goal-risk-tiers` (Payload REST, admin session), or
  `/admin/collections/goal-risk-tiers`.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/goal-risk-tiers?limit=10")`.
  3. Assert 200 and that at least one tier record exists with `tier`
     (`green`/`yellow`/`red`/`black`) and numeric threshold fields.
- **Expected:** 200 with tier docs; all four tier names ideally present.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 → PROD-BUG. No records → possible missing seed data
  (DEV-CONFIG).

---

## INF-025 — Goal runs collection · READ

### INF-025-happy — List goal run records
- **Entry point:** `GET /api/goal-runs` (Payload REST, admin session), or
  `/admin/collections/goal-runs`.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/goal-runs?limit=10&sort=-createdAt")`.
  3. Assert 200; confirm shape includes `id`, `status`, `goalId`, `createdAt`
     on each record (zero records acceptable for a fresh test DB).
- **Expected:** 200 with zero-or-more goal-run docs; schema fields present.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 → PROD-BUG.

---

## INF-026 — Goal run snapshots collection · READ

### INF-026-happy — List goal run snapshot records
- **Entry point:** `GET /api/goal-run-snapshots` (Payload REST, admin session),
  or `/admin/collections/goal-run-snapshots`.
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/goal-run-snapshots?limit=10&sort=-createdAt")`.
  3. Assert 200; confirm shape includes `id`, `goalRunId`, `step`,
     `proposedPayload`, `riskTier`, `blockReason` (zero records acceptable).
- **Expected:** 200 with zero-or-more snapshot docs; audit-trail fields present.
- **Env/service deps:** admin session; local test DB.
- **Triage:** 500 → PROD-BUG.

---

## INF-027 — Goal-agent scheduler cron API · DANGER

> 🚨 **HIGHEST-RISK ROUTE — SAFETY INTERLOCK ACTIVE**
>
> `GET /api/goal-agents/cron` drives the goal-agent state machine. When any
> goal-run reaches the `executing` state the cron **pushes live Google Ads
> changes via Growth Tools with NO human-approval gate for green-tier runs.**
>
> **This scenario MUST NOT trigger a real cron tick against due goal-runs.**
> The only permitted test is asserting the authentication gate (401 without
> `CRON_SECRET`). The full goal-agent runtime — including the `executing`
> state, live push logic, and end-to-end green-tier auto-execution — is owned
> by the gated **Phase 5b** track and is explicitly **out of scope here.**
>
> Do not add steps that call this endpoint with a valid `CRON_SECRET` against
> a database that contains real or due goal-runs. If the harness is run against
> any environment with live goal-runs, this scenario must be skipped entirely
> (`harness-blocked`).

### INF-027-happy — Cron endpoint requires CRON_SECRET (auth gate only)
- **Entry point:** `GET /api/goal-agents/cron` — **auth-gate assertion only;
  no real tick.**
- **Inputs:** no `Authorization` header.
- **Steps:**
  1. `fetch("http://localhost:3004/api/goal-agents/cron", { method:"GET" })` —
     **no** `Authorization: Bearer <CRON_SECRET>` header.
  2. Assert HTTP **401**.
  3. Confirm the response body contains an error (e.g. `{ error: "Unauthorized" }`)
     and that no goal-agent state machine was advanced (no new goal-run records
     created).
  4. **Stop here. Do NOT proceed to call with a valid secret.**
- **Expected:** 401 without secret; no state change in the DB; no Google Ads
  write attempted.
- **Env/service deps:** local test DB (must have **no due goal-runs** — verify
  before running); `CRON_SECRET` (must **not** be supplied in this scenario).
- **Triage:** 200 without secret → PROD-BUG (**critical security**). Any
  Google Ads mutation observed → PROD-BUG (critical). Correct 401 → PASS.

### INF-027-edge — Wrong secret returns 401
- **Entry point:** `GET /api/goal-agents/cron` with
  `Authorization: Bearer WRONG_SECRET`.
- **Expected:** 401; no tick executed.
- **Triage:** 200 with wrong secret → PROD-BUG (critical security).

---

## INF-028 — Goal-agent watchdog API · CMS-WRITE

### INF-028-happy — Watchdog resets stale goal runs (auth-gated)
- **Entry point:** `GET /api/goal-agents/watchdog` with
  `Authorization: Bearer <CRON_SECRET>`.
- **Inputs:** `CRON_SECRET` from env; local test DB (ensure no real goal-runs
  at risk of being reset unexpectedly — use only the local test DB).
- **Steps:**
  1. Confirm `DATABASE_URI` is the local test DB.
  2. `fetch("http://localhost:3004/api/goal-agents/watchdog", { headers:{
     "Authorization": "Bearer " + process.env.CRON_SECRET } })`.
  3. Assert 200 with a body indicating how many (if any) stale runs were reset
     (e.g. `{ reset: 0 }` on a clean test DB).
  4. For a more meaningful test: seed a goal-run record with `status:
     "executing"` and `updatedAt` > stale threshold; re-run watchdog; assert
     the record is reset to `pending` or `failed`.
- **Expected:** 200; stale runs (if any) reset; no-op on clean DB is valid.
- **Env/service deps:** `CRON_SECRET`; local test DB.
- **Triage:** 401 without secret is expected (see edge). 500 with valid secret
  → PROD-BUG.

### INF-028-edge — Missing CRON_SECRET returns 401
- **Entry point:** `GET /api/goal-agents/watchdog` with **no** `Authorization`
  header.
- **Expected:** 401; no watchdog logic executed.
- **Triage:** 200 without secret → PROD-BUG (security).

---

## INF-029 — Debug meeting schedulers API · CMS-WRITE

### INF-029-happy — Debug endpoint returns scheduler state (API-key gated)
- **Entry point:** `POST /api/debug-meeting-schedulers` with
  `x-api-key: <AUDIT_API_KEY>`.
- **Inputs:** `{ }` or `{ clientId: <zz-test-client id> }`.
- **Steps:**
  1. `fetch("http://localhost:3004/api/debug-meeting-schedulers", { method:
     "POST", headers:{ "x-api-key": process.env.AUDIT_API_KEY },
     body: JSON.stringify({}) })`.
  2. Assert 200; confirm the response contains diagnostic data about meeting
     scheduler state (e.g. `{ schedulers: [...] }` or similar).
  3. Any email notifications triggered by this diagnostic route are
     **harness-blocked** (Brevo live but intercepted — not a failure).
- **Expected:** 200 with scheduler diagnostic payload; no email delivered.
- **Env/service deps:** `AUDIT_API_KEY`; local test DB; Brevo
  (`BREVO_API_KEY`) — send harness-blocked.
- **Triage:** 401 without key is expected (see edge). With valid key, 500 →
  PROD-BUG.

### INF-029-edge — Missing API key returns 401
- **Entry point:** `POST /api/debug-meeting-schedulers` with **no**
  `x-api-key` header.
- **Expected:** 401; no scheduler logic executed.
- **Triage:** 200 without key → PROD-BUG (security).
