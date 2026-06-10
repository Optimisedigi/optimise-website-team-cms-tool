# Account-Efficiency Goal Agent — Activation & Testing Runbook

How to activate the `account-efficiency` goal agent for a client and test it in
production. Grounded in the live routes, cron schedules, and apply-handler
guards as of the multi-window-snapshots / staged-pauses ship.

- **Goal type:** `src/lib/goal-agents/goal-types/account-efficiency.ts`
- **Create tool (OptiMate):** `create_account_efficiency_goal_run`
- **Apply handler:** `src/lib/agents/optimate-google-ads/apply-handlers/account-efficiency-goal-run-create.ts`
- **Change-Review UI:** `/admin/goal-changes?clientId=<ID>`

---

## What the agent does

Improves account-wide CPA by pulling up to five levers, each gated by a risk
tier and (for anything destructive) a human approval:

| Lever | Action | Notes |
|-------|--------|-------|
| `budget_shift` | Move daily budget from 0-conversion donors to budget-bound recipients | Conserves total daily spend (= monthly budget) within $0.01 |
| `keyword_pause` | Pause wasteful keywords | BROAD always pauses; EXACT/PHRASE confirmed against the 90-day window |
| `ad_group_pause` | Pause wasteful ad groups | **Staged** first, then confirmed against the 60-day window after one `measurementDays` cycle |
| `bid_adjust` | Raise target-CPA caps on rank-bound efficient ad groups | Capped by `maxTargetCpaUpliftPercent` |
| `strategy_alert` | Flag bid-strategy mismatches | Proposal-only; never auto-executes |

**Fail-safe principle:** the agent never pauses on absent confirmation data. If
the 90d (keyword) or 60d (ad-group) window hasn't been captured yet, it skips
and re-checks next tick.

---

## Prerequisites (must be true before activation)

1. **Client has a Google Ads customer ID.**
   `/admin` → client record → `googleAdsCustomerId`. The snapshot cron only
   processes clients with this set.
2. **A `google-ads-audits` row exists for the client.**
   On apply, the supplied `monthlyBudget` **overwrites**
   `google-ads-audits.monthlyBudget` (the budget-shift anchor). With no audit
   row, activation fails with: *"a monthly budget was supplied but no
   google-ads-audits row exists for this client to write it to. Run a Google Ads
   audit for the client first."*
3. **Fresh snapshots with impression-share data.**
   Activation is blocked unless the client's campaign snapshot carries
   `searchImpressionShare`. Produced by the daily snapshot cron (Step 1).
4. **Risk tiers seeded.** Already done via migration
   `20260605_130000_seed_account_efficiency_pause_risk_tiers`. These decide which
   levers auto-execute vs. require approval.
5. **Schema migration applied.** This ship widened the
   `google_ads_snapshots` unique index to `(client_id, level, date_range_label)`.
   Run `POST /api/migrate` after deploy if not already applied (verify per
   "Appendix: verify the schema migration").

---

## Activation — step by step

### Step 1 — Refresh snapshots (incl. the new windows)

The snapshot cron runs **daily at 04:00 UTC** (`/api/google-ads-snapshots/cron`).
To populate immediately rather than wait, trigger it with the `CRON_SECRET`
bearer token:

```bash
curl -X GET https://cms.optimisedigital.online/api/google-ads-snapshots/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

This captures **6 pulls per client**: campaign, ad_group, keyword, search_term,
plus the two additive windows — **90-day keyword** and **60-day ad-group**. It
can take a few minutes; the response is a per-client JSON summary.

Verify the windows landed (read-only):

```sql
SELECT level, date_range_label, row_count
FROM google_ads_snapshots
WHERE client_id = <ID>;
```

Expect `LAST_90_DAYS` (keyword) and `LAST_60_DAYS` (ad_group) rows alongside the
`LAST_30_DAYS` / `STRUCTURAL` primaries.

### Step 2 — Activate via OptiMate (the only entry point)

Open the client's OptiMate chat in the admin and ask it to set up the agent. It
calls `create_account_efficiency_goal_run`, which **requires** you to supply:

- **`monthlyBudget`** (required — dollars; overwrites the stored CMS monthly budget)
- `minRecipientConversions` (default 5 — conversions a campaign needs to receive freed budget)
- `targetImprovementPercent` (default 15)
- `includedCampaignIds` (optional scope allow-list — **use this to keep the blast radius small at first**)
- `enabledLevers` (e.g. `["budget_shift","keyword_pause","ad_group_pause","bid_adjust","strategy_alert"]`)

Example prompt:

> "Set up the account-efficiency agent for this client. Monthly budget is
> $5,000, recipient conversions threshold 5, target 15% CPA improvement, enable
> budget_shift and keyword_pause, scope to campaigns 123 and 456."

The tool **does not start the run** — it queues a human-approval row and returns
an approval URL. It rejects creation outright if `monthlyBudget` is missing.

### Step 3 — Approve & apply

Go to **`/admin/agent-approvals`**, open the queued *"Create Account Efficiency
goal run"* proposal, review the parameters, and click **Apply**. On apply the
handler:

- overwrites `google-ads-audits.monthlyBudget` (recording the prior value in the
  run's first audit snapshot for auditability),
- creates the `goal-runs` row in `awaiting_data`,
- sets `nextCheckAt = now`.

### Step 4 — Let the scheduler tick (or trigger it)

The goal-agents scheduler runs **hourly** (`/api/goal-agents/cron`). To advance
immediately:

```bash
curl -X GET https://cms.optimisedigital.online/api/goal-agents/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

The run walks:

```
awaiting_data → analysing → pending_approval / executing → measuring → complete
```

Lever proposals (keyword/ad-group pauses, bid changes) land back in
`/admin/agent-approvals` for sign-off per their risk tier.

---

## Testing end-to-end in prod

1. **Pick a low-risk client** (or a test customer ID) with real campaign data.
2. Run **Step 1**; confirm the 90d/60d window rows exist.
3. Activate (**Steps 2–3**) with a **tight scope** — one or two
   `includedCampaignIds` and only `["budget_shift"]` to start — so the blast
   radius is tiny.
4. Trigger the scheduler (**Step 4**) and watch the run progress
   (`list_goal_runs` / `get_goal_run` / `get_goal_progress_summary` in OptiMate,
   or the `goal-runs` collection).
5. **Verify via the Change-Review UI:**
   `https://cms.optimisedigital.online/admin/goal-changes?clientId=<ID>`
   - Approved/applied changes show by default, each with its reason.
   - Toggle **"Show disapproved / blocked"** to see what was filtered and why.
   - Scope to a single run with `&goalRunId=<ID>`.
6. **Confirm the fail-safes:**
   - A phrase/exact keyword pause should appear **only** if the 90d window
     confirms 0 conversions.
   - An ad group should first be **staged** (an `ad-group-prune-staged`
     snapshot), not paused, until a `measurementDays` cycle elapses **and** the
     60d window confirms 0 conversions. If it converted within 60d, staging is
     cleared (no pause).

---

## Gotchas

- **Ad-group pauses don't fire on the first tick — by design.** They stage and
  re-check after one `measurementDays` cycle (default 14 days). The run stays in
  `analysing` (re-tick scheduled) rather than completing while staging is active.
- **Keep scope tight first.** `budget_shift` moves real daily budgets when
  approved+applied; keyword/ad-group pauses mutate live Google Ads.
- **Approvals required for yellow/red/black tiers.** Nothing destructive
  auto-executes unless a green tier with `autoExecute` allows it.
- **One active run per client.** Re-activating while a run is live (not
  complete/failed) errors out.
- **Monthly-budget overwrite is destructive** — it replaces the stored CMS
  monthly budget. The prior value is recorded in the create snapshot, visible in
  the Change-Review UI.
- **No pacing.** The agent does NOT consult the spend pacer; budget shifts are
  not vetoed by under/over-spend. Total spend is held constant by the internal
  daily-budget conservation check instead.

---

## Cron reference (from `vercel.json`)

| Cron | Schedule (UTC) | Purpose |
|------|----------------|---------|
| `/api/google-ads-snapshots/cron` | `0 4 * * *` (daily 04:00) | Refresh snapshots incl. 90d/60d windows |
| `/api/goal-agents/cron` | `0 */1 * * *` (hourly) | Advance every active goal run one tick |
| `/api/goal-agents/watchdog` | `0 5 * * *` (daily 05:00) | Detect stuck runs |

All three authenticate via `Authorization: Bearer $CRON_SECRET`.

---

## Appendix: verify the schema migration

The widened unique index must be present in production. Read-only check against
Turso:

```sql
SELECT name, sql FROM sqlite_master
WHERE type = 'index' AND tbl_name = 'google_ads_snapshots';
```

Expect:
- ✅ `google_ads_snapshots_client_level_window_unq` on
  `(client_id, level, date_range_label)` present
- ✅ the old 2-column `google_ads_snapshots_client_level_unq` **absent**

If the new index is missing, run the migration sweep (idempotent):

```bash
curl -X POST https://cms.optimisedigital.online/api/migrate \
  -H "x-api-key: $AUDIT_API_KEY"
```

Note: the sweep runs ~2500 statements serially against Turso and may exceed the
HTTP function timeout — the statements still apply server-side. Re-query the
index to confirm rather than relying on the HTTP response completing.
