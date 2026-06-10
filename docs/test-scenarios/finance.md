# Test Scenarios — Finance (`FIN`)

Standalone scenarios keyed to FEAT-IDs `FIN-001`…`FIN-034` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads `6591013898`), proposal
`zz-test-proposal` (PIN `5836`).

> ⚠️ **Safety Interlock — Finance DANGER surface:**
> - **FIN-023** (`approve-send`) and **FIN-027** (`xero/actions` approve/send) are
>   **harness-blocked**. Scenarios must NOT call these endpoints. Instead test their
>   safe counterparts: FIN-021 (statement preview — builds HTML, no send), FIN-022
>   (refresh-snapshot — read), FIN-020 (pending-summary — read), FIN-026
>   (Xero invoices/scheduled-sends — read-only).
> - **FIN-019** (statement sweep cron) is EXTERNAL-SAFE but requires `CRON_SECRET`
>   header; without it a 401 is expected and is not a bug.
> - **FIN-025** (invoice assistant chat) note: any path that triggers an email send
>   inside the chat handler is harness-blocked; assert the send does not fire.
> - Xero is **unverified in dev** — FIN-019/021/022/026 Xero-dependent reads may
>   fail; triage as UNKNOWN unless clearly wired.
> - Postmark/SendGrid are **missing in dev** — any path that would send email via
>   those providers will fail; triage as DEV-CONFIG (and those paths are also
>   harness-blocked).

---

## FIN-001 — Business costs collection · READ

### FIN-001-happy — List business costs in admin
- **Entry point:** `GET /api/costs` (admin session) **or** open
  `/admin/collections/business-costs` in browser.
- **Inputs:** admin session via `loginAdmin()` + `authedFetch("/api/costs")`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs")` (or navigate to the admin collection list).
  3. Assert response shape and that the collection table renders without error.
- **Expected:** 200 JSON array (possibly empty in test DB); each item has at
  minimum `id`, `name`/description, `amount`, and an optional `category` relation.
  Admin list page renders without crash.
- **Env/service deps:** admin session (`TEST_ADMIN_PASSWORD`); local test DB. No external services.
- **Triage:** 401 without session is expected; 500 with valid session → PROD-BUG.

### FIN-001-edge — Unauthenticated request blocked
- **Entry point:** `GET /api/costs` (no session cookie).
- **Inputs:** none — request is made without calling `loginAdmin()`.
- **Steps:**
  1. Call `fetch("http://localhost:3004/api/costs")` with no auth cookie.
  2. Assert the response status is 401 (or a redirect to login).
  3. Assert no cost data is present in the response body.
- **Expected:** 401 or redirect to login; no cost data returned.
- **Env/service deps:** none — unauthenticated request; local DB.
- **Triage:** data returned without auth → PROD-BUG (security).

---

## FIN-002 — Cost categories/rules collections · READ

### FIN-002-happy — Browse categories and rules in admin
- **Entry point:** `GET /admin/collections/cost-categories` and
  `GET /admin/collections/cost-rules` (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `/admin/collections/cost-categories`; confirm list loads.
  3. Navigate to `/admin/collections/cost-rules`; confirm list loads.
- **Expected:** both collection list pages render (possibly with zero rows in a
  fresh test DB); no 500 errors.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## FIN-003 — Business costs page · READ

### FIN-003-happy — Business costs admin page renders
- **Entry point:** `BusinessCostsPage` component — navigate to the Finance /
  Business Costs admin page (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Open the Business Costs admin page (typically under the Finance nav group).
  3. Verify `BusinessCostsPage` and `BusinessCostsListView` render without crash.
  4. Confirm the page shows a cost list (or an empty state), filter controls, and an
     "Add cost" button.
- **Expected:** page renders; list view populates (or shows empty state); no
  console errors or 500 responses.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash or 500 → PROD-BUG.

---

## FIN-004 — Costs list API · READ

### FIN-004-happy — GET /api/costs returns filterable cost list
- **Entry point:** `GET /api/costs` (admin session).
- **Inputs:** `authedFetch("/api/costs")`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs")` — expect 200 with JSON array.
  3. `authedFetch("/api/costs?category=<id>")` if any category exists — expect
     filtered subset.
- **Expected:** 200 array; items include `id`, `description`, `amount`, `date`,
  optional `category`/`rule` relations. Filtering by `?category=` narrows results.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

### FIN-004-edge — Unknown filter param handled gracefully
- **Entry point:** `GET /api/costs?unknownParam=abc` (admin session).
- **Inputs:** query string `unknownParam=abc`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs?unknownParam=abc")`.
  3. Assert 200 (param silently ignored) or 400 with a clear validation message.
- **Expected:** 200 (param ignored) or 400 with clear validation message; no 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** unhandled crash / 500 → PROD-BUG.

---

## FIN-005 — Add cost API · CMS-WRITE

### FIN-005-happy — Create a business cost record
- **Entry point:** `POST /api/costs/add` (admin session).
- **Inputs:**
  ```json
  {
    "description": "ZZ Test Cost",
    "amount": 99.99,
    "date": "2025-01-15",
    "category": null
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs/add", { method: "POST", body: JSON.stringify(inputs) })`.
  3. Assert 200/201 with a new record `id`.
  4. `authedFetch("/api/costs")` and confirm the new cost appears.
  5. Append `{ collection: "business-costs", id: <newId>, op: "delete", timestamp }` to
     teardown manifest.
- **Expected:** cost record created; appears in cost list; teardown manifest updated.
- **Env/service deps:** admin session; local DB.
- **Triage:** 422/400 without clear message → PROD-BUG. Record id logged for teardown.

### FIN-005-edge — Missing required fields rejected
- **Entry point:** `POST /api/costs/add` (admin session).
- **Inputs:** `{}` — empty body, no description, no amount.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs/add", { method: "POST", body: JSON.stringify({}) })`.
  3. Assert 400 or 422 with validation errors naming the missing fields.
  4. `authedFetch("/api/costs")` — confirm no new record was created.
- **Expected:** 400/422 with validation errors listing the missing fields; no record
  created.
- **Env/service deps:** admin session; local DB.
- **Triage:** record silently created or 500 → PROD-BUG.

---

## FIN-006 — Delete cost API · CMS-WRITE

### FIN-006-happy — Delete a business cost record
- **Entry point:** `POST /api/costs/delete` (admin session).
- **Inputs:** `{ "id": <id of a throwaway cost created in FIN-005-happy> }`.
- **Steps:**
  1. Create a throwaway cost via FIN-005-happy or equivalent; record its `id`.
  2. `authedFetch("/api/costs/delete", { method: "POST", body: JSON.stringify({ id }) })`.
  3. `authedFetch("/api/costs")` — assert the deleted record is gone.
- **Expected:** 200 confirming deletion; deleted record no longer in cost list.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on failure. No teardown needed (record already deleted).

### FIN-006-edge — Delete non-existent record
- **Entry point:** `POST /api/costs/delete` (admin session).
- **Inputs:** `{ "id": "nonexistent-id-999999" }` — a fabricated id that does not exist.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs/delete", { method: "POST", body: JSON.stringify({ id: "nonexistent-id-999999" }) })`.
  3. Assert 404 or 400 with a clear error message.
- **Expected:** 404 or graceful 400; no 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** unhandled crash / 500 → PROD-BUG.

---

## FIN-007 — Categorise cost API · EXTERNAL-SAFE

### FIN-007-happy — AI categorises a cost via Gemini
- **Entry point:** `POST /api/costs/categorise` (admin session).
- **Inputs:**
  ```json
  {
    "description": "Google Ads monthly management fee",
    "amount": 500
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs/categorise", { method: "POST", body: JSON.stringify(inputs) })`.
  3. Assert 200 with a suggested `category` (id or name) returned.
- **Expected:** Gemini returns a category suggestion matching existing categories (or
  a best-effort label); response includes `{ category, confidence }` or similar shape.
  No CMS write occurs.
- **Env/service deps:** admin session; **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`, ✅ wired).
- **Triage:** Gemini network error → UNKNOWN; wrong shape returned → PROD-BUG;
  missing key → DEV-CONFIG.

### FIN-007-edge — Empty description handled
- **Entry point:** `POST /api/costs/categorise` (admin session).
- **Inputs:** `{ "description": "", "amount": 0 }` — empty description.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs/categorise", { method: "POST", body: JSON.stringify({ description: "", amount: 0 }) })`.
  3. Assert 400 with a validation error, or 200 with a safe fallback category (not a crash).
- **Expected:** graceful 400 or a safe fallback category; no 500.
- **Env/service deps:** admin session; **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`, ✅ wired).
- **Triage:** unhandled crash / 500 → PROD-BUG.

---

## FIN-008 — Create category API · CMS-WRITE

### FIN-008-happy — Create a cost category
- **Entry point:** `POST /api/costs/create-category` (admin session).
- **Inputs:** `{ "name": "ZZ Test Category", "description": "Scenario test category" }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/costs/create-category", { method: "POST", body: JSON.stringify(inputs) })`.
  3. Assert 200/201 with new `id`.
  4. Navigate to `/admin/collections/cost-categories` and confirm the category appears.
  5. Log `{ collection: "cost-categories", id: <newId>, op: "delete" }` to teardown manifest.
- **Expected:** category created and visible in the admin list.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on failure. Log id for teardown.

### FIN-008-edge — Duplicate category name
- **Entry point:** `POST /api/costs/create-category` (admin session).
- **Inputs:** `{ "name": "ZZ Test Category" }` — same name as already created in happy path.
- **Steps:**
  1. Ensure the happy-path category `ZZ Test Category` exists.
  2. `authedFetch("/api/costs/create-category", { method: "POST", body: JSON.stringify({ name: "ZZ Test Category" }) })`.
  3. Assert 400/409 with a uniqueness error.
  4. Confirm no duplicate record exists in `/admin/collections/cost-categories`.
- **Expected:** 400/409 with a uniqueness error; no duplicate record created.
- **Env/service deps:** admin session; local DB.
- **Triage:** duplicate silently created → PROD-BUG.

---

## FIN-009 — Cost uploads API · CMS-WRITE

### FIN-009-happy — Bulk-upload costs from a CSV/JSON file
- **Entry point:** `POST /api/costs/upload` (admin session, multipart form).
- **Inputs:** a minimal CSV file with one cost row:
  ```
  description,amount,date
  ZZ Upload Test Cost,25.00,2025-02-01
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. POST a multipart request to `/api/costs/upload` with the file attached.
  3. Assert 200 with `{ created: 1 }` or similar; verify the new cost appears in
     `/api/costs`.
  4. Log created ids to teardown manifest.
- **Expected:** costs parsed and created; response reports import count; no 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** parse failure on valid CSV → PROD-BUG. Log ids for teardown.

### FIN-009-edge — Malformed file rejected
- **Entry point:** `POST /api/costs/upload` (admin session, multipart).
- **Inputs:** a `.txt` file containing `this is not valid csv data @@#$%`.
- **Steps:**
  1. `loginAdmin()`.
  2. POST a multipart request to `/api/costs/upload` with the malformed `.txt` file.
  3. Assert 400 or 422 with a parse error message.
  4. Confirm no new cost records were created (`/api/costs` count unchanged).
- **Expected:** 400/422 with a clear parse error; no partial records created.
- **Env/service deps:** admin session; local DB.
- **Triage:** partial creation or 500 → PROD-BUG.

---

## FIN-010 — Contractors collections · READ

### FIN-010-happy — Browse contractors, time entries, and payments in admin
- **Entry point:** `/admin/collections/contractors`, `/admin/collections/contractor-time-entries`,
  `/admin/collections/contractor-payments` (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to each of the three collection list pages.
  3. Assert each renders without crash (may show empty list in test DB).
- **Expected:** all three list pages load; no 500 errors.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## FIN-011 — Contractor costs page · READ

### FIN-011-happy — Contractor costs dashboard renders
- **Entry point:** `ContractorCostsPage` component — Finance → Contractor Costs
  admin page (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the Contractor Costs admin page.
  3. Confirm `ContractorCostsPage` renders: contractor list, totals, time breakdown.
- **Expected:** page renders without crash; shows contractor rows (or empty state)
  with time/payment summaries.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## FIN-012 — Contractor overview API · READ

### FIN-012-happy — GET /api/contractor-overview returns aggregated data
- **Entry point:** `GET /api/contractor-overview` (admin session).
- **Inputs:** `authedFetch("/api/contractor-overview")`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/contractor-overview")`.
  3. Assert 200 with a JSON object containing per-contractor summaries.
- **Expected:** 200 with `{ contractors: [...] }` or similar shape; each contractor
  entry has name, total hours, total cost. (Test DB may return empty array.)
- **Env/service deps:** admin session; local DB. Catalog notes an `email` dep but
  this endpoint is classified READ — no email is sent.
- **Triage:** 500 with valid session → PROD-BUG.

---

## FIN-013 — Contractor portal (token) · CMS-WRITE

### FIN-013-happy — Contractor accesses portal with valid token
- **Entry point:** `/contractor/[token]` (public route, no admin session).
- **Inputs:** a valid contractor token (look up a `Contractors` record in the test
  DB and use its `portalToken` field, or create a throwaway contractor record via
  admin and read its token).
- **Steps:**
  1. Obtain a valid `token` from a Contractors record (or create one via admin).
  2. `GET http://localhost:3004/contractor/<token>` (no auth cookie).
  3. Assert the page renders the contractor portal UI.
  4. `GET /api/contractor/<token>` — assert 200 with contractor time/payment data.
  5. Submit a time entry: `POST /api/contractor/<token>` with
     `{ "hours": 2, "description": "ZZ scenario time entry", "date": "2025-03-01" }`.
  6. Assert 200; verify the new time entry appears.
  7. Log `{ collection: "contractor-time-entries", id: <newId>, op: "delete" }` to
     teardown manifest.
- **Expected:** portal page loads; GET returns contractor data; POST creates time
  entry and it is returned on subsequent GET.
- **Env/service deps:** valid portal token; local DB. No admin session required.
- **Triage:** valid token rejected → PROD-BUG; portal page crash → PROD-BUG.
  Log ids for teardown.

### FIN-013-edge — Wrong/expired token returns 404 or 401
- **Entry point:** `/contractor/invalid-token-zz9999` (public route, no auth).
- **Inputs:** token `invalid-token-zz9999` — does not exist in the DB.
- **Steps:**
  1. `GET http://localhost:3004/contractor/invalid-token-zz9999` (no auth cookie).
  2. Assert page renders a 404 or access-denied state (not the portal UI).
  3. `GET http://localhost:3004/api/contractor/invalid-token-zz9999` — assert 404 or 401.
- **Expected:** 404 or 401; portal UI not rendered; API returns error with no contractor data.
- **Env/service deps:** none (unauthenticated public route); local DB.
- **Triage:** any data exposed for an invalid token → PROD-BUG (security).

---

## FIN-014 — Time-track API · CMS-WRITE

### FIN-014-happy — Record a time-tracking entry
- **Entry point:** `POST /api/time-track` (admin session).
- **Inputs:**
  ```json
  {
    "hours": 1.5,
    "description": "ZZ Scenario time track",
    "date": "2025-03-15",
    "contractor": null
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/time-track", { method: "POST", body: JSON.stringify(inputs) })`.
  3. Assert 200/201 with a new record `id`.
  4. Confirm the entry appears in the contractor overview or time-entries collection.
  5. Log `{ collection: "contractor-time-entries", id: <newId>, op: "delete" }` to
     teardown manifest.
- **Expected:** time entry created; visible in admin.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on failure. Log id for teardown.

### FIN-014-edge — Negative hours rejected
- **Entry point:** `POST /api/time-track` (admin session).
- **Inputs:** `{ "hours": -3, "description": "bad entry", "date": "2025-03-15" }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/time-track", { method: "POST", body: JSON.stringify({ hours: -3, description: "bad entry", date: "2025-03-15" }) })`.
  3. Assert 400/422 with a validation error about non-positive hours.
  4. Confirm no record was created.
- **Expected:** 400/422 with validation error; no record created.
- **Env/service deps:** admin session; local DB.
- **Triage:** negative hours accepted → PROD-BUG.

---

## FIN-015 — Pomodoro timer · READ

### FIN-015-happy — Timer widget renders in admin
- **Entry point:** `PomodoroTimer` component (admin page, browser).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the admin page that hosts `PomodoroTimer` (Finance / Time Tracking
     section or equivalent).
  3. Confirm the timer widget renders: countdown display, start/pause/reset controls.
  4. Click Start; assert timer begins counting down.
- **Expected:** timer UI renders; start/stop controls are interactive; no crash.
- **Env/service deps:** admin session. No external services.
- **Triage:** render crash → PROD-BUG.

---

## FIN-016 — Billing summary components · READ

### FIN-016-happy — Billing summary renders on client list and record
- **Entry point:** `BillingSummaryCell` (client list) and `ClientBillingSummary` /
  `MonthlyRetainerCell` (client record) — admin browser.
- **Inputs:** admin session; `zz-test-client`.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to `/admin/collections/clients` — confirm `BillingSummaryCell` shows
     a retainer value or placeholder for `zz-test-client`.
  3. Open `/admin/collections/clients/<zz id>` → Billing tab — confirm
     `ClientBillingSummary` and `MonthlyRetainerCell` render without crash.
- **Expected:** billing cells render; values are numeric or show a dash/placeholder
  if not set; no 500s.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## FIN-017 — Invoice statement drafts collection · READ

### FIN-017-happy — Browse statement drafts in admin
- **Entry point:** `/admin/collections/invoice-statement-drafts` (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the collection list.
  3. Assert the list page renders; each draft row shows `status`, `client`, and
     `snapshotDate`.
- **Expected:** 200/page render; rows (or empty state) visible; status chips
  (`pending`/`sent`/`rejected`) render correctly.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## FIN-018 — Invoice statements page · READ

### FIN-018-happy — Invoice statements queue UI renders
- **Entry point:** `InvoiceStatementsPage` component — Finance → Invoice Statements
  admin page (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the Invoice Statements page.
  3. Confirm `InvoiceStatementsPage` renders: draft queue, status filters, preview
     field (`InvoiceStatementPreviewField`).
  4. If drafts exist, click one to expand; the preview field renders the stored
     statement HTML.
- **Expected:** page and components render without crash; queue is visible (or shows
  empty state); preview field renders stored HTML when a draft is selected.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## FIN-019 — Statement sweep API · EXTERNAL-SAFE

> ⚠️ This is a cron route requiring `CRON_SECRET`. Xero is unverified in dev —
> a Xero-related failure is UNKNOWN. The sweep does **not** send emails; it only
> creates draft records.

### FIN-019-happy — Sweep creates statement drafts (with CRON_SECRET)
- **Entry point:** `GET /api/invoice-statements/sweep` (cron route).
- **Inputs:** `Authorization: Bearer <CRON_SECRET>` header.
- **Steps:**
  1. Obtain `CRON_SECRET` from env.
  2. `fetch("http://localhost:3004/api/invoice-statements/sweep", { headers: { Authorization: "Bearer <secret>" } })`.
  3. Assert 200 with a summary like `{ drafted: N, skipped: M }`.
  4. If Xero is wired: verify any newly created drafts appear in
     `/api/invoice-statements/pending-summary`.
- **Expected:** 200 with a count of drafts created (may be 0 in test DB if no
  clients have ≥2 outstanding invoices); no email is sent; no crash.
- **Env/service deps:** `CRON_SECRET`; **Xero** (⚠️ unverified in dev);
  Growth Tools.
- **Triage:** 401 without secret is expected (not a bug). Xero failure → UNKNOWN.
  Other 500 → PROD-BUG.

### FIN-019-edge — Missing CRON_SECRET returns 401
- **Entry point:** `GET /api/invoice-statements/sweep` (no auth header).
- **Inputs:** no `Authorization` header.
- **Steps:**
  1. `fetch("http://localhost:3004/api/invoice-statements/sweep")` with no headers.
  2. Assert 401.
  3. Confirm no draft records were created.
- **Expected:** 401; sweep does not run.
- **Env/service deps:** `CRON_SECRET` (deliberately absent for this test); local DB.
- **Triage:** sweep runs without secret → PROD-BUG (security).

---

## FIN-020 — Statement pending-summary API · READ

### FIN-020-happy — GET /api/invoice-statements/pending-summary returns counts
- **Entry point:** `GET /api/invoice-statements/pending-summary` (admin session).
- **Inputs:** `authedFetch("/api/invoice-statements/pending-summary")`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/invoice-statements/pending-summary")`.
  3. Assert 200 with `{ count, totalAmount }` or similar summary object.
- **Expected:** 200 with numeric `count` and `totalAmount` (may be 0 in test DB);
  dashboard widget header renders correctly.
- **Env/service deps:** admin session; local DB. No Xero call on this endpoint.
- **Triage:** 500 with valid session → PROD-BUG.

---

## FIN-021 — Statement preview API · EXTERNAL-SAFE

> ⚠️ **SAFE counterpart for FIN-023.** This endpoint builds the statement HTML
> without sending. Live send/approve is harness-blocked; this scenario must NOT
> call `/approve-send`. Xero is unverified in dev — a Xero connectivity failure
> means the preview may fail; triage as UNKNOWN in that case.

### FIN-021-happy — Preview builds statement HTML without sending
- **Entry point:** `POST /api/invoice-statements/[id]/preview` (admin session).
- **Inputs:**
  - `id`: a `pending` invoice statement draft (create one via FIN-019-happy, or use
    a pre-existing draft in the test DB).
  - Body: `{ "customMessage": "ZZ scenario preview message" }`.
- **Steps:**
  1. Resolve a draft id from `/api/invoice-statements/pending-summary` or by
     querying the collection.
  2. `authedFetch("/api/invoice-statements/<id>/preview", { method: "POST", body })`.
  3. Assert 200 with `{ html: "<!DOCTYPE..." }` or equivalent HTML string.
  4. Confirm the HTML contains invoice line-items and the custom message.
  5. Assert **no** email was dispatched (no Postmark/SendGrid call made).
- **Expected:** 200 with rendered HTML; the preview is a dry-run — no email sent;
  draft status remains `pending`.
- **Env/service deps:** admin session; **Xero** (⚠️ unverified in dev) for
  invoice data in the snapshot.
- **Triage:** Xero failure → UNKNOWN; HTML empty but 200 → PROD-BUG; 500 → PROD-BUG.

### FIN-021-edge — Preview for non-existent draft
- **Entry point:** `POST /api/invoice-statements/nonexistent-id-999/preview` (admin session).
- **Inputs:** fabricated draft id `nonexistent-id-999`; body `{ "customMessage": "test" }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/invoice-statements/nonexistent-id-999/preview", { method: "POST", body: JSON.stringify({ customMessage: "test" }) })`.
  3. Assert 404 with a clear "not found" message.
- **Expected:** 404; no crash.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG.

---

## FIN-022 — Statement refresh-snapshot API · EXTERNAL-SAFE

> ⚠️ Xero is unverified in dev — this endpoint calls Xero to re-fetch outstanding
> invoices. Failure may be UNKNOWN if Xero is not wired. This is a read-only
> snapshot update; no email is sent.

### FIN-022-happy — Refresh snapshot updates invoice data on draft
- **Entry point:** `POST /api/invoice-statements/[id]/refresh-snapshot` (admin session).
- **Inputs:** `id` of an existing `pending` draft.
- **Steps:**
  1. Resolve a draft `id`.
  2. `authedFetch("/api/invoice-statements/<id>/refresh-snapshot", { method: "POST" })`.
  3. Assert 200 with updated snapshot data `{ invoices: [...], refreshedAt: "..." }`.
  4. Confirm draft's `snapshotDate` is updated.
- **Expected:** 200; snapshot refreshed from Xero (or fails gracefully if Xero
  is unwired); draft status remains `pending`.
- **Env/service deps:** admin session; **Xero** (⚠️ unverified in dev).
- **Triage:** Xero failure → UNKNOWN; other 500 → PROD-BUG.

### FIN-022-edge — Refresh on a sent/rejected draft
- **Entry point:** `POST /api/invoice-statements/[id]/refresh-snapshot` (admin session).
- **Inputs:** `id` of a draft with `status === "sent"` or `"rejected"` (set via FIN-024-happy or directly via admin).
- **Steps:**
  1. `loginAdmin()`.
  2. Obtain or create a draft with `status: "rejected"` (see FIN-024-happy).
  3. `authedFetch("/api/invoice-statements/<id>/refresh-snapshot", { method: "POST" })`.
  4. Assert 400/422 with a message indicating the draft cannot be refreshed in its current state.
- **Expected:** 400/422 indicating the draft is not in a refreshable state; no snapshot overwrite.
- **Env/service deps:** admin session; local DB.
- **Triage:** snapshot overwritten on sent/rejected draft → PROD-BUG.

---

## FIN-023 — Statement approve-send API · DANGER

> 🚫 **HARNESS-BLOCKED. This scenario must NOT call `/approve-send`.**
> Live send/approve is client-visible (sends email + attaches PDFs).
> The safe counterpart is **FIN-021** (preview). The harness must assert that any
> call to `POST /api/invoice-statements/[id]/approve-send` is rejected before
> reaching the network. Exercise only FIN-021 and FIN-022 instead.

### FIN-023-blocked — approve-send is harness-blocked
- **Entry point:** `POST /api/invoice-statements/[id]/approve-send` (would need admin session).
- **Inputs:** N/A — this call must never be issued by the test harness.
- **Steps:** assert the test harness has a network-layer block (e.g. URL pattern deny-list)
  that intercepts any request matching `/api/invoice-statements/*/approve-send` and
  rejects it before it reaches the server. Confirm by attempting a blocked call
  from within the harness and asserting it is intercepted.
- **Expected:** harness blocks the request; no email dispatched; no Xero invoice
  marked as sent; no Postmark/SendGrid call made.
- **Env/service deps:** Xero (harness-blocked); email provider (harness-blocked).
- **Triage:** if the live call reaches the server → PROD-BUG (safety violation).

---

## FIN-024 — Statement reject/reset API · CMS-WRITE

### FIN-024-happy — Reject a pending statement draft
- **Entry point:** `POST /api/invoice-statements/[id]/reject` (admin session).
- **Inputs:** `id` of a `pending` draft (use a throwaway draft created for this
  scenario; do NOT use a draft that might otherwise be sent).
- **Steps:**
  1. Resolve or create a `pending` draft id.
  2. `authedFetch("/api/invoice-statements/<id>/reject", { method: "POST", body: JSON.stringify({ reason: "ZZ scenario reject" }) })`.
  3. Assert 200; re-fetch the draft and confirm `status === "rejected"`.
  4. Log `{ collection: "invoice-statement-drafts", id, op: "delete" }` to teardown
     manifest.
- **Expected:** 200; draft `status` flips to `rejected`; no email sent.
- **Env/service deps:** admin session; local DB. (Catalog notes optional `email` dep
  on this route — any notification is harness-blocked; blocked send ≠ failure.)
- **Triage:** status not updated → PROD-BUG; email fired without block → safety violation.

### FIN-024-edge — Reset a failed-send draft
- **Entry point:** `POST /api/invoice-statements/[id]/reset-failed` (admin session).
- **Inputs:** `id` of a draft with `status === "failed"` (force via Payload admin
  by manually setting `status` to `failed` on a throwaway draft before the test).
- **Steps:**
  1. `loginAdmin()`.
  2. Obtain or force a draft to `status: "failed"` via admin.
  3. `authedFetch("/api/invoice-statements/<id>/reset-failed", { method: "POST" })`.
  4. Assert 200; re-fetch the draft and confirm `status === "pending"`.
- **Expected:** 200; `status` is `pending` again, ready for re-approval (without live send).
- **Env/service deps:** admin session; local DB. (Optional email notification is harness-blocked.)
- **Triage:** status not reset → PROD-BUG.

---

## FIN-025 — Invoice assistant chat · CMS-WRITE

> ⚠️ This chat uses Xero and may suggest sending emails. Any path that would
> trigger an actual email send is **harness-blocked**. Xero reads are UNKNOWN in
> dev. Assert no live send is fired during the chat turn.

### FIN-025-happy — Send a chat message to the invoice assistant
- **Entry point:** `POST /api/xero/chat` (admin session).
- **Inputs:**
  ```json
  {
    "message": "How many outstanding invoices are there?",
    "threadId": "zz-scenario-thread-001"
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/xero/chat", { method: "POST", body: JSON.stringify(inputs) })`.
  3. Assert 200 with `{ reply: "..." }` or a streaming response that eventually
     completes without error.
  4. Confirm no email was sent during the turn.
- **Expected:** assistant returns a text reply; Xero data is queried (or gracefully
  unavailable); no email dispatched; chat turn persisted (if stored).
- **Env/service deps:** admin session; **Xero** (⚠️ unverified in dev);
  email provider (harness-blocked).
- **Triage:** Xero failure → UNKNOWN; email fired → safety violation (PROD-BUG);
  other 500 → PROD-BUG.

### FIN-025-edge — Empty message rejected
- **Entry point:** `POST /api/xero/chat` (admin session).
- **Inputs:** `{ "message": "", "threadId": "zz-scenario-thread-edge" }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/xero/chat", { method: "POST", body: JSON.stringify({ message: "", threadId: "zz-scenario-thread-edge" }) })`.
  3. Assert 400 with a validation error; confirm no AI/Xero call was triggered.
- **Expected:** 400 with a validation error; no AI call made.
- **Env/service deps:** admin session; local DB.
- **Triage:** empty message causes 500 → PROD-BUG.

---

## FIN-026 — Xero invoices/scheduled-sends API · EXTERNAL-SAFE

> ⚠️ Read-only Xero data. Xero is unverified in dev — responses may fail;
> triage as UNKNOWN. **Do not call `/api/xero/actions`** (that is FIN-027, harness-blocked).
> Live send/approve is harness-blocked; this scenario must NOT call approve/send Xero actions.

### FIN-026-happy — Read outstanding invoices and scheduled sends from Xero
- **Entry point:** `GET /api/xero/invoices` and `GET /api/xero/scheduled-sends`
  (admin session).
- **Inputs:** admin session; no request body (GET).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/xero/invoices")` — assert 200 or Xero-unavailable error.
  3. `authedFetch("/api/xero/scheduled-sends")` — assert 200 or Xero-unavailable error.
  4. If 200: confirm response is an array of invoice/send objects with expected
     fields (`id`, `amount`, `dueDate`, etc.).
- **Expected:** 200 with invoice/scheduled-send arrays (may be empty); or a clear
  Xero-connectivity error if Xero is not wired. No write occurs.
- **Env/service deps:** admin session; **Xero** (⚠️ unverified in dev).
- **Triage:** 200 with malformed shape → PROD-BUG; Xero auth error → UNKNOWN;
  other 500 → PROD-BUG.

### FIN-026-edge — Unauthenticated request blocked
- **Entry point:** `GET /api/xero/invoices` (no session cookie).
- **Inputs:** none — request is made without `loginAdmin()`.
- **Steps:**
  1. `fetch("http://localhost:3004/api/xero/invoices")` with no auth cookie.
  2. Assert 401.
  3. Confirm no Xero call was made (no invoice data in response).
- **Expected:** 401; no Xero call made.
- **Env/service deps:** none (unauthenticated); local DB.
- **Triage:** data returned without auth → PROD-BUG (security).

---

## FIN-027 — Xero actions API · DANGER

> 🚫 **HARNESS-BLOCKED. This scenario must NOT call `POST /api/xero/actions`
> with approve or send payloads.** Approving or sending Xero invoices is
> client-visible and irreversible. The safe counterpart is **FIN-026**
> (read-only Xero invoices). The harness must assert that any approve/send
> Xero action call is rejected before reaching the network.

### FIN-027-blocked — Xero approve/send actions are harness-blocked
- **Entry point:** `POST /api/xero/actions` (would need admin session).
- **Inputs:** N/A — no `approve` or `send` payload must ever be issued by the harness.
- **Steps:** assert the test harness has a network-layer block that intercepts any
  request to `/api/xero/actions` with an `approve` or `send` action payload and
  rejects it before it reaches the server. Confirm by verifying the deny-list rule
  is in place for these action types.
- **Expected:** harness blocks the request; no Xero invoice is approved or sent;
  no client-visible change occurs.
- **Env/service deps:** Xero (harness-blocked).
- **Triage:** if the live call reaches the server → PROD-BUG (safety violation).

---

## FIN-028 — Usage reports collection + dashboard · READ

### FIN-028-happy — Usage dashboard renders and API returns data
- **Entry point:** `GET /api/usage` (admin session) **and** `UsageDashboard`
  component (browser).
- **Inputs:** admin session; no request body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/usage")` — assert 200 with usage report data.
  3. Navigate to the Usage dashboard admin page; confirm `UsageDashboard` renders
     cost/call charts.
  4. Navigate to `/admin/collections/usage-reports`; confirm list loads.
- **Expected:** API returns 200 with `{ reports: [...] }` or similar; dashboard
  renders charts (or empty state); collection list loads.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG; render crash → PROD-BUG.

---

## FIN-029 — API cost rates global · READ

### FIN-029-happy — API cost rates global renders in admin
- **Entry point:** `/admin/globals/api-cost-rates` (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to Globals → API Cost Rates.
  3. Confirm the form renders with per-service rate fields (Gemini, OpenAI, etc.).
- **Expected:** global form renders; fields show existing values or defaults; save
  button is present but not exercised (READ scenario).
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## FIN-030 — Agency KPI snapshots collection · READ

### FIN-030-happy — Browse agency KPI snapshots in admin
- **Entry point:** `/admin/collections/agency-kpi-snapshots` (browser, admin session).
- **Inputs:** admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the collection list.
  3. Assert the list renders (may be empty in test DB).
- **Expected:** 200/page load; rows (or empty state); no crash.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## FIN-031 — Revenue breakdown diag API · READ

### FIN-031-happy — Diagnostic revenue breakdown returns data
- **Entry point:** `GET /api/diag/revenue-breakdown` (API-key gated).
- **Inputs:** `Authorization: Bearer <AUDIT_API_KEY>` (or equivalent API key header).
- **Steps:**
  1. Obtain `AUDIT_API_KEY` from env.
  2. `fetch("http://localhost:3004/api/diag/revenue-breakdown", { headers: { Authorization: "Bearer <key>" } })`.
  3. Assert 200 with revenue breakdown data `{ clients: [...], totals: { ... } }`.
- **Expected:** 200 with per-client revenue breakdown and aggregate totals. (May
  show limited data in test DB.)
- **Env/service deps:** `AUDIT_API_KEY`; local DB.
- **Triage:** 401 without key is expected. With key: 500 → PROD-BUG.

### FIN-031-edge — Missing API key returns 401
- **Entry point:** `GET /api/diag/revenue-breakdown` (no auth header).
- **Inputs:** no `Authorization` header.
- **Steps:**
  1. `fetch("http://localhost:3004/api/diag/revenue-breakdown")` with no headers.
  2. Assert 401.
  3. Confirm no revenue data is in the response body.
- **Expected:** 401; no data returned.
- **Env/service deps:** none (deliberately absent key).
- **Triage:** data returned without key → PROD-BUG (security).

---

## FIN-032 — Value ledger · READ

### FIN-032-happy — Value ledger renders and API returns data
- **Entry point:** `GET /api/client-hub/[slug]/value-ledger` (admin session) **and**
  `ValueLedger` component in the client hub (browser).
- **Inputs:** slug `zz-test-client`; admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-hub/zz-test-client/value-ledger")`.
  3. Assert 200 with `{ items: [...] }` (may be empty for the test client).
  4. Navigate to the client hub for `zz-test-client` → Value Ledger tab; confirm
     `ValueLedger` component renders.
- **Expected:** API 200; component renders ledger items (or empty state); no crash.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG; render crash → PROD-BUG.

### FIN-032-edge — Unknown client slug returns 404
- **Entry point:** `GET /api/client-hub/zz-no-such-client/value-ledger` (admin session).
- **Inputs:** slug `zz-no-such-client` — does not exist in the DB.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-hub/zz-no-such-client/value-ledger")`.
  3. Assert 404.
- **Expected:** 404; no 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG.

---

## FIN-033 — Forecast lab · READ

### FIN-033-happy — Forecast lab renders and API returns scenarios
- **Entry point:** `GET /api/client-hub/[slug]/forecast-scenarios` (admin session)
  **and** `ForecastLab` component in the client hub (browser).
- **Inputs:** slug `zz-test-client`; admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-hub/zz-test-client/forecast-scenarios")`.
  3. Assert 200 with `{ scenarios: [...] }` (may be empty).
  4. Navigate to the client hub → Forecast Lab tab; confirm `ForecastLab` component
     renders with scenario cards or an empty state.
- **Expected:** API 200; component renders without crash; what-if sliders/inputs
  visible.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG; render crash → PROD-BUG.

### FIN-033-edge — Unknown client slug returns 404
- **Entry point:** `GET /api/client-hub/zz-no-such-client/forecast-scenarios` (admin session).
- **Inputs:** slug `zz-no-such-client` — does not exist in the DB.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-hub/zz-no-such-client/forecast-scenarios")`.
  3. Assert 404.
- **Expected:** 404; no 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG.

---

## FIN-034 — Tier table grid editor · CMS-WRITE

### FIN-034-happy — Edit pricing tier table and save
- **Entry point:** `TierTableGridEditor` component — admin page hosting the tier
  table editor (browser, admin session).
- **Inputs:** admin session; edit one cell value (e.g. change a retainer tier
  amount by ±1) and save.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the admin page that hosts `TierTableGridEditor` (Finance /
     Pricing Tiers or equivalent).
  3. Confirm the grid renders with tier rows and rate columns.
  4. Edit a single tier cell value (e.g. increment by 1).
  5. Save the change.
  6. Reload the page; assert the edited value persists.
  7. Revert the cell to its original value and save again (teardown in-place).
- **Expected:** grid renders; edits persist on reload; revert succeeds.
- **Env/service deps:** admin session; local DB.
- **Triage:** edit not persisted → PROD-BUG; render crash → PROD-BUG.

### FIN-034-edge — Invalid tier value rejected
- **Entry point:** `TierTableGridEditor` component (browser, admin session).
- **Inputs:** type the string `abc` into a numeric tier-amount cell.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the tier table editor page.
  3. Click a numeric cell (e.g. a retainer amount) and type `abc`.
  4. Attempt to save.
  5. Assert an inline validation error is shown and the invalid value is not persisted.
  6. Reload and confirm the cell still holds its original numeric value.
- **Expected:** validation error shown inline; save blocked or value not persisted;
  no 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** invalid value silently saved → PROD-BUG.
