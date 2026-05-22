# Goal-Oriented Agents for OptiMate — Architecture & Build Plan

> Programmatic, autonomous Google Ads optimisation agents for OptiMise Digital's CMS.
> Source: extended design conversation, May 2026. Author: planning session output.

---

## 1. What Is a Goal-Oriented Agent?

A goal-oriented agent is a **closed-loop autonomous execution system**. Unlike a normal conversational agent (propose → human approves → execute → stop), a goal agent runs as a persistent, cron-driven loop:

1. **Success contract** — explicit criteria that define "done" before any work starts
2. **Prerequisites gate** — things that must exist (API access, permissions, conversion tracking) before the loop begins
3. **Harness** — diagnostic queries the agent runs to observe reality
4. **Evidence ledger** — every claim of progress must be backed by an artifact (log, command output, snapshot)
5. **Verifier** — independent check that proves the goal is achieved end-to-end
6. **Worker tasks** — disposable sub-actions that execute one focused step at a time

**Critical principle:** the agent cannot mark itself "done" by assertion. It must produce evidence the verifier accepts.

### Why this maps cleanly onto Google Ads work

| Goal framework requirement | Google Ads equivalent |
|---|---|
| Measurable success criteria | CPA, CTR, conversion volume, Quality Score, impression share |
| Prerequisites | MCC access, conversion tracking live, budget headroom |
| Harness (observe reality) | Search Terms Report, campaign performance, change history |
| Evidence | Before/after metrics, mutation IDs from Google Ads API |
| Verifier | Query proving the change took effect AND moved the metric |
| Disposable workers | Per-campaign, per-ad-group, per-keyword micro-tasks |

---

## 2. Cadence — How Fast the Loop Runs

Google Ads data has natural latency. The loop speed depends entirely on what metric the goal is verifying against.

| Signal | When reliable |
|---|---|
| Impressions, clicks, CTR | ~3 hours, settled by 24h |
| Cost data | 24–48h (Google re-attributes invalid clicks) |
| Conversions (direct) | 24–72h |
| Conversions (view-through / cross-device) | 3–7 days |
| Quality Score changes | 7–14 days |
| Smart Bidding learning phase | 7–14 days minimum, often 21 |
| Statistical significance (typical SMB volumes) | 14–28 days |

### Goal cadence tiers

| Tier | Verifier metric | Loop frequency |
|---|---|---|
| **Fast** (24–72h) | Spend, clicks, impressions, search term appearance | Daily check, action every 2–3 days |
| **Medium** (5–10 days) | Conversion rate, CPA, conversion volume | Twice-weekly check, weekly action |
| **Slow** (3–6 weeks) | ROAS, Quality Score, account efficiency | Weekly check, action every 2–3 weeks |
| **Quarterly** | LTV, profitability, channel mix | Outside goal-agent scope — humans only |

**The reframing that matters:** the agent's value isn't speed — it's **consistency and vigilance**. A weekly loop with perfect follow-through beats a human's "I'll get to it" cadence.

---

## 3. The Seven Safety Layers

Before any autonomous goal runs in production, these layers must exist. They are stacked from most restrictive (bottom) to most permissive (top). An action only reaches Google Ads if every layer approves.

```
┌─────────────────────────────────────────────────┐
│ 7. Goal Agents (propose actions toward goals)   │
├─────────────────────────────────────────────────┤
│ 6. Goal Scheduler (slots, parallel conflicts)   │
├─────────────────────────────────────────────────┤
│ 5. Per-Goal Scope Fences (entities/verbs)       │
├─────────────────────────────────────────────────┤
│ 4. Risk Tier Classification (green/yellow/red)  │
├─────────────────────────────────────────────────┤
│ 3. Spend Pacer (veto if pacing violated)        │
├─────────────────────────────────────────────────┤
│ 2. Account Health Contract (invariants)         │
├─────────────────────────────────────────────────┤
│ 1. Hard Guardrails (forbidden actions)          │
└─────────────────────────────────────────────────┘
```

### Layer 1 — Hard Guardrails (Non-Negotiable, Code-Enforced)

Forbidden actions, always, regardless of goal:

- ❌ Delete campaign / ad group / ad (only pause is allowed)
- ❌ Remove conversion tracking
- ❌ Change bidding strategy *type* without human approval
- ❌ Modify any campaign tagged `protected: true`
- ❌ Touch budgets > X% of current value in a single move

**Implementation:** every apply handler starts with a policy check function that throws before any Google Ads mutation. If you don't want it to happen, don't build the tool that does it.

### Layer 2 — Account Health Contract

Per-client invariants that hold regardless of which goal is running:

```
Account Health Contract for Acme Bakery:
  - Monthly spend: 90–105% of $50,000
  - Active campaigns: minimum 3
  - Active ad groups per campaign: minimum 2
  - Conversion tracking: must be live
  - Impression share: must stay above 30%
  - Daily conversion volume: 7-day average must stay above 5
  - Brand campaign: untouchable (campaign_id_X)
```

Set once at client onboarding. Every subsequent goal operates inside it.

### Layer 3 — Spend Pacer

Continuous monitor that runs hourly, independent of any goal:

```
Spend Pacer:
  Target daily pace = monthly budget / days in month
  Tolerance band = ±15% of target

  If MTD pace below band:
    - Flag account 'underspending'
    - BLOCK any goal action that would reduce spend further
    - Allow goal actions that maintain or increase spend
    - Alert team if underspend persists >3 days

  If MTD pace above band:
    - Flag 'overspending'
    - BLOCK any action that would increase spend
    - Alert team if overspend persists >2 days
```

Pacing modes by client type:

| Client type | Pacing rule |
|---|---|
| Fixed monthly budget ($50k/mo committed) | Must spend 90–105%; underspend is a failure |
| Performance-cap budget ($50k/mo ceiling) | May underspend if efficiency drops; ceiling is hard |
| ROAS-target with flexible budget | Spend scales with ROAS achievement |
| Seasonal/launch budget | Pace varies by predefined curve |

### Layer 4 — Risk Tier Classification

Every action declares its tier; approval requirements follow:

| Tier | Examples | Approval Model |
|---|---|---|
| 🟢 **Green** (low risk, reversible) | Add negative below $X spend; pause a single low-volume ad | Fully autonomous |
| 🟡 **Yellow** (medium risk) | Pause an ad group; add 20+ negatives; shift budget <10% | Auto-execute, notify human, 24h revert window |
| 🔴 **Red** (high risk) | Change bid strategy; pause campaign; budget change >10% | Require explicit human approval before execution |
| ⚫ **Black** (forbidden) | Delete anything; touch brand campaigns | Not possible — no handler exists |

### Layer 5 — Per-Goal Scope Fence

Each goal declares its constrained universe at creation:

```typescript
{
  goal: "Reduce wasted spend on irrelevant search terms by 30%",
  scope: {
    campaigns: ["campaign_id_123", "campaign_id_456"],
    excludedCampaigns: ["brand_campaign_id"],
    allowedActions: ["add-negative-keyword"],
    forbiddenTerms: brandTerms,
    maxBudgetImpact: 0,
    maxKeywordsPerRun: 50,
    minSpendThreshold: 50,
  }
}
```

The orchestrator filters every proposed action through this fence. Brand-term proposed as negative? Rejected before reaching the API.

### Layer 6 — Goal Scheduler (Parallel Conflict Detection)

Goals can run in parallel if and only if:

1. They touch **different entities** (different campaigns), OR
2. They optimise for **the same direction** on the same metric, OR
3. Their action types are **non-overlapping**

Otherwise: serialised.

**Goal slots per account:**

```
Account: Acme Bakery
  Slot 1 (Search Hygiene): search-term-waste-reducer  [active, day 4/14]
  Slot 2 (Creative): ad-ctr-improver                  [active, day 9/21]
  Slot 3 (Structure): EMPTY
  Slot 4 (Bidding): bid-strategy-tuner                [queued]
```

Rules:
- Max 1 goal per slot at a time
- Slots defined by action-type families
- Bidding slot blocks all others when active
- Restructure slot blocks all others

### Layer 7 — Goal Agent Decision Logic

The agent's "brain" — the LLM-driven decision step that picks the next action toward the goal. All creativity lives here; all constraints live in the layers below.

### Independent: Watchdog (Anomaly Detection)

Runs hourly, separate from any goal:

```
Every hour, check:
  - Account CTR dropped >20% in last 24h?
  - CPA risen >30% in last 24h?
  - Impression volume dropped >40%?
  - Campaigns newly "limited by budget"?
  - Quality Score drop on key terms?

If any tripwire fires:
  → Pause all active goal runs
  → Notify team
  → Require human re-authorisation to resume
```

This is the seatbelt — catches failures even if every other layer fails.

---

## 4. The Spend-Floor Problem (Reward Hacking)

**The trap:** "Reduce CPA by 30%" is gameable. Easiest path to near-zero CPA = pause everything except the one best ad group. CPA: amazing. Volume: destroyed. Client's $50k: 90% unspent.

**The fix:** never specify a goal with a single metric. Every optimisation goal is expressed as a metric to improve **subject to constraints**:

Bad (gameable):
```
"Reduce CPA by 30%"
```

Good (constrained):
```
Primary objective: Reduce CPA by 30%
Constraints (all must hold):
  - Monthly spend must stay within 90–105% of $50,000 budget
  - Conversion volume must not drop below current baseline
  - Impression share must not drop more than 10 percentage points
  - No campaign may be paused
  - No ad group may go below 50% of its current daily budget
```

**Redeployment principle:** if a goal genuinely identifies waste, the saved money must be redeployed, not banked. Every goal that *reduces* spend in one place must trigger a paired redeployment goal so saved budget gets reinvested.

---

## 5. Goal Type Library — Initial Build Targets

### Goal 1: Search Term Waste Reducer ⭐ FIRST BUILD

**Use case:** eliminate wasted spend on zero-conversion search terms

```yaml
Prerequisites:
  - MCC access confirmed
  - ≥14 days of search term data available
  - Existing NKL infrastructure in place

Harness:
  - Search terms with >$X spend and 0 conversions in last 14d
  - Current negative keyword coverage
  - Current month's wasted spend baseline

Cadence:
  observation_days: 7
  action_day: 1
  measurement_days: 7
  total_cycle: ~14 days
  max_iterations: 2-3

Evidence Plan:
  - Baseline snapshot saved
  - List of proposed negatives
  - Mutation IDs from negative keyword push
  - 7-day-later re-measurement

Verifier:
  Spend on negated terms after push = $0
  Wasted spend reduced by ≥30% from baseline
```

**Intent classification before any negation:**
1. Brand term? → reject
2. Competitor brand? → flag for human review, don't auto-negate
3. High commercial intent ("buy", "near me", "best") + zero conversions? → escalate as conversion-tracking problem, don't negate
4. <3 clicks in 14 days? → insufficient data, skip
5. Recently added as positive keyword? → conflict, skip

### Goal 2: Ad CTR Improver

```yaml
Use case: Restructure underperforming campaigns until CTR > target
Cadence: 7d observation, 1d action, 10d measurement (~3 weeks/loop)
Actions: ad copy generate, ad copy deploy, pause low-CTR ads
```

### Goal 3: Ad Group Restructure (Proposal Only)

```yaml
Use case: Surface ad group restructure candidates for human approval
Cadence: 14d observation, 2-3d action, 21d measurement (~5-6 weeks)
Risk: Yellow → always requires approval
```

### Goal 4: Budget Reallocation

```yaml
Use case: Move budget from low-ROAS to high-ROAS campaigns within total budget
Cadence: 7d observation, 1d action, 14d measurement (~3 weeks/loop)
Constraint: Total account spend unchanged
```

### Goal 5: ROAS Improvement (Ambitious)

```yaml
Use case: Hit ROAS target on Campaign Y within 21 days
Cadence: 14d observation, ongoing action, 21d measurement (6-10 weeks total)
Status: Build LAST, after first 4 prove the system
```

---

## 6. Architecture — Where Goal Agents Sit Relative to OptiMate

OptiMate and goal agents are **siblings at the agent layer**. They share everything below.

```
┌────────────────────────────────────────────────────────────────┐
│ Layer 3: AGENTS (the "brains")                                  │
│                                                                 │
│   OptiMate Chat              Goal Agents                        │
│   (conversational,           (autonomous, cron-driven,          │
│    human-paced)               persistent, self-checking)        │
└────────────────────────────────────────────────────────────────┘
                              ↓ both call ↓
┌────────────────────────────────────────────────────────────────┐
│ Layer 2: ACTIONS (the "hands")                                  │
│   Apply handlers, tools, propose-* functions                    │
│   All policy checks, scope fences, risk classification          │
└────────────────────────────────────────────────────────────────┘
                              ↓ both call ↓
┌────────────────────────────────────────────────────────────────┐
│ Layer 1: INFRASTRUCTURE (the "body")                            │
│   Google Ads client, rate limiter, snapshot cache,              │
│   brand terms, activity log, spend pacer, watchdog,             │
│   account health contract                                       │
└────────────────────────────────────────────────────────────────┘
```

### Target file structure

```
src/lib/agents/
  _shared/
    llm/                          ← existing
    google-ads-client/            ← NEW: rate-limited client (via Growth Tools)
    snapshot-cache/               ← NEW: daily snapshots
    policy/                       ← NEW: scope fences, risk tiers, preflight
    spend-pacer/                  ← NEW
    watchdog/                     ← NEW
    activity-log/                 ← existing, lift up

  _actions/                       ← LIFTED OUT of optimate-google-ads/
    google-ads/
      apply-handlers/
      tools/
      propose-helpers/

  optimate-google-ads/            ← now just the chat brain
    prompt.ts
    chat-handler.ts
    tool-registry.ts

  goal-agents/                    ← NEW
    _runtime/
      scheduler.ts                ← slot management, conflict detection
      executor.ts                 ← daily cron that wakes goals up
      verifier.ts                 ← evidence collection + success checks

    goal-types/
      search-term-waste-reducer/
        definition.ts
        observe.ts
        plan.ts
        act.ts
        verify.ts
      ad-ctr-improver/
      bid-strategy-tuner/
      ...
```

### The Action Interface

Every action is self-contained and callable by any agent:

```typescript
export const addNegativeKeywordsAction = {
  id: 'add-negative-keywords',
  riskTier: 'green',
  reversible: true,

  schema: addNegativeKeywordsSchema,

  async preflight(input, context): Promise<PolicyResult> {
    // Scope fence, brand terms, rate limit, pacer, health contract
    return { ok: true } // or { ok: false, reason: '...' }
  },

  async execute(input, context): Promise<ExecutionResult> {
    // Call via rate-limited client, return mutation IDs
    // Log to activity-log with caller identity
  },

  async revert(executionResult, context): Promise<void> {
    // Undo this specific execution
  },
}
```

### Where OptiMate and goal agents intersect (by design)

1. **OptiMate can see goal state** — read access to `goal-runs` collection so chat can answer "how's Acme doing?"
2. **OptiMate can start goals** — when user describes an optimisation goal in chat, OptiMate proposes creating a goal run
3. **Goal agents escalate to humans via OptiMate** — yellow/red tier actions surface in the approval queue OptiMate exposes

---

## 7. API Access & Quota

**Decision:** Growth Tools (owned in-house) holds the Google Ads dev token. All goal agent traffic flows through it. Basic Access (15k ops/day) is sufficient for current scale + 1–5 goal agents, with CMS-side snapshot caching reducing API load dramatically.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CMS (this repo)                                         │
│                                                          │
│  Goal Agents          OptiMate Chat                      │
│       └────────┬───────────┘                             │
│                ▼                                          │
│       _actions/ (shared action layer + preflight)        │
│         │                       │                        │
│       reads                  mutations                   │
│         ▼                       ▼                        │
│   google-ads-snapshots    Growth Tools                   │
│   (DB collection)         (fire-and-forget)              │
│         ▲                       │                        │
└─────────┼───────────────────────┼────────────────────────┘
          │ daily cron pull       │ HTTP calls
          ▼                       ▼
    ┌─────────────────────────────────────┐
    │  Growth Tools (in-house service)    │
    │  (holds the Google Ads dev token)   │
    └──────────────┬──────────────────────┘
                   ▼
            Google Ads API
```

### Quota math (at current scale, 50 clients)

| Source | Ops/day estimate |
|---|---|
| Snapshot cron pull (50 clients × ~6 entity types) | ~300 |
| Goal agent action days (1–5 goals) | ~200 peak |
| OptiMate chat (now cache-backed) | ~100 |
| Headroom for audits, backfills, ad-hoc | ~14,400 |
| **Total used** | ~600 (~4% of quota) |

Plenty of headroom. Will likely sustain 3–5× current scale on Basic before needing Standard.

### Things to plan for

1. **Per-client rate limits still apply** even on Basic — snapshot cron must be per-client sequential, cross-client parallel (concurrency cap 5–10)
2. **Backfills are the real quota risk** — onboarding a new client (90-day search terms backfill) can burn thousands of ops in minutes. Use rate-limited job queue, never tight loops.

---

## 8. Gap Analysis — What OptiMate Has vs What Goal Agents Need

### What exists today (reads)

| Capability | Tool | Suitable for goals |
|---|---|---|
| Account snapshot (spend, MTD pacing) | `get_account_overview` | ✅ Spend pacer foundation |
| Campaign-level performance | `get_campaign_performance` | ✅ ROAS, CTR goals |
| Search terms with spend/conversions | `get_search_terms` | ✅ Waste reducer |
| Budget management context | `get_budget_management_email` | ✅ Budget redeployment |
| Pipeline status | `get_campaign_proposal_status` | ✅ Conflict detection |
| Client metadata | `get_client_details` | ✅ Customer ID resolution |

### What exists today (mutations)

| Capability | Apply Handler | Suitable for goals |
|---|---|---|
| Add negatives to campaign | `propose_negative_keywords` | ✅ Waste reducer |
| Create/update/push NKLs | `propose_nkl_*` | ✅ NKL waste reduction |
| Update CMS budget allocation | `propose_budget_update` | ✅ Budget redeployment |
| Push budget to Google Ads live | `propose_budget_push_live` | ✅ Budget redeployment |
| Generate RSA copy | `propose_ad_copy_generate` | ✅ CTR improver |
| Deploy ad copy live | `propose_ad_copy_deploy` | ✅ CTR improver |
| Create new ad group | `propose_ad_group_create` | ✅ Restructure |
| Restructure campaign | `propose_campaign_restructure` | ✅ Restructure |
| Add keywords | `propose_keywords_add` | ✅ Expansion |

### Gaps blocking specific goal types

| Gap | Blocks | Needed handler |
|---|---|---|
| No pause/enable controls | CTR improver, CPA reducer | `propose_ad_status_change`, `propose_ad_group_status_change`, `propose_keyword_status_change` |
| No bid adjustments | ROAS goals, CPA goals, bid-tuning | `propose_keyword_bid_update`, `propose_bid_modifier_update`, `propose_bidding_strategy_target_update` |
| No snapshot/caching layer | All goals (quota risk) | `google-ads-snapshots` collection + cron |
| No account health contract | Spend protection, brand protection | Extension to `clients` collection |
| No mutation reversibility records | All goals (revert capability) | `goal-run-mutations` table |
| No risk tier classification | All goals (autonomous approval) | `riskTier` metadata on handlers |
| No goal runtime | Everything | `goal-runs` collection + scheduler |

### Optional (nice-to-have, defer)

- Asset/extension management (sitelinks, callouts)
- Audience management
- Conversion tracking inspection
- Quality Score retrieval
- Geo/location targeting

---

## 9. Build Plan — Ordered Phases

### Phase 1: Lift Actions Out (No Behaviour Change)

1. Lift `apply-handlers/` and `tools/` from `optimate-google-ads/` to `_actions/google-ads/`
2. Update OptiMate's imports to new paths
3. Verify nothing changes — same tests pass

**Why first:** isolates "what OptiMate can do" from "things one can do to Google Ads accounts." Sets up for everything else.

### Phase 2: Foundations (Snapshot + Policy)

4. **`google-ads-snapshots` collection + daily cron** ⭐ highest leverage
   - Search terms, campaign metrics, ad group metrics, keyword metrics
   - Per-client sequential, cross-client concurrency-capped
   - Snapshot freshness timestamp on every record
   - Read helpers in `src/lib/google-ads-snapshots/`

5. **Account health contract** — extend `clients` collection with `spendPolicy`, protected campaigns, brand campaign IDs

6. **Spend pacer service** — hourly cron + `canReduceSpend()` / `canIncreaseSpend()` API reading from snapshots

7. **Risk tier metadata + preflight gate** — annotate existing handlers, wrap with policy check

### Phase 3: Goal Runtime

8. **`goal-runs` collection** with state machine: `awaiting_data | analysing | pending_approval | executing | measuring | complete | failed`

9. **Scheduler/executor cron** — daily wake-up loop:
   - Reads `goal-runs` where `next_check_at <= now`
   - Runs harness via snapshot reads
   - Decides next step (LLM call)
   - Updates state and `next_check_at`

10. **First goal type: search-term-waste-reducer** end-to-end using existing actions

11. **Watchdog cron** — independent anomaly detector from snapshot deltas

### Phase 4: OptiMate Integration

12. OptiMate tools to read goal state
13. OptiMate tool to create new goals
14. Escalation notifications back to humans

### Phase 5: Expand Goal Library (After First Goal Proves Out)

15. Pause/enable handlers (Tier B prerequisites for goals 2+)
16. Mutation reversibility records (`goal-run-mutations` table)
17. Bid adjustment handlers
18. Second goal type: ad CTR improver
19. Third goal type: budget reallocation
20. Fourth goal type: ad group restructure
21. Fifth goal type: ROAS improvement (last, most complex)

---

## 10. Goal Run Data Model (Sketch)

```typescript
{
  id: 'gr_abc123',
  clientId: '...',
  goalType: 'search-term-waste-reducer',

  // Definition
  scope: {
    campaigns: [...],
    excludedCampaigns: [...],
    allowedActions: [...],
    forbiddenTerms: [...],
    maxBudgetImpact: 0,
    maxKeywordsPerRun: 50,
  },

  successCriteria: {
    primary: { metric: 'wasted_spend', operator: '<', target: 0.7, baseline: '$X' },
    constraints: [
      { metric: 'monthly_spend', between: [0.9, 1.05] },
      { metric: 'conversion_volume', operator: '>=', baseline: true },
      { metric: 'impression_share', operator: '>=', minus: 0.10 },
    ],
  },

  cadence: {
    minObservationDays: 7,
    cooldownDays: 5,
    maxIterations: 4,
    expectedDurationDays: 28,
  },

  quotaBudget: {
    readsPerDay: 5,
    mutateOpsPerActionDay: 100,
    estimatedTotalOps: 250,
  },

  // State
  state: 'measuring',
  nextCheckAt: '2026-06-15T10:00:00Z',
  coolingOffUntil: '2026-06-12T10:00:00Z',
  iterationsCount: 1,

  // Evidence
  baselineSnapshot: {...},
  currentMeasurement: {...},
  mutationsApplied: [
    { mutationId: '...', actionType: 'add-negative-keywords', appliedAt: '...', reversible: true }
  ],
  evidenceLog: [
    { kind: 'observation', at: '...', summary: '...', artifactPath: '...' },
    { kind: 'decision', at: '...', summary: '...', llmReasoning: '...' },
    { kind: 'action', at: '...', summary: '...', mutationIds: [...] },
    { kind: 'measurement', at: '...', summary: '...', metrics: {...} },
  ],
}
```

---

## 11. The Mental Model

Stop thinking of the agent as the decision-maker. Start thinking of it as a **candidate generator**:

- The **agent** proposes moves toward the goal
- The **policy engine** decides which proposals are legal
- The **risk classifier** decides which legal proposals are safe to auto-execute
- The **human** approves the rest
- The **watchdog** can override everything

Once you frame it this way, "the agent did something dumb" becomes structurally impossible — the dumb thing either has no handler, fails the scope fence, fails the classifier, or trips the watchdog.

The agent's superpower isn't speed. It's that **on day 9 of a 14-day measurement window, it actually checks. On day 14, it actually acts. On day 21, it actually re-measures.** Humans rarely do this reliably across a portfolio.

---

## 12. Open Questions to Resolve Before Phase 2

1. Confirm Growth Tools endpoint coverage for full snapshot needs (campaign + ad group + keyword + search term historical)
2. Decide structured format for `mutationId` returned from Growth Tools (needed for reversibility)
3. Define exact set of green-tier actions (can auto-execute) vs yellow (auto + notify) vs red (require approval)
4. Decide where escalation notifications surface (existing approval queue? new inbox?)
5. Determine spend pacer alert channel (email? Slack? CMS notification?)

---

*End of architecture document.*
