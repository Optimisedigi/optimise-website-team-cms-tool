# Test Scenarios — Negative Keywords (`NEG`)

Standalone scenarios keyed to FEAT-IDs `NEG-001`…`NEG-036` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads `6591013898`), proposal
`zz-test-proposal` (PIN `5836`). Growth Tools live reads target whitelisted account
`659-101-3898`. NLB and NKL public review pages are PIN-gated.

---

## NEG-001 — Negative keyword lists collection · READ

### NEG-001-happy — List NKL collection records
- **Entry point:** `GET /api/payload/negative-keyword-lists` (admin session), or
  `/admin/collections/negative-keyword-lists` in a browser.
- **Inputs:** admin session for `zz-test-client`; no body required.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/payload/negative-keyword-lists?limit=10")`.
  3. Assert response shape: `{ docs: [...], totalDocs, totalPages }`.
  4. Confirm each doc has at least `id`, `client`, `keywords`, `matchTypes`, `syncState`.
- **Expected:** 200 JSON with zero or more NKL records; collection schema is valid.
  Test client's NKL (if seeded) is present.
- **Env/service deps:** admin session (`TEST_ADMIN_PASSWORD`); local test DB. No external services.
- **Triage:** 401 without session is expected; 500 with session → PROD-BUG.

### NEG-001-edge — Empty NKL still returns valid shape
- **Entry point:** same collection API filtered to a client with no NKLs.
- **Inputs:** `?where[client][equals]=<a-client-id-with-no-nkls>`.
- **Steps:**
  1. `authedFetch("/api/payload/negative-keyword-lists?where[client][equals]=99999")`.
- **Expected:** 200 `{ docs: [], totalDocs: 0 }` — empty array, not 404 or 500.
- **Env/service deps:** admin session; local DB.
- **Triage:** crash on empty result → PROD-BUG.

---

## NEG-002 — Negative list builder (NLB) admin page · EXTERNAL-SAFE

### NEG-002-happy — Open NLB for a Google Ads audit
- **Entry point:** `src/components/NegativeListBuilder.tsx` opened via
  `OpenNegativeListBuilderButton.tsx` on a Google Ads Audit record linked to
  `zz-test-client` (Ads account `6591013898`).
- **Inputs:** an existing Google Ads Audit record id for `zz-test-client`; admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate (browser) to `/admin/collections/google-ads-audits/<audit-id>`.
  3. Click "Open NLB" button — asserts the `NegativeListBuilder` drawer/modal renders.
  4. Assert the UI shows: keyword table header, match-type selectors, "Generate" button.
  5. Do **not** click Generate in this sub-step (covered in NEG-003).
- **Expected:** Component renders without crash; account id `6591013898` is pre-filled;
  no Growth Tools call fires on open alone.
- **Env/service deps:** admin session; local DB; `GROWTH_TOOLS_URL` (called only on Generate).
- **Triage:** render crash → PROD-BUG; Ads id absent → check fixture setup.

---

## NEG-003 — NLB generate API · EXTERNAL-SAFE

### NEG-003-happy — Generate proposed negatives from search terms
- **Entry point:** `POST /api/google-ads-audits/[id]/negative-list-builder/generate`
  (admin session).
- **Inputs:** `auditId` of `zz-test-client`'s audit; body `{}` or minimal params
  accepted by the route.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/google-ads-audits/<audit-id>/negative-list-builder/generate", { method: "POST", body: JSON.stringify({}) })`.
  3. Assert 200 or 202 response.
  4. Assert response body has an array of proposed keywords (may be empty if no search
     term data exists for the test account — that is acceptable).
  5. Assert response does NOT contain an error field on a 200.
- **Expected:** Growth Tools returns search-term analysis; proposed negative list
  (possibly empty) is returned. No CMS write occurs.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`, live prod
  against account `659-101-3898`).
- **Triage:** Growth Tools 5xx → UNKNOWN (not a CMS bug); non-Growth-Tools 500 → PROD-BUG.
  Empty proposal list for a fresh test account is expected — not a failure.

### NEG-003-edge — Missing audit id returns 400/404
- **Entry point:** `POST /api/google-ads-audits/999999/negative-list-builder/generate`.
- **Inputs:** non-existent audit id.
- **Expected:** 400 or 404 with a clear error message; no Growth Tools call.
- **Triage:** unhandled crash → PROD-BUG.

---

## NEG-004 — NLB save edits API · CMS-WRITE

### NEG-004-happy — Persist keep/remove/edit decisions
- **Entry point:** `POST /api/google-ads-audits/[id]/negative-list-builder/save-edits`
  (admin session).
- **Inputs:**
  ```json
  {
    "keywords": [
      { "keyword": "free", "matchType": "broad", "keep": true },
      { "keyword": "diy", "matchType": "exact", "keep": false }
    ]
  }
  ```
- **Steps:**
  1. `loginAdmin()`.
  2. POST to the route with the test audit id and the payload above.
  3. Assert 200; re-fetch the audit record via `GET /api/payload/google-ads-audits/<id>`
     and confirm the `nlbEdits` (or equivalent) field stores the submitted decisions.
  4. Log updated record to teardown manifest.
- **Expected:** 200; audit record reflects the saved keyword decisions on reload.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** PROD-BUG on 500 or if field doesn't persist.

### NEG-004-edge — Empty keyword array accepted without error
- **Inputs:** `{ "keywords": [] }`.
- **Expected:** 200 with no-op; no crash or validation error.
- **Triage:** 500 on empty array → PROD-BUG.

---

## NEG-005 — NLB team review API · DANGER

### NEG-005-happy — Stage a team-review notification (safe surface only)
- **Entry point:** `POST /api/google-ads-audits/[id]/negative-list-builder/team-review`
  (admin session).
- **Inputs:** `auditId` for `zz-test-client`'s audit.
- **Steps:**
  1. `loginAdmin()`.
  2. POST to the team-review route. Assert the response is either:
     - **200/202** — route accepts the request and stages the notification, OR
     - **harness-blocked** — Brevo is live but the test harness intercepts the outbound
       send before it leaves the process (assert no email actually delivered).
  3. Confirm that the audit record's NLB status field (e.g. `nlbStatus`, `reviewStatus`)
     transitions to a `"team-review-pending"` or equivalent state in the CMS.
  4. Do **not** call any "approve-negatives" or "push" endpoint.

  > ⚠️ **DANGER — live email:** this route sends an internal notification email via
  > Brevo. **Live push/send is harness-blocked; scenario must NOT call the approve/push
  > endpoint.** Assert only CMS state change and that the harness intercepted any
  > outbound send.

- **Expected:** CMS status updated to team-review-pending; any email call is
  harness-blocked (Brevo intercepted, not delivered).
- **Env/service deps:** admin session; local DB; `BREVO_API_KEY` (live, harness-blocked).
- **Triage:** status not updated → PROD-BUG. Email actually delivered to inbox → DANGER
  (harness failed). Brevo block logged → expected (not a failure).

---

## NEG-006 — NLB client share API · DANGER

### NEG-006-happy — Publish PIN-gated review link (safe surface only)
- **Entry point:** `POST /api/google-ads-audits/[id]/negative-list-builder/client-share`
  (admin session).
- **Inputs:** `auditId` for `zz-test-client`'s audit.
- **Steps:**
  1. `loginAdmin()`.
  2. POST to the client-share route. Assert 200/202.
  3. Assert that the audit record gains a `nlbSlug` or `shareSlug` field (the public
     PIN-gate slug used by `/negative-keyword-build/[slug]`).
  4. Assert that any outbound email (client notification) is harness-blocked.
  5. Optionally call `GET /api/negative-keyword-build?slug=<nlbSlug>&pin=4729` (see
     NEG-011) to confirm the public data is readable.
  6. Do **not** proceed to the approve-negatives endpoint.

  > ⚠️ **DANGER — email + Growth Tools write:** this route sends a client-facing email
  > and may write to Growth Tools. **Live push/send is harness-blocked; scenario must
  > NOT call the approve/push/sync endpoint.** Only the slug generation and CMS
  > record update are safe to assert.

- **Expected:** audit record has a valid `nlbSlug`; email send is harness-blocked.
- **Env/service deps:** admin session; local DB; `BREVO_API_KEY` (harness-blocked);
  `GROWTH_TOOLS_URL` (read-side only for slug generation if applicable).
- **Triage:** no slug generated → PROD-BUG. Email delivered → DANGER. Growth Tools
  5xx on slug gen → UNKNOWN.

---

## NEG-007 — NLB client approve API · CMS-WRITE

### NEG-007-happy — Record client approval of proposed negatives
- **Entry point:** `POST /api/google-ads-audits/[id]/negative-list-builder/client-approve`
  (admin session, simulating a client approval action).
- **Inputs:**
  ```json
  { "approved": true, "approvedBy": "Test Client", "approvedAt": "2025-01-15T00:00:00Z" }
  ```
- **Steps:**
  1. Ensure NEG-005 or NEG-006 has already been run so NLB has proposed keywords.
  2. `loginAdmin()`.
  3. POST the approval body to the route.
  4. Assert 200; re-fetch audit record and confirm `nlbClientApproved: true` (or
     equivalent approval field) is set with a timestamp.
  5. Log updated record to teardown manifest.
- **Expected:** 200; approval status persisted on audit record. No live Ads push.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** approval not persisted → PROD-BUG.

### NEG-007-edge — Double approval is idempotent
- **Inputs:** POST the same approval payload a second time.
- **Expected:** 200; record still shows single approval; no duplicate rows created.
- **Triage:** crash or duplicate → PROD-BUG.

---

## NEG-008 — NLB import to CMS API · CMS-WRITE

### NEG-008-happy — Import approved negatives into an NKL record
- **Entry point:** `POST /api/google-ads-audits/[id]/negative-list-builder/import-to-cms`
  (admin session).
- **Inputs:** audit id with prior approval (from NEG-007); optionally `{ "nklId": <existing-nkl-id> }` or blank to create a new NKL.
- **Steps:**
  1. `loginAdmin()`.
  2. POST to the import-to-cms route.
  3. Assert 200; response includes `{ nklId: <id> }`.
  4. `GET /api/payload/negative-keyword-lists/<nklId>` and assert the keywords from
     the NLB now appear in the `keywords` array.
  5. Log the new/updated NKL id to teardown manifest.
- **Expected:** 200; NKL record contains the imported keywords. No live Ads push.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** PROD-BUG on 500 or if keywords are absent from the NKL.

### NEG-008-edge — Import with no approved keywords returns graceful error
- **Inputs:** audit that has NOT been through client-approve (NEG-007).
- **Expected:** 400/422 with clear message ("no approved keywords to import"); no NKL
  created.
- **Triage:** crash or empty NKL created → PROD-BUG.

---

## NEG-009 — Approve negatives API · DANGER

### NEG-009-happy — Stage approval row; assert live push is harness-blocked
- **Entry point:** `POST /api/google-ads-audits/approve-negatives` (admin session).
- **Inputs:** `{ "auditId": "<zz-test-client audit id>", "keywords": ["free", "diy"] }`.
- **Steps:**
  1. `loginAdmin()`.
  2. Confirm the test harness has the live-push block active (environment variable
     `ALLOW_LIVE_PUSH` is absent or `false`).
  3. POST to `/api/google-ads-audits/approve-negatives`.
  4. Assert the response is either:
     - `403` / blocked response — harness correctly rejects the live push, OR
     - `200` with `{ staged: true, pushed: false }` — route created an approval record
       but did not call Growth Tools live.
  5. If an AgentApprovalQueue row is created, assert it is in `status: "pending"` and
     **do not** call `/api/agent-approvals/[id]/apply`.
  6. Do NOT verify Google Ads account — never call the live Ads API from this scenario.

  > ⚠️ **DANGER — pushes live to Google Ads:** this route calls Growth Tools and
  > writes negatives directly to the Google Ads account. **Live push/send/sheet-write
  > is harness-blocked; scenario must NOT call the approve/push/sync endpoint.** Only
  > assert the pre-push state (staged row or harness rejection).

- **Expected:** either a harness block (403/blocked) or a staged `pending` approval row;
  no keywords written to Google Ads `659-101-3898`.
- **Env/service deps:** admin session; local DB; `GROWTH_TOOLS_URL` (blocked by harness);
  `ALLOW_LIVE_PUSH` must be absent/false.
- **Triage:** live push succeeds without `--allow-live-push` flag → DANGER (harness
  failure, escalate). Harness block logged → expected. Other 500 → PROD-BUG.

---

## NEG-010 — NLB client review page · READ

### NEG-010-happy — View NLB with correct PIN
- **Entry point:** `/negative-keyword-build/[slug]` (public, no admin session).
- **Inputs:** `slug` generated by NEG-006; PIN `4729` (client PIN for `zz-test-client`).
- **Steps:**
  1. Ensure NEG-006 has run and produced a valid `nlbSlug`.
  2. Navigate (browser / fetch) to `/negative-keyword-build/<nlbSlug>`.
  3. Assert a PIN gate is rendered (not the full page content).
  4. Submit PIN `4729`.
  5. Assert the full review page renders: current NKL keywords, proposed additions,
     per-keyword comment inputs, and an Approve button.
- **Expected:** PIN accepted; review page content visible with proposed negatives.
- **Env/service deps:** local DB (slug + PIN stored); no external services.
- **Triage:** correct PIN rejected → PROD-BUG (security). Slug not found → check
  NEG-006 ran first.

### NEG-010-edge — Wrong PIN blocked and rate-limited
- **Entry point:** `/negative-keyword-build/<nlbSlug>` (public).
- **Inputs:** PIN `0000` (wrong).
- **Steps:**
  1. Submit PIN `0000`.
  2. Assert access denied / error displayed; review content not shown.
  3. Repeat 5 times rapidly.
  4. Assert rate-limit response (429 or UI lockout message).
- **Expected:** wrong PIN always blocked; repeated failures trigger rate-limit.
- **Env/service deps:** local DB; rate-limiter middleware.
- **Triage:** wrong PIN unlocks page → PROD-BUG (critical security). No rate-limit
  after repeated failures → PROD-BUG.

---

## NEG-011 — NLB client review data API · READ

### NEG-011-happy — Fetch review data with valid PIN cookie
- **Entry point:** `GET /api/negative-keyword-build?slug=<nlbSlug>` (PIN-authenticated
  cookie, public).
- **Inputs:** `nlbSlug` from NEG-006; PIN `4729` established via `/api/audit-auth` or
  equivalent PIN-auth endpoint.
- **Steps:**
  1. POST to the PIN-auth endpoint: `POST /api/audit-auth { slug: "<nlbSlug>", password: "4729" }`.
  2. Assert `{ ok: true }` and that a session cookie is set.
  3. `GET /api/negative-keyword-build?slug=<nlbSlug>` with that cookie.
  4. Assert 200 JSON containing `{ keywords, proposed, auditId, clientName }` (or
     equivalent fields).
- **Expected:** 200 with review data; proposed negatives match what was saved in NEG-004.
- **Env/service deps:** local DB; PIN-auth cookie. No external services.
- **Triage:** 401 with valid cookie → PROD-BUG. 404 for valid slug → check NEG-006.

### NEG-011-edge — No PIN cookie returns 401
- **Inputs:** `GET /api/negative-keyword-build?slug=<nlbSlug>` with no auth cookie.
- **Expected:** 401 Unauthorized; no data leaked.
- **Triage:** data returned without PIN → PROD-BUG (security).

---

## NEG-012 — NLB client comments API · DANGER

### NEG-012-happy — Save client keyword comments (safe surface only)
- **Entry point:** `POST /api/negative-keyword-build-comments` (PIN-authenticated cookie,
  public).
- **Inputs:**
  ```json
  {
    "slug": "<nlbSlug>",
    "comments": [{ "keyword": "free", "comment": "Agreed, add it" }],
    "submit": false
  }
  ```
  Note: `"submit": false` — save edits only, do NOT trigger the approval submit path
  that sends the internal notification email.
- **Steps:**
  1. Obtain PIN cookie for slug (as in NEG-011 step 1–2).
  2. POST the save-edits payload (`submit: false`).
  3. Assert 200; re-fetch via NEG-011 and confirm comments are stored on the keyword.
  4. Do **not** set `"submit": true` in this scenario.

  > ⚠️ **DANGER — email on submit:** setting `submit: true` sends an internal
  > notification email. **Live push/send/sheet-write is harness-blocked; scenario must
  > NOT call the approve/push/sync endpoint.** Only the comment-save (`submit: false`)
  > surface is exercised here.

- **Expected:** 200; comment persisted on the keyword entry; no email sent.
- **Env/service deps:** PIN cookie; local DB; `BREVO_API_KEY` (harness-blocked if submit
  path reached accidentally).
- **Triage:** comments not persisted → PROD-BUG. Email fired on save-only path → PROD-BUG.

### NEG-012-edge — Submission without PIN rejected
- **Inputs:** POST with no auth cookie.
- **Expected:** 401; no data written.
- **Triage:** write accepted without PIN → PROD-BUG (security).

---

## NEG-013 — NKL client view page · READ

### NEG-013-happy — View NKL with correct client PIN
- **Entry point:** `/zz-test-client/negative-keywords/[listSlug]` (public, no admin
  session).
- **Inputs:** `clientSlug: "zz-test-client"`, `listSlug` of a seeded NKL record;
  PIN `4729`.
- **Steps:**
  1. Ensure an NKL record exists for `zz-test-client` (from NEG-008 or seeded fixture).
  2. Navigate to `/zz-test-client/negative-keywords/<listSlug>`.
  3. Assert a PIN gate component (`NegativeKeywordPinGate`) is rendered.
  4. Submit PIN `4729`.
  5. Assert the `NegativeKeywordsClientView` renders the keyword list with flag/comment
     controls.
- **Expected:** PIN accepted; NKL content visible with correct keywords.
- **Env/service deps:** local DB; PIN-gate component. No external services.
- **Triage:** correct PIN rejected → PROD-BUG (security). Missing NKL → check fixture.

### NEG-013-edge — Wrong PIN blocked and rate-limited
- **Entry point:** `/zz-test-client/negative-keywords/<listSlug>` (public).
- **Inputs:** PIN `1111` (wrong).
- **Steps:**
  1. Submit PIN `1111`.
  2. Assert access denied; keyword list not shown.
  3. Repeat 5 times; assert rate-limit (429 or UI lockout).
- **Expected:** wrong PIN consistently blocked; rate-limit triggered on repeated attempts.
- **Triage:** wrong PIN unlocks → PROD-BUG (critical security). No rate-limit → PROD-BUG.

---

## NEG-014 — NKL client view component · READ

### NEG-014-happy — Component renders with flag and comment controls
- **Entry point:** `src/components/NegativeKeywordsClientView.tsx` rendered within
  `/zz-test-client/negative-keywords/<listSlug>` after PIN unlock (see NEG-013).
- **Inputs:** authenticated (PIN `4729`) browser session on the NKL page.
- **Steps:**
  1. Complete NEG-013-happy PIN unlock.
  2. Assert keyword rows render with: keyword text, match-type label, flag icon/button,
     comment input field.
  3. Assert the `NegativeKeywordPinGate` is no longer blocking.
  4. Assert no JS console errors.
- **Expected:** All keyword rows render; flag + comment controls are interactive.
- **Env/service deps:** local DB; browser render (Playwright or similar).
- **Triage:** render crash → PROD-BUG; missing controls → PROD-BUG.

---

## NEG-015 — NKL flag API · CMS-WRITE

### NEG-015-happy — Flag a keyword for review
- **Entry point:** `POST /api/negative-keyword-lists/flag` (PIN-authenticated, public).
- **Inputs:** PIN cookie for `zz-test-client` (PIN `4729`);
  ```json
  {
    "listId": "<nkl-id>",
    "keyword": "free",
    "flagged": true,
    "comment": "Please review this one"
  }
  ```
- **Steps:**
  1. Obtain PIN cookie (POST to PIN-auth with PIN `4729` and the NKL slug/context).
  2. POST the flag payload.
  3. Assert 200.
  4. `authedFetch` (admin) `GET /api/payload/negative-keyword-lists/<nkl-id>` and confirm
     the keyword entry has `flagged: true` and the comment stored.
  5. Revert flag in teardown manifest.
- **Expected:** 200; keyword flagged in the CMS record.
- **Env/service deps:** PIN cookie; local DB. No external services.
- **Triage:** PROD-BUG on 500 or if flag not persisted.

### NEG-015-edge — Flag without PIN returns 401
- **Inputs:** POST with no auth cookie.
- **Expected:** 401; no write.
- **Triage:** write succeeds without PIN → PROD-BUG (security).

---

## NEG-016 — NKL for-client API · READ

### NEG-016-happy — List NKLs scoped to a client
- **Entry point:** `GET /api/negative-keyword-lists/for-client?clientSlug=zz-test-client`
  (admin session).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/negative-keyword-lists/for-client?clientSlug=zz-test-client")`.
  3. Assert 200 JSON array; each entry has `id`, `name`/`slug`, `keywords`, `syncState`.
- **Expected:** 200; array of NKLs for `zz-test-client` (may be empty if none seeded).
- **Env/service deps:** admin session; local DB.
- **Triage:** 401 without session → expected. 500 with session → PROD-BUG.

### NEG-016-edge — Unknown client slug returns empty array or 404
- **Inputs:** `?clientSlug=zzz-nonexistent-client`.
- **Expected:** 200 `[]` or 404 — no crash.
- **Triage:** 500 → PROD-BUG.

---

## NEG-017 — NKL campaigns API · EXTERNAL-SAFE

### NEG-017-happy — List campaigns for NKL targeting
- **Entry point:** `GET /api/negative-keyword-lists/campaigns?clientId=<zz-test-client-id>`
  (admin session).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/negative-keyword-lists/campaigns?clientId=<id>")`.
  3. Assert 200; response is an array of campaign objects with at least `id`/`name`.
  4. Confirm the call targets account `6591013898` (whitelisted).
- **Expected:** 200 with campaign list from Growth Tools for the whitelisted account.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`, live prod
  against `659-101-3898`).
- **Triage:** Growth Tools 5xx → UNKNOWN; non-GT 500 → PROD-BUG; empty array for
  the test account is acceptable if no active campaigns exist.

### NEG-017-edge — Missing clientId returns 400
- **Inputs:** `GET /api/negative-keyword-lists/campaigns` with no `clientId`.
- **Expected:** 400/422 with clear validation message.
- **Triage:** unhandled crash → PROD-BUG.

---

## NEG-018 — NKL export API · READ

### NEG-018-happy — Export NKL as CSV/JSON
- **Entry point:** `GET /api/negative-keyword-lists/export?listId=<nkl-id>`
  (API-key authenticated or admin session per route requirements).
- **Inputs:** `listId` of a seeded NKL for `zz-test-client`; valid API-key header
  (`x-api-key: <AUDIT_API_KEY>`).
- **Steps:**
  1. `GET /api/negative-keyword-lists/export?listId=<nkl-id>` with API-key header.
  2. Assert 200 and `Content-Type: text/csv` or `application/json`.
  3. Assert the body contains the keywords stored in the NKL.
- **Expected:** 200; download body contains correct keywords.
- **Env/service deps:** `AUDIT_API_KEY` env key; local DB.
- **Triage:** 401 without API key → expected. With valid key → PROD-BUG on failure.
  Missing `AUDIT_API_KEY` in dev → DEV-CONFIG.

### NEG-018-edge — Invalid listId returns 404
- **Inputs:** `?listId=999999`.
- **Expected:** 404 or empty response; no crash.
- **Triage:** 500 → PROD-BUG.

---

## NEG-019 — NKL editor components · CMS-WRITE

### NEG-019-happy — Edit NKL keywords in admin
- **Entry point:** `/admin/collections/negative-keyword-lists/<nkl-id>` (browser,
  admin session). Components: `NegativeKeywordTable.tsx`,
  `NegativeKeywordEditorContent.tsx`, `NegativeKeywordBulkAdd.tsx`,
  `NegativeKeywordCampaignSelect.tsx`, `NegativeKeywordListInfo.tsx`.
- **Inputs:** existing NKL id for `zz-test-client`; admin session.
- **Steps:**
  1. `loginAdmin()` then navigate to the NKL admin record.
  2. Confirm `NegativeKeywordTable` renders existing keywords.
  3. Use `NegativeKeywordBulkAdd` to add keyword `"test-bulk-add"` with match type
     `exact`; save.
  4. Assert 200 on save; reload the record and confirm `"test-bulk-add"` is present.
  5. Use `NegativeKeywordCampaignSelect` to assign a campaign; save and confirm.
  6. Log changes to teardown manifest.
- **Expected:** Keywords and campaign assignment persist after save; no external calls.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on persist failure or render crash.

### NEG-019-edge — Duplicate keyword within same NKL
- **Inputs:** add a keyword already present in the NKL.
- **Expected:** validation error or de-duplication; no silent duplicate row.
- **Triage:** silent duplicate → PROD-BUG.

---

## NEG-020 — Apply-to-NKL button · CMS-WRITE

### NEG-020-happy — Move selected keywords into a managed NKL
- **Entry point:** `src/components/ApplyToNKLButton.tsx` (admin UI, within Google Ads
  audit or sweep review page).
- **Inputs:** admin session; selected keyword rows (e.g. `["cheap", "free trial"]`);
  target NKL id.
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to an audit record or sweep review page where keywords can be selected.
  3. Select 2–3 keyword rows.
  4. Click "Apply to NKL"; select the target NKL from the dropdown.
  5. Confirm the action by clicking the confirm button.
  6. Assert success toast/response; fetch the target NKL via admin API and confirm the
     keywords appear.
  7. Log NKL id to teardown manifest.
- **Expected:** 200; selected keywords appended to the NKL. No live Ads push.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** keywords not added → PROD-BUG. Render crash → PROD-BUG.

---

## NEG-021 — Negative sweep candidates collection · READ

### NEG-021-happy — List sweep candidate records
- **Entry point:** `GET /api/payload/negative-sweep-candidates?limit=10` (admin session).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/payload/negative-sweep-candidates?limit=10")`.
  3. Assert 200; `{ docs: [...], totalDocs }`.
  4. Each doc has `id`, `client`, `keywords`, `status`, `createdAt`.
- **Expected:** 200 with zero or more candidate records.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** 500 with session → PROD-BUG.

---

## NEG-022 — Run negative sweep · EXTERNAL-SAFE

### NEG-022-happy — Trigger negative sweep for test client
- **Entry point:** `POST /api/clients/[id]/negative-sweep` (admin session) via
  `RunNegativeSweepButton.tsx`.
- **Inputs:** `zz-test-client` id; admin session.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/clients/<zz-id>/negative-sweep", { method: "POST", body: JSON.stringify({}) })`.
  3. Assert 200 or 202; response includes `{ candidateIds: [...] }` or equivalent.
  4. Confirm one or more `NegativeSweepCandidates` records are created in the CMS.
  5. Log created candidate ids to teardown manifest.
- **Expected:** 200; Growth Tools returns sweep results; candidates stored in CMS.
  Empty result is acceptable for the test account.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`, live prod
  against `659-101-3898`).
- **Triage:** Growth Tools 5xx → UNKNOWN; local 500 → PROD-BUG.

### NEG-022-edge — Client with no Ads id returns 400
- **Inputs:** POST against a client record with no `googleAdsCustomerId`.
- **Expected:** 400/422 "no customer id"; no Growth Tools call.
- **Triage:** crash → PROD-BUG.

---

## NEG-023 — Negative sweep cron API · EXTERNAL-SAFE

### NEG-023-happy — Cron sweep with valid CRON_SECRET
- **Entry point:** `GET /api/negative-sweep/cron` with header
  `Authorization: Bearer <CRON_SECRET>`.
- **Steps:**
  1. Read `CRON_SECRET` from env.
  2. `fetch("http://localhost:3004/api/negative-sweep/cron", { headers: { Authorization: "Bearer <CRON_SECRET>" } })`.
  3. Assert 200 or 202; response body summarises clients swept and candidate counts.
  4. Confirm new `NegativeSweepCandidates` records exist (may be zero for test accounts).
- **Expected:** 200; cron runs without error; Growth Tools called for eligible clients.
- **Env/service deps:** `CRON_SECRET` env key; **Growth Tools** (`GROWTH_TOOLS_URL`).
- **Triage:** missing `CRON_SECRET` in dev → DEV-CONFIG. Growth Tools error → UNKNOWN.
  Application error with valid secret → PROD-BUG.

### NEG-023-edge — Missing or wrong CRON_SECRET returns 401
- **Inputs:** `GET /api/negative-sweep/cron` with no Authorization header (or wrong secret).
- **Expected:** 401 Unauthorized; no sweep runs.
- **Triage:** 200 without valid secret → PROD-BUG (security).

---

## NEG-024 — Negative sweep lists/review API · CMS-WRITE

### NEG-024-happy — List candidates then record a review decision
- **Entry point:**
  - `GET /api/negative-sweep/lists` (admin session) — list candidate sets.
  - `POST /api/negative-sweep/review` (admin session) — record a decision.
- **Inputs:**
  - GET: no body required.
  - POST: `{ "candidateId": "<id>", "decision": "approve" }`.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/negative-sweep/lists")` → assert 200; array of candidate sets.
  3. Pick a candidate id (from NEG-022 or existing fixture).
  4. `authedFetch("/api/negative-sweep/review", { method: "POST", body: JSON.stringify({ candidateId: "<id>", decision: "approve" }) })`.
  5. Assert 200; re-fetch the candidate and confirm `status: "approved"` (or equivalent).
  6. Log to teardown manifest.
- **Expected:** GET 200 with list; POST 200 with updated status. No live Ads push from
  this endpoint.
- **Env/service deps:** admin session; local DB.
- **Triage:** decision not persisted → PROD-BUG.

### NEG-024-edge — Invalid decision value rejected
- **Inputs:** POST `{ "candidateId": "<id>", "decision": "bogus" }`.
- **Expected:** 400/422 validation error; no status change.
- **Triage:** invalid decision accepted → PROD-BUG.

---

## NEG-025 — Negative sweep review page · CMS-WRITE

### NEG-025-happy — Review and act on sweep candidates in admin UI
- **Entry point:** `src/components/NegativeSweepReviewPage.tsx` (admin page/browser).
- **Inputs:** admin session; existing sweep candidates (from NEG-022).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the negative sweep review admin page.
  3. Assert the candidate table renders with keyword rows, status labels, approve/reject
     buttons.
  4. Click "Approve" on one candidate row.
  5. Assert success indicator; candidate status updated in the UI without page reload.
- **Expected:** UI renders; approve action updates candidate status via the review API
  (NEG-024). No live Ads push from this UI action.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG. Approve action fails → PROD-BUG.

---

## NEG-026 — Negative sweep sync-sheet API · DANGER

### NEG-026-happy — Assert sync-sheet is harness-blocked
- **Entry point:** `POST /api/negative-sweep/sync-sheet` (admin session).
- **Inputs:** `{ "candidateIds": ["<id>"] }` (approved candidates from NEG-024).
- **Steps:**
  1. `loginAdmin()`.
  2. Confirm `ALLOW_LIVE_SHEETS_WRITE` is absent/false in env.
  3. POST to `/api/negative-sweep/sync-sheet` with approved candidate ids.
  4. Assert the response is either:
     - **harness-blocked** (Google Sheets OAuth write intercepted — 403/blocked), OR
     - **200** with `{ synced: false, reason: "harness-blocked" }`.
  5. Do NOT verify the Google Sheet contents — treat any Sheet read/write as blocked.

  > ⚠️ **DANGER — Google Sheets write:** this route writes reviewed negatives into
  > the client's Google Sheet. **Live push/send/sheet-write is harness-blocked; scenario
  > must NOT call the approve/push/sync endpoint.** Only the harness-block assertion
  > is in scope.

- **Expected:** request accepted by the route but Sheets write is intercepted and blocked;
  no data written to any live Google Sheet.
- **Env/service deps:** admin session; Google Sheets OAuth (`SheetsAuth`) — harness-blocked.
- **Triage:** Sheets write actually executes → DANGER (harness failure). Route 500
  (non-Sheets error) → PROD-BUG.

---

## NEG-027 — Match-type violation candidates collection · READ

### NEG-027-happy — List match-type violation candidate records
- **Entry point:** `GET /api/payload/match-type-violation-candidates?limit=10`
  (admin session).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/payload/match-type-violation-candidates?limit=10")`.
  3. Assert 200 `{ docs: [...], totalDocs }`.
  4. Each doc has `id`, `client`, `campaign`, `keyword`, `violationType`, `status`.
- **Expected:** 200 with zero or more violation candidates.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with session → PROD-BUG.

---

## NEG-028 — Match-type violations API · CMS-WRITE

### NEG-028-happy — List, approve, and bulk-approve candidates
- **Entry point:**
  - `GET /api/match-type-violations` — list candidates.
  - `POST /api/match-type-violations/[id]/approve` — approve one.
  - `POST /api/match-type-violations/[id]/reject` — reject one.
  - `POST /api/match-type-violations/bulk-approve` — bulk approve.
- **Inputs:** candidate ids from NEG-027 fixture or NEG-029 cron run.
- **Steps:**
  1. `loginAdmin()`.
  2. `GET /api/match-type-violations` → 200, array of candidates.
  3. Pick one candidate id. `POST /api/match-type-violations/<id>/approve` → 200;
     assert `status: "approved"` (writes to CMS candidates, NOT a live Ads push).
  4. Pick another id. `POST /api/match-type-violations/<id>/reject` → 200;
     assert `status: "rejected"`.
  5. `POST /api/match-type-violations/bulk-approve` with `{ "ids": ["<id>", "<id2>"] }` → 200.
  6. Log all changed ids to teardown manifest.

  > Note: approve/reject here writes to CMS candidate records only — it is classified
  > CMS-WRITE, **not** a live Google Ads push.

- **Expected:** all three operations return 200; statuses persist on the CMS records.
- **Env/service deps:** admin session; local DB.
- **Triage:** status not persisted → PROD-BUG. Live Ads call triggered unexpectedly → PROD-BUG.

### NEG-028-edge — Approve non-existent candidate returns 404
- **Inputs:** `POST /api/match-type-violations/999999/approve`.
- **Expected:** 404; no crash.
- **Triage:** 500 → PROD-BUG.

---

## NEG-029 — Match-type violations cron API · EXTERNAL-SAFE

### NEG-029-happy — Cron detects violations with valid CRON_SECRET
- **Entry point:** `GET /api/match-type-violations/cron` with
  `Authorization: Bearer <CRON_SECRET>`.
- **Steps:**
  1. Read `CRON_SECRET` from env.
  2. `fetch("http://localhost:3004/api/match-type-violations/cron", { headers: { Authorization: "Bearer <CRON_SECRET>" } })`.
  3. Assert 200 or 202; response body summarises clients scanned and candidates created.
  4. Confirm new `MatchTypeViolationCandidates` records may appear in the CMS
     (zero is acceptable for the test account).
- **Expected:** 200; Growth Tools called for eligible clients; no live Ads writes.
- **Env/service deps:** `CRON_SECRET` env key; **Growth Tools** (`GROWTH_TOOLS_URL`).
- **Triage:** missing `CRON_SECRET` → DEV-CONFIG. Growth Tools error → UNKNOWN.
  Application error with valid secret → PROD-BUG.

### NEG-029-edge — Missing CRON_SECRET returns 401
- **Inputs:** `GET /api/match-type-violations/cron` with no Authorization header.
- **Expected:** 401 Unauthorized; no detection run.
- **Triage:** 200 without valid secret → PROD-BUG (security).

---

## NEG-030 — Match-type violations UI · CMS-WRITE

### NEG-030-happy — Admin review surface renders and allows decisions
- **Entry point:** `src/components/match-type-violations/*` (admin page/browser).
- **Inputs:** admin session; existing violation candidates (from NEG-029 or fixture).
- **Steps:**
  1. `loginAdmin()`.
  2. Navigate to the match-type violations admin page/section.
  3. Assert the violation table renders with: keyword, match type, campaign, violationType,
     status pill, approve/reject buttons.
  4. Click "Approve" on a pending row.
  5. Assert the row status updates inline (or after refresh) to `"approved"`.
- **Expected:** UI renders without crash; approve action calls the CMS-WRITE API
  (NEG-028) and updates the row status. No live Ads push.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG. Approve action fails silently → PROD-BUG.

---

## NEG-031 — Consolidation candidates collection · READ

### NEG-031-happy — List consolidation candidate records
- **Entry point:** `GET /api/payload/consolidation-candidates?limit=10` (admin session).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/payload/consolidation-candidates?limit=10")`.
  3. Assert 200 `{ docs: [...], totalDocs }`.
  4. Each doc has `id`, `client`, `keywords`, `status`, `createdAt`.
- **Expected:** 200 with zero or more consolidation candidates.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with session → PROD-BUG.

---

## NEG-032 — Consolidation candidates API · DANGER

### NEG-032-happy — List candidates and stage approval (safe surface only)
- **Entry point:**
  - `GET /api/consolidation-candidates` — list.
  - `POST /api/consolidation-candidates/[id]/reject` — reject (safe CMS-only write).
- **Inputs:** candidate ids from NEG-031.
- **Steps:**
  1. `loginAdmin()`.
  2. `GET /api/consolidation-candidates` → 200, array of candidates.
  3. Pick one candidate. `POST /api/consolidation-candidates/<id>/reject` → 200;
     assert `status: "rejected"`. This is safe (CMS-only).
  4. For the approve path: confirm `ALLOW_LIVE_PUSH` is absent/false. POST to
     `/api/consolidation-candidates/<id>/approve` and assert the response is either
     harness-blocked (403) or returns `{ staged: true, pushed: false }`. Do NOT
     verify Google Ads account.
  5. Do NOT call the approve endpoint against a real account without the harness block.

  > ⚠️ **DANGER — approve pushes consolidation live to Google Ads:** this route
  > calls Growth Tools to execute keyword consolidation in the live account.
  > **Live push/send/sheet-write is harness-blocked; scenario must NOT call the
  > approve/push/sync endpoint** without the harness block confirmed active.

- **Expected:** GET lists candidates; reject is a safe CMS write; approve is
  harness-blocked or staged as pending.
- **Env/service deps:** admin session; local DB; `GROWTH_TOOLS_URL` (blocked for
  approve path); `ALLOW_LIVE_PUSH` absent/false.
- **Triage:** approve executes live push without harness block → DANGER. Reject
  not persisted → PROD-BUG.

### NEG-032-edge — Approve non-existent candidate returns 404
- **Inputs:** `POST /api/consolidation-candidates/999999/approve`.
- **Expected:** 404; no Growth Tools call.
- **Triage:** 500 → PROD-BUG.

---

## NEG-033 — Avoided-spend dashboard API · READ

### NEG-033-happy — Read avoided-spend metrics and flush cache
- **Entry point:**
  - `GET /api/dashboard/avoided-spend` (admin session).
  - `POST /api/dashboard/avoided-spend/flush-cache` (admin session).
- **Inputs:** admin session; `clientId=<zz-test-client-id>` query param if required.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/dashboard/avoided-spend?clientId=<id>")` → assert 200;
     response has `{ avoidedSpend, impressionsBlocked, keywordCount }` (or equivalent).
  3. `authedFetch("/api/dashboard/avoided-spend/flush-cache", { method: "POST" })` →
     assert 200 or 204.
  4. Re-fetch GET and confirm fresh data (cache flushed).
- **Expected:** 200 on both; avoided-spend metrics returned; cache flush succeeds.
- **Env/service deps:** admin session; local DB (cache in CMS). No external services
  (data pre-computed from NKL records).
- **Triage:** 500 on read → PROD-BUG. Cache flush failure → PROD-BUG.

### NEG-033-edge — No NKL data returns zero metrics (not an error)
- **Inputs:** GET for a client with no NKL records.
- **Expected:** 200 `{ avoidedSpend: 0, impressionsBlocked: 0, keywordCount: 0 }` or
  equivalent zero-state; no crash.
- **Triage:** 500 on empty state → PROD-BUG.

---

## NEG-034 — Monthly waste/relevancy API · READ

### NEG-034-happy — Read waste/relevancy metrics and clear cache
- **Entry point:**
  - `GET /api/dashboard/monthly-waste-relevancy` (admin session).
  - `POST /api/dashboard/monthly-waste-relevancy/clear` (admin session).
- **Inputs:** admin session; optional `clientId` query param.
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/dashboard/monthly-waste-relevancy")` → assert 200;
     response has monthly metrics shape (waste spend, relevancy score, month array, etc.).
  3. `authedFetch("/api/dashboard/monthly-waste-relevancy/clear", { method: "POST" })` →
     assert 200 or 204.
  4. Re-fetch GET — confirm cache cleared (fresh data or empty cache indicator).
- **Expected:** 200 on both; monthly waste/relevancy data returned; clear succeeds.
- **Env/service deps:** admin session; local DB (cache in `NegativeKeywordMonthlyWasteRelevancyCache`).
- **Triage:** 500 on read or clear → PROD-BUG.

---

## NEG-035 — Dashboard negative-keywords API · DANGER

### NEG-035-happy — Read-side request is safe; push path is harness-blocked
- **Entry point:** `POST /api/dashboard/negative-keywords` (API-key authenticated).
- **Inputs:** valid `AUDIT_API_KEY` in header; body with `action: "read"` or equivalent
  read-mode param (do not use `action: "push"` or omit if default is push).
- **Steps:**
  1. Confirm `ALLOW_LIVE_PUSH` is absent/false.
  2. If the route supports a read/list action:
     `fetch("http://localhost:3004/api/dashboard/negative-keywords", { method: "POST", headers: { "x-api-key": "<AUDIT_API_KEY>" }, body: JSON.stringify({ action: "read", clientId: "<id>" }) })`.
     Assert 200; response contains current negatives.
  3. For the push action path: confirm the harness blocks the outbound Growth Tools
     call. POST with `{ action: "push", … }` and assert either harness-blocked (403)
     or `{ pushed: false, reason: "harness-blocked" }`. Do NOT verify Google Ads.

  > ⚠️ **DANGER — pushes live to Google Ads:** the push/write path of this API-key
  > endpoint calls Growth Tools to write negatives to the live Google Ads account.
  > **Live push/send/sheet-write is harness-blocked; scenario must NOT call the
  > approve/push/sync endpoint.** Only the read surface is safe to exercise freely.

- **Expected:** Read path 200 with current negatives. Push path is harness-blocked;
  no keywords written to live account.
- **Env/service deps:** `AUDIT_API_KEY` env key; `GROWTH_TOOLS_URL` (push path blocked);
  `ALLOW_LIVE_PUSH` absent/false.
- **Triage:** 401 without API key → expected. Push executes live without harness block →
  DANGER. Read 500 with valid key → PROD-BUG. Missing `AUDIT_API_KEY` in dev → DEV-CONFIG.

### NEG-035-edge — No API key returns 401
- **Inputs:** POST with no `x-api-key` header.
- **Expected:** 401; no data read or written.
- **Triage:** 200 without key → PROD-BUG (security).

---

## NEG-036 — Avoided-spend / waste caches · READ

### NEG-036-happy — Cache collection records are readable
- **Entry point:**
  - `GET /api/payload/negative-keyword-avoided-spend-caches?limit=5` (admin session).
  - `GET /api/payload/negative-keyword-monthly-waste-relevancy-caches?limit=5`
    (admin session).
- **Steps:**
  1. `loginAdmin()`.
  2. `authedFetch("/api/payload/negative-keyword-avoided-spend-caches?limit=5")` →
     assert 200 `{ docs: [...], totalDocs }`.
  3. `authedFetch("/api/payload/negative-keyword-monthly-waste-relevancy-caches?limit=5")`
     → assert 200 `{ docs: [...], totalDocs }`.
  4. Each doc (if present) has `id`, `client`, `cachedAt`, and metric fields.
- **Expected:** 200 for both; zero or more cache records; schema is valid.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 on either → PROD-BUG. Empty docs is expected for a fresh test DB.

### NEG-036-edge — Cache populated after dashboard read then flush
- **Entry point:** Run NEG-033-happy (GET avoided-spend) then check cache collection.
- **Steps:**
  1. Run the GET in NEG-033-happy; note a cache record is created.
  2. `GET /api/payload/negative-keyword-avoided-spend-caches?limit=5` → confirm the
     cache record now exists.
  3. Run the flush in NEG-033-happy; re-fetch collection → confirm cache record is
     absent or marked stale.
- **Expected:** Cache lifecycle (create on read, clear on flush) is observable via the
  collection endpoint.
- **Triage:** cache not created after read → PROD-BUG. Cache not cleared after flush → PROD-BUG.
