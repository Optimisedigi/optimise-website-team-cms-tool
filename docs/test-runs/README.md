# Test Runs — Strategy & Safety Contract

This document records the **resolved test-strategy decisions** for end-to-end / platform testing of the Content CMS. These decisions are settled — treat them as the governing reference for all later test steps.

> ⚠️ **Read the [Safety Interlock](#safety-interlock-governing-safety-contract) section first.** It is the binding safety contract for every test run. No exceptions.

> 🧪 **Creating fixtures?** Use `scripts/test-fixtures.ts` — see
> [`fixtures-README.md`](./fixtures-README.md) for the test client/proposal it
> creates, the chosen PINs, and create/teardown commands. It writes only to the
> local `file:` DB and logs every row to `fixtures-manifest.jsonl` for cleanup.

---

## 1. Database target

- The dev server (`npm run dev`, port **3004**) loads `.env.local`, which **overrides `DATABASE_URL`** to a **local SQLite file**: `file:./content-voice-test.db`.
- This file is a **~69MB production-data snapshot** containing roughly **7 clients**.
- **This file is the test DB.** All CMS writes performed during testing land here, not in production Turso.
- CMS writes are therefore **safe / non-production** — the database itself cannot harm live data.
- ⚠️ Safety of the *database* does **not** extend to *external service calls* (email, Ads pushes, Sheets, calendar). Those hit real systems regardless of which DB is active — see the Safety Interlock.

---

## 2. Whitelisted Google Ads account (OptiMate read-validation)

- **Customer ID `659-101-3898`** — *Optimise Digital*, the agency's own Google Ads account — is the **only** whitelisted account for OptiMate read-validation.
- The **only** permitted **live green-tier negative push** (a gated goal-agent test) is against campaign:

  ```
  search_cro-audit-tool_au
  ```

- **Nothing else.** No other campaign, account, or push type is permitted to go live. This single opt-in push is the sole exception carved out of the Safety Interlock allowlist.

---

## 3. External services wired in dev

Verified status as of this strategy:

| Service | Status | Notes |
|---|---|---|
| Growth Tools | ✅ Wired | **LIVE production** |
| Scrapling | ✅ Wired | |
| Vercel Blob | ✅ Wired | |
| Brevo | ✅ Wired | **LIVE — can really send email** (must be blocked by harness) |
| Gemini | ✅ Wired | See note below |
| Kimi / Moonshot | ✅ Wired | |
| Google OAuth client | ✅ Wired | |
| Postmark | ❌ Missing | Not configured |
| SendGrid | ❌ Missing | Not configured |
| OpenAI (proper key) | ❌ Missing | No valid key |

> 🔎 **Gemini review flag:** Gemini is only used by **blog/image generation + transcription**. We should review whether it is actually needed for the platform going forward — flag it for a usage/value decision rather than assuming it stays.

---

## 4. DANGER policy — HARD-NO on going live

**HARD-NO. Nothing goes live during testing.** Specifically:

- ❌ **No emails sent** (Brevo / Postmark / SendGrid).
- ❌ **No Google Ads pushes** — except the single gated green-tier push in §2.
- ❌ **No Xero send.**
- ❌ **NO contract testing at all** — the user confirmed contracts already work. Do not exercise the contract flow.
- ❌ **No Google Sheets writes.**
- ❌ **No calendar event creation.**

**Permitted:** Approvals **MAY** be created / staged in the queue for the user to **apply manually later**. Staging an approval is fine; *applying* it (which triggers a live write) is not.

**Enforcement requirement:** Brevo / Postmark / SendGrid sends, Sheets writes, and calendar event creation must be **blocked at the harness level** — not merely avoided by careful scenario design. Scenarios must not be the only line of defence.

---

## 5. Browser automation — Playwright + Chromium

- **Playwright + Chromium installation is approved.**
- Admin login for authenticated scenarios:
  - **User:** `peter@optimisedigital.online`
  - **Password:** stored as env var `TEST_ADMIN_PASSWORD` — **NOT committed** to the repo.

---

## 5a. Auth helper for the harness

`scripts/test-harness/auth.ts` is the shared auth utility for authenticated
test runs.

```ts
import { loginAdmin, authedFetch } from "./scripts/test-harness/auth";

await loginAdmin();                       // CMS admin session (cached)
const res = await authedFetch("/api/users/me");
```

- `loginAdmin()` → `POST /api/users/login` (Payload v3 REST login on the
  `users` collection) with `{ email, password }`. Returns the
  `payload-token` cookie string for reuse.
- Credentials come from env only — `TEST_ADMIN_EMAIL`
  (default `peter@optimisedigital.online`) and **`TEST_ADMIN_PASSWORD`**
  (required, never committed). Export it in your shell before running.
- `authedFetch(path, init?)` resolves `path` against
  `http://localhost:3004` (override with `TEST_BASE_URL`) and attaches the
  session cookie from `loginAdmin()`.

Public surfaces are gated separately (PINs / tokens, not the CMS session) —
each gate, its verify route, and where the token comes from is documented in
the header comment of `auth.ts`. Contract signing is intentionally **not**
covered (see §4).

## 6. First-pass scope

- **FULL platform.** No narrowing for the first pass.

---

## Bonus — Teardown manifest

- Test clients **MAY** be created.
- **Every created or modified record must be logged** to a teardown manifest for easy cleanup:

  ```
  docs/test-runs/<date>/teardown-manifest.jsonl
  ```

- Use one JSON object per line (JSONL). Each entry should capture enough to reverse the change (collection, record ID, operation, and ideally a timestamp). This manifest is the authoritative cleanup list for each run.

---

## Safety Interlock (governing safety contract)

This is the **binding safety contract** for all test runs. It supersedes scenario-level judgement.

### The allowlist

There is exactly **ONE** permitted live external write:

> The single opt-in **green-tier negative push** on Google Ads campaign **`search_cro-audit-tool_au`** in account **`659-101-3898`** (Optimise Digital).

### Block-by-default

**All** of the following external-write calls are **blocked by default at the harness level**:

- Email sends — **Brevo, Postmark, SendGrid** (and any other email transport).
- **Google Sheets** writes.
- **Calendar** event creation.
- **Google Ads** pushes (every campaign/account **except** the single allowlisted push above).
- **Xero** send.

### Rules

1. **Default = blocked.** If a live external write is not the one allowlisted push, the harness must reject it before it reaches the network.
2. **Harness-level enforcement.** Blocking is implemented in the harness, not left to scenario authors to avoid. A scenario that *tries* to send must still be stopped.
3. **Single, explicit opt-in.** The allowlisted green-tier push requires deliberate opt-in for that specific campaign. It is never enabled implicitly.
4. **DB writes are not external writes.** Writes to `content-voice-test.db` are safe and unrestricted. The interlock governs only outbound calls to real external systems.
5. **Approvals may be staged, not applied.** Creating/queuing an approval is permitted; applying it (triggering a live write) is not, unless it is the one allowlisted push.

If in doubt, **block it.** The interlock fails closed.

---

## How to re-run this suite as a regression harness

The catalog + scenarios + swarm are designed to be re-run as the platform grows.
Each run writes to a fresh `docs/test-runs/<date>/` directory. Run the steps below
in order; everything is copy-pasteable. **Replace `<date>` with today's date**
(e.g. `2026-06-04`).

> ⚠️ The [Safety Interlock](#safety-interlock-governing-safety-contract) governs
> every run. The harness blocks all live external writes **except** the single
> allowlisted green-tier push, and only when you explicitly pass
> `--allow-live-push`. Never pass that flag unless you intend the one permitted
> push in §2.

### 1. Start the dev server (local test DB, port 3004)

```bash
# Loads .env then .env.local → DATABASE_URL = file:./content-voice-test.db
npm run dev
```

Leave this running in its own terminal. Confirm it serves on
<http://localhost:3004>.

### 2. Create the test fixtures

```bash
# Creates "ZZ Test Client" + "ZZ Test Proposal" in the local DB and logs every
# created row to docs/test-runs/fixtures-manifest.jsonl. Refuses to run unless
# DATABASE_URL is a file: DB and DATABASE_AUTH_TOKEN is unset.
npx tsx --env-file=.env --env-file=.env.local scripts/test-fixtures.ts
```

See [`fixtures-README.md`](./fixtures-README.md) for the records, slugs, and PINs.

### 3. Set the run env

```bash
# Required: admin password for authenticated scenarios (never committed).
export TEST_ADMIN_PASSWORD='<the admin password>'
# Optional overrides (defaults shown):
export TEST_ADMIN_EMAIL='peter@optimisedigital.online'
export TEST_BASE_URL='http://localhost:3004'
```

`scripts/test-harness/auth.ts` reads these to mint a reusable Payload session
cookie (`loginAdmin()` → `authedFetch()`).

### 4. Run the coordinator

```bash
# Default — fully safe. All live external writes blocked at the harness level.
npx tsx --env-file=.env --env-file=.env.local scripts/test-harness/coordinator.ts --date <date>
```

To additionally exercise the **one** allowlisted live green-tier negative push
(§2 — campaign `search_cro-audit-tool_au` on account `659-101-3898`), and only
then, opt in explicitly:

```bash
# DANGER opt-in: enables the single allowlisted push and nothing else.
npx tsx --env-file=.env --env-file=.env.local scripts/test-harness/coordinator.ts --date <date> --allow-live-push
```

The coordinator appends machine-readable records to
`docs/test-runs/<date>/results.jsonl` and logs every created/modified row to
`docs/test-runs/<date>/teardown-manifest.jsonl`.

### 5. Generate the report

```bash
# Assembles docs/test-runs/<date>/report.md from results.jsonl:
# coverage table, pass/fail per FEAT-ID, and failures triaged into
# DEV-CONFIG / PROD-BUG / UNKNOWN.
npx tsx --env-file=.env --env-file=.env.local scripts/test-harness/report.ts --date <date>
```

Then finalise the human deliverables for the run:

- `docs/test-runs/<date>/prod-bugs.md` — one fix item per confirmed PROD-BUG.
- `docs/test-runs/<date>/dev-config-review.md` — DEV-CONFIG items for prod-vs-dev
  review.

### 6. Teardown (leave the DB clean)

```bash
# Deletes every record in the fixtures manifest (proposals before clients),
# then clears the manifest.
npx tsx --env-file=.env --env-file=.env.local scripts/test-fixtures.ts --teardown
```

If a run logged additional rows to `docs/test-runs/<date>/teardown-manifest.jsonl`
(goal-runs, snapshots, approvals staged during the run), delete those too before
considering the DB clean. Verify nothing test-named remains:

```bash
sqlite3 content-voice-test.db "SELECT name, slug FROM clients WHERE name LIKE 'ZZ%' OR slug LIKE 'zz%';"
sqlite3 content-voice-test.db "SELECT COUNT(*) AS goal_runs FROM goal_runs;"
```

Both should come back empty / `0`.

> **Harness scripts not present yet?** `scripts/test-harness/` currently contains
> the shared `auth.ts` and `result-schema.ts`; the `coordinator.ts` / `report.ts`
> entry points referenced above are the Phase-4/6 deliverables. Until they exist,
> steps 1–3 and 6 are runnable today; steps 4–5 produce the run artifacts once the
> coordinator is built.
