# GoogleMate report keyword triggers

Use the phrases below to select the intended Google Ads report. Explicit period phrases in the latest request take priority over earlier messages and generic words such as `monthly` or `report`.

## Reliable Gmail report prompts

| Report | Primary trigger words | Reliable prompt | Tool path |
| --- | --- | --- | --- |
| Current-month budget pacing | `this month`, `current month`, `MTD`, plus `budget`, `pacing`, or `spend` | `Create separate Gmail drafts for each selected account's budget pacing this month, with a 1 sentence summary.` | `create_portfolio_budget_pacing_gmail_drafts(period='this_month')` |
| Last completed month | `last month`, `previous month`, `prior month`, or `completed month` | `Create separate Gmail drafts for each selected account's last month performance, with a 2 sentence summary above the tables.` | `create_portfolio_budget_pacing_gmail_drafts(period='last_month')` |
| Weekly report | `weekly`, `last week`, `completed week`, `Monday-Sunday`, or an explicit `N weeks` phrase | `Create separate weekly Gmail drafts for each selected account using the last 4 completed Monday-Sunday weeks.` | `create_portfolio_weekly_gmail_drafts` |
| Single-account monthly dashboard report | `monthly report` plus one or more component keys | `Create a Gmail draft for last month's monthly report with keyword relevancy, CPA trend, quality score, and top converters.` | `create_monthly_budget_gmail_draft` |
| Current or previous month data only, no Gmail draft | `this month` / `last month` plus a metric such as `spend`, `conversions`, or `CPA` | `Show spend, conversions, and CPA for last month.` | Google Ads read tools with `THIS_MONTH` or `LAST_MONTH` |

## Component keywords

Monthly dashboard drafts require at least one explicit component:

- `keyword relevancy` maps to `keyword_relevancy`
- `CPA trend` maps to `cpa_trend`
- `quality score` maps to `quality_score`
- `top converters` maps to `top_converters`

Weekly drafts require `keyword relevancy`, `CPA trend`, or `both` when requested from an audit-scoped chat.

## Precedence

1. `weekly`, `last week`, and explicit week ranges win over monthly/pacing words.
2. `last month`, `previous month`, `prior month`, and `completed month` always select the completed calendar month.
3. `this month`, `current month`, and `MTD` select current-month-to-date data.
4. Bare `monthly`, `performance`, or `report` does not define a period. Add one of the explicit period phrases above.
5. For multiple selected accounts, include `separate`, `each`, `per account`, or `for each` to trigger per-account Gmail drafts.

## Why the August 2026 request returned August instead of July

The request `Create separate Gmail drafts for each selected account's for last month's performance...` did not contain the portfolio shortcut's former required category words (`budget`, `pacing`, or `spend`). It therefore missed deterministic routing. The model correctly fetched July data, but the only available multi-account draft shortcut was hard-coded to current-month budget pacing, so the final drafts were rebuilt with August data and discarded the earlier July result.

The classifier now recognises `performance` and `report`, carries an explicit `last_month` period into the draft tool, and the draft tool renders both the performance summary and Budget Management table from the same completed-month period.
