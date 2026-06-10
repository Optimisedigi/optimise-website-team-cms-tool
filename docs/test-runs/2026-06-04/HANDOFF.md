# Platform Test-Swarm + Phase 5 Validation — Session Handoff

**Last updated:** 2026-06-05
**Purpose:** Complete state of the platform feature-test review so work can resume cleanly in a new
session with no prior context. Read this first, then `report.md` / `phase5-validation.md` /
`prod-bugs.md` for detail.

Plan of record: `.gg/plans/platform-feature-test-swarm.md`.
Machine-readable results: `docs/test-runs/2026-06-04/results.jsonl` (608 records — the source of truth;
all docs are regenerated/reconciled from it).

---

## 1. Current scoreboard (reconciled to results.jsonl)

- **608 scenarios:** 240 pass · 32 fail · 303 blocked · 33 skipped-DANGER
- **Features exercised:** 207 / 406
- **Fail triage:** PROD-BUG 5 rows (2 distinct defects) · DEV-CONFIG 26 · UNKNOWN 1
- Pass rate of executed (pass+fail): ~88%

The report coverage table sums **exactly** to these totals (verified).

---

## 2. What was done this session (chronological)

1. **Generated the run deliverables** from `results.jsonl`: `report.md` (coverage, triage, ranked
   issues), `prod-bugs.md`, `dev-config-review.md`. Ran teardown of test fixtures.
2. **Found the test DB was missing 9 migrations** — applied them to `content-voice-test.db`; this
   fixed a class of spurious 500s (a `findByID('clients',…)` joined `negative_keyword_lists`, which
   lacked the `relevancy_exclusion` column). Re-ran affected scenarios.
3. **Re-validated all 58 original PROD-BUG candidates** against the live migrated server →
   **collapsed to 2 real content-cms defects**; 56 were scenario-metadata artifacts (wrong
   `/api/payload/` prefix, unresolved `<id>`/`<slug>`, admin `hidden:true` collections, correct
   400/404 edge rejections).
4. **Resolved all UNKNOWNs** (were 10). One surfaced a real bug (consolidation auth — see §3).
5. **Phase 5 OptiMate real-data validation** — 11 records, surfaced + fixed 3 GSC defects (§3),
   confirmed typed chat is grounded (§4).
6. **Characterized the 303 blocked scenarios** (§5) — harness-design gaps, not broken features.

---

## 3. Bugs FIXED + committed this session (all in HEAD history)

| Commit | Fix |
|---|---|
| `c34ebad` | **consolidation-candidates API was dead in prod.** GET list + `[id]/approve` + `[id]/reject` authed via `(req as any).user`, which Next.js App Router never populates → 401 for everyone incl. admins. Switched all 3 to `await payload.auth({ headers: req.headers })`. Verified: 200 with admin cookie, 401 without. |
| `587c16c` | **GSC branded split used `groupType:"or"`** — rejected by the Search Console API (HTTP 400, only `"and"` is valid) → the split silently returned null in prod (hit the catch). Replaced with `includingRegex`/`excludingRegex` (regex-escaped brand terms, true OR/NOR). Also raised `rowLimit:25→25000` (was dropping long-tail totals). Empty-regex guard added. |
| `430cdb1` | **GSC branded-split ctr/position were unweighted per-row means.** CTR is now `clicks/impressions`; position is impression-weighted. Verified live across 3 clients. |

All 3 are committed and confirmed reachable from HEAD (survived the Syncthing sync — see §6).

---

## 4. Phase 5 — OptiMate data validation (the core of the original brief)

**Method:** the CMS holds no Google Ads creds, so ground truth = the same Growth Tools / GA4 / GSC /
CMS-DB the tools wrap, queried independently and compared within tolerance. **All harness scripts were
temporary and removed** — re-create from the patterns in `phase5-validation.md` to re-run.

**Validated faithful to ground truth (11 records):**
- `get_account_overview`, `get_search_terms`, `get_weekly_metric_table` (Monday-bucketing),
  `get_ga4_overview`, conversion **action** mapping (MTP 184-083-4992) — all **exact**.
- `get_ai_visibility`, `get_serp_displacement` — faithfully reflect CMS DB; honest "no data" when
  empty (no fabrication); SERP `trackedKeywordCount` matches DB exactly.
- **End-to-end typed chat (live LLM, `kimi-k2.6`):** agent calls a real tool before answering and
  returns exact numbers (MTP conv 69, Phone Click 37); **refuses to fabricate** unsupported metrics
  (Quality Score → "I don't have access…", no tool call).
- **Full 10-week WoW table on account 342-535-3766 (away-digital):** every cell (conversions, CPA,
  clicks) matches ground truth exactly, end-to-end through chat.

**IMPORTANT caveat the user is checking separately:** all Phase 5 ground truth is **Growth Tools vs
Growth Tools**. It proves OptiMate's *transformation layer* is faithful, NOT that Growth Tools itself
matches the Google Ads UI. The user is spot-checking account 342-535-3766's weekly numbers against the
actual Google Ads UI to close that last link. **Follow up: did the Ads-UI numbers match?**

---

## 5. The 303 blocked scenarios (coverage gaps, NOT failures)

| Count | Reason | How to recover |
|--:|---|---|
| 119 | CMS-WRITE needs a request body (many DANGER: email/Ads-push/Xero/contract) | encode request-body fixtures; DANGER only via preview/dry-run |
| 92 | no callable endpoint / behavioural assertion in surface text | rewrite scenario with a concrete path, or browser-drive |
| 51 | unresolved `[id]`/`[slug]` / non-navigable surface | resolve to a fixture record |
| 24 | admin-UI interaction ("→ tab", "Download button") | **needs Playwright** — cannot be curl'd |
| 12 | voice / realtime parity | **descoped** (voice not working) |
| 5 | goal-agent mocked-Payload seed | seed `goal-runs`/`goal-run-snapshots` |

Raising real coverage needs **(a) Playwright wired into the swarm** for admin-UI scenarios and
**(b) request-body fixtures** for the CMS-WRITE set. This is the regression-harness backlog.

---

## 6. OPEN / REMAINING work (prioritized)

1. **Deck-preview route is unreachable — OPEN, fix proven but BLOCKED by file-sync.**
   `/partners/_preview/[templateSlug]` 404s for valid templates because Next.js excludes
   underscore-prefixed (`_preview`) folders from routing. **Proven fix:** rename the folder to
   `%5Fpreview` (URL-encoded underscore — keeps the `/partners/_preview/` URL, zero code edits).
   It was applied + verified live (HTTP 200) twice but a **Syncthing daemon on this repo reverted it
   both times** (commits `60b9537`, `8f0d81e` restored `_preview`). **To land it:** on the
   authoritative machine with Syncthing paused, run
   `git mv "src/app/(frontend)/partners/_preview" "src/app/(frontend)/partners/%5Fpreview"`, commit,
   let it propagate. Impact: admin "Preview template" button + OptiMate deck-proposal preview iframe
   (client-facing decks unaffected). Details in `prod-bugs.md` §2.

2. **`account-structure` 500 — upstream Growth Tools defect, NOT content-cms.** The CMS route is a
   thin proxy; the `ENOENT …/03_campaign_totals.json` is Growth Tools' container error. Fix belongs
   in the Growth Tools repo. `prod-bugs.md` §3. (No content-cms action.)

3. **DEK-009 (single UNKNOWN):** `GET /api/clients?where[presentations.templateSlug][equals]=…`
   returns 500 — querying a sub-field inside the `presentations` array. Likely a Payload SQLite
   adapter limitation on nested-array filters, not core CMS. Low severity. Needs manual confirm:
   guard it or document as unsupported.

4. **Phase 5 breadth (optional):** grouped conversion *categories* (MTP uses flat actions, so
   bucketing of multiple actions under one label is unexercised — negligible, see picker behaviour
   in `phase5-validation.md`); portfolio cross-account tools; GA4 bounce/engagement sub-fields.
   Voice-vs-typed is **descoped** (voice not working).

5. **Confirm Growth-Tools-vs-Google-Ads-UI** for account 342-535-3766 (user doing this separately).

---

## 7. Environment / how to resume

- **Dev server:** `npm run dev` (port 3004). Reads `content-voice-test.db` live (SQLite — schema
  cached at boot; folder/route changes need a restart, column adds are picked up live).
- **Test DB:** `content-voice-test.db` (local, fully migrated, prod snapshot). **Never** run fixtures
  against prod Turso — `scripts/test-fixtures.ts` refuses unless `DATABASE_URL` starts with `file:`.
- **Admin auth for API/curl:** `local-admin@example.test` / password from `LOCAL_ADMIN_PASSWORD` in
  `.env.local` (currently `Test123`; I reset it during the session — harmless, matches env).
  Login: `POST /api/users/login` → reuse the `payload-token` cookie.
- **LLM in dev:** `kimi-k2.6` (Moonshot/KIMI key) is wired and used for live chat validation. Sonnet
  is the configured default but needs Anthropic creds.
- **Growth Tools + INTERNAL_API_KEY:** wired in dev (live Google Ads reads work).
- **Whitelisted/known accounts:** 659-101-3898 (test client, low conversions),
  184-083-4992 (MTP, client id 4, audit id 2 — real conversions),
  342-535-3766 (away-digital, client id 6, audit id 6 — high spend, rich data).
- **GSC valid tokens in dev:** clients 1, 3, 6. **GA4 valid token:** client 1 only.

### DB hygiene (IMPORTANT — keep it clean)
Every live chat turn writes `activity_log` rows (agent timeline) + a login creates `users_sessions`.
After any validation run, clean residue:
```sql
DELETE FROM users_sessions WHERE created_at > '2026-06-04T05:00:00';
DELETE FROM activity_log   WHERE agent_run_id = '<runId>';   -- per chat run
```
Current DB state: **clean** — 0 `zz-*` fixtures, 0 recent sessions, integrity_check ok, FK ok.
Test fixtures (zz-test-client/proposal) were torn down; recreate with
`npx tsx --env-file=.env --env-file=.env.local scripts/test-fixtures.ts` if needed.

### Pre-existing backup (NOT mine — do not delete)
`content-voice-test.db.bak` (dated May 30) is the user's, from before this session.

---

## 8. Files map

| File | What |
|---|---|
| `docs/test-runs/2026-06-04/results.jsonl` | Source of truth — 608 machine-readable records |
| `docs/test-runs/2026-06-04/report.md` | Run report: coverage, triage, ranked issues, blocked analysis |
| `docs/test-runs/2026-06-04/phase5-validation.md` | OptiMate data validation detail (8 tools + chat + 3 bugs) |
| `docs/test-runs/2026-06-04/prod-bugs.md` | Confirmed defects (deck-preview OPEN, account-structure upstream) |
| `docs/test-runs/2026-06-04/dev-config-review.md` | Dev-only failures for prod-vs-dev review |
| `docs/test-runs/2026-06-04/HANDOFF.md` | **This file** |
| `.gg/plans/platform-feature-test-swarm.md` | The plan of record |
