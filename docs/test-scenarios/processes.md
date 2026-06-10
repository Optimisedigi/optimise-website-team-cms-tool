# Test Scenarios — Processes (`PRO`)

Standalone scenarios keyed to FEAT-IDs `PRO-001`…`PRO-014` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`). All CMS-WRITE scenarios that
create rows **must** append the created id(s) to
`docs/test-runs/<date>/teardown-manifest.jsonl`
`{ collection, id, op, timestamp }`.

> **Email dep note (PRO-007, PRO-010, PRO-013):** the catalog lists an `email`
> dep on these routes. Any actual send is harness-blocked (Brevo is live but
> blocked; Postmark/SendGrid keys are absent). These scenarios target only the
> CMS-record creation/mutation — a send-path failure is **DEV-CONFIG**, not a
> PROD-BUG.

---

## PRO-001 — Process templates collection · READ

### PRO-001-happy — List and inspect a process template
- **Entry point:** `GET /api/process-templates` (Payload REST, admin session) or
  `/admin/collections/process-templates` in a browser.
- **Inputs:** admin session; no additional body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/process-templates?limit=10")`.
  3. Pick the first returned record; `authedFetch("/api/process-templates/<id>")`.
  4. Assert the record shape contains `phases` (array), each phase has `steps`
     (array) with `title` and `weekRange` fields.
- **Expected:** 200 list with at least one template record; individual GET returns
  a well-shaped template with `phases[].steps[]`.
- **Env/service deps:** Payload admin session (`TEST_ADMIN_PASSWORD`); local test
  DB. No external services.
- **Triage:** 401 without session → expected. 200 but empty array with no templates
  seeded → run PRO-014 first (seed). Any 500 with session → PROD-BUG.

### PRO-001-edge — Empty template body gracefully handled
- **Entry point:** `GET /api/process-templates` with a filter that matches nothing:
  `?where[title][equals]=__nonexistent__`.
- **Inputs:** admin session; query above.
- **Steps:**
  1. `authedFetch("/api/process-templates?where[title][equals]=__nonexistent__")`.
  2. Assert response is 200 with `{ docs: [], totalDocs: 0 }`.
- **Expected:** 200 empty page, not a 404 or 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG; 404 → PROD-BUG (Payload should return empty page).

---

## PRO-002 — Client processes collection · READ

### PRO-002-happy — List client processes for zz-test-client
- **Entry point:** `GET /api/client-processes` (Payload REST, admin session).
- **Inputs:** admin session; filter by client slug or id.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/clients?where[slug][equals]=zz-test-client&limit=1")` to
     resolve the client id (e.g. `<clientId>`).
  3. `authedFetch("/api/client-processes?where[client][equals]=<clientId>&limit=20")`.
  4. Assert response shape: each doc has `client`, `phases`, `status`, `createdAt`.
- **Expected:** 200 list (may be empty if no processes created yet; that is valid
  for a fresh fixture). Shape is consistent.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 → PROD-BUG; unexpected shape → PROD-BUG.

### PRO-002-edge — Non-existent client id returns empty list
- **Entry point:** `GET /api/client-processes?where[client][equals]=999999`.
- **Steps:**
  1. `authedFetch("/api/client-processes?where[client][equals]=999999")`.
  2. Assert 200 `{ docs: [], totalDocs: 0 }`.
- **Expected:** empty page, not a 500.
- **Triage:** 500 → PROD-BUG.

---

## PRO-003 — Process template worksheet · CMS-WRITE

### PRO-003-happy — Worksheet renders and saves a template edit
- **Entry point:** browser — `/admin/collections/process-templates/<id>` →
  `ProcessTemplateWorksheet` component tab.
- **Inputs:** admin session; any existing template id (resolved from PRO-001).
- **Steps:**
  1. Open the template record in Payload admin.
  2. Navigate to the Worksheet tab (rendered by `ProcessTemplateWorksheet.tsx`).
  3. Assert the worksheet renders the phase/step grid without a crash.
  4. Edit one step title (e.g. append ` (edited)`); save the record.
  5. Reload and confirm the edited title persists.
- **Expected:** worksheet renders; edit persists on reload.
- **Env/service deps:** admin session (browser); local DB. No external services.
- **Triage:** render crash → PROD-BUG; save failure → PROD-BUG; revert the edited
  title after the run.

### PRO-003-edge — Worksheet with zero phases renders gracefully
- **Entry point:** `/admin/collections/process-templates/create` (new empty record).
- **Steps:**
  1. Open the create form; do not add any phases.
  2. Assert the Worksheet component renders without crashing (empty state UI or
     placeholder message).
- **Expected:** no JS error; empty state message or blank grid.
- **Triage:** crash on empty phases array → PROD-BUG.

---

## PRO-004 — Client process worksheet · CMS-WRITE

### PRO-004-happy — Worksheet renders for a live client process
- **Entry point:** browser — `/admin/collections/client-processes/<id>` →
  `ClientProcessWorksheet` component tab (requires a process to exist; create one
  via PRO-007 first).
- **Inputs:** admin session; `<clientProcessId>` from PRO-007 teardown manifest.
- **Steps:**
  1. Open the client process record in Payload admin.
  2. Navigate to the Worksheet tab (`ClientProcessWorksheet.tsx`).
  3. Assert the phase/step grid renders; verify each step shows a completion
     toggle or checkbox.
  4. Toggle one step's completion state; save the record.
  5. Reload and confirm the state persists.
- **Expected:** worksheet renders with step completion controls; toggle persists.
- **Env/service deps:** admin session (browser); local DB.
- **Triage:** render crash → PROD-BUG; toggle not persisting → PROD-BUG.

### PRO-004-edge — Worksheet flags overdue steps visually
- **Entry point:** same worksheet; process has at least one step whose `weekRange`
  end is in the past.
- **Steps:**
  1. Open a client process where start date is set so that the first phase is
     overdue (set `startDate` to several weeks in the past via PATCH PRO-009 or
     admin edit).
  2. Open the Worksheet tab.
  3. Assert overdue steps are visually differentiated (colour / badge).
- **Expected:** overdue indicator present on past-due steps; no crash.
- **Triage:** no overdue indicator → likely PROD-BUG; crash → PROD-BUG.

---

## PRO-005 — Process tracker · READ

### PRO-005-happy — Tracker renders phase/step progress
- **Entry point:** browser — `ProcessTracker.tsx` / `LinkedProcesses.tsx`
  embedded in a client record or the process record itself; or open
  `/admin/collections/client-processes/<id>` → Process Tracker tab.
- **Inputs:** admin session; `<clientProcessId>` (from PRO-007).
- **Steps:**
  1. Open the client process record in Payload admin.
  2. Navigate to the Tracker tab.
  3. Assert `ProcessTracker` renders phases as sections, steps as rows, each with
     a completion state (complete / in-progress / pending).
  4. Assert `ProcessTrackerCell` progress cells render percentage bars or counts.
- **Expected:** tracker renders without crash; phases and steps visible; progress
  indicators correct relative to current step completions.
- **Env/service deps:** admin session (browser); local DB.
- **Triage:** render crash → PROD-BUG; incorrect counts → PROD-BUG.

### PRO-005-edge — Tracker with all steps complete
- **Entry point:** same tracker view after marking all steps complete (via PRO-010).
- **Steps:**
  1. PATCH all steps to `completed: true` via `PRO-010` calls.
  2. Reload the tracker.
  3. Assert overall progress shows 100 % / all phases complete.
- **Expected:** 100 % completion state; no overflow or NaN in progress display.
- **Triage:** visual glitch at 100 % → PROD-BUG.

---

## PRO-006 — Create from template (buttons) · CMS-WRITE

### PRO-006-happy — CreateFromTemplateButton triggers process creation
- **Entry point:** browser — `CreateFromTemplateButton.tsx` or
  `CreateProcessFromTemplate.tsx` rendered on the `zz-test-client` admin record
  (Processes tab).
- **Inputs:** admin session; `zz-test-client` admin record; any available template
  id.
- **Steps:**
  1. Open `zz-test-client` in Payload admin → Processes tab.
  2. Click "Create from Template" (or equivalent button).
  3. Select a template from the picker.
  4. Confirm creation.
  5. Assert a new client process record appears in the list, linked to
     `zz-test-client`.
- **Expected:** new ClientProcess created; confirmation message or redirect to the
  new record; record linked to `zz-test-client`.
- **Env/service deps:** admin session (browser); local DB. Any email dep is
  harness-blocked.
- **Triage:** no record created → PROD-BUG; email send blocked ≠ failure; log new
  id to teardown manifest.

### PRO-006-edge — No templates available shows empty-state UI
- **Entry point:** same button, but call with no templates in DB (only viable in a
  clean DB; skip in production-seeded envs).
- **Steps:**
  1. If templates list is empty, open the template picker.
  2. Assert the UI renders an "no templates available" message rather than crashing.
- **Expected:** graceful empty state in the picker; no JS error.
- **Triage:** crash → PROD-BUG; skip if templates always seeded.

---

## PRO-007 — Create-from-template API · CMS-WRITE

### PRO-007-happy — POST creates a client process from a template
- **Entry point:** `POST /api/client-processes/create-from-template` (admin
  session).
- **Inputs:**
  - Resolve `<templateId>`: `authedFetch("/api/client-processes/templates")` →
    pick `docs[0].id`.
  - Resolve `<clientId>`: `authedFetch("/api/clients?where[slug][equals]=zz-test-client&limit=1")`
    → `docs[0].id`.
  - Body: `{ templateId: "<templateId>", clientId: "<clientId>" }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-processes/templates")` → pick first template id.
  3. `authedFetch("/api/clients?where[slug][equals]=zz-test-client&limit=1")` →
     resolve client id.
  4. `authedFetch("/api/client-processes/create-from-template", { method: "POST",
     body: JSON.stringify({ templateId, clientId }) })`.
  5. Assert response is 200/201 with `{ id }` or `{ doc: { id, client, phases } }`.
  6. `authedFetch("/api/client-processes/<id>")` and confirm `client` matches the
     test client id; phases are a snapshot of the template.
  7. Append `{ collection: "client-processes", id, op: "create", timestamp }` to
     teardown manifest.
- **Expected:** 200/201; ClientProcess record created with phases/steps copied from
  template; linked to `zz-test-client`. Any email send is harness-blocked; the CMS
  record is the success criterion.
- **Env/service deps:** admin session; local DB; `email` dep is harness-blocked
  (Brevo live but blocked; Postmark missing → DEV-CONFIG if send path reached).
- **Triage:** 400/500 without an input error → PROD-BUG; email block ≠ failure.
  Log id for teardown.

### PRO-007-edge — Missing templateId returns 400
- **Entry point:** `POST /api/client-processes/create-from-template`.
- **Inputs:** body `{ clientId: "<clientId>" }` (no `templateId`).
- **Steps:**
  1. Resolve `<clientId>` as above.
  2. POST without `templateId`.
  3. Assert 400 with a validation message referencing the missing field.
- **Expected:** 400; no record created.
- **Triage:** 201 silently created → PROD-BUG (validation missing); 500 unhandled →
  PROD-BUG.

### PRO-007-edge — Missing clientId returns 400
- **Entry point:** `POST /api/client-processes/create-from-template`.
- **Inputs:** body `{ templateId: "<templateId>" }` (no `clientId`).
- **Steps:**
  1. Resolve `<templateId>` as above.
  2. POST without `clientId`.
  3. Assert 400 with a validation message.
- **Expected:** 400; no record created.
- **Triage:** silent create → PROD-BUG; 500 unhandled → PROD-BUG.

---

## PRO-008 — Templates list API · READ

### PRO-008-happy — GET returns all available process templates
- **Entry point:** `GET /api/client-processes/templates` (admin session).
- **Inputs:** admin session; no body.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-processes/templates")`.
  3. Assert 200; response is an array (or `{ docs }`) where each item has at least
     `id`, `title` (or `name`), and `phases`.
- **Expected:** 200; list of template objects; non-empty if PRO-014 has been run or
  templates were manually seeded.
- **Env/service deps:** admin session; local DB.
- **Triage:** 401 without session → expected. 500 with session → PROD-BUG. Empty
  array on a fresh DB → run PRO-014 first; not a PROD-BUG.

### PRO-008-edge — Unauthenticated request returns 401
- **Entry point:** `GET /api/client-processes/templates` (no session cookie).
- **Steps:**
  1. Call `fetch("http://localhost:3004/api/client-processes/templates")` with no
     auth header or cookie.
  2. Assert 401.
- **Expected:** 401 Unauthorized; no template data leaked.
- **Triage:** 200 without auth → PROD-BUG (security — unauthenticated data exposure).

---

## PRO-009 — Client process CRUD API · CMS-WRITE

### PRO-009-happy — Read, update, then verify a client process
- **Entry point:** `GET /api/client-processes/<id>`, `PATCH /api/client-processes/<id>`
  (admin session).
- **Inputs:** `<clientProcessId>` from PRO-007 teardown manifest.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-processes/<clientProcessId>")` → assert 200 with
     `client`, `phases`, `status`, `createdAt`.
  3. `authedFetch("/api/client-processes/<clientProcessId>", { method: "PATCH",
     body: JSON.stringify({ status: "in-progress" }) })` (or equivalent writable
     field).
  4. Assert PATCH returns 200.
  5. GET again; confirm `status` is `"in-progress"`.
  6. Restore original status via another PATCH.
- **Expected:** GET 200 well-shaped; PATCH 200; updated value persists; restore
  succeeds.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on any unexpected 4xx/5xx.

### PRO-009-edge — DELETE a non-existent id returns 404
- **Entry point:** `DELETE /api/client-processes/999999999` (admin session).
- **Steps:**
  1. `authedFetch("/api/client-processes/999999999", { method: "DELETE" })`.
  2. Assert 404 (or 400) with a clear "not found" message.
- **Expected:** 404; no crash; no silent 200 for a missing record.
- **Triage:** 500 → PROD-BUG; 200 on non-existent delete → PROD-BUG.

### PRO-009-edge — DELETE the test process (teardown)
- **Entry point:** `DELETE /api/client-processes/<clientProcessId>` (admin session).
- **Inputs:** `<clientProcessId>` from PRO-007 teardown manifest.
- **Steps:**
  1. `authedFetch("/api/client-processes/<clientProcessId>", { method: "DELETE" })`.
  2. Assert 200 or 204.
  3. GET the id; assert 404.
  4. Remove from teardown manifest.
- **Expected:** 200/204 on delete; subsequent GET returns 404.
- **Triage:** 500 on delete → PROD-BUG.

---

## PRO-010 — Process step update API · CMS-WRITE

### PRO-010-happy — PATCH marks a single step as complete
- **Entry point:** `PATCH /api/client-processes/<id>/step` (admin session).
- **Inputs:**
  - `<clientProcessId>` from PRO-007 (must be a live process with at least one
    step).
  - `<stepId>`: resolve by GET-ting the process and picking `phases[0].steps[0].id`
    (or the field name used in the response).
  - Body: `{ stepId: "<stepId>", completed: true }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-processes/<clientProcessId>")` → extract first step
     id.
  3. `authedFetch("/api/client-processes/<clientProcessId>/step", { method:
     "PATCH", body: JSON.stringify({ stepId, completed: true }) })`.
  4. Assert 200.
  5. GET the process again; find the step and assert `completed === true`.
  6. Revert: PATCH `{ stepId, completed: false }`.
- **Expected:** 200; step completion persists; revert succeeds. Any email
  notification dep is harness-blocked; the CMS mutation is the success criterion.
- **Env/service deps:** admin session; local DB; `email` dep harness-blocked.
- **Triage:** 500 → PROD-BUG; completion not persisted → PROD-BUG; email block ≠
  failure. If Postmark key missing and send path reached → DEV-CONFIG.

### PRO-010-edge — Invalid stepId returns 400 or 404
- **Entry point:** `PATCH /api/client-processes/<clientProcessId>/step`.
- **Inputs:** body `{ stepId: "nonexistent-step-xyz", completed: true }`.
- **Steps:**
  1. `authedFetch("/api/client-processes/<clientProcessId>/step", { method:
     "PATCH", body: JSON.stringify({ stepId: "nonexistent-step-xyz", completed:
     true }) })`.
  2. Assert 400 or 404 with a message referencing the unknown step.
- **Expected:** 400/404; process record unchanged.
- **Triage:** 200 silently ignored → acceptable if step not found is a no-op, but
  must not corrupt the process document. 500 → PROD-BUG.

---

## PRO-011 — Process share API · CMS-WRITE

### PRO-011-happy — POST generates a shareable token/link
- **Entry point:** `POST /api/client-processes/<id>/share` (admin session).
- **Inputs:** `<clientProcessId>` from PRO-007.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-processes/<clientProcessId>/share", { method:
     "POST" })`.
  3. Assert 200; response contains a `shareToken` (or `shareUrl`, `token`, or
     equivalent field — check actual response shape).
  4. GET the process record again; assert the `shareToken` field is set on the
     stored document.
- **Expected:** 200 with a non-empty token; token persisted on the ClientProcess
  record. Subsequent calls return the same or a refreshed token (implementation-
  dependent; assert not empty).
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** 500 → PROD-BUG; empty/missing token → PROD-BUG.

### PRO-011-edge — Share on a non-existent process returns 404
- **Entry point:** `POST /api/client-processes/999999999/share`.
- **Steps:**
  1. `authedFetch("/api/client-processes/999999999/share", { method: "POST" })`.
  2. Assert 404.
- **Expected:** 404; no token generated.
- **Triage:** 500 → PROD-BUG.

---

## PRO-012 — Process email preview API · CMS-WRITE

### PRO-012-happy — POST returns Gmail-ready HTML without sending
- **Entry point:** `POST /api/client-processes/<id>/email-preview` (admin session).
- **Inputs:** `<clientProcessId>` from PRO-007.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/client-processes/<clientProcessId>/email-preview", {
     method: "POST" })`.
  3. Assert 200.
  4. Assert response body (or `{ html }` field) is a non-empty string containing
     HTML markup (e.g. `<html`, `<table`, or `<div`).
  5. Assert **no** email was sent: check that no network call to Brevo/Postmark
     was made (harness-blocked); the response is pure HTML, no `{ sent: true }`.
- **Expected:** 200 with Gmail-compatible HTML. Absolutely no email dispatched.
  Side effect class is CMS-WRITE (may store the preview HTML on the record), not
  DANGER.
- **Env/service deps:** admin session; local DB. No external send; Brevo/Postmark
  are not called by this route.
- **Triage:** 500 → PROD-BUG; empty HTML → PROD-BUG; any indication an email was
  actually sent → PROD-BUG (this route must never send).

### PRO-012-edge — Email preview for non-existent process returns 404
- **Entry point:** `POST /api/client-processes/999999999/email-preview`.
- **Steps:**
  1. `authedFetch("/api/client-processes/999999999/email-preview", { method:
     "POST" })`.
  2. Assert 404.
- **Expected:** 404; no HTML returned; no email attempted.
- **Triage:** 500 → PROD-BUG.

---

## PRO-013 — Import template from process API · CMS-WRITE

### PRO-013-happy — POST creates a reusable template from a client process
- **Entry point:** `POST /api/process-templates/import-from-process` (admin
  session).
- **Inputs:** `<clientProcessId>` from PRO-007; body:
  `{ processId: "<clientProcessId>", title: "ZZ Imported Template" }` (or
  equivalent field names — check route handler for exact body shape).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/process-templates/import-from-process", { method: "POST",
     body: JSON.stringify({ processId: "<clientProcessId>", title: "ZZ Imported
     Template" }) })`.
  3. Assert 200/201 with `{ id }` or `{ doc: { id, title, phases } }`.
  4. `authedFetch("/api/process-templates/<newTemplateId>")` → confirm `phases` and
     steps match the source process; `title` is `"ZZ Imported Template"`.
  5. Append `{ collection: "process-templates", id: <newTemplateId>, op: "create",
     timestamp }` to teardown manifest.
- **Expected:** 200/201; new ProcessTemplate created with phases/steps mirroring
  the source ClientProcess. Any email dep is harness-blocked; CMS record creation
  is the success criterion.
- **Env/service deps:** admin session; local DB; `email` dep harness-blocked.
- **Triage:** 500 → PROD-BUG; email block ≠ failure. Log new template id for
  teardown.

### PRO-013-edge — Import with non-existent processId returns 400/404
- **Entry point:** `POST /api/process-templates/import-from-process`.
- **Inputs:** body `{ processId: "999999999", title: "ZZ Bad Import" }`.
- **Steps:**
  1. POST with a non-existent `processId`.
  2. Assert 400 or 404 with a descriptive error; no template created.
- **Expected:** 400/404; no orphan template record in DB.
- **Triage:** 201 with an empty/corrupt template → PROD-BUG; 500 → PROD-BUG.

---

## PRO-014 — Seed process templates API · CMS-WRITE

### PRO-014-happy — POST seeds default process templates
- **Entry point:** `POST /api/process-templates/seed` (admin session).
- **Inputs:** admin session; no body required (or empty `{}`).
- **Steps:**
  1. `loginAdmin()`.
  2. Record the current template count:
     `authedFetch("/api/client-processes/templates")` → note `totalDocs` (or array
     length).
  3. `authedFetch("/api/process-templates/seed", { method: "POST" })`.
  4. Assert 200 with a summary (e.g. `{ seeded: N }` or `{ created: [...] }`).
  5. `authedFetch("/api/client-processes/templates")` → assert count has increased
     (or is unchanged if templates were already present — idempotent seed).
  6. Append each newly created template id to teardown manifest.
- **Expected:** 200; default templates appear in the templates list. Seed is
  idempotent (re-running does not duplicate) — or at minimum does not crash.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** 500 → PROD-BUG; duplicates created on re-run → likely PROD-BUG
  (idempotency expected); count unchanged without prior templates → investigate
  seed data.

### PRO-014-edge — Seed is idempotent (run twice, no duplicates)
- **Entry point:** `POST /api/process-templates/seed` called twice.
- **Steps:**
  1. `authedFetch("/api/process-templates/seed", { method: "POST" })` — first run.
  2. Note template count: `authedFetch("/api/client-processes/templates")` →
     `countAfterFirst`.
  3. `authedFetch("/api/process-templates/seed", { method: "POST" })` — second run.
  4. Note template count again: `countAfterSecond`.
  5. Assert `countAfterSecond === countAfterFirst` (no duplicates).
- **Expected:** 200 on both calls; template count is stable after the second call.
- **Triage:** duplicate templates created → PROD-BUG (seed must guard against
  re-seeding).
