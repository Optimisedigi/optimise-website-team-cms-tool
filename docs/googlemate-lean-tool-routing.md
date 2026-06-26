# GoogleMate lean tool routing

## Decision

Route tools before `runAgent()` instead of sending the full catalogue.

Current audit chat sends **50 tools** from `getTools()` on every LLM call. `base-agent.ts` resends those definitions on the first pass, after each tool result, and again during corrective retries.

Proposed flow:

1. Read the latest user message plus recent turns.
2. Select `alwaysOn + specialistBundles`.
3. Apply `restrictExternalContextActions` after routing.
4. Run the agent with the reduced set.
5. Retry once with an escalated bundle only when post-run checks prove under-routing.

## Always-on tools

Keep always-on tiny:

| Tool | Reason |
| --- | --- |
| `get_client_details` | Small CMS fact lookup used across emails, decks, proposals, and client questions. |
| `get_campaign_proposal_status` | Cheap status answer for proposal/build/ad-copy pipeline questions. |
| `request_confirm` | Safety gate for restructure/build flows. |

Portfolio mode should swap `get_client_details` for `get_selected_client_details`; portfolio inventory/performance tools stay in a portfolio-specific router.

## Specialist bundles

| Bundle | Trigger | Tools |
| --- | --- | --- |
| `google-ads-read` | Spend, CPA, conversions, CTR, campaign/ad group/search-term/asset/NKL reads, weekly/monthly metrics. | `get_account_overview`, `get_campaign_performance`, `get_ad_group_performance`, `get_search_terms`, `get_negative_keyword_lists`, `get_ad_asset_performance`, `get_weekly_metric_table`, `get_monthly_metric_table`, `get_weekly_trend_note` until retired. |
| `gmail-drafts` | Draft, Gmail, email, push/drop/save as draft, budget email. | `create_gmail_draft`, `get_budget_management_email`, `get_weekly_metric_table`, `get_monthly_metric_table`; add `google-ads-read` when fresh metrics are needed. |
| `proposals` | Queue/propose approval actions, budgets, negatives, ad copy, pause/enable, ad groups, keywords, goal agents. | `propose_negative_keywords`, `propose_nkl_create`, `propose_nkl_update`, `propose_nkl_push_live`, `propose_budget_update`, `propose_budget_push_live`, `propose_all_campaign_budget_push`, `propose_ad_copy_generate`, `propose_ad_copy_deploy`, `propose_campaign_restructure`, `propose_campaign_build`, `propose_campaign_status_change`, `propose_ad_group_create`, `propose_ad_group_status_change`, `propose_keywords_add`, `list_goal_runs`, `get_goal_run`, `get_goal_progress_summary`, `create_goal_run`, `create_account_efficiency_goal_run`; add `google-ads-read` when exact IDs/evidence are needed. |
| `geo-build` | Geo split/build, city/region/location expansion, clone campaign by area. | `propose_geo_campaign_split`, `propose_campaign_build`, `propose_campaign_restructure`, `propose_ad_group_create`, `propose_keywords_add`, `get_campaign_performance`, `get_ad_group_performance`, `get_search_terms`. |
| `schedules` | Recurring reports, cron-like tasks, pause/resume/edit/delete schedules. | `list_scheduled_tasks`, `propose_scheduled_task`, `propose_scheduled_task_update`; add the target work bundle only when composing/validating the saved prompt. |
| `decks` | Stakeholder decks, owner recaps, presentations, template decks. | `propose_stakeholder_deck`, `propose_deck_from_template`, `get_client_details`; add `google-ads-read` or `seo/analytics` for live evidence. |
| `seo/analytics` | GA4, GSC, Search Console, indexing, SERP displacement, AI visibility, organic/paid displacement. | `get_ga4_overview`, `get_gsc_overview`, `get_gsc_branded_split`, `get_gsc_indexing_status`, `get_serp_displacement`, `get_serp_displacement_alerts`, `get_ai_visibility`. |
| `memory` | Remember/save durable facts, search saved facts, adjust communication style. | `memory_search`, `remember`, `soul_set`. Keep `memory_search` out of always-on because pinned memory is already loaded into the prompt. |

Default router: deterministic keyword rules first. Use an LLM classifier later only if activity logs show repeated misses.

Bundle cap: use up to **3 bundles** in normal chat. Prefer the action bundle plus its evidence bundle; ask a clarifying question if more unrelated intents match.

## Expected token savings

Planning estimates, not measured billing data:

| Scenario | Current | Lean | Expected tool-definition input saving |
| --- | ---: | ---: | ---: |
| Plain chat/client/status | 50 tools | 0-3 tools | 90-100% |
| Google Ads read | 50 tools | 8-10 tools | 70-85% |
| Gmail draft from budget template | 50 tools | 4-6 tools | 80-90% |
| Proposal/action | 50 tools | 15-24 tools | 45-70% |
| Geo build/split | 50 tools | 8 tools | 75-85% |
| Schedule edit | 50 tools | 3-6 tools | 85-94% |
| Deck request | 50 tools | 3-10 tools | 75-94% |
| SEO/analytics | 50 tools | 7 tools | 80-90% |
| Memory-only | 50 tools | 3 tools | 90-95% |

The saving compounds across tool loops: a two-tool workflow can resend definitions across **3 model calls**, so shrinking Gmail draft routing from ~50 tools to ~5 tools should cut tool-definition input by roughly **85-90% per call and per loop**.

## Second-pass behavior

Keep both existing safety nets, but make retries bundle-aware:

- **Max-token truncation** stays in `base-agent.ts`: retry the same routed bundle with doubled `maxTokens`, capped by `MAX_TOKENS_RETRY_CEILING`.
- **Corrective retry** stays in `runChatTurn()` after `checkRunForCorrection()`: reuse the same `runId`, sanitize prior assistant tool-use blocks, and rerun once with the smallest missing bundle.

Correction-to-bundle mapping:

| Correction | Retry bundle |
| --- | --- |
| `budget_email_without_template` | `gmail-drafts` + `google-ads-read` |
| Gmail `promised_but_not_delivered` | `gmail-drafts` |
| Proposal `promised_but_not_delivered` | `proposals` + `google-ads-read` |
| `unverified_metric_breakdown` / `unverified_google_ads_data` | `google-ads-read` |
| `zero_tool_call_on_action` | Re-route with stricter action matching. |
| `Tool not found: <name>` tool result | Retry once with the bundle containing `<name>`. |

Escalate once only. If the second pass still misses the required tool, return a direct failure asking the user to rephrase the action.

## Implementation hook

Add `src/lib/agents/optimate-google-ads/tool-router.ts`:

```ts
export type GoogleMateToolBundle =
  | "google-ads-read"
  | "gmail-drafts"
  | "proposals"
  | "geo-build"
  | "schedules"
  | "decks"
  | "seo/analytics"
  | "memory";

export function routeGoogleMateTools(input: {
  messages: Message[];
  correction?: CorrectionRequest;
  portfolio?: boolean;
}): { bundles: GoogleMateToolBundle[]; tools: CanonicalTool<unknown>[]; reason: string };
```

`index.ts` should call this router instead of `getTools()` for normal chat turns, while keeping `getTools()` as a compatibility fallback for benchmarks and emergency debugging.
