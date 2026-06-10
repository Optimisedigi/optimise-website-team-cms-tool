# Phase 5 — OptiMate Real-Data Validation

**Run date:** 2026-06-04
**Account:** `659-101-3898` (whitelisted read account, the test client's `googleAdsCustomerId`)
**Range:** `LAST_30_DAYS`
**Method:** deterministic transformation check (no LLM). For each OptiMate read tool, the wrapped
Growth Tools endpoint was queried **independently**, the totals re-aggregated by hand, and compared
to the tool's own output within tolerance (exact for counts/spend after rounding; epsilon for
derived rates). This isolates a *data/transformation* bug from an *agent-reasoning* bug.

> **Why this form:** the CMS holds no Google Ads creds — ground truth is the same Growth Tools
> endpoint the tool wraps (`.gg/plans/platform-feature-test-swarm.md` Phase 5). Growth Tools and
> `INTERNAL_API_KEY` are wired in this dev env, so live reads were possible.

## Results

### `get_account_overview` → `/api/google-ads/campaign-budgets/get-metrics` — ✅ ALL MATCH

| Metric | Ground truth (independent) | Tool output | Tol |
|---|--:|--:|--:|
| campaignsReturned | 16 | 16 | 0 |
| activeCampaigns (impr > 0) | 10 | 10 | 0 |
| totalSpend | $2647.44 | $2647.44 | 0.01 |
| totalConversions | 0 | 0 | 0.01 |
| totalImpressions | 863 | 863 | 0 |
| totalClicks | 12 | 12 | 0 |
| avgCpa | null (0 conv) | null | 0.01 |

Validated: spend/conversion aggregation across campaigns, active-campaign definition
(impressions > 0), and the null-CPA guard on zero conversions.

### `get_search_terms` → `/api/google-ads/search-terms` — ✅ ALL MATCH

| Metric | Ground truth (independent) | Tool output |
|---|--:|--:|
| count (minImpressions=0) | 195 | 195 |
| sum spend across terms | $1477.45 | $1477.45 |
| top-spend term | `google agency` | `google agency` |
| top-spend value | $286.44 | $286.44 |

Validated: `minImpressions` filter, term-field mapping (`searchTerm`/`query`), and the
spend-descending sort that the waste-hunting use case depends on.

### `get_weekly_metric_table` → `/api/google-ads/campaign-budgets/get-metrics` (per bucket) — ✅ ALL MATCH

4 Monday-anchored weeks ending 2026-06-01. Each bucket's `weekStart` was verified to be a Monday,
buckets contiguous, the in-progress last week correctly flagged `partial`. Each bucket's totals were
compared to an **independent** Growth Tools call for that exact `weekStart,weekEnd` span:

| Week | Spend (gt = tool) | Impr | Clicks |
|---|--:|--:|--:|
| 2026-05-11..17 | $236.65 | 56 | 1 |
| 2026-05-18..24 | $2182.58 | 778 | 10 |
| 2026-05-25..31 | $0 | 0 | 0 |
| 2026-06-01..01 (partial) | $0 | 0 | 0 |

Validates the **Monday-anchored bucketing the plan specifically flagged as a silent-misreport risk** —
bucket boundaries and per-bucket aggregation are both correct.

### `get_gsc_branded_split` / `fetchBrandedAnalytics` — ⚠️ **2 PROD-BUGs FOUND + FIXED**

This is where Phase 5 earned its keep. Validating the brand/non-brand split against an unfiltered GSC
total surfaced two real defects in `src/lib/gsc-service.ts`:

1. **`groupType: "or"` is rejected by the GSC API (HTTP 400).** The brand query OR'd multiple
   `contains` filters via `{ groupType: "or", … }`, but the Search Console API **only supports
   `"and"`** (verified live: both `"or"` and `"OR"` return
   `Invalid value at 'dimension_filter_group[0].group_type'`). Every call threw and the function's
   `catch` returned `{ brand: null, nonBrand: null }` — so the branded split **silently produced no
   data in production**, affecting GSC monitoring, the dashboard brand-vs-generic split, and AI
   visibility. **Fixed:** replaced the OR/AND filter groups with single `includingRegex` /
   `excludingRegex` filters (regex-escaped brand terms) — true OR / NOR semantics in one call.
2. **`rowLimit: 25` undercounted totals.** Once #1 was fixed, brand+nonBrand impressions didn't
   reconcile to the unfiltered total because only the top 25 queries were summed (long-tail dropped).
   **Fixed:** raised to `25000` so the totals cover all queries (the top-10 `topQueries` slice is
   unaffected).

**Post-fix, the partition reconciles exactly** to the independent unfiltered GSC total across 3 live
clients (including berendsen with 12 brand terms, confirming regex-OR scales):

| Client | brand+nonBrand clicks = total | brand+nonBrand impr = total |
|---|--:|--:|
| optimise-digital | 3 = 3 | 8,435 = 8,435 |
| away-digital | 192 = 192 | 104,924 = 104,924 |
| berendsen (12 terms) | 949 = 949 | 124,333 = 124,333 |

### `get_gsc_branded_split` ctr/position — ⚠️ **3rd PROD-BUG FOUND + FIXED**

A follow-up check of the segment `ctr`/`position` fields (the totals were already fixed above) found
they were computed as a **flat unweighted mean of each query's per-row ctr/position**. That misreports:
a single high-CTR brand query averaged equally against thousands of near-0% long-tail queries skews
the segment CTR, and an unweighted position mean ignores impression volume. **Fixed:** CTR is now
`total clicks / total impressions` (its definition) and position is **impression-weighted**. Verified
live across 3 clients — segment CTR now equals clicks/impressions exactly (e.g. client 1 brand
2/11 = 18.18%, non-brand 1/8424 = 0.01%), positions are sensible weighted values (brand 3.1–11.4).

### `get_ga4_overview` → `fetchGa4Report` vs independent GA4 re-query — ✅ ALL MATCH

GA4-connected client 1 (property 280195593), ~30-day window. The tool's overview was compared to an
independent `runReport` for the same metrics, plus a channel-breakdown reconciliation:

| Metric | Ground truth | Tool |
|---|--:|--:|
| users | 442 | 442 |
| sessions | 194 | 194 |
| pageviews | 744 | 744 |
| conversions | 15 | 15 |
| channel sessions sum | 194 | 194 |

(Only client 1 had a refreshable GA4 token in this dev snapshot; the others are DEV-CONFIG.)

## Verdict

For the **Google Ads read tools** (`get_account_overview`, `get_search_terms`,
`get_weekly_metric_table`) and **GA4 overview**, OptiMate's transformations are **faithful to ground
truth** — exact matches incl. the Monday-bucketing risk. The **GSC branded split** validation surfaced
and fixed **three** real production defects (unsupported `or` filter group, capped `rowLimit`, and
unweighted ctr/position); post-fix it reconciles exactly against live GSC.

### `get_ai_visibility` + `get_serp_displacement` — ✅ anti-hallucination (faithful to CMS DB)

These two tools read directly from CMS DB collections (`ai-visibility-snapshots`,
`serp-displacement-snapshots`), so ground truth is the DB itself. The test DB has **zero snapshot
rows**, which is the ideal anti-hallucination case — the tools must say "no data", never invent it:

| Tool | Client (state) | Tool response | Verdict |
|---|---|---|---|
| AI visibility | 3, 6 (enabled, 0 snapshots) | `{enabled:true, snapshotCount:0, reason:"no snapshots collected yet"}` | honest no-data ✅ |
| AI visibility | 1 (disabled) | `{enabled:false, reason:"not enabled"}` | honest ✅ |
| SERP displacement | 3 (enabled) | `trackedKeywordCount:2` | **matches DB exactly** ✅ |
| SERP displacement | 6 (enabled) | `trackedKeywordCount:0` | matches DB ✅ |
| SERP displacement | 1 (disabled) | `{enabled:false}` | honest ✅ |

SERP `trackedKeywordCount` was cross-checked against `clients_serp_monitor_keywords` — client 3 has
exactly 2 rows (`hydraulic repairs`/au ×2), client 6 has 0. The tools reflect real DB state and
fabricate nothing when empty.

### `get_account_overview` conversion action/category mapping — ✅ ALL MATCH (MTP account 184-083-4992)

Re-run against the **MTP Google Ads account `184-083-4992`** (client id 4), which has real,
attributed conversions — unlike the original whitelisted account (1 conv / 90d, no breakdown). The
agent's `conversionActions` were resolved from the client doc
(`Form Submission, Phone Click, Email Click, Get Directions`), passed to Growth Tools, and the
per-action merge (`mergeBreakdown`) compared to an independently-merged ground-truth call:

| Window | totalConv | Phone Click | Form Submission | Get Directions | Email Click |
|---|--:|--:|--:|--:|--:|
| LAST_90_DAYS | 69 | 37 | 14 | 12 | 6 |
| LAST_30_DAYS | 32 | 21 | 2 | 5 | 4 |

**Every value matches ground truth exactly across both windows.** `conversionsByCategory` is empty
because MTP configures flat conversion *actions* rather than grouped categories — the tool faithfully
returns `{}` for the category split (no fabrication), and the per-action aggregation is now fully
exercised on live data. This closes the previously-flagged gap.

## Typed Google Ads chat — anti-hallucination assessment

The user's core concern: do typed Google Ads answers come from real platform data, not the model
guessing? Evidence gathered:

1. **Prompt guardrails are explicit and strong** (`config.ts`): *"Always ground every claim in a tool
   result, never invent metrics"*; *"Every numeric claim must come from a tool result called this
   turn or earlier… Don't guess"*; *"Never fabricate fallback numbers"*; on tool error, retry once
   then escalate — never invent a fallback.
2. **The read tools return real data** — 5 tools proven exact against independent ground truth above.
3. **No-data paths return honest structured "no data"** (AI-visibility, SERP, conversion-category),
   so when the platform has nothing, the agent receives an explicit empty/disabled signal to relay
   rather than a blank it might fill in.

**Conclusion:** the architecture grounds typed answers in tool results, the tools are faithful to
Growth Tools / GA4 / GSC / CMS-DB ground truth, and empty cases are reported honestly.

### End-to-end typed-chat behavioural validation — ✅ CONFIRMED (live LLM, MTP audit)

The behavioural gap is now closed. Real `runChatTurn` turns were run against the MTP audit (id 2,
account 184-083-4992) with the `kimi-k2.6` model, and the tools actually called were read back from
`activity_log` by `runId`:

| Question | Tool called | Reply | Ground truth | Verdict |
|---|---|---|---|---|
| "total conversions last 90 days?" | `get_account_overview` | **69** | 69 | grounded ✅ |
| "Phone Click conversions, 90 days?" | `get_account_overview` | **37** | 37 | grounded ✅ |
| "exact Quality Score for 'plumber sydney' on 2024-03-03?" | *(none)* | *"I don't have access to Quality Score data… my tools cover spend, clicks, impressions, conversions, search terms, ad asset performance, but not Quality Score."* | n/a | **refused to fabricate** ✅ |

This proves the runtime behaviour, not just the data layer: the agent **calls a real tool before
answering a numeric question** and returns the tool's exact number, and when asked for a metric no
tool provides it **declines rather than inventing** one. The data-layer *and* agent-reasoning-layer
hallucination risks are both addressed for typed Google Ads chat.

### Full 10-week WoW table — ✅ every cell matches (account 342-535-3766, away-digital)

The strongest grounding test: asked OptiMate (end-to-end, `kimi-k2.6`) to *"build a week-on-week table
of conversions, CPA, and clicks for the last 10 weeks"* for account `342-535-3766`. It called
`get_weekly_metric_table` and rendered a 10-row table whose **every cell matches independent
ground truth exactly**:

| Week | Conversions | CPA | Clicks |
|---|--:|--:|--:|
| Mar 30 | 6 | $1,668 | 491 |
| Apr 6 | 6 | $1,461 | 355 |
| Apr 13 | 6 | $1,434 | 306 |
| Apr 20 | 7 | $1,571 | 435 |
| Apr 27 | 25 | $468 | 591 |
| May 4 | 25 | $446 | 547 |
| May 11 | 26 | $341 | 403 |
| May 18 | 30 | $310 | 424 |
| May 25 | 28 | $284 | 373 |
| Jun 1 (partial) | 23 | $249 | 301 |

Ground truth was computed independently by calling Growth Tools `get-metrics` once per Monday-anchored
week and recomputing CPA as spend/conversions. The direct-tool check matched all 10 weeks, and the
live chat reproduced them cell-for-cell with the partial week correctly flagged — no drift, no
fabrication. This is exactly the "does what OptiMate sends match what's actually in Google Ads"
question, answered affirmatively on a real, high-spend account.

## Defects found + fixed by Phase 5 (all committed)

| # | Defect | Fix | Commit |
|---|---|---|---|
| 1 | GSC branded split used `groupType:"or"` — rejected by GSC API (HTTP 400), split silently returned null in prod | `includingRegex`/`excludingRegex` | `587c16c` |
| 2 | `rowLimit:25` dropped long-tail — brand/non-brand totals undercounted | raise to 25000 | `587c16c` |
| 3 | segment ctr/position were unweighted per-row means | CTR = clicks/impr; position impression-weighted | `430cdb1` |

## Still outstanding (not run this pass)

- **Grouped conversion *categories*:** **descoped (negligible).** The Default Conversion Actions
  picker writes one category row per action by default (`label` defaults to the action name), so
  `conversionsByCategory` only diverges from the already-validated `conversionsByAction` in the rare
  case where someone manually bundles 2+ actions under a single renamed label. The per-action mapping
  is proven exact on MTP, which covers the data-correctness concern.
- **Voice vs typed parity:** **descoped** — voice/realtime is currently not working, so there's
  nothing to compare. Revisit when voice is restored.
- **Portfolio cross-account tools** and **GA4 bounce/engagement-rate fields** (overview totals
  matched exactly; these sub-fields not separately reconciled).

_(The end-to-end typed-chat behavioural check is now done — see the section above.)_
- **Voice vs typed parity:** validate the realtime-voice path returns the same ground-truth-consistent
  numbers as the typed path (needs a live WebRTC client).
- **Full chat-path assertion:** these checks ran the tool `execute()` directly (deterministic). An
  end-to-end "ask OptiMate in chat, parse its numeric answer" pass would also validate the agent's
  reasoning/formatting layer, but is non-deterministic and needs answer parsing.
