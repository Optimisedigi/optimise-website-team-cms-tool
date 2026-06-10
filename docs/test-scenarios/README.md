# Test Scenarios — shared conventions

Per-domain, standalone, executable test scenarios keyed to **FEAT-IDs** from
[`../feature-catalog.md`](../feature-catalog.md). This is **Phase 3** of
[`.gg/plans/platform-feature-test-swarm.md`](../../.gg/plans/platform-feature-test-swarm.md).

> ⚠️ Every run is governed by the **Safety Interlock** in
> [`../test-runs/README.md`](../test-runs/README.md). **DANGER** scenarios are
> tested via **dry-run / preview / approval-staging only — never live.** The one
> and only permitted live external write is the single opt-in green-tier negative
> push on campaign `search_cro-audit-tool_au` in account `659-101-3898`, behind
> the explicit `--allow-live-push` flag. Nothing else goes live.

One file per domain (matches the 12 FEAT-ID prefixes):

| File | Prefix | Domain |
|---|---|---|
| [`clients-proposals.md`](./clients-proposals.md) | `CLI` | Clients & Proposals |
| [`audits.md`](./audits.md) | `AUD` | SEO/CRO/Keyword/Competitor/Content audits |
| [`google-ads-audits.md`](./google-ads-audits.md) | `GAD` | Google Ads audits |
| [`optimate.md`](./optimate.md) | `OPT` | OptiMate agent |
| [`gsc-serp-ai.md`](./gsc-serp-ai.md) | `GSC` | GSC / SERP / AI-visibility / Indexing |
| [`negative-keywords.md`](./negative-keywords.md) | `NEG` | Negative Keywords |
| [`finance.md`](./finance.md) | `FIN` | Finance |
| [`processes.md`](./processes.md) | `PRO` | Processes |
| [`content.md`](./content.md) | `CON` | Content |
| [`client-portals.md`](./client-portals.md) | `POR` | Client-facing portals |
| [`decks.md`](./decks.md) | `DEK` | Decks / presentations |
| [`platform-infra.md`](./platform-infra.md) | `INF` | Platform / infra |

Plus the **Phase 5b** track for the autonomous goal-agent runtime (state machine,
risk gating, scheduler, watchdog, escalations, the staged `executing` live push,
measuring loop, chat→goal-run handoff):

| File | Prefix | Domain |
|---|---|---|
| [`goal-agents.md`](./goal-agents.md) | `GOAL` | Autonomous goal-agent runtime (Phase 5b) |

## Scenario format

Each scenario is a self-contained block an agent can run with **no extra context**:

- **`<FEAT-ID>-happy` / `<FEAT-ID>-edge`** — scenario id (happy path / edge-negative).
- **Surface** — collection field / admin page / public route / API / agent tool.
- **Side-effect class** — READ / CMS-WRITE / EXTERNAL-SAFE / DANGER (from the catalog).
- **Entry point** — exact URL / route / component the scenario hits.
- **Inputs** — concrete values to use (fixtures below).
- **Steps** — numbered, runnable.
- **Expected** — the observable result to assert.
- **Env/service deps** — env keys + external services this scenario needs, for
  dev-vs-prod triage.
- **Triage** — how to classify a failure (DEV-CONFIG / PROD-BUG / UNKNOWN).

## Fixtures (local test DB only)

Created by `scripts/test-fixtures.ts` into `file:./content-voice-test.db`
(see [`../test-runs/fixtures-README.md`](../test-runs/fixtures-README.md)):

| Entity | Name | Slug | PIN | Notes |
|---|---|---|---|---|
| Client | `ZZ Test Client` | `zz-test-client` | `4729` (`clientPin`) | `googleAdsCustomerId` = `6591013898` (whitelisted read acct `659-101-3898`); GSC/GA4 **disconnected** |
| Proposal | `ZZ Test Proposal` | `zz-test-proposal` | `5836` (`proposalPin`) | linked to `zz-test-client` |

- **Base URL:** `http://localhost:3004` (`TEST_BASE_URL`).
- **Admin auth:** `scripts/test-harness/auth.ts` → `loginAdmin()` (`TEST_ADMIN_EMAIL`
  default `peter@optimisedigital.online`, `TEST_ADMIN_PASSWORD` from env) →
  `authedFetch(path, init?)`. All admin-session API/browser scenarios use this.
- **Whitelisted Google Ads read account:** `659-101-3898` (Optimise Digital) — the
  **only** account OptiMate/Growth Tools live reads may target.
- **Teardown:** every created/modified row must be appended to
  `docs/test-runs/<date>/teardown-manifest.jsonl` (collection, id, op, timestamp).

## Env-key / service dependency map (dev-vs-prod triage)

Verified dev wiring (from [`../test-runs/README.md`](../test-runs/README.md) §3):

| Service | Env key(s) | Dev status | Triage if scenario fails on this |
|---|---|---|---|
| Growth Tools | `GROWTH_TOOLS_URL` | ✅ LIVE prod | failure ≠ key → PROD-BUG |
| Scrapling | `SCRAPLING_SERVICE_URL` | ✅ wired | known-flaky; UNKNOWN unless deterministic |
| Vercel Blob | `BLOB_READ_WRITE_TOKEN` | ✅ wired | PROD-BUG |
| Brevo (email) | `BREVO_API_KEY` | ✅ LIVE — **harness-blocked** | send blocked by harness ≠ failure |
| Postmark (email) | `POSTMARK_API_KEY` | ❌ missing | send path fail → **DEV-CONFIG** |
| SendGrid (email) | — | ❌ missing | → **DEV-CONFIG** |
| Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ wired | PROD-BUG |
| Kimi / Moonshot | (Kimi key) | ✅ wired | PROD-BUG |
| OpenAI | `OPENAI_API_KEY` | ❌ no valid key | any OpenAI path fail → **DEV-CONFIG** |
| Google OAuth | `GOOGLE_CLIENT_ID`/`SECRET` | ✅ wired | per-client token may be absent → DEV-CONFIG |
| GSC / GA4 | per-client OAuth token | ⚠️ test client **disconnected** | "not connected" is expected → DEV-CONFIG |
| Google Sheets | OAuth (`SheetsAuth`) | write **harness-blocked** | write blocked ≠ failure |
| Google Calendar | OAuth (`CalendarAuth`) | event-create **harness-blocked** | blocked ≠ failure |
| Xero | Xero creds (via Growth Tools) | ⚠️ unverified | UNKNOWN unless clearly wired |
| Cron routes | `CRON_SECRET` | required header | 401 without secret is expected |
| API-key routes | `AUDIT_API_KEY` / key-access | required header | 401 without key is expected |

**Triage buckets** (Phase 6): **DEV-CONFIG** (fails only for a missing dev key /
test DB / unwired service), **PROD-BUG** (genuine defect that would also fail in
prod), **UNKNOWN** (needs prod access to classify). Each scenario names its deps so
triage is evidence-based.

## DANGER handling (binding)

For every DANGER FEAT-ID the scenario exercises **only** the safe surface:
- **Preview / dry-run** endpoint where one exists (e.g. campaign `preview-build`,
  statement `preview`, process `email-preview`, OptiMate `propose_*`).
- **Approval-staging**: create/queue an approval row and assert it is `pending` —
  **never** call the apply/send/push that triggers the live write.
- Assert the live call is **harness-blocked** (it must be rejected before the
  network), not merely skipped.

The single live-push exception (campaign `search_cro-audit-tool_au`) is owned by
the goal-agent track and is out of scope for these per-feature scenario files.
