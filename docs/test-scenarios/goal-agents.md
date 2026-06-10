# Test Scenarios — Autonomous Goal-Agent Runtime (`GOAL`)

Phase **5b** of [`.gg/plans/platform-feature-test-swarm.md`](../../.gg/plans/platform-feature-test-swarm.md).
Standalone scenarios for the unattended goal-agent loop
`awaiting_data → analysing → pending_approval → executing → measuring → analysing(loop) → complete`.
Read [`./README.md`](./README.md) for fixtures, the env-key map, auth, and the
binding DANGER / Safety-Interlock rules. Base URL `http://localhost:3004`; admin
scenarios use `loginAdmin()` + `authedFetch()`.

> ⚠️ **The goal agents are the highest-risk automation in the platform** — the
> `executing` state pushes real negatives to a live Google Ads account and
> green-tier actions auto-execute with **no human approval**. Every scenario
> below is mocked/staged by default. The **only** permitted live external write
> is the single opt-in green-tier negative push on campaign
> `search_cro-audit-tool_au` in account `659-101-3898`, behind the explicit
> `--allow-live-push` flag (scenario `GOAL-5b.3-live`). Nothing else goes live.

**Code under test (source of truth):**

| Layer | File |
|---|---|
| State machine | `src/lib/goal-agents/state-machine.ts` |
| Risk-tier gate | `src/lib/goal-agents/check-risk-tier.ts` |
| Spend pacer (pure) | `src/lib/goal-agents/spend-pacer.ts` |
| Spend pacer (integration) | `src/lib/goal-agents/get-spend-pacer-status.ts` |
| Account-health contract | `src/lib/goal-agents/account-health-contract.ts` |
| Scheduler tick | `src/lib/goal-agents/scheduler.ts` |
| Escalations | `src/lib/goal-agents/escalations.ts` |
| Watchdog | `src/lib/goal-agents/watchdog.ts` |
| Audit-trail writers | `src/lib/goal-agents/goal-run-audit.ts` |
| `search-term-waste-reducer` handler | `src/lib/goal-agents/goal-types/search-term-waste-reducer.ts` |
| `account-efficiency` handler | `src/lib/goal-agents/goal-types/account-efficiency.ts` |
| Live push apply handler | `src/lib/agents/optimate-google-ads/apply-handlers/nkl-push-live.ts` |
| Chat→goal-run apply handler | `src/lib/agents/optimate-google-ads/apply-handlers/goal-run-create.ts` |
| Cron routes | `src/app/(frontend)/api/goal-agents/{cron,watchdog}/route.ts` |

**Fixtures:** client `zz-test-client` (Ads `6591013898` = whitelisted account
`659-101-3898`), proposal `zz-test-proposal`. Seeded `goal-risk-tiers` rows (from
migration `20260604_120000_add_goal_risk_tiers_and_seed.ts`): two **Yellow** rows
(`budget-update`, `budget-push-live`), `maxBudgetImpactDollars = $500`,
`requiresApproval = true`, `autoExecute = false`. **No green-tier row is seeded by
default** — green-tier scenarios must seed their own tier row (see GOAL-5b.1-c).

**Test style:** 5b.1 are pure-function unit tests (Vitest, no Payload). 5b.2 / 5b.4
mock the `payload` object (`find`/`findByID`/`create`/`update`/`delete`) and inject
a fixed clock via the `now: Date` argument. 5b.3-default stubs `dispatchApply`.
5b.5 drives the apply handler against a mocked Payload, stopping before any push.

---

## GOAL-5b.1 — Pure-logic layer (state machine · risk gating · pacer · contract)

Side-effect class: **READ** (pure functions, no I/O). Env deps: **none** — these
run with no DB, no network, no keys. A failure here is always a **PROD-BUG**
(never DEV-CONFIG), because nothing external is involved.

### GOAL-5b.1-a — State machine: legal vs illegal transitions, terminals, identity
- **Surface:** `assertLegalTransition(from, to)` + `LEGAL_TRANSITIONS` in
  `state-machine.ts`.
- **Inputs:** the full transition graph documented in the module header:
  - `awaiting_data → {analysing, blocked, failed}`
  - `analysing → {pending_approval, executing, awaiting_data, blocked, failed}`
  - `pending_approval → {executing, blocked, failed}`
  - `executing → {measuring, failed, blocked}`
  - `measuring → {analysing, complete, failed, blocked}`
  - `blocked → {analysing, failed}`
  - `complete → {}` (terminal), `failed → {}` (terminal)
- **Steps:**
  1. For **every** `(from, to)` pair in `LEGAL_TRANSITIONS[from]`, call
     `assertLegalTransition(from, to)` and assert it **does not throw**.
  2. For every pair **not** in the allow-list (and `from !== to`), assert it throws
     `IllegalTransitionError`, and that `err.from`/`err.to` carry the attempted
     states and `err.name === "IllegalTransitionError"`.
  3. **Terminal states:** assert `LEGAL_TRANSITIONS.complete` and
     `LEGAL_TRANSITIONS.failed` are both `[]`, and that e.g.
     `assertLegalTransition("complete", "analysing")` throws.
  4. **Idempotent identity:** for every status `s`, assert
     `assertLegalTransition(s, s)` returns `void` and never throws — including the
     terminals (`complete→complete`, `failed→failed`) which are legal idempotent
     re-saves even though their allow-lists are empty.
- **Expected:** all 20 legal edges pass; every illegal edge throws the typed error;
  both terminals have empty allow-lists yet accept identity moves.
- **Env/service deps:** none.
- **Triage:** any deviation → **PROD-BUG**.

### GOAL-5b.1-b — Risk gating: black-tier exclusion of brand/protected campaigns
- **Surface:** `checkRiskTier()` in `check-risk-tier.ts`, decision step 1.
- **Inputs:** any proposal; `isBrandCampaign: true` (then separately
  `isProtectedCampaign: true`); pass a non-empty `clientTiers` so we prove the
  black gate wins **before** tier matching.
- **Steps:**
  1. Call `checkRiskTier({ proposal: { actionType: "nkl-push-live", campaignIds: ["c1"] }, clientTiers: [<a green row>], isBrandCampaign: true, isProtectedCampaign: false })`.
  2. Call again with `isBrandCampaign: false, isProtectedCampaign: true`.
- **Expected (both):** `{ tier: "black", autoExecute: false, requiresApproval: false, escalation: "blocked" }`; `reason` names the brand/protected cause and the
  campaign id. Black overrides any tier definition.
- **Env/service deps:** none.
- **Triage:** brand/protected campaign **not** blocked → **PROD-BUG (safety)**.

### GOAL-5b.1-c — Risk gating: green → `auto_execute` AND the over-cap negative test
- **Surface:** `checkRiskTier()`, decision steps 2–4. **This is the critical
  safety gate** — the request explicitly calls for proving an over-budget green
  action is NOT auto-executed.
- **Inputs:** build tier definitions in-memory (do **not** rely on the seeded
  Yellow-only rows):
  - `green` = `{ tier: "green", maxBudgetImpactDollars: 200, allowedActionTypes: ["budget-update"], requiresApproval: false, autoExecute: true }`
  - `yellow` = the seeded shape: `{ tier: "yellow", maxBudgetImpactDollars: 500, allowedActionTypes: ["budget-update"], requiresApproval: true, autoExecute: false }`
- **Steps:**
  1. **Green auto-execute:** `checkRiskTier({ proposal: { actionType: "budget-update", budgetImpact: 50 }, clientTiers: [green], isBrandCampaign: false, isProtectedCampaign: false })`
     → assert `{ tier: "green", autoExecute: true, requiresApproval: false, escalation: "auto_execute" }`.
     ⚠️ **Note the current code behaviour:** for a matched **green** tier, step 4
     returns `auto_execute` *unconditionally* — it does **not** re-check
     `maxBudgetImpactDollars`. So the same call with `budgetImpact: 5000` (over the
     $200 green cap) **still returns `auto_execute`** in `check-risk-tier.ts` as
     written. The budget cap is only enforced for **yellow** tiers (step 4
     `withinBudgetLimit`).
  2. **Over-cap must NOT auto-execute — assert at the level the cap is actually
     enforced.** The defence-in-depth cap lives on the **yellow** path: call
     `checkRiskTier({ proposal: { actionType: "budget-update", budgetImpact: 5000 }, clientTiers: [yellow], … })`
     → assert `{ autoExecute: false, requiresApproval: true, escalation: "queue_for_approval" }`
     and `reason` contains `exceeds the $500 limit`.
  3. **Yellow within cap, autoExecute disabled:** with the seeded yellow row
     (`autoExecute: false`) and `budgetImpact: 100`, assert it **still** requires
     approval (seeded rows never auto-execute regardless of cap).
  4. **Yellow within cap, autoExecute enabled:** flip a copy of yellow to
     `autoExecute: true`, `budgetImpact: 100` → assert `auto_execute`; raise to
     `600` → assert `queue_for_approval` (over $500 cap).
  5. **Unknown budget impact:** yellow + `autoExecute: true` + `budgetImpact: undefined`
     → assert `requiresApproval: true` (`budget impact is unknown`).
  6. **No matching tier:** `clientTiers: []` (or only mismatched `allowedActionTypes`)
     → assert default `{ tier: "red", requiresApproval: true, escalation: "queue_for_approval" }`.
  7. **Empty `allowedActionTypes` is a no-op:** a tier with `allowedActionTypes: []`
     never matches; the next definition wins.
- **Expected:** green matches → `auto_execute`; the **green cap is not re-checked
  in current code** (step 1 note); the over-cap *block* is proven on the yellow
  path (steps 2 & 4); unknown impact and no-match both escalate.
- **Env/service deps:** none.
- **Triage:** if step 1's over-cap green call returns `auto_execute`, that is the
  **documented current behaviour**, not a test failure — but flag it as a
  **PROD-BUG candidate (safety gap)** for human review: a green budget cap that is
  never enforced is a latent risk. Steps 2–7 returning the wrong escalation →
  **PROD-BUG**.

### GOAL-5b.1-d — Spend pacer: pacing math + direction flags
- **Surface:** `computeSpendPaceStatus()` in `spend-pacer.ts` (pure).
- **Inputs:** table-driven, all in micros, with injected `currentDayOfMonth` /
  `daysInMonth` so the result is deterministic (never reads the real clock when
  both are supplied):
  - On-track: `monthlyBudgetMicros = 30_000_000`, `daysInMonth = 30`, `day = 10`,
    `mtdSpendMicros = 10_000_000` → pace ≈ 100% → `on_track`, both flags `true`.
  - Underspending: same budget, `mtdSpendMicros = 5_000_000` (≈50%) →
    `underspending`, `canReduceSpend: false`, `canIncreaseSpend: true`,
    `alertMessage` set.
  - Overspending: `mtdSpendMicros = 20_000_000` (≈200%) → `overspending`,
    `canReduceSpend: true`, `canIncreaseSpend: false`.
  - Day-1 clamp: `day = 1`, any spend → `on_track` (no flag restriction).
  - End-of-month: `day >= daysInMonth` → target = full monthly budget.
  - No policy: `monthlyBudgetMicros = 0` → `on_track`, both flags `true`.
  - `performance_cap` mode: `canIncreaseSpend` forced `false` even when on_track.
- **Steps:** run each row, assert `state`, `canReduceSpend`, `canIncreaseSpend`,
  and that `pacePercent` matches the hand-computed `round(actual/effectiveTarget*100)`.
- **Expected:** every row matches; underspend blocks reductions, overspend blocks
  increases, `performance_cap` blocks all increases.
- **Env/service deps:** none.
- **Triage:** wrong flag/state → **PROD-BUG**.

### GOAL-5b.1-e — Account-health contract: protected/brand exclusion
- **Surface:** `isCampaignProtected()`, `isBrandCampaign()`,
  `normaliseCampaignIdList` (via `getAccountHealthContract`) in
  `account-health-contract.ts`.
- **Side-effect class:** **READ** (the helpers are pure; only
  `getAccountHealthContract` touches Payload — mock it).
- **Inputs:** a contract object with
  `protectedCampaignIds: [" 123 ", "123", "", "Brand-AU"]` and
  `brandCampaignIds: ["search_brand_au"]`.
- **Steps:**
  1. Build the contract directly (or mock `payload.findByID` to return a `clients`
     doc with raw `protectedCampaignIds: [{campaignId:" 123 "}, {campaignId:"123"}, {campaignId:""}]`)
     and assert `normaliseCampaignIdList` trims, dedupes, and drops empties →
     `["123", "Brand-AU"]`.
  2. `isCampaignProtected(contract, "123")` → `true`;
     `isCampaignProtected(contract, " BRAND-au ")` → `true` (case-insensitive,
     whitespace-tolerant); `isCampaignProtected(contract, "999")` → `false`.
  3. `isBrandCampaign(contract, "SEARCH_BRAND_AU")` → `true`; non-member → `false`.
  4. **Wire it to the gate:** feed `isProtectedCampaign`/`isBrandCampaign` results
     into `checkRiskTier` (GOAL-5b.1-b) and assert a protected/brand campaign is
     black-tier blocked end-to-end.
  5. `getAccountHealthContract` on a missing client (mock `findByID` to throw) →
     returns `null`, never throws.
- **Expected:** normalisation is exact; matching is case/space-insensitive;
  protected & brand campaigns are excluded from any auto action.
- **Env/service deps:** none (mock Payload for the loader path).
- **Triage:** a protected/brand campaign that slips the exclusion → **PROD-BUG
  (safety)**.

---

## GOAL-5b.2 — Scheduler tick · injected clock · watchdog · escalations

Side-effect class: **CMS-WRITE** (writes only to the mocked/test CMS DB:
`goal-runs`, `goal-run-snapshots`, `notifications`, `activity-log`). **No external
Google Ads / Growth Tools call** — the handler's only dangerous edge
(`dispatchApply`) is reached in 5b.3, and here we keep runs short of `executing`
or stub it. Env deps: local/mocked DB only.

### GOAL-5b.2-a — Tick picks up due rows; injected clock; metadata persisted
- **Surface:** `runGoalAgentsTick(payload, now)` in `scheduler.ts`.
- **Inputs:** mock `payload.find` for `goal-runs` to return seeded rows; inject a
  fixed `now`. Seed:
  - Row A: `goal: "search-term-waste-reducer"`, `status: "awaiting_data"`,
    `nextCheckAt` in the past (due), `client: 1`.
  - Row B: same goal, `status: "measuring"`, `coolingOffUntil` **in the future**
    (relative to injected `now`) → must stay `measuring` (not yet due to advance).
  - Row C: `status: "complete"` → must be **excluded** by the query
    (`status not_in [complete, failed]`).
- **Steps:**
  1. Call `runGoalAgentsTick(payload, fixedNow)`.
  2. Assert the `find` `where` filters out terminal rows and selects only rows
     whose `nextCheckAt <= now` or is unset.
  3. Assert each processed row triggers `persistTickMetadata` → a `payload.update`
     on `goal-runs` carrying `nextCheckAt` (and `coolingOffUntil` /
     `iterationsCount` when the handler returned them).
  4. Assert the returned `TickSummary` counts: `processed`, `advanced` (status
     changed), `skipped` (status unchanged), `failed`, plus a `details[]` entry per
     row with `fromStatus`/`toStatus`.
- **Time-travel over the 7-day cooling-off:** re-run the tick for Row B with
  `now` advanced **past** its `coolingOffUntil` (the handler's `COOLING_OFF_MS` =
  7 days). Assert the `measuring` handler now measures and transitions
  (`analysing` loop or `complete`) — real waiting is impossible, so the clock is
  the lever.
- **Expected:** only due, non-terminal rows are processed; scheduling metadata is
  persisted; the cooling-off gate is honoured purely via the injected clock.
- **Env/service deps:** mocked Payload; no external services.
- **Triage:** terminal rows processed, or `nextCheckAt` not persisted → **PROD-BUG**.

### GOAL-5b.2-b — Tick never throws upward: unknown goal type + handler throw
- **Surface:** `runGoalAgentsTick` error paths + `safeMarkFailed`.
- **Inputs:**
  - Row D: `goal: "does-not-exist"` (not in `GOAL_TYPES`).
  - Row E: a known goal whose handler is forced to throw (mock the registry entry
    or seed data that makes the handler throw).
  - Row F: a row with no resolvable `client` relation.
- **Steps:**
  1. Call the tick; assert it **resolves** (never rejects) even though rows throw.
  2. Row D → marked `failed` with `error: "Unknown goal type: does-not-exist"`;
     `summary.failed` incremented; `details` records `toStatus: "failed"`.
  3. Row E → marked `failed` with the thrown message; batch continues to F.
  4. Row F → marked `failed` (`no resolvable client id`).
- **Expected:** every bad row fails in isolation; the batch completes; the tick
  return value reflects all failures; no exception escapes.
- **Env/service deps:** mocked Payload.
- **Triage:** tick throws upward (one bad row aborts the batch) → **PROD-BUG**.

### GOAL-5b.2-c — Escalation bell fan-out on enter, clear on exit
- **Surface:** `applyEscalationSideEffects` (scheduler) →
  `fanOutGoalRunEscalation` / `clearGoalRunEscalations` in `escalations.ts`.
- **Inputs:** mock `payload.find` on `users` to return 3 users; mock
  `notifications` create/delete.
- **Steps:**
  1. Drive a transition **into** `pending_approval` (e.g. analysing → pending_approval).
     Assert `fanOutGoalRunEscalation` creates **one `goal-run-escalation`
     notification per user** (3 creates), each with `kind: "goal-run-escalation"`,
     `relatedGoalRun`, `relatedClient`, and `url: /admin/collections/goal-runs/<id>`.
  2. Drive a transition **into** `failed` → same fan-out.
  3. Drive a transition **out of** `pending_approval` (e.g. pending_approval →
     executing) → assert `clearGoalRunEscalations` deletes all rows matching
     `kind = goal-run-escalation` AND `relatedGoalRun = <id>` in one call.
  4. **Identity move** (`from === to`) → assert **no** fan-out and no clear.
  5. **Missing clientId** entering an escalated state → assert the fan-out is
     skipped and logged (a notification needs a client) and the tick still
     continues.
  6. **Best-effort:** make one per-user create throw → assert the others still
     create and the tick does not abort.
- **Expected:** entering `pending_approval`/`failed` lights the bell for every
  user; leaving clears it for everyone; identity moves and notification hiccups
  never break the tick.
- **Env/service deps:** mocked Payload (`users`, `notifications`).
- **Triage:** missing/duplicated notifications → **PROD-BUG**; in dev the
  `notifications` collection must exist (else **DEV-CONFIG**).

### GOAL-5b.2-d — Watchdog: independent anomaly detection (stale-run note)
- **Surface:** `runWatchdog(payload, now)` in `watchdog.ts` + cron route
  `GET /api/goal-agents/watchdog`.
- **Side-effect class:** **CMS-WRITE** (writes `activity-log` rows; pure read of
  `google-ads-snapshots`; never mutates `goal-runs`, never calls Growth Tools).
- **Inputs:** mock `clients` (one with `googleAdsCustomerId` set) and two
  campaign-level `google-ads-snapshots` rows within the 7-day window with a large
  day-over-day delta.
- **Steps:**
  1. Seed two snapshots where `totalSpend` jumps ≥60% → assert one
     `activity-log` row `type: "google_ads_anomaly_detected"`, severity
     `critical` (≥60%) vs `warning` (≥30%).
  2. Seed a conversions **decline** ≤ −70% → assert a `critical` conversions
     anomaly; a −40% decline → `warning`; a conversions **increase** → **no**
     anomaly (declines only).
  3. `deltaPct` against a zero previous value returns `null` → no anomaly, no crash.
  4. A client with `< 2` snapshots → skipped, no anomaly.
  5. Assert `runWatchdog` returns `{ clientsChecked, anomaliesFound, details }` and
     never throws (per-client errors are caught + logged).
  6. **Cron auth:** `GET /api/goal-agents/watchdog` without `Authorization: Bearer
     <CRON_SECRET>` → 401; with the secret → 200 `{ ok: true, summary }`.
- **Expected:** anomalies are detected by threshold and logged to `activity-log`;
  the run is read-only against goal-runs.
- **⚠️ Plan-vs-code divergence (flag for human review):** Phase 5b.2 describes the
  watchdog as *"seed a stale run and assert it is detected and reset."* The current
  `watchdog.ts` is a **Google Ads anomaly detector**, not a stale-`goal-runs`
  resetter — there is **no stale-run reset logic in the codebase**. Record this as
  a **coverage gap / spec mismatch (UNKNOWN → human review)**, not a test failure.
  Test the watchdog that exists (above); do not assert a reset that isn't built.
- **Env/service deps:** mocked Payload; `CRON_SECRET` for the route. Missing
  `CRON_SECRET` in dev → 401/500 is **DEV-CONFIG**, not a bug.
- **Triage:** wrong severity classification → **PROD-BUG**; the stale-run-reset gap
  → **UNKNOWN (spec mismatch, escalate)**.

---

## GOAL-5b.3 — The `executing` push step (`dispatchApply("nkl-push-live")`)

This is **the dangerous bit** — the only place the runtime writes to a live
Google Ads account. Two modes; **default is fully mocked**.

### GOAL-5b.3-default — Mocked dispatch: payload integrity + state stamping  · CMS-WRITE
- **Surface:** `handleExecuting()` in `search-term-waste-reducer.ts` (the
  `case "executing"` branch of `tick`).
- **Side-effect class:** **CMS-WRITE** (dispatch is stubbed — no external write).
- **Inputs:**
  - A `goal-runs` row in `status: "executing"`, `client: 1`.
  - A `goal-run-snapshots` row (the latest for the run, found via
    `findLatestSnapshotForRun`) carrying the **exact approved** `proposedPayload`,
    e.g. `{ action: "nkl-push-live", scope: "account", matchType: "PHRASE", keywords: [{keyword:"cheap x", matchType:"PHRASE"}], baselineWasted: 42.5, … }`,
    `status: "approved"`, with an `approval` relation id.
  - **Stub `dispatchApply`** (mock `@/lib/agents/_shared/apply-dispatcher`) to
    return `{ message: "Pushed 1/1 keywords…", detail: { customerId, successCount: 1 } }`
    **without** any network call.
- **Steps:**
  1. Call `tick({ payload, goalRun, clientId: 1, now: fixedNow })`.
  2. **Payload integrity:** assert `dispatchApply` was called **once** with exactly
     `("nkl-push-live", <the snapshot's proposedPayload verbatim>, { payload, approvalId: <snapshot.approval>, userId: 0 })`.
     The second arg must be the **exact** object read back from the snapshot row —
     no mutation, no re-derivation. (`userId: 0` = unattended system caller.)
  3. **Snapshot stamped `applied`:** assert `payload.update` on
     `goal-run-snapshots/<id>` sets `status: "applied"` and a `modifiedPayload`
     with `appliedAt` (= `now.toISOString()`), `message`, and `detail` from the
     dispatch result.
  4. **Transition to `measuring`:** assert `markGoalRunStatus(… status: "measuring")`
     and that the returned `TickResult` has `status: "measuring"`,
     `coolingOffUntil = now + 7d`, and `nextCheckAt === coolingOffUntil`.
  5. **Failure path:** make the stubbed `dispatchApply` throw → assert the run is
     marked `failed` with `error: "nkl-push-live dispatch failed: …"` and
     `completedAt` set; `TickResult.status === "failed"`.
  6. **Missing snapshot:** no snapshot row → marked `failed`
     (`no snapshot row to execute against`).
- **Expected:** the runtime forwards the approved payload **byte-for-byte**, stamps
  the audit row `applied`, opens the 7-day cooling-off, and moves to `measuring` —
  all proven **without touching a real account**.
- **Env/service deps:** mocked Payload + stubbed dispatcher. **No** `GROWTH_TOOLS_URL`
  call (assert the stub intercepts before the network).
- **Triage:** payload mutated before dispatch, wrong `userId`, snapshot not stamped,
  or wrong transition → **PROD-BUG**.

### GOAL-5b.3-live — Opt-in single live green-tier push  · **DANGER (gated)**
- **Surface:** real `dispatchApply("nkl-push-live", …)` →
  `applyNklPushLive` → Growth Tools `POST /api/google-ads/negative-sweep/apply`.
- **Side-effect class:** **DANGER** — irreversible live Google Ads write. **Runs
  ONLY behind the `--allow-live-push` flag with explicit human go-ahead.** The
  swarm coordinator must reject this scenario unless the flag is set.
- **Allow-list (hard constraints — refuse if any differs):**
  - Account: **`659-101-3898`** (Ads customer id `6591013898`, Optimise Digital).
  - Campaign: **`search_cro-audit-tool_au`** — the single allow-listed push target.
  - Tier: **green** only; a small keyword set; total budget impact within green cap.
- **Steps:**
  1. Confirm `--allow-live-push` is set **and** the resolved
     `customerId === 6591013898` and campaign === `search_cro-audit-tool_au`.
     Abort hard otherwise.
  2. Run **one** real green-tier `executing` tick end-to-end against the
     whitelisted account.
  3. **Cross-check it landed** using the same Growth Tools read used in Phase 5
     (`GET /api/google-ads/negative-sweep/*` / the negatives list endpoint) — the
     pushed negatives must appear on the account.
  4. Record the applied keywords + customer id + timestamp to the run report and
     the teardown manifest.
- **Expected:** the negatives actually land on `659-101-3898 / search_cro-audit-tool_au`
  and are confirmed by an independent read. This is the **only** permitted live
  external write in the entire suite.
- **Env/service deps:** live `GROWTH_TOOLS_URL` with valid Google Ads MCC access to
  `659-101-3898`; `--allow-live-push`.
- **Triage:** if `GROWTH_TOOLS_URL` is unwired in dev → **DEV-CONFIG** (the live
  test simply can't run; do **not** mark pass). A landed-mismatch (read shows
  different keywords than pushed) → **PROD-BUG**.

### GOAL-5b.3-measuring — Measuring loop closes via injected clock  · CMS-WRITE
- **Surface:** `handleMeasuring()` in `search-term-waste-reducer.ts`.
- **Inputs:** a run in `status: "measuring"` with `coolingOffUntil` set; an
  applied `goal-run-snapshots` row with `proposedPayload.baselineWasted` and
  `keywords`; mock `getSearchTermSnapshot` to return a fresh post-push snapshot.
- **Steps:**
  1. With `now` **before** `coolingOffUntil` → assert it stays `measuring`,
     `nextCheckAt === coolingOffUntil` (no measurement yet).
  2. Advance `now` **past** `coolingOffUntil`; fresh snapshot shows the negated
     terms' spend dropped ≥30% (`SUCCESS_REDUCTION`) → assert `attachMeasurement`
     writes `{ wastedSpendReduction, baselineWasted, currentWasted, measuredAtIteration }`,
     `iterationsCount` is incremented on the run, and the run transitions to
     **`complete`**.
  3. Reduction `< 30%` and `iterationsCount + 1 < MAX_ITERATIONS (3)` → assert it
     **loops** back to `analysing` with the bumped `iterationsCount`.
  4. Reduction `< 30%` but `iterationsCount + 1 >= 3` → assert `complete` (iteration
     cap reached).
  5. No fresh snapshot available → assert it stays `measuring` and backs off (no
     measurement, no crash).
- **Expected:** cooling-off is enforced by the clock; on expiry the run measures,
  records the result, and either completes or loops within the 3-iteration cap.
- **Env/service deps:** mocked Payload + mocked snapshot reader; no external write.
- **Triage:** wrong loop/terminal decision or missing measurement row → **PROD-BUG**.

---

## GOAL-5b.4 — Goal-run audit trail (`goal-run-snapshots`)

Side-effect class: **CMS-WRITE** (writes `goal-run-snapshots` / `goal-runs`). Env
deps: local/mocked DB. Every decision step must leave a reconstructable row.

### GOAL-5b.4-a — Each step writes a complete, reconstructable snapshot row
- **Surface:** `recordGoalRunSnapshot`, `markGoalRunStatus`, `attachMeasurement`
  in `goal-run-audit.ts`.
- **Steps:**
  1. **Proposed-for-approval step:** drive `handleAnalysing` with a non-green tier
     → assert a `goal-run-snapshots` row with `status: "proposed"`,
     `riskTier` from the gate, `action: "nkl-push-live"`, the full `proposedPayload`,
     `modifiedPayload: null`, `blockReason: null`, and an `approval` relation id.
  2. **Auto-execute step:** with a green tier → assert a row `status: "approved"`
     (no approval relation needed) before the run flips to `executing`.
  3. **Applied step:** after a mocked dispatch (GOAL-5b.3-default) → assert the
     same row is updated to `status: "applied"` with `modifiedPayload` capturing
     `appliedAt` / `message` / `detail`.
  4. **Measured step:** after `attachMeasurement` → assert `measuredAt` and
     `measuredResult` are present on the row.
  5. **Blocked step:** simulate a contract/pacer block → assert `status` is one of
     `blocked_by_contract` / `blocked_by_pacer` / `blocked_by_scope`,
     `modifiedPayload: null`, and `blockReason` is set with the cause.
  6. `markGoalRunStatus` **validates via the state machine** before writing —
     assert an illegal transition (e.g. `complete → executing`) throws
     `IllegalTransitionError` and **no** write occurs.
- **Expected:** every step is auditable: `proposedPayload`/`modifiedPayload`,
  `riskTier`, `status`, and `blockReason` together let a human replay the full
  decision history. Status writes are guarded by the state machine.
- **Env/service deps:** mocked Payload.
- **Triage:** any step missing its snapshot row, or `blockReason` absent on a
  block, or an illegal status write succeeding → **PROD-BUG**.

---

## GOAL-5b.5 — Chat → approval → goal-run handoff

Side-effect class: **CMS-WRITE** (queues an approval row, then on apply creates a
`goal-runs` row). **Stops before any live push** unless GOAL-5b.3-live is opted in.
Env deps: local/mocked DB; the OptiMate apply pipeline.

### GOAL-5b.5-a — `create_goal_run` apply → goal-run exists → first tick advances it
- **Surface:** chat tool `create_goal_run` /
  `create_account_efficiency_goal_run` → approval row → `applyGoalRunCreate`
  (`apply-handlers/goal-run-create.ts`) → first `runGoalAgentsTick`.
- **Inputs:** mocked Payload; `clientId: 1` (`zz-test-client`); goal
  `"search-term-waste-reducer"`.
- **Steps:**
  1. **Queue stage (DANGER-safe):** invoke the chat tool and assert it creates an
     `agent-approval-queue` row in `status: "pending"` — assert **no** `goal-runs`
     row exists yet (the tool only queues; it never auto-creates the run).
  2. **Apply stage:** run `applyGoalRunCreate(payload, ctx)` and assert:
     - It **rejects a duplicate**: if an active (`status not_in [complete, failed]`)
       run for the same `(client, goal)` already exists, it throws
       `An active … run already exists`.
     - On success it calls `startGoalRun` (row created `status: "analysing"`),
       then `markGoalRunStatus(… "awaiting_data")`, sets `nextCheckAt = now`, and
       writes a **step-1 `goal-run-snapshots`** row
       (`action: "create_goal_run"`, `riskTier: "green"`, `status: "approved"`,
       `proposedPayload` carrying `approvalId` + `appliedByUserId`).
     - Invalid `clientId` or unknown `goal` (not in `GOAL_TYPES`) → throws.
  3. **First tick advances it:** run `runGoalAgentsTick(payload, now)` with the new
     row due (`nextCheckAt <= now`, `status: "awaiting_data"`). With a fresh
     search-term snapshot mocked available → assert it transitions
     `awaiting_data → analysing`; with no snapshot → assert it stays
     `awaiting_data` and backs off (~6h). **Stop here** — do not let the run reach
     `executing`/live push unless GOAL-5b.3-live is enabled.
- **Expected:** chat queues an approval (no run yet); applying the approval creates
  exactly one `goal-runs` row in `awaiting_data` with its audit step; the next
  scheduler tick picks it up and advances it — proving the full handoff end-to-end
  without any live external write.
- **Env/service deps:** mocked Payload; no external services for the mocked path.
  (A real end-to-end run through the live apply pipeline additionally needs the
  OpenAI/agent keys — missing in dev → **DEV-CONFIG**.)
- **Triage:** chat tool auto-creating a run (skipping approval), duplicate run not
  rejected, or the tick failing to pick up a due new run → **PROD-BUG**.

---

## Side-effect class & env-dependency summary (for the coordinator)

| Scenario | Side-effect class | External write? | Key env deps | Default mode |
|---|---|---|---|---|
| GOAL-5b.1-a…e | READ (pure) | none | none | unit, in-memory |
| GOAL-5b.2-a…c | CMS-WRITE | none | mocked DB | mocked clock |
| GOAL-5b.2-d watchdog | CMS-WRITE (activity-log) | none | mocked DB; `CRON_SECRET` (route) | mocked |
| GOAL-5b.3-default | CMS-WRITE | none (dispatch stubbed) | mocked DB | **stubbed dispatch** |
| GOAL-5b.3-live | **DANGER** | **YES — live Google Ads** | live `GROWTH_TOOLS_URL`, MCC access, `--allow-live-push` | **gated, opt-in only** |
| GOAL-5b.3-measuring | CMS-WRITE | none | mocked DB + snapshot reader | mocked clock |
| GOAL-5b.4-a | CMS-WRITE | none | mocked DB | mocked |
| GOAL-5b.5-a | CMS-WRITE | none (stops pre-push) | mocked DB (real path needs agent keys) | mocked, stop pre-push |

**Binding rule:** the coordinator enforces *DANGER-never-applied* centrally —
`GOAL-5b.3-live` is the single exception and only with `--allow-live-push` on
campaign `search_cro-audit-tool_au` / account `659-101-3898`. Everything else is
mocked or stubbed before the network.
