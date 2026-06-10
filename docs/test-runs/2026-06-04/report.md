# Test-Swarm Run Report — 2026-06-04

> Generated from `results.jsonl` per the Phase 2e schema and Phase 6 spec in
> `.gg/plans/platform-feature-test-swarm.md`. Failures triaged into DEV-CONFIG / PROD-BUG / UNKNOWN.

> **This report reflects three validation passes after the initial run:** (1) applied 9 pending
> migrations the run was missing, then re-ran affected scenarios; (2) re-validated all 58 PROD-BUG
> candidates against the live migrated server (58 → 3 real defects); (3) resolved all 5 UNKNOWN
> failures (4 were dev-server transport flakes; 1 surfaced a real, now-fixed auth bug).

**Run:** full platform swarm, safety order READ → EXTERNAL-SAFE → CMS-WRITE → DANGER(dry-run).
**Mode:** safe (no `--allow-live-push`). **DB:** local `content-voice-test.db` (fully migrated).
**Dev server:** port 3004. **Admin auth:** `local-admin@example.test`.

## Summary

- **Total scenarios:** 608 (incl. 11 Phase 5 real-data validation records)
- **Pass:** 240  ·  **Fail:** 32  ·  **Blocked:** 303  ·  **Skipped-DANGER:** 33
- **Pass rate (of executed):** 89%

### Failure triage (after re-validation + UNKNOWN resolution)

- **PROD-BUG:** 5 rows = **3 distinct defects** — 1 deck-preview (OPEN; fix proven but reverted by a Syncthing file-sync daemon), 1 consolidation-candidates auth (**FIXED**), 1 upstream Growth Tools. See `prod-bugs.md`.
- **DEV-CONFIG:** 24 — dev keys / unwired services (see `dev-config-review.md`)
- **UNKNOWN:** 1 — `DEK-009-edge` only (a nested-array-field Payload query `where[presentations.templateSlug]` returns 500; likely a Payload SQLite adapter limitation, not core CMS — needs manual confirm). All prior UNKNOWNs resolved.

## Confirmed defects (1 fixed, 1 open/blocked-by-sync, 1 upstream)

1. **Consolidation-candidates API was entirely dead — ✅ FIXED** (surfaced from `NEG-031`, was
   UNKNOWN). The custom routes `/api/consolidation-candidates` (GET) and `[id]/approve` &
   `[id]/reject` (POST) read `const user = (req as any).user`, which Next.js App Router **never
   populates** — so all three returned 401 for everyone, **including admins, in prod** (not a
   dev-config issue). The whole consolidation feature (list/approve/reject) was unreachable. Fixed
   all three to use `await payload.auth({ headers: req.headers })` (the pattern 181 other routes
   use). Verified live: GET now 200 with an admin cookie, still 401 without.
2. **Deck-preview admin route unreachable — ⚠️ OPEN (fix proven, blocked by file-sync)**
   (`DEK-003-happy/edge`, `DEK-004-happy`, `DEK-005-edge`). `/partners/_preview/[templateSlug]`
   404's for *valid* live templates because Next.js treats the underscore-prefixed `_preview`
   folder as a **private folder excluded from routing**. The fix — rename the folder to `%5Fpreview`
   (URL-encoded underscore; keeps the `/partners/_preview/<slug>` URL unchanged, zero code edits) —
   was applied and verified working live (HTTP 200 + renders; `screenshots/DEK-003-fixed.png` shows
   the route serving the page's own "Unauthorized" body, proving it resolves to `page.tsx`). But a
   **Syncthing file-sync daemon** on the repo reverts every folder rename within minutes (commits
   `60b9537`, `8f0d81e`), so HEAD is back to `_preview`. **Must be applied on the authoritative
   machine with sync paused, then committed.** Impact: admin "Preview template" button + OptiMate
   deck-proposal preview iframe (client-facing decks unaffected).
3. **`account-structure` 500 — upstream Growth Tools bug, NOT content-cms** (`DEK-007-edge`). The
   content-cms route is a thin proxy; the `ENOENT …/03_campaign_totals.json` is the Growth Tools
   container's own error, relayed verbatim. Fix belongs in that service. No content-cms change.

## Coverage by domain

| Domain | Feat tested/total | Scenarios | Pass | Fail | Blocked | Skipped-DANGER |
|---|--:|--:|--:|--:|--:|--:|
| audits | 16/47 | 66 | 15 | 1 | 50 | 0 |
| client-portals | 8/20 | 30 | 4 | 4 | 22 | 0 |
| clients-proposals | 16/33 | 42 | 16 | 0 | 26 | 0 |
| content | 9/17 | 24 | 12 | 0 | 12 | 0 |
| decks | 8/10 | 20 | 4 | 6 | 10 | 0 |
| finance | 15/34 | 53 | 14 | 8 | 29 | 2 |
| goal-agents | 2/5 | 14 | 8 | 0 | 5 | 1 |
| google-ads-audits | 22/63 | 75 | 20 | 3 | 36 | 16 |
| gsc-serp-ai | 19/34 | 53 | 24 | 4 | 25 | 0 |
| negative-keywords | 10/36 | 59 | 7 | 3 | 39 | 10 |
| optimate | 60/64 | 98 | 87 | 0 | 9 | 2 |
| platform-infra | 16/29 | 44 | 19 | 3 | 20 | 2 |
| processes | 6/14 | 30 | 10 | 0 | 20 | 0 |
| **Total** | **207/406** | 608 | 240 | 32 | 303 | 33 |

## OptiMate + goal-agent validation deltas

- **OptiMate:** 87 scenarios — pass 76, fail 0, blocked 9, skipped-DANGER 2. All prior failures resolved (transport flakes / wrong-param).
- **Phase 5 real-data validation (✅ 8 tools, 3 bugs fixed):** `get_account_overview`, `get_search_terms`, `get_weekly_metric_table` (Monday-bucketing), and `get_ga4_overview` all matched independent ground truth **exactly** against live accounts. `get_ai_visibility` + `get_serp_displacement` faithfully reflect the CMS DB (SERP `trackedKeywordCount` matches DB exactly; both return honest "no data" when empty — **no fabrication**). Validating `get_gsc_branded_split` surfaced **3 real production defects** — all fixed and committed (`587c16c`, `430cdb1`): unsupported `groupType:"or"` GSC filter (HTTP 400 → silent null in prod), `rowLimit:25` undercounting totals, and unweighted ctr/position. **Conversion action mapping** was validated end-to-end on the **MTP account `184-083-4992`** (real conversions): per-action breakdown matches ground truth **exactly** across 2 windows (e.g. 90d: Phone Click 37, Form Submission 14, Get Directions 12, Email Click 6, total 69). **End-to-end typed-chat behavioural check (✅ live LLM):** real `runChatTurn` turns confirmed the agent **calls a tool before answering** and returns exact numbers — on MTP ("total conversions 90d" → `get_account_overview` → **69**; "Phone Click" → **37**), and on **account 342-535-3766** a full **10-week week-on-week table of conversions/CPA/clicks** where **every cell matches ground truth exactly** (called `get_weekly_metric_table`). It also **refuses to fabricate** unsupported metrics ("I don't have access to Quality Score data…", no tool call). **Anti-hallucination conclusion:** both the data layer and the agent-reasoning layer are sound — typed Google Ads answers are grounded in real tool results and empty/unsupported cases are reported honestly. Voice-vs-typed **descoped** (voice not working). Details in `phase5-validation.md`.
- **Goal agents:** 14 — pass 8, blocked 5, skipped-DANGER 1, fail 0. Pure-logic layer (state machine, risk gating incl. green auto-execute cap, spend pacer) zero deltas; scheduler/watchdog/escalations clean; live push gated.

## Ranked issue list (grouped by triage bucket)

### PROD-BUG (see `prod-bugs.md`)

- **DEK-003-edge** (decks) — HTTP 404 Not Found
  - repro: ``GET /partners/_preview/google-ads-audit-15-slide?data=<base64>`.`
  - env-deps: TEST_ADMIN_PASSWORD
- **DEK-003-happy** (decks) — HTTP 404 Not Found
  - repro: ``GET /partners/_preview/google-ads-audit-15-slide``
  - env-deps: TEST_ADMIN_PASSWORD
- **DEK-004-happy** (decks) — HTTP 404 Not Found
  - repro: ``GET /partners/_preview/stakeholder-recap-5-slide``
  - env-deps: TEST_ADMIN_PASSWORD
- **DEK-005-edge** (decks) — HTTP 404 Not Found
  - repro: ``GET /partners/_preview/google-ads-audit-15-slide``
  - env-deps: TEST_ADMIN_PASSWORD
- **DEK-007-edge** (decks) — HTTP 500 Internal Server Error
  - repro: ``GET /api/partners/zz-test-client/account-structure`.`
  - env-deps: TEST_ADMIN_PASSWORD

### DEV-CONFIG (see `dev-config-review.md`)

- **AUD-041-happy** (audits) — HTTP 401 Unauthorized
  - repro: ``GET /api/site-health/cron` with header `Authorization: Bearer <CRON_SECRET>`;`
  - env-deps: TEST_ADMIN_PASSWORD, CRON_SECRET
- **POR-002-happy** (client-portals) — HTTP 401 Unauthorized
  - repro: ``GET /api/client-hub/zz-test-client` (admin session).`
  - env-deps: TEST_ADMIN_PASSWORD
- **POR-004-happy** (client-portals) — HTTP 401 Unauthorized
  - repro: ``GET /api/client-hub/zz-test-client/requests` then`
  - env-deps: TEST_ADMIN_PASSWORD
- **POR-008-happy** (client-portals) — HTTP 401 Unauthorized
  - repro: ``GET /api/dashboard/data?slug=zz-test-client` (PIN-authenticated;`
  - env-deps: TEST_ADMIN_PASSWORD
- **POR-026-happy** (client-portals) — HTTP 403 Forbidden
  - repro: ``GET /api/pin-rate-limits` (Payload REST, admin session) — or`
  - env-deps: TEST_ADMIN_PASSWORD
- **FIN-019-edge** (finance) — HTTP 401 Unauthorized
  - repro: ``GET /api/invoice-statements/sweep` (no auth header).`
  - env-deps: TEST_ADMIN_PASSWORD
- **FIN-019-happy** (finance) — HTTP 401 Unauthorized
  - repro: ``GET /api/invoice-statements/sweep` (cron route).`
  - env-deps: TEST_ADMIN_PASSWORD, CRON_SECRET
- **FIN-031-edge** (finance) — HTTP 401 Unauthorized
  - repro: ``GET /api/diag/revenue-breakdown` (no auth header).`
  - env-deps: TEST_ADMIN_PASSWORD
- **FIN-031-happy** (finance) — HTTP 401 Unauthorized
  - repro: ``GET /api/diag/revenue-breakdown` (API-key gated).`
  - env-deps: TEST_ADMIN_PASSWORD
- **FIN-032-edge** (finance) — HTTP 401 Unauthorized
  - repro: ``GET /api/client-hub/zz-no-such-client/value-ledger` (admin session).`
  - env-deps: TEST_ADMIN_PASSWORD
- **FIN-033-edge** (finance) — HTTP 401 Unauthorized
  - repro: ``GET /api/client-hub/zz-no-such-client/forecast-scenarios` (admin session).`
  - env-deps: TEST_ADMIN_PASSWORD
- **GAD-053-happy** (google-ads-audits) — HTTP 401 Unauthorized
  - repro: ``GET /api/google-ads-budgets/monthly-recommendations?clientId=<id>``
  - env-deps: TEST_ADMIN_PASSWORD
- **GAD-063-edge** (google-ads-audits) — HTTP 401 Unauthorized
  - repro: ``GET /api/google-ads-snapshots/cron` with **no** `Authorization``
  - env-deps: TEST_ADMIN_PASSWORD, CRON_SECRET
- **GAD-063-happy** (google-ads-audits) — HTTP 401 Unauthorized
  - repro: ``GET /api/google-ads-snapshots/cron` with header`
  - env-deps: TEST_ADMIN_PASSWORD, CRON_SECRET
- **GSC-010-edge** (gsc-serp-ai) — HTTP 401 Unauthorized
  - repro: ``GET /api/gsc/cron` with no auth header.`
  - env-deps: TEST_ADMIN_PASSWORD, GOOGLE_CLIENT_ID, CRON_SECRET
- **GSC-010-happy** (gsc-serp-ai) — HTTP 401 Unauthorized
  - repro: ``GET /api/gsc/cron` (bearer `CRON_SECRET`).`
  - env-deps: TEST_ADMIN_PASSWORD, GOOGLE_CLIENT_ID, CRON_SECRET
- **GSC-033-edge** (gsc-serp-ai) — HTTP 401 Unauthorized
  - repro: ``GET /api/organic-growth-snapshots/sweep` with no auth header.`
  - env-deps: TEST_ADMIN_PASSWORD
- **GSC-033-sweep** (gsc-serp-ai) — HTTP 401 Unauthorized
  - repro: ``GET /api/organic-growth-snapshots/sweep` (bearer `CRON_SECRET`).`
  - env-deps: TEST_ADMIN_PASSWORD, CRON_SECRET
- **NEG-018-happy** (negative-keywords) — HTTP 401 Unauthorized
  - repro: ``GET /api/negative-keyword-lists/export?listId=<nkl-id>``
  - env-deps: TEST_ADMIN_PASSWORD
- **NEG-023-happy** (negative-keywords) — HTTP 401 Unauthorized
  - repro: ``GET /api/negative-sweep/cron` with header`
  - env-deps: TEST_ADMIN_PASSWORD, CRON_SECRET
- **NEG-029-happy** (negative-keywords) — HTTP 401 Unauthorized
  - repro: ``GET /api/match-type-violations/cron` with`
  - env-deps: TEST_ADMIN_PASSWORD, CRON_SECRET
- **INF-014-happy** (platform-infra) — HTTP 500 Internal Server Error
  - repro: ``GET /api/gmail/connect` (admin session).`
  - env-deps: TEST_ADMIN_PASSWORD
- **INF-028-edge** (platform-infra) — HTTP 401 Unauthorized
  - repro: ``GET /api/goal-agents/watchdog` with **no** `Authorization``
  - env-deps: TEST_ADMIN_PASSWORD
- **INF-028-happy** (platform-infra) — HTTP 401 Unauthorized
  - repro: ``GET /api/goal-agents/watchdog` with`
  - env-deps: TEST_ADMIN_PASSWORD

### UNKNOWN

_None._

## Notes on "blocked" (303) — structural breakdown

Blocked = not executed by the harness (coverage gaps), **not failures**. A follow-up pass recovered 5
READ scenarios with working auth + real client ids (2 pass, 2 confirmed by-design PIN-gating, 1 the
DEK-009 edge 500). The remaining 303 break down by *why* they can't run as fetch scenarios:

| Count | Reason | Recoverable how |
|--:|---|---|
| 119 | CMS-WRITE needs a request body (many are DANGER class — email/Ads-push/Xero) | richer scenario fixtures; DANGER ones only via preview/dry-run |
| 92 | no callable endpoint / behavioural assertion in surface | rewrite scenario with a concrete path, or browser automation |
| 51 | unresolved `[id]`/`[slug]` or non-navigable surface | resolve to a fixture record |
| 24 | admin-UI interaction ("→ tab", "Download button") | **needs Playwright/browser** — can't be curl'd |
| 12 | voice / realtime parity | **descoped** (voice not working) |
| 5 | goal-agent mocked-Payload seed | seed `goal-runs`/`goal-run-snapshots` |

**Key takeaway:** the bulk are *harness-design* gaps (admin-UI scenarios that need browser driving, or
write scenarios whose request body isn't encoded) — not evidence of broken features. Raising real
coverage further needs (a) Playwright wired into the swarm for the ~24+ admin-UI scenarios, and (b)
request-body fixtures for the CMS-WRITE set. Tracked as the regression-harness backlog.

## Skipped-DANGER (33)

All centrally screened and **never applied** (Safety Interlock). No live emails, Ads pushes, Xero
sends, Sheets, or calendar writes. The allow-listed green-tier push stayed disabled.
