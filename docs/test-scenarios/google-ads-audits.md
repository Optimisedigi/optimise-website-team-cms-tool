# Test Scenarios — Google Ads Audits (`GAD`)

Standalone scenarios keyed to FEAT-IDs `GAD-001`…`GAD-063` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads customer id `6591013898`),
proposal `zz-test-proposal` (PIN `5836`).

> ⚠️ **DANGER features** (GAD-021, GAD-029, GAD-030, GAD-034, GAD-040, GAD-041,
> GAD-045, GAD-047, GAD-051, GAD-052, GAD-055, GAD-057, GAD-058, GAD-059,
> GAD-060): scenarios exercise **only** the safe surface (dry-run, staging,
> queue-and-assert-pending). The live push/send/deploy is harness-blocked and
> must **not** be called.

---

## GAD-001 — Google Ads Audits collection · READ

### GAD-001-happy — Browse collection in admin
- **Entry point:** `/admin/collections/google-ads-audits` (admin session).
- **Inputs:** none; browse existing records.
- **Steps:** 1) `loginAdmin()`. 2) `GET /admin/collections/google-ads-audits` (browser
  or `authedFetch`). 3) Confirm list renders with columns for client name, customer
  id, status, and created date.
- **Expected:** 200; at least one record visible (or empty-state message); no crash.
- **Env/service deps:** admin session; local DB. No external services.
- **Triage:** 500 with a valid session → PROD-BUG.

### GAD-001-edge — Record field tabs render without crash
- **Entry point:** open any existing audit record's admin edit page.
- **Expected:** all tabs (Audit, Email, Ad Copy, Campaigns, Budget) render; no JS
  console error.
- **Triage:** render crash → PROD-BUG.

---

## GAD-002 — Run Google Ads audit (button) · EXTERNAL-SAFE

### GAD-002-happy — Trigger audit pipeline via button
- **Entry point:** `/admin/collections/google-ads-audits/<audit-id>` → click
  "Run Google Ads Audit" button (`src/components/RunGoogleAdsAuditButton.tsx`).
- **Inputs:** audit record linked to `zz-test-client` (customer id `6591013898`).
- **Steps:** 1) `loginAdmin()`. 2) Open the audit record. 3) Click "Run Google Ads
  Audit". 4) Poll `GET /api/google-ads-audits/<id>/audit-status` until
  `status !== "running"`.
- **Expected:** button initiates the run; status transitions through `running` →
  `completed`; findings and starter email HTML appear on the record. Growth Tools
  read against whitelisted account `659-101-3898`.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`, live).
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG.

---

## GAD-003 — Run audit from client · EXTERNAL-SAFE

### GAD-003-happy — Create + run audit from Client record
- **Entry point:** `/admin/collections/clients/<zz-test-client id>` → click "Run
  Google Ads Audit" (`src/components/RunGoogleAdsAuditFromClientButton.tsx`).
- **Inputs:** `zz-test-client` (customer id `6591013898`).
- **Steps:** 1) `loginAdmin()`. 2) Open the client record. 3) Click the button. 4)
  Confirm a new `google-ads-audits` record is created and linked to the client.
  5) Poll audit-status until complete.
- **Expected:** a new audit record is created with `clientId = <zz-test-client>`;
  findings persist after the run completes.
- **Env/service deps:** admin session; **Growth Tools**.
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG. Log new audit id
  for teardown.

---

## GAD-004 — Run audit from proposal · EXTERNAL-SAFE

### GAD-004-happy — Create + run audit from ClientProposal record
- **Entry point:** `/admin/collections/client-proposals/<zz-test-proposal id>` →
  click "Run Google Ads Audit" (`src/components/RunGoogleAdsAuditFromProposalButton.tsx`).
- **Inputs:** `zz-test-proposal` which inherits customer id `6591013898` from the
  linked client.
- **Steps:** 1) `loginAdmin()`. 2) Open the proposal record. 3) Click the button.
  4) Confirm a new audit record is created and linked. 5) Poll audit-status.
- **Expected:** new audit record with `proposalId = <zz-test-proposal>`; status
  reaches `completed`.
- **Env/service deps:** admin session; **Growth Tools**.
- **Triage:** Growth Tools 5xx → UNKNOWN; other → PROD-BUG. Log id for teardown.

---

## GAD-005 — Audit run API · EXTERNAL-SAFE

### GAD-005-happy — POST run-audit for a known audit record
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/run-audit` (admin session).
- **Inputs:** `audit-id` of a record linked to `6591013898`; body `{}`.
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/run-audit",
  { method:"POST" })`. 3) Poll `GET /api/google-ads-audits/<id>/audit-status` until
  done.
- **Expected:** 200 immediately (or 202); audit-status eventually `completed`; CMS
  record updated with `rawFindings`, `scoredFindings`, `starterEmailHtml`.
- **Env/service deps:** admin session; **Growth Tools** (live read against `659-101-3898`).
- **Triage:** Growth Tools 5xx → UNKNOWN; DB write failure → PROD-BUG.

### GAD-005-edge — Missing customer id returns 400
- **Inputs:** use an audit record whose linked client has **no** `googleAdsCustomerId`.
- **Expected:** 400/422 with a clear "no customer id" message; no Growth Tools call.
- **Triage:** unhandled crash or silent empty run → PROD-BUG.

---

## GAD-006 — Audit status poll · READ

### GAD-006-happy — Poll audit status returns structured JSON
- **Entry point:** `GET /api/google-ads-audits/<audit-id>/audit-status` (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/audit-status")`.
- **Expected:** 200 `{ status, stage, percent, error }` with no crash; `status` is
  one of `idle | running | completed | failed`.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## GAD-007 — Audit preview panel · READ

### GAD-007-happy — Preview panel renders findings and scores
- **Entry point:** open a completed audit record in admin → Preview tab
  (`src/components/GoogleAdsAuditPreview.tsx`).
- **Expected:** panel renders overall score, per-category scores, and a findings
  summary without crash; no network error for a completed record.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## GAD-008 — Finding curation · CMS-WRITE

### GAD-008-happy — Toggle findings and save curation
- **Entry point:** open a completed audit record → "Finding Curation" tab
  (`src/components/GoogleAdsFindingCuration.tsx`).
- **Inputs:** toggle one finding off, edit a finding's headline text, save.
- **Steps:** 1) `loginAdmin()`. 2) Navigate to the audit record. 3) In Finding
  Curation, uncheck one finding and edit one headline. 4) Click Save. 5) Reload
  the record.
- **Expected:** curated findings persist on reload; unchecked finding absent from
  `curatedFindings`; edited headline stored correctly.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on persist failure. Revert curation after.

---

## GAD-009 — Metrics table · READ

### GAD-009-happy — Metrics table renders campaign data
- **Entry point:** open a completed audit record in admin → Metrics tab
  (`src/components/GoogleAdsMetricsTable.tsx`).
- **Expected:** table renders rows for each campaign with columns (impressions,
  clicks, CTR, CPC, conversions, cost) from stored audit data; no crash.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## GAD-010 — Google Ads hub · READ

### GAD-010-happy — Hub lists all clients with audit status
- **Entry point:** `GET /api/clients/google-ads-list` (admin session) and/or open
  the Google Ads hub admin page (`src/components/GoogleAdsHubPage.tsx`).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/clients/google-ads-list")`.
  3) Confirm `zz-test-client` appears with its `googleAdsCustomerId`.
- **Expected:** 200 JSON array; each item has `name`, `slug`, `googleAdsCustomerId`,
  and audit status fields; `zz-test-client` is present.
- **Env/service deps:** admin session; local DB. (Budget enrichment may call Growth
  Tools; tolerate absent budget fields as UNKNOWN if base list returns OK.)
- **Triage:** missing base list → PROD-BUG; missing budget enrichment only → UNKNOWN.

---

## GAD-011 — Download audit data · READ

### GAD-011-happy — DownloadAuditDataButton returns JSON
- **Entry point:** open a completed audit record → "Download data" button
  (`src/components/DownloadAuditDataButton.tsx`) which calls
  `GET /api/google-ads-audits/<id>/download-data` (admin session).
- **Expected:** browser receives a JSON file (or API returns 200 `application/json`)
  containing `rawFindings` and/or `scoredFindings` from the stored record.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on 500 / empty download.

---

## GAD-012 — Download data API · READ

### GAD-012-happy — GET download-data streams raw audit JSON
- **Entry point:** `GET /api/google-ads-audits/<audit-id>/download-data` (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/download-data")`.
- **Expected:** 200; `Content-Disposition: attachment`; body is valid JSON with
  at least one of `rawFindings`, `scoredFindings`, `campaigns`.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on 500 or malformed body.

### GAD-012-edge — Missing audit id returns 404
- **Inputs:** `GET /api/google-ads-audits/nonexistent-id/download-data`.
- **Expected:** 404 with a clear error; no crash.
- **Triage:** 500 instead of 404 → PROD-BUG.

---

## GAD-013 — Customer ID field · READ

### GAD-013-happy — Customer ID renders and validates format
- **Entry point:** `/admin/collections/clients/<zz-test-client id>` → Google Ads
  customer ID field (`src/components/GoogleAdsCustomerIdField.tsx`).
- **Expected:** field displays `6591013898`; input is formatted/validated (dashes
  or digits); no render crash.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

### GAD-013-edge — Invalid format is rejected
- **Inputs:** set `googleAdsCustomerId` to `"abc"` and attempt to save.
- **Expected:** validation error; save blocked or field flagged invalid.
- **Triage:** invalid id silently saved → PROD-BUG.

---

## GAD-014 — Conversion action picker · CMS-WRITE

### GAD-014-happy — Picker fetches actions and saves selection
- **Entry point:** open `zz-test-client` record → conversion action picker
  (`src/components/GoogleAdsConversionActionPicker.tsx`).
- **Steps:** 1) `loginAdmin()`. 2) Open client record. 3) Picker calls
  `GET /api/clients/<id>/google-ads-conversion-actions`. 4) Select the first action
  returned. 5) Save.
- **Expected:** dropdown populated with conversion actions from Growth Tools; selected
  action persisted on the client record.
- **Env/service deps:** admin session; **Growth Tools** (live read); local DB.
- **Triage:** Growth Tools 5xx → UNKNOWN; picker crash after response → PROD-BUG.
  Revert selection after.

---

## GAD-015 — Conversion actions API · EXTERNAL-SAFE

### GAD-015-happy — GET returns conversion actions for whitelisted account
- **Entry point:** `GET /api/clients/<zz-test-client id>/google-ads-conversion-actions`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/clients/<id>/google-ads-conversion-actions")`.
- **Expected:** 200 array of conversion action objects (at least `name`, `id`, `category`);
  Growth Tools live read against `659-101-3898`.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; non-Growth-Tools error → PROD-BUG.

### GAD-015-edge — Client without customer id returns 400
- **Inputs:** call for a client with no `googleAdsCustomerId`.
- **Expected:** graceful 400/422; no Growth Tools call.
- **Triage:** unhandled crash → PROD-BUG.

---

## GAD-016 — Account structure API · EXTERNAL-SAFE

### GAD-016-happy — GET returns campaigns and ad groups
- **Entry point:** `GET /api/client/<zz-test-client slug>/google-ads/account-structure`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/client/zz-test-client/google-ads/account-structure")`.
- **Expected:** 200 with a list of campaigns each containing ad groups; data sourced
  from Growth Tools live read of `659-101-3898`.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; parse error → PROD-BUG.

---

## GAD-017 — Location targeting picker · READ

### GAD-017-happy — Picker renders location selection UI
- **Entry point:** open the budget management or campaign build section of an audit
  record that embeds `src/components/GoogleAdsLocationTargeting.tsx`.
- **Expected:** location picker renders a searchable list of geo-targets; selections
  are reflected in component state; no crash.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## GAD-018 — Starter email preview field · READ

### GAD-018-happy — Preview field renders generated email HTML
- **Entry point:** open a completed audit record in admin; the starter email preview
  field (`src/components/GoogleAdsStarterEmailPreviewField.tsx`) appears in the
  Email tab.
- **Expected:** field renders the `starterEmailHtml` blob as formatted HTML; no crash.
  If no audit has been run, an empty/placeholder state renders.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash on a record with `starterEmailHtml` set → PROD-BUG.

---

## GAD-019 — Regenerate email (button) · CMS-WRITE

### GAD-019-happy — Button rebuilds and saves email HTML
- **Entry point:** completed audit record → "Regenerate email" button
  (`src/components/RegenerateEmailButton.tsx`), which calls
  `POST /api/google-ads-audits/<id>/regenerate-email`.
- **Steps:** 1) `loginAdmin()`. 2) Open completed audit record. 3) Click "Regenerate
  email". 4) Confirm response returns new `starterEmailHtml`. 5) Reload record.
- **Expected:** 200; `starterEmailHtml` updated on the record; preview field reflects
  new content; **no email sent**.
- **Env/service deps:** admin session; local DB (HTML generated from curated findings
  in-process, no external service).
- **Triage:** PROD-BUG on 500 or no change to stored HTML.

---

## GAD-020 — Regenerate email API · CMS-WRITE

### GAD-020-happy — POST regenerates and persists email HTML
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/regenerate-email`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) Note current `starterEmailHtml` value.
  3) `authedFetch("/api/google-ads-audits/<id>/regenerate-email", { method:"POST" })`.
  4) `GET /api/google-ads-audits/<id>` and compare `starterEmailHtml`.
- **Expected:** 200; `starterEmailHtml` on the record is updated; no email sent.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on 500 or unchanged value.

---

## GAD-021 — Send audit email API · DANGER

> **Safety Interlock — DANGER.** Live email send is harness-blocked; scenario must
> NOT call the send endpoint against a real recipient. Test only that the route
> exists and validates input; assert the live send is blocked before network egress.

### GAD-021-happy — Stage email send and assert harness block
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/send-email`
  (admin session).
- **Inputs:** `{ recipient: "harness-test@example.invalid", dryRun: true }` (or
  whatever dry-run / staging flag the route accepts).
- **Steps:** 1) `loginAdmin()`. 2) Confirm harness intercept is active. 3)
  `authedFetch("/api/google-ads-audits/<id>/send-email", { method:"POST", body })`.
  4) Assert the harness returns a `blocked` / `202 queued` response, NOT a live send.
- **Expected:** harness intercepts and blocks the outbound Postmark/Brevo call before
  it reaches the mail provider; no email delivered to any real address; route itself
  returns a recognisable response (200/202/blocked).
- **Env/service deps:** admin session; **Postmark** (`POSTMARK_API_KEY` — absent in
  dev → DEV-CONFIG); harness block.
- **Triage:** harness block firing → expected (not a failure). If the route crashes
  before the send gate → PROD-BUG. Missing `POSTMARK_API_KEY` → DEV-CONFIG.
- **Live send is harness-blocked; scenario must NOT call apply/send live.**

### GAD-021-edge — Missing audit email HTML returns 422
- **Inputs:** call send-email on an audit record that has no `starterEmailHtml`.
- **Expected:** 422/400 with a clear "no email content" error; no send attempted.
- **Triage:** unhandled crash → PROD-BUG.

---

## GAD-022 — Last-month recap API · EXTERNAL-SAFE

### GAD-022-happy — POST returns recap metrics from Growth Tools
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/last-month-recap`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/last-month-recap",
  { method:"POST" })`.
- **Expected:** 200 with last-month spend, conversions, and key metric fields; Growth
  Tools live read of `659-101-3898`; **no email sent**.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG.

---

## GAD-023 — Audit chat · CMS-WRITE

### GAD-023-happy — POST chat returns streaming response (or DEV-CONFIG)
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/chat` (admin session).
- **Inputs:** `{ message: "Summarise the main findings", threadId: "test-thread-1" }`.
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/chat",
  { method:"POST", body })`. 3) Inspect response.
- **Expected (prod):** 200 streaming response with assistant message; chat turn
  persisted to CMS. *(OpenAI key absent in dev → DEV-CONFIG.)*
- **Expected (dev):** route reaches the OpenAI call and fails with a recognisable
  auth error; the route does **not** crash unhandled (500 with no body → PROD-BUG).
- **Env/service deps:** admin session; **OpenAI** (`OPENAI_API_KEY` — ❌ no valid key
  in dev → **DEV-CONFIG** on OpenAI failure); **Gmail** (for draft tool).
- **Triage:** OpenAI auth error → DEV-CONFIG. Crash before reaching OpenAI → PROD-BUG.

---

## GAD-024 — Generate ad copy (button) · EXTERNAL-SAFE

### GAD-024-happy — Button triggers Kimi AI ad copy generation
- **Entry point:** completed audit record → "Generate ad copy" button
  (`src/components/GenerateAdCopyButton.tsx`), which calls
  `POST /api/google-ads-audits/<id>/generate-ad-copy`.
- **Steps:** 1) `loginAdmin()`. 2) Open audit record. 3) Click "Generate ad copy".
  4) Poll `GET /api/google-ads-audits/<id>/ad-copy-status` until `status !== "generating"`.
- **Expected:** status transitions `generating` → `completed`; ad copy variants
  staged on the record; `AdCopyEditor` tab shows new variants.
- **Env/service deps:** admin session; **Kimi/Moonshot AI** (wired in dev); local DB.
- **Triage:** Kimi 5xx → UNKNOWN; other error → PROD-BUG.

---

## GAD-025 — Generate ad copy API · EXTERNAL-SAFE

### GAD-025-happy — POST generate-ad-copy stages variants via Kimi
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/generate-ad-copy`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/generate-ad-copy",
  { method:"POST" })`. 3) Poll ad-copy-status.
- **Expected:** 200 (or 202); `ad-copy-status` eventually `completed`; staged ad
  copy persisted on the record (headlines, descriptions, responsive ad variants).
- **Env/service deps:** admin session; **Kimi/Moonshot AI** (wired).
- **Triage:** Kimi 5xx → UNKNOWN; schema write failure → PROD-BUG.

---

## GAD-026 — Ad copy editor · CMS-WRITE

### GAD-026-happy — Edit a staged ad copy variant and save
- **Entry point:** audit record → Ad Copy tab → `AdCopyEditor`
  (`src/components/AdCopyEditor.tsx`).
- **Inputs:** edit one headline text on a staged variant; save.
- **Steps:** 1) `loginAdmin()`. 2) Navigate to the Ad Copy tab. 3) Edit a headline.
  4) Save. 5) Reload the record.
- **Expected:** edited headline persists on reload.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on persist failure. Revert edit after.

---

## GAD-027 — Ad copy activity feed · READ

### GAD-027-happy — Activity feed renders generation/deploy events
- **Entry point:** audit record → Ad Copy tab → activity feed panel
  (`src/components/AdCopyActivity.tsx`).
- **Expected:** timeline renders events (e.g. "Generated", "Reviewed") with
  timestamps; no crash; empty state renders gracefully when no events exist.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash → PROD-BUG.

---

## GAD-028 — Ad copy status API · READ

### GAD-028-happy — GET returns ad-copy generation status
- **Entry point:** `GET /api/google-ads-audits/<audit-id>/ad-copy-status`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/ad-copy-status")`.
- **Expected:** 200 `{ status, stage, percent }` where `status` is one of
  `idle | generating | completed | failed`.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## GAD-029 — Deploy ad copy (button) · DANGER

> **Safety Interlock — DANGER.** Live deploy to Google Ads is harness-blocked;
> scenario must NOT call the deploy endpoint against the live account.

### GAD-029-happy — Button is present; assert harness blocks live deploy
- **Entry point:** audit record → Ad Copy tab → "Deploy" button
  (`src/components/DeployAdCopyButton.tsx`).
- **Steps:** 1) `loginAdmin()`. 2) Verify the Deploy button renders in the Ad Copy
  tab for a record with staged ad copy. 3) If the harness is active, a click should
  be intercepted before reaching `POST /api/google-ads-audits/<id>/deploy-ad-copy`.
  4) Assert no `deploy-ad-copy` network call completed against the live account.
- **Expected:** button renders; harness prevents live deploy; no changes to the live
  Google Ads account.
- **Env/service deps:** admin session; harness block; **Growth Tools → Google Ads**
  (harness-blocked).
- **Triage:** harness block → expected. Button absent on a record with staged copy →
  PROD-BUG.
- **Live deploy is harness-blocked; scenario must NOT call apply/deploy live.**

---

## GAD-030 — Deploy ad copy API · DANGER

> **Safety Interlock — DANGER.** Live ad copy deploy via Growth Tools is
> harness-blocked; scenario must NOT call this endpoint against the live account.

### GAD-030-happy — Assert route is present and harness-blocked
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/deploy-ad-copy`
  (admin session).
- **Steps:** 1) Confirm harness intercept is active. 2) Assert that any call to
  this endpoint is blocked by the harness before Growth Tools is reached. 3) Verify
  the audit record's `adCopyDeployStatus` remains `idle` / unchanged.
- **Expected:** harness blocks the live push; no change to the Google Ads account;
  `adCopyDeployStatus` unchanged.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** harness block → expected (not a failure). Route 404 → PROD-BUG.
- **Live deploy is harness-blocked; scenario must NOT call apply/deploy live.**

---

## GAD-031 — Ad copy deploy status API · READ

### GAD-031-happy — GET returns deploy status
- **Entry point:** `GET /api/google-ads-audits/<audit-id>/ad-copy-deploy-status`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/ad-copy-deploy-status")`.
- **Expected:** 200 `{ status, stage, percent }` where `status` is one of
  `idle | deploying | completed | failed`.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## GAD-032 — Ad copy review page · READ

### GAD-032-happy — Public page unlocks with correct client PIN
- **Entry point:** `/ad-copy/<slug>` (no admin session) → enter PIN `4729`.
- **Inputs:** slug from an audit record linked to `zz-test-client`; PIN `4729`.
- **Steps:** 1) Navigate to `/ad-copy/<slug>` without session. 2) Enter PIN `4729`
  in the gate UI. 3) Confirm ad copy variants render.
- **Expected:** PIN accepted; ad copy review page renders with headlines,
  descriptions, and a comment box.
- **Env/service deps:** PIN auth via `/api/audit-auth`; local DB.
- **Triage:** correct PIN rejected → PROD-BUG.

### GAD-032-edge — Wrong PIN is blocked
- **Inputs:** PIN `0000` on `/ad-copy/<slug>`.
- **Expected:** access denied; report not shown; repeated attempts rate-limited (429).
- **Triage:** wrong PIN grants access → PROD-BUG (security).

---

## GAD-033 — Ad copy data API · READ

### GAD-033-happy — PIN-gated GET returns ad-copy review payload
- **Entry point:** `GET /api/ad-copy?slug=<ad-copy-slug>` (PIN cookie set via
  prior `/api/audit-auth` call).
- **Steps:** 1) `POST /api/audit-auth { slug: "<slug>", password: "4729" }` to get
  auth cookie. 2) `GET /api/ad-copy?slug=<slug>` with that cookie.
- **Expected:** 200 with ad copy variants (headlines, descriptions, review metadata).
- **Env/service deps:** PIN auth; local DB.
- **Triage:** 401 without valid PIN cookie is expected. 500 with valid cookie → PROD-BUG.

### GAD-033-edge — No PIN cookie returns 401
- **Expected:** 401 `{ error: "unauthorized" }`; no data exposed.
- **Triage:** data returned without PIN → PROD-BUG (security).

---

## GAD-034 — Ad copy comments API · DANGER

> **Safety Interlock — DANGER.** Approval submission triggers a team email
> notification. Live email send is harness-blocked; scenario must NOT submit an
> approval that would deliver a real email.

### GAD-034-happy — GET reads comments; POST saves draft comment only
- **Entry point:** `GET /api/ad-copy-comments?slug=<slug>` (PIN cookie), then
  `POST /api/ad-copy-comments` with a **draft comment only** (not an approval
  submission).
- **Inputs (GET):** slug from fixture audit; valid PIN cookie.
- **Inputs (POST):** `{ slug: "<slug>", type: "comment", text: "HARNESS TEST — draft
  only" }` — deliberately not `type: "approve"` to avoid email trigger.
- **Steps:** 1) Authenticate with PIN. 2) `GET` to read existing comments. 3) `POST`
  a draft comment. 4) `GET` again and confirm the comment appears. 5) Delete the
  test comment (teardown).
- **Expected:** GET returns comments array; POST 200 with the saved comment; no
  email sent for a draft-only comment.
- **Env/service deps:** PIN auth; local DB; **email** (harness-blocked for approval
  notifications).
- **Triage:** harness block on approval send → expected. GET/POST failure → PROD-BUG.
  Log comment id for teardown.
- **Live approval email is harness-blocked; scenario must NOT submit an approval.**

---

## GAD-035 — Run campaign proposal (button) · EXTERNAL-SAFE

### GAD-035-happy — Button triggers Growth Tools campaign proposal
- **Entry point:** audit record → "Run campaign proposal" button
  (`src/components/RunCampaignProposalButton.tsx`), calling
  `POST /api/google-ads-audits/<id>/run-campaign-proposal`.
- **Steps:** 1) `loginAdmin()`. 2) Open a completed audit record. 3) Click the
  button. 4) Poll `GET /api/google-ads-audits/<id>/campaign-proposal-status` until
  done.
- **Expected:** campaign proposal staged on the record; `campaignProposalStatus`
  reaches `completed`; `CampaignProposalPreview` tab shows proposed structure.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG.

---

## GAD-036 — Run campaign proposal API · EXTERNAL-SAFE

### GAD-036-happy — POST run-campaign-proposal returns staged proposal
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/run-campaign-proposal`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/run-campaign-proposal",
  { method:"POST" })`. 3) Poll campaign-proposal-status.
- **Expected:** 200 (or 202); proposal data persisted on the record (campaign
  names, budgets, keyword themes); `campaignProposalStatus` → `completed`.
- **Env/service deps:** admin session; **Growth Tools** (live read of `659-101-3898`).
- **Triage:** Growth Tools 5xx → UNKNOWN; write failure → PROD-BUG.

---

## GAD-037 — Campaign proposal status API · READ

### GAD-037-happy — GET returns campaign-proposal generation status
- **Entry point:** `GET /api/google-ads-audits/<audit-id>/campaign-proposal-status`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/campaign-proposal-status")`.
- **Expected:** 200 `{ status, stage, percent }` with valid status string.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## GAD-038 — Campaign proposal preview · READ

### GAD-038-happy — Preview component renders proposed campaign structure
- **Entry point:** audit record → Campaign Proposal tab
  (`src/components/CampaignProposalPreview.tsx`).
- **Expected:** proposed campaigns rendered with names, daily budgets, keyword
  themes, and match types; no crash; empty state renders gracefully when no proposal
  exists yet.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash on a record with proposal data → PROD-BUG.

---

## GAD-039 — Preview build API · EXTERNAL-SAFE

### GAD-039-happy — POST preview-build returns dry-run build output
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/preview-build`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/preview-build",
  { method:"POST" })`.
- **Expected:** 200 with a dry-run preview payload from Growth Tools `cms-preview`
  (campaign structure, estimated metrics) — **no changes to the live Google Ads account**.
- **Env/service deps:** admin session; **Growth Tools** (preview/dry-run endpoint,
  live prod but read/preview only).
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG.

---

## GAD-040 — Build campaigns (button) · DANGER

> **Safety Interlock — DANGER.** Live campaign build in Google Ads is
> harness-blocked; scenario must NOT trigger a live build. Use GAD-039
> (preview-build) as the safe counterpart.

### GAD-040-happy — Button renders; harness blocks live build call
- **Entry point:** audit record → Campaign Proposal tab → "Build campaigns" button
  (`src/components/BuildCampaignsButton.tsx`).
- **Steps:** 1) `loginAdmin()`. 2) Verify "Build campaigns" button is present after
  a proposal has been staged (GAD-035/036). 3) Assert harness intercepts any click
  before `POST /api/google-ads-audits/<id>/build-campaigns` reaches Growth Tools.
  4) Verify no campaign was created in the live account.
- **Expected:** button renders; live build is harness-blocked; no campaign created.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** button absent when proposal exists → PROD-BUG. Harness block → expected.
- **Live build is harness-blocked; scenario must NOT call apply/build/push live.**

---

## GAD-041 — Build campaigns API · DANGER

> **Safety Interlock — DANGER.** Live campaign build via Growth Tools is
> harness-blocked; scenario must NOT call this endpoint against the live account.

### GAD-041-happy — Assert route is present and harness-blocked
- **Entry point:** `POST /api/google-ads-audits/<audit-id>/build-campaigns`
  (admin session).
- **Steps:** 1) Confirm harness intercept is active. 2) Assert any call to this
  endpoint is blocked before Growth Tools receives it. 3) Verify `campaignBuildStatus`
  remains `idle`.
- **Expected:** harness blocks the live call; no campaign created; status unchanged.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** route 404 → PROD-BUG. Harness block → expected.
- **Live build is harness-blocked; scenario must NOT call apply/build/push live.**

---

## GAD-042 — Campaign build status API · READ

### GAD-042-happy — GET returns campaign-build status
- **Entry point:** `GET /api/google-ads-audits/<audit-id>/campaign-build-status`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-audits/<id>/campaign-build-status")`.
- **Expected:** 200 `{ status, stage, percent }` with valid status string.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## GAD-043 — Audit presentation API · READ

### GAD-043-happy — PIN-gated GET returns presentation deck payload
- **Entry point:** `GET /api/google-ads-audits/presentation?slug=<slug>&pin=<pin>`
  (or PIN cookie from prior auth).
- **Steps:** 1) Obtain PIN cookie via `POST /api/audit-auth { slug, password: "4729" }`.
  2) `GET /api/google-ads-audits/presentation?slug=<audit-slug>`.
- **Expected:** 200 with presentation sections (findings, metrics, recommendations)
  structured for the deck renderer.
- **Env/service deps:** PIN auth; local DB.
- **Triage:** 401 without valid PIN is expected. 500 with valid PIN → PROD-BUG.

### GAD-043-edge — No PIN returns 401
- **Expected:** 401 `{ error: "unauthorized" }`; no presentation data exposed.
- **Triage:** data returned without PIN → PROD-BUG (security).

---

## GAD-044 — Campaign budgets collection · READ

### GAD-044-happy — Browse campaign budgets collection
- **Entry point:** `/admin/collections/google-ads-campaign-budgets` (admin session).
- **Expected:** list renders with per-campaign budget records (campaign name, budget,
  client link); no crash; empty state acceptable for test DB.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## GAD-045 — Budget management UI · DANGER

> **Safety Interlock — DANGER.** Any "push to live" action in the budget management
> UI writes to the live Google Ads account and is harness-blocked; scenario must
> NOT trigger a live push.

### GAD-045-happy — UI renders budget list in read mode; push is harness-blocked
- **Entry point:** open the Budget Management UI for `zz-test-client`
  (`src/components/GoogleAdsBudgetManagement.tsx`).
- **Steps:** 1) `loginAdmin()`. 2) Open budget management for `zz-test-client`.
  3) Confirm budget list renders (calls `GET /api/google-ads-budgets/<id>/list`
  which is EXTERNAL-SAFE). 4) Confirm any "Push" / "Save" action is intercepted by
  the harness before reaching Growth Tools.
- **Expected:** read view renders campaigns with current budgets; push action
  harness-blocked.
- **Env/service deps:** admin session; **Growth Tools** (list read — EXTERNAL-SAFE);
  harness block for push writes.
- **Triage:** read list failure → UNKNOWN (Growth Tools). Push block → expected.
- **Live push is harness-blocked; scenario must NOT call apply/push live.**

---

## GAD-046 — Budget management (simple) · READ

### GAD-046-happy — Simple view renders campaign budgets
- **Entry point:** open simple budget view (`src/components/GoogleAdsBudgetManagementSimple.tsx`)
  for `zz-test-client`.
- **Expected:** simplified read-only budget table renders with campaign names,
  current budgets, and spend figures from Growth Tools; no crash.
- **Env/service deps:** admin session; **Growth Tools** (live read).
- **Triage:** Growth Tools 5xx → UNKNOWN; render crash → PROD-BUG.

---

## GAD-047 — Inline client budget mgmt · DANGER

> **Safety Interlock — DANGER.** Any live budget push from the inline client
> component is harness-blocked; scenario must NOT trigger a live push.

### GAD-047-happy — Client record budget tab renders; push is harness-blocked
- **Entry point:** `/admin/collections/clients/<zz-test-client id>` → Budget tab
  (`src/components/ClientBudgetManagementInline.tsx`).
- **Steps:** 1) `loginAdmin()`. 2) Open client record → Budget tab. 3) Confirm the
  budget table loads (EXTERNAL-SAFE read). 4) Confirm any push/save action is
  harness-blocked.
- **Expected:** budget table renders with read data; push harness-blocked; no live
  write.
- **Env/service deps:** admin session; **Growth Tools → Google Ads** (push
  harness-blocked).
- **Triage:** read failure → UNKNOWN. Push block → expected.
- **Live push is harness-blocked; scenario must NOT call apply/push live.**

---

## GAD-048 — Budget list API · EXTERNAL-SAFE

### GAD-048-happy — GET lists live campaign budgets from Growth Tools
- **Entry point:** `GET /api/google-ads-budgets/<client-id>/list` (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-budgets/<zz-test-client id>/list")`.
- **Expected:** 200 array of campaigns with `name`, `budget`, `spend`, `impressions`,
  `clicks`; data from Growth Tools live read of `659-101-3898`.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; non-GT error → PROD-BUG.

### GAD-048-edge — Client without customer id returns 400
- **Inputs:** call for a client with no `googleAdsCustomerId`.
- **Expected:** 400/422; no Growth Tools call.
- **Triage:** unhandled crash → PROD-BUG.

---

## GAD-049 — Ad groups API · EXTERNAL-SAFE

### GAD-049-happy — GET returns ad groups for a campaign
- **Entry point:** `GET /api/google-ads-budgets/<client-id>/ad-groups?campaignId=<id>`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) Obtain a campaign id from the budget list (GAD-048).
  3) `authedFetch("/api/google-ads-budgets/<client-id>/ad-groups?campaignId=<campaign-id>")`.
- **Expected:** 200 array of ad groups with `name`, `status`, `bids`, and basic metrics.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG.

---

## GAD-050 — Budget refresh metrics API · EXTERNAL-SAFE

### GAD-050-happy — POST re-fetches current campaign metrics
- **Entry point:** `POST /api/google-ads-budgets/<client-id>/refresh-metrics`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-budgets/<zz-test-client id>/refresh-metrics",
  { method:"POST" })`.
- **Expected:** 200 with refreshed metrics from Growth Tools; no write to Google Ads.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG.

---

## GAD-051 — Budget update API · DANGER

> **Safety Interlock — DANGER.** Live budget update in Google Ads is
> harness-blocked; scenario must NOT push a budget change to the live account.

### GAD-051-happy — Assert route is present and harness-blocked
- **Entry point:** `POST /api/google-ads-budgets/<client-id>/update` (admin session).
- **Steps:** 1) Confirm harness intercept is active. 2) Assert any call to this
  endpoint is blocked before Growth Tools receives it. 3) Verify the campaign budget
  in the live account is unchanged.
- **Expected:** harness blocks the live update; no budget changed in Google Ads.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** route 404 → PROD-BUG. Harness block → expected.
- **Live budget update is harness-blocked; scenario must NOT call apply/push live.**

---

## GAD-052 — Budget push API · DANGER

> **Safety Interlock — DANGER.** Live budget push via Growth Tools `campaign-budgets/push`
> is harness-blocked; scenario must NOT call this endpoint against the live account.

### GAD-052-happy — Assert route is present and harness-blocked
- **Entry point:** `POST /api/google-ads-budgets/<client-id>/push` (admin session).
- **Steps:** 1) Confirm harness intercept is active. 2) Assert any call to this
  endpoint is blocked before Growth Tools receives it. 3) Verify live account
  unchanged.
- **Expected:** harness blocks the push; no change to live budgets.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** route 404 → PROD-BUG. Harness block → expected.
- **Live budget push is harness-blocked; scenario must NOT call apply/push live.**

---

## GAD-053 — Monthly budget recommendations API · EXTERNAL-SAFE

### GAD-053-happy — GET returns monthly recommendations
- **Entry point:** `GET /api/google-ads-budgets/monthly-recommendations?clientId=<id>`
  (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-budgets/monthly-recommendations?clientId=<zz-test-client id>")`.
- **Expected:** 200 with per-campaign monthly budget recommendations (recommended
  budget, rationale, performance projection); data from Growth Tools.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG.

### GAD-053-edge — POST generates fresh recommendations
- **Entry point:** `POST /api/google-ads-budgets/monthly-recommendations`
  `{ clientId: <id> }`.
- **Expected:** 200 with generated recommendations; stored/returned JSON matches
  expected schema.
- **Triage:** PROD-BUG on crash or missing recommendations body.

---

## GAD-054 — Ad extensions collection · READ

### GAD-054-happy — Browse ad extensions collection
- **Entry point:** `/admin/collections/google-ads-ad-extensions` (admin session).
- **Expected:** list renders with sitelink/callout/snippet extension records per
  account; no crash; empty state acceptable for test DB.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## GAD-055 — Ad extensions manager UI · DANGER

> **Safety Interlock — DANGER.** Extension create/edit/delete/assign actions in this
> UI write to the live Google Ads account and are harness-blocked; scenario must NOT
> trigger a live write. Only the read/list view is exercised.

### GAD-055-happy — UI renders extension list in read mode; writes are harness-blocked
- **Entry point:** open the ad extensions manager for `zz-test-client`
  (`src/components/GoogleAdsAdExtensions.tsx`, with dialogs
  `GoogleAdsSitelinkDialog.tsx`, `GoogleAdsSnippetDialog.tsx`).
- **Steps:** 1) `loginAdmin()`. 2) Open extensions UI. 3) Confirm extension list
  loads (calls `GET /api/google-ads-extensions/<id>/list` — EXTERNAL-SAFE). 4)
  Confirm create/assign/delete dialogs are blocked by harness when triggered.
- **Expected:** list view renders; create/assign/delete calls harness-blocked.
- **Env/service deps:** admin session; **Growth Tools** (list read — EXTERNAL-SAFE);
  harness block for writes.
- **Triage:** read list failure → UNKNOWN. Write block → expected.
- **Live extension writes are harness-blocked; scenario must NOT call create/assign/delete/sync live.**

---

## GAD-056 — Extensions list API · EXTERNAL-SAFE

### GAD-056-happy — GET lists ad extensions from Growth Tools
- **Entry point:** `GET /api/google-ads-extensions/<client-id>/list` (admin session).
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/google-ads-extensions/<zz-test-client id>/list")`.
- **Expected:** 200 array of extensions with `type`, `text`/`finalUrl`, `id`, and
  status; data from Growth Tools live read of `659-101-3898`.
- **Env/service deps:** admin session; **Growth Tools** (live).
- **Triage:** Growth Tools 5xx → UNKNOWN; other error → PROD-BUG.

---

## GAD-057 — Extension create API · DANGER

> **Safety Interlock — DANGER.** Live extension creation in Google Ads is
> harness-blocked; scenario must NOT call this endpoint against the live account.

### GAD-057-happy — Assert route is present and harness-blocked
- **Entry point:** `POST /api/google-ads-extensions/<client-id>/create`
  (admin session).
- **Steps:** 1) Confirm harness intercept is active. 2) Assert any call to this
  endpoint is blocked before Growth Tools receives it. 3) Verify no extension was
  created in the live account.
- **Expected:** harness blocks the live create; account unchanged.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** route 404 → PROD-BUG. Harness block → expected.
- **Live extension create is harness-blocked; scenario must NOT call create live.**

---

## GAD-058 — Extension assign API · DANGER

> **Safety Interlock — DANGER.** Live extension assignment to a campaign/ad group
> is harness-blocked; scenario must NOT call this endpoint against the live account.

### GAD-058-happy — Assert route is present and harness-blocked
- **Entry point:** `POST /api/google-ads-extensions/<client-id>/assign`
  (admin session).
- **Steps:** 1) Confirm harness intercept is active. 2) Assert any call to this
  endpoint is blocked before Growth Tools receives it.
- **Expected:** harness blocks the live assign; no campaign/ad group modified.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** route 404 → PROD-BUG. Harness block → expected.
- **Live extension assign is harness-blocked; scenario must NOT call assign live.**

---

## GAD-059 — Extension delete API · DANGER

> **Safety Interlock — DANGER.** Live extension deletion in Google Ads is
> harness-blocked; scenario must NOT call this endpoint against the live account.

### GAD-059-happy — Assert route is present and harness-blocked
- **Entry point:** `POST /api/google-ads-extensions/<client-id>/delete`
  (admin session).
- **Steps:** 1) Confirm harness intercept is active. 2) Assert any call to this
  endpoint is blocked before Growth Tools receives it.
- **Expected:** harness blocks the live delete; no extension removed from the account.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** route 404 → PROD-BUG. Harness block → expected.
- **Live extension delete is harness-blocked; scenario must NOT call delete live.**

---

## GAD-060 — Extension sync API · DANGER

> **Safety Interlock — DANGER.** Live extension sync between CMS and Google Ads is
> harness-blocked; scenario must NOT call this endpoint against the live account.

### GAD-060-happy — Assert route is present and harness-blocked
- **Entry point:** `POST /api/google-ads-extensions/<client-id>/sync`
  (admin session).
- **Steps:** 1) Confirm harness intercept is active. 2) Assert any call to this
  endpoint is blocked before Growth Tools receives it. 3) Verify CMS and live
  account state are unchanged.
- **Expected:** harness blocks the live sync; no write to the Google Ads account.
- **Env/service deps:** harness block; **Growth Tools → Google Ads**.
- **Triage:** route 404 → PROD-BUG. Harness block → expected.
- **Live extension sync is harness-blocked; scenario must NOT call sync live.**

---

## GAD-061 — Match-type variants UI · READ

### GAD-061-happy — Match-type variants view renders correctly
- **Entry point:** open the match-type variants view for an audit record
  (`src/components/GoogleAdsMatchTypeVariants.tsx`).
- **Expected:** UI renders a list of match-type violation/consolidation variants
  (keyword, current match type, recommended consolidation) from stored audit data;
  no crash; empty state when no variants exist.
- **Env/service deps:** admin session; local DB.
- **Triage:** render crash on a record with stored variant data → PROD-BUG.

---

## GAD-062 — Snapshots collection · READ

### GAD-062-happy — Browse Google Ads snapshots collection
- **Entry point:** `/admin/collections/google-ads-snapshots` (admin session).
- **Expected:** list renders with snapshot records showing account, period, and
  key metrics; no crash; empty state acceptable for test DB.
- **Env/service deps:** admin session; local DB.
- **Triage:** 500 with valid session → PROD-BUG.

---

## GAD-063 — Snapshots cron API · EXTERNAL-SAFE

### GAD-063-happy — Cron fires with valid CRON_SECRET and captures snapshots
- **Entry point:** `GET /api/google-ads-snapshots/cron` with header
  `Authorization: Bearer <CRON_SECRET>`.
- **Steps:** 1) Read `CRON_SECRET` from env. 2) `fetch("http://localhost:3004/api/google-ads-snapshots/cron",
  { headers: { Authorization: \`Bearer ${CRON_SECRET}\` } })`. 3) Confirm
  `google-ads-snapshots` collection has a new record for the current period.
- **Expected:** 200 (or 202); at least one snapshot record created or updated for
  `659-101-3898`; Growth Tools live read.
- **Env/service deps:** `CRON_SECRET` (required); **Growth Tools** (live).
- **Triage:** `CRON_SECRET` absent → DEV-CONFIG. Growth Tools 5xx → UNKNOWN. Other
  error with secret present → PROD-BUG.

### GAD-063-edge — Request without CRON_SECRET returns 401
- **Entry point:** `GET /api/google-ads-snapshots/cron` with **no** `Authorization`
  header.
- **Steps:** `fetch("http://localhost:3004/api/google-ads-snapshots/cron")` (no header).
- **Expected:** 401 `{ error: "unauthorized" }` (or 403); cron does not execute;
  no snapshot written.
- **Triage:** 200 without secret → PROD-BUG (security). 401 → expected.
