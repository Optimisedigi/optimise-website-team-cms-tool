# Test Scenarios — Clients & Proposals (`CLI`)

Standalone scenarios keyed to FEAT-IDs `CLI-001`…`CLI-033` from
[`../feature-catalog.md`](../feature-catalog.md). Read
[`./README.md`](./README.md) for fixtures, the env-key map, auth, and the binding
DANGER/Safety-Interlock rules. Base URL `http://localhost:3004`; admin scenarios
use `loginAdmin()` + `authedFetch()`.

Fixtures: client `zz-test-client` (PIN `4729`, Ads `6591013898`), proposal
`zz-test-proposal` (PIN `5836`).

---

## CLI-001 — Clients collection · CMS-WRITE

### CLI-001-happy — Create a client record
- **Entry point:** `POST /api/clients` (Payload REST) with admin session, or
  `/admin/collections/clients/create` in a browser.
- **Inputs:** `name: "ZZ Scenario Client"`, `slug: "zz-scenario-client"`,
  `website: "https://example.com"`, `status: "active"`, at least one service.
- **Steps:** 1) `loginAdmin()`. 2) `authedFetch("/api/clients", {method:"POST", body})`.
  3) `GET /api/clients/list` and confirm the new client appears.
- **Expected:** 201/200 with a created record id; client appears in the active list
  with the submitted name/slug.
- **Env/service deps:** Payload admin session (`TEST_ADMIN_PASSWORD`); local test DB. No external services.
- **Triage:** failure with no external dep → PROD-BUG. Log new id to teardown manifest.

### CLI-001-edge — Duplicate slug rejected
- **Entry point:** `POST /api/clients`.
- **Inputs:** `name: "ZZ Dup", slug: "zz-test-client"` (already used by the fixture).
- **Expected:** validation error / 400 — slug uniqueness enforced; no second record created.
- **Env/service deps:** admin session; local DB.
- **Triage:** if a duplicate is silently created → PROD-BUG.

## CLI-002 — Client list API · READ
### CLI-002-happy — List active clients
- **Entry point:** `GET /api/clients/list` (admin session).
- **Expected:** 200 JSON array; each item has `name`, `slug`, GSC/GA4 connection
  status, blog settings; `zz-test-client` is present.
- **Env/service deps:** admin session; local DB.
- **Triage:** 401 without session is expected; 500 with session → PROD-BUG.

## CLI-003 — Client SEO list API · READ
### CLI-003-happy — SEO-enriched client list
- **Entry point:** `GET /api/clients/seo-list` (admin session).
- **Expected:** 200 array with per-client SEO-audit + GSC connection state; test
  client shows GSC **disconnected**.
- **Env/service deps:** admin session; local DB.
- **Triage:** disconnected GSC is expected (DEV-CONFIG, not a bug).

## CLI-004 — Client Google Ads list API · READ
### CLI-004-happy — Ads-enriched client list
- **Entry point:** `GET /api/clients/google-ads-list` (admin session).
- **Expected:** 200 array enriched with Google Ads audit/budget status; test client
  present with its customer id `6591013898`.
- **Env/service deps:** admin session; local DB. (Budget enrichment may call Growth Tools.)
- **Triage:** missing budget data while base list returns → likely Growth Tools shape → UNKNOWN.

## CLI-005 — Agency client toggle · CMS-WRITE
### CLI-005-happy — Set/confirm a single agency client
- **Entry point:** `/admin/collections/clients/<agency-id>` → `isAgency` checkbox (browser).
- **Inputs:** check `isAgency` on the designated agency client and save.
- **Expected:** save succeeds; `AgencyBadge` banner renders on the record.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on save/render failure.

### CLI-005-edge — Second agency blocked
- **Entry point:** same field on a **different** client (`zz-test-client`).
- **Inputs:** attempt to set `isAgency: true` while another agency already exists.
- **Expected:** validation blocks the save (only one agency allowed); no second flag set.
- **Triage:** if two agencies persist → PROD-BUG. Reset the flag afterwards.

## CLI-006 — Agency client lookup API · READ
### CLI-006-happy — Resolve the agency client
- **Entry point:** `GET /api/clients/agency-client` (admin session).
- **Expected:** 200 `{ client: { id, name } }` for the single `isAgency` record.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG if it returns wrong/multiple records.

## CLI-007 — Client bookmarks export · READ
### CLI-007-happy — Download bookmark HTML
- **Entry point:** `GET /api/clients/<id>/bookmarks` for `zz-test-client` (admin session).
- **Expected:** 200 `text/html` Netscape-bookmark file (filename `zz-test-client-bookmarks.html`)
  containing the website, Google Ads, GA4, GTM, GSC links.
- **Env/service deps:** admin session; local DB (URLs composed locally).
- **Triage:** PROD-BUG on 500 / malformed file.

## CLI-008 — Client performance report · EXTERNAL-SAFE
### CLI-008-happy — Fetch a monthly Ads performance report
- **Entry point:** `POST /api/clients/<id>/performance-report` for `zz-test-client`.
- **Inputs:** `{ year: 2025, month: 11 }`.
- **Expected:** 200 with spend/conversion data for the whitelisted account.
- **Env/service deps:** admin session; **Growth Tools** (`GROWTH_TOOLS_URL`, live).
- **Triage:** Growth Tools 5xx → UNKNOWN; non-Growth-Tools error → PROD-BUG.

### CLI-008-edge — Missing customer id
- **Inputs:** call against a client with **no** `googleAdsCustomerId`.
- **Expected:** graceful 400/422 with a clear "no customer id" message; no Growth Tools call.
- **Triage:** unhandled crash → PROD-BUG.

## CLI-009 — Bulk assign account managers · CMS-WRITE
### CLI-009-happy — Append managers to selected clients
- **Entry point:** `POST /api/clients/assign-managers` (admin session) or the
  Clients list bulk button.
- **Inputs:** `{ clientIds: [<zz-test-client id>], managerIds: [<a user id>], mode: "append" }`.
- **Expected:** 200; the test client's account-managers list now includes the user.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on failure. Revert managers after.

## CLI-010 — Account managers field · CMS-WRITE
### CLI-010-happy — Edit account managers inline
- **Entry point:** `/admin/collections/clients/<zz id>` → Contacts & Managers → Account Managers array.
- **Inputs:** add one manager row (name + email), save.
- **Expected:** row persists and renders on reload.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on persist failure.

## CLI-011 — Client record header · READ
### CLI-011-happy — Header renders on a client
- **Entry point:** open `/admin/collections/clients/<zz id>` (browser screenshot).
- **Expected:** header card shows logo, name, website, Ads id, status pill, service pills.
- **Env/service deps:** admin session.
- **Triage:** render crash → PROD-BUG.

## CLI-012 — Client proposals collection · CMS-WRITE
### CLI-012-happy — Create a proposal
- **Entry point:** `POST /api/client-proposals` (admin session).
- **Inputs:** `businessName: "ZZ Scenario Proposal"`, `website`, a keyword category,
  a contact.
- **Expected:** 200/201; slug auto-generated; record listed.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG. Log id for teardown.

### CLI-012-edge — Missing required business name
- **Inputs:** POST without `businessName`.
- **Expected:** validation 400; no record created.
- **Triage:** silent create → PROD-BUG.

## CLI-013 — Proposal convert-to-client · CMS-WRITE
### CLI-013-happy — Convert proposal to client (staged)
- **Entry point:** `/admin/collections/client-proposals/<a throwaway proposal>` →
  check `Convert to Client` → save.
- **Inputs:** use a **new throwaway proposal** (not the shared fixture) so the side effect is isolated.
- **Expected:** a new Client record is created, audits/briefings re-linked, contract
  financials ported; proposal `proposalStatus` becomes `client`.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on partial/failed port. Log both records for teardown.

## CLI-014 — Proposal start-as-lead toggle · CMS-WRITE
### CLI-014-happy — Flip start-as-lead
- **Entry point:** throwaway proposal → check `Start as Lead` → save.
- **Expected:** a SalesLead is created and linked; the toggle auto-resets to off.
- **Env/service deps:** admin session; local DB.
- **Triage:** no lead created / toggle stuck on → PROD-BUG.

## CLI-015 — Proposals show-converted toggle · READ
### CLI-015-happy — Reveal converted proposals
- **Entry point:** Proposals admin list → "Include Converted" toggle (browser).
- **Expected:** list now includes `proposalStatus: client` rows; toggling off hides them.
- **Env/service deps:** admin session.
- **Triage:** PROD-BUG if filter has no effect.

## CLI-016 — Public proposal report · READ
### CLI-016-happy — View report with correct PIN
- **Entry point:** `/proposals/zz-test-proposal` (no session) → enter PIN `5836`.
- **Expected:** PIN accepted; audit report renders.
- **Env/service deps:** none (local DB); PIN auth via `/api/audit-auth`.
- **Triage:** PROD-BUG if correct PIN rejected.

### CLI-016-edge — Wrong PIN blocked
- **Inputs:** enter PIN `0000`.
- **Expected:** access denied; report not shown; repeated attempts rate-limited (429).
- **Triage:** if wrong PIN unlocks → PROD-BUG (security).

## CLI-017 — Proposal editor (public) · CMS-WRITE
### CLI-017-happy — Adjust exclusions and notes
- **Entry point:** `/proposals/zz-test-proposal/edit` (admin session).
- **Inputs:** toggle an excluded competitor/keyword and edit a slide note; save.
- **Expected:** PATCH persists; reload reflects the change.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on persist failure.

## CLI-018 — Proposal v2 view · READ
### CLI-018-happy — Render the v2 deck
- **Entry point:** `/proposals/zz-test-proposal/v2` (admin session or PIN `5836`).
- **Expected:** v2 slide deck renders without crash.
- **Env/service deps:** session or PIN.
- **Triage:** render crash → PROD-BUG.

## CLI-019 — Proposal edit API · CMS-WRITE
### CLI-019-happy — GET then PATCH exclusions
- **Entry point:** `GET /api/proposals/<zz id>/edit` then `PATCH` same.
- **Inputs:** PATCH `{ excludedCompetitorDomains: ["foo.com"], slideNotes: "..." }`.
- **Expected:** GET returns current arrays; PATCH 200; values persisted.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG. Revert after.

## CLI-020 — Proposal audit status API · READ
### CLI-020-happy — Poll audit status
- **Entry point:** `GET /api/proposals/<zz id>/audit-status` (admin session).
- **Expected:** 200 `{ status, stage, percent, error }` (likely `idle`/no run for a fresh proposal).
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on 500.

## CLI-021 — Client discovery briefings collection · CMS-WRITE
### CLI-021-happy — Create a briefing record
- **Entry point:** `/admin/collections/client-discovery-briefings/create` linked to `zz-test-client`.
- **Inputs:** minimal answers + markdown blob; save.
- **Expected:** record saved and linked to the client.
- **Env/service deps:** admin session; **Vercel Blob** (panel saves); local DB.
- **Triage:** Blob save failure → check `BLOB_READ_WRITE_TOKEN` (PROD-BUG if wired).

## CLI-022 — Discovery briefing by-scope API · CMS-WRITE
### CLI-022-happy — Upsert briefing by scope
- **Entry point:** `GET /api/client-discovery-briefings/by-scope?scope=client&id=<zz id>`
  then `PUT` same path with `{ data: {...} }`.
- **Expected:** GET returns existing-or-empty; PUT 200 persists answers.
- **Env/service deps:** admin session; Vercel Blob; local DB.
- **Triage:** PROD-BUG on persist failure.

### CLI-022-edge — Invalid scope
- **Inputs:** `?scope=bogus&id=1`.
- **Expected:** 400/422 with a clear validation error.
- **Triage:** crash → PROD-BUG.

## CLI-023 — Discovery briefing admin panel · CMS-WRITE
### CLI-023-happy — Panel renders inside client tab
- **Entry point:** `/admin/collections/clients/<zz id>` → Discovery Briefing tab (browser).
- **Expected:** `DiscoveryBriefingPanel` form + PIN-gate/visibility controls render; an edit autosaves.
- **Env/service deps:** admin session.
- **Triage:** render/save crash → PROD-BUG.

## CLI-024 — Discovery briefing form (public) · CMS-WRITE
### CLI-024-happy — Fill public briefing form
- **Entry point:** `/discovery/client/<zz id>` (or `/client/zz-test-client/discovery/<briefingId>`);
  enter PIN `4729` if gated.
- **Inputs:** answer one section field; let it autosave.
- **Expected:** answer autosaves and survives reload.
- **Env/service deps:** PIN (rate-limited); local DB.
- **Triage:** autosave failure → PROD-BUG.

## CLI-025 — Discovery PIN gate · READ
### CLI-025-happy — Unlock with correct PIN
- **Entry point:** a PIN-gated discovery URL → enter `4729`.
- **Expected:** form unlocks in component state.
- **Triage:** correct PIN rejected → PROD-BUG.

### CLI-025-edge — Wrong PIN stays locked
- **Inputs:** PIN `1111`.
- **Expected:** stays locked; repeated attempts rate-limited.
- **Triage:** wrong PIN unlocks → PROD-BUG (security).

## CLI-026 — Discovery auth API · READ
### CLI-026-happy — Verify correct PIN
- **Entry point:** `POST /api/discovery-auth` `{ scope:"client", slug:"zz-test-client", briefingId:<id>, password:"4729" }`.
- **Expected:** `{ ok: true }`.
- **Triage:** correct PIN false → PROD-BUG.

### CLI-026-edge — Wrong PIN + lockout
- **Inputs:** `password:"9999"` repeated.
- **Expected:** `{ ok:false }`; after threshold, rate-limited (429).
- **Triage:** no lockout → PROD-BUG (security).

## CLI-027 — Sales leads collection · CMS-WRITE
### CLI-027-happy — Create and advance a lead
- **Entry point:** `POST /api/sales-leads` (admin) or admin create form.
- **Inputs:** `name`, `channel`, `estimatedValue`, `stage:"new"`; then update to `contacted`.
- **Expected:** record created; stage transition persists with history.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG. Log id for teardown.

## CLI-028 — Inbound lead capture API · CMS-WRITE
### CLI-028-happy — Capture an inbound form submission
- **Entry point:** `POST /api/leads/inbound` with header `x-lead-key: <key>`.
- **Inputs:** `{ name, email, utm_source:"google", gclid:"test123" }`.
- **Expected:** 200; a SalesLead is created with channel auto-attributed; **no email sent**.
- **Env/service deps:** `x-lead-key` (lead key); local DB.
- **Triage:** 401 without key is expected; with key → PROD-BUG on failure.

### CLI-028-edge — Dedup within 24h
- **Inputs:** POST the same email twice within 24h.
- **Expected:** second call deduped (no duplicate lead).
- **Triage:** duplicate created → PROD-BUG.

## CLI-029 — Sales funnel dashboard · READ
### CLI-029-happy — Dashboard renders with filter
- **Entry point:** open the Sales Funnel dashboard (browser, admin) and pick period `90d`.
- **Expected:** funnel viz, channel breakdown, monthly trend, conversion rates render.
- **Env/service deps:** admin session.
- **Triage:** render crash → PROD-BUG.

## CLI-030 — Sales funnel API · READ
### CLI-030-happy — Aggregated funnel JSON
- **Entry point:** `GET /api/sales-funnel?period=ytd` (admin session).
- **Expected:** 200 `{ summary, funnel, channels, monthlyTrend, lostReasons, recentLeads }`.
- **Env/service deps:** admin session; local DB.
- **Triage:** PROD-BUG on 500/malformed shape.

## CLI-031 — Drip email tracker · READ
### CLI-031-happy — View drip leads + preview
- **Entry point:** open `DripEmailTracker` (browser, admin); click a row's preview.
- **Expected:** lead list with send status renders; preview shows rendered email HTML.
- **Env/service deps:** admin session; **Postgres `drip_leads`** table.
- **Triage:** if `drip_leads` not present in dev DB → DEV-CONFIG (empty/error expected).

## CLI-032 — Drip leads API · READ
### CLI-032-happy — List + preview drip leads
- **Entry point:** `GET /api/drip-leads` then `GET /api/drip-leads?preview=2&id=<id>`.
- **Expected:** list JSON; preview returns email HTML.
- **Env/service deps:** admin session; Postgres `drip_leads`.
- **Triage:** missing table → DEV-CONFIG; other 500 → PROD-BUG.

## CLI-033 — Start process from lead button · CMS-WRITE
### CLI-033-happy — Start a process from a lead
- **Entry point:** open a throwaway SalesLead → Lead Details tab → "Start Process" → pick a template → confirm.
- **Expected:** a ClientProcess is created from the template, seeded with the lead's context.
- **Env/service deps:** admin session; local DB. (Catalog notes an `email` dep on the
  create-from-template route — see PRO-007; any send is harness-blocked.)
- **Triage:** no process created → PROD-BUG; email-send block ≠ failure. Log ids for teardown.
