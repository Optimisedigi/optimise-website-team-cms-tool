# DEV-CONFIG Review — Prod-vs-Dev

**Run date:** 2026-06-04

> Failures the swarm triaged as **DEV-CONFIG**: they fail only because the dev env
> lacks a key / uses the local test DB / an external service isn't wired. Review each:
> *would this pass in production?* These are **not** confirmed code bugs.

**Count:** 24 DEV-CONFIG items (post re-run; `INF-014-happy` added below).

---

## audits

### AUD-041-happy — `GET /api/site-health/cron` with header `Authorization: Bearer <CRON_SECRET>`;
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, CRON_SECRET

## client-portals

### POR-002-happy — `GET /api/client-hub/zz-test-client` (admin session).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### POR-004-happy — `GET /api/client-hub/zz-test-client/requests` then
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### POR-008-happy — `GET /api/dashboard/data?slug=zz-test-client` (PIN-authenticated;
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### POR-026-happy — `GET /api/pin-rate-limits` (Payload REST, admin session) — or
- **Observed:** HTTP 403 Forbidden
- **Env deps:** TEST_ADMIN_PASSWORD

## finance

### FIN-019-edge — `GET /api/invoice-statements/sweep` (no auth header).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### FIN-019-happy — `GET /api/invoice-statements/sweep` (cron route).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, CRON_SECRET

### FIN-031-edge — `GET /api/diag/revenue-breakdown` (no auth header).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### FIN-031-happy — `GET /api/diag/revenue-breakdown` (API-key gated).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### FIN-032-edge — `GET /api/client-hub/zz-no-such-client/value-ledger` (admin session).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### FIN-033-edge — `GET /api/client-hub/zz-no-such-client/forecast-scenarios` (admin session).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

## google-ads-audits

### GAD-053-happy — `GET /api/google-ads-budgets/monthly-recommendations?clientId=<id>`
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### GAD-063-edge — `GET /api/google-ads-snapshots/cron` with **no** `Authorization`
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, CRON_SECRET

### GAD-063-happy — `GET /api/google-ads-snapshots/cron` with header
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, CRON_SECRET

## gsc-serp-ai

### GSC-010-edge — `GET /api/gsc/cron` with no auth header.
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, GOOGLE_CLIENT_ID, CRON_SECRET

### GSC-010-happy — `GET /api/gsc/cron` (bearer `CRON_SECRET`).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, GOOGLE_CLIENT_ID, CRON_SECRET

### GSC-033-edge — `GET /api/organic-growth-snapshots/sweep` with no auth header.
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### GSC-033-sweep — `GET /api/organic-growth-snapshots/sweep` (bearer `CRON_SECRET`).
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, CRON_SECRET

## negative-keywords

### NEG-018-happy — `GET /api/negative-keyword-lists/export?listId=<nkl-id>`
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### NEG-023-happy — `GET /api/negative-sweep/cron` with header
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, CRON_SECRET

### NEG-029-happy — `GET /api/match-type-violations/cron` with
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD, CRON_SECRET

## platform-infra

### INF-014-happy — `GET /api/gmail/connect` (admin session).
- **Observed:** HTTP 500 — `{"error":"Gmail OAuth credentials not configured (need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REDIRECT_URI)."}`
- **Env deps:** GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REDIRECT_URI
- **Notes:** Confirmed via re-run. The route intentionally returns this when Gmail OAuth creds are unset in
  dev. Would work in prod where the creds are configured. (Minor: a 503 would be more correct than 500.)

### INF-028-edge — `GET /api/goal-agents/watchdog` with **no** `Authorization`
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD

### INF-028-happy — `GET /api/goal-agents/watchdog` with
- **Observed:** HTTP 401 Unauthorized
- **Env deps:** TEST_ADMIN_PASSWORD
