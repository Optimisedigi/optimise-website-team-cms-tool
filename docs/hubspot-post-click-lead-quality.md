# HubSpot Post-Click / Lead Quality Ingestion (Away Digital Teams)

How the **Lead Quality** tab of the Google Ads dashboard gets its data: HubSpot contacts → paid-search filter → GCLID/campaign attribution → meeting counts → the lead details table.

Scope note: this feature is hard-gated to Away Digital Teams (`slug === "away-digital"` or customer ID `3425353766`). Every layer re-checks it.

---

## 1. Request path

| Layer | File | Role |
| --- | --- | --- |
| Tab UI | `src/components/dashboards/googleads/HubSpotPostClickTab.tsx` | Renders chart, attribution rows, lead details table, CSV export |
| Dashboard shell | `src/components/dashboards/googleads/GoogleAdsDashboard.tsx` (`fetchPostClickData`, ~L406) | Fetches with `range=last_14_months`, passes `conversionActions`, caches 15 min in `sessionStorage` |
| CMS proxy | `src/app/(frontend)/api/dashboard/hubspot-post-click/route.ts` | Slug gate, `dashboard_token` cookie auth, 15-min in-memory cache, forwards to Growth Tools with `x-internal-key` |
| Growth Tools route | `website-growth-tools/server/routes.ts` L9524 `GET /api/google-ads/dashboard/:slug/hubspot-post-click` | Internal-key auth, parses `customerId`/`range`/`conversionActions` |
| Orchestrator | `website-growth-tools/server/google-ads-hubspot-post-click.ts` | Joins HubSpot leads + Google Ads click/search-term/spend/conversion data |
| HubSpot client | `website-growth-tools/server/hubspot-service.ts` | Contact search, paid-search filter, meeting/call associations |

Types are mirrored in `src/lib/dashboard-types.ts` (`HubSpotPostClickDashboardData`).

Caching: browser sessionStorage 15 min → CMS route in-memory 15 min → Growth Tools always fresh (`Cache-Control: no-store`).

---

## 2. HubSpot ingestion (`hubspot-service.ts`)

Auth: private-app token from `AWAY_HUBSPOT_SERVICE_KEY` (throws if missing).

### 2.1 Contact search
`POST /crm/v3/objects/contacts/search`, paginated 100 at a time, three OR'd filter groups — each ANDed with `createdate BETWEEN [range start, range end]`:

1. `hs_google_click_id HAS_PROPERTY`
2. `hs_analytics_source = PAID_SEARCH` (original source)
3. `hs_latest_source = PAID_SEARCH`

Range boundaries are converted from **Australia/Sydney** local day edges to UTC ISO (`sydneyDateBoundaryToUtcIso`), so "July" means Sydney July. Results are deduped by contact ID.

Properties pulled: `createdate`, `first_conversion_date`, `hs_first_outreach_date`, `hs_v2_date_entered_marketingqualifiedlead`, `hs_v2_date_entered_salesqualifiedlead`, `email`, `firstname`, `lastname`, `company`, `hs_google_click_id`, `hs_analytics_source(_data_1/_2)`, `hs_latest_source(_data_1/_2)`, `engagements_last_meeting_booked`, `hs_latest_meeting_activity`, `lifecyclestage`, `hs_lead_status`.

### 2.2 Paid-search qualification (second pass, in code)
A contact is kept when `contactLooksPaidSearch()` is true:
- non-empty `hs_google_click_id` (GCLID) → immediately paid, **or**
- any of the six source/source-data fields contains `paid_search`, `paid search`, `google ads`, `google cpc`, or `cpc`.

Then one explicit exclusion (`isUnreliableSeoUnknownKeywordLead`): drop contacts with **no GCLID** + `hs_latest_source = PAID_SEARCH` + `hs_latest_source_data_1 = "seo"` + `hs_latest_source_data_2 = "unknown keywords (ssl)"`. These are known-bad HubSpot attribution rows.

Surviving contacts are `diagnostics.paidGoogleLeadsChecked` (151 in the screenshot); pre-filter count is `hubspotContactsScanned`.

### 2.3 HubSpot-side campaign/keyword fields
`attributionSourceFields()` picks the drilldown pair used as fallback attribution:
1. If **original** source is paid search and has data → `hubspotCampaign = hs_analytics_source_data_1`, `hubspotKeyword = hs_analytics_source_data_2`.
2. Else if **latest** source is paid search and has data → the `hs_latest_source_data_*` pair.
3. Else first non-empty of each across both sets.

### 2.4 Meetings and calls (the "Meeting?" column)
Per contact, at concurrency 8:
1. `GET /crm/v4/objects/contacts/{id}/associations/meetings` (paged, limit 500) → meeting IDs.
2. `POST /crm/v3/objects/meetings/batch/read` in chunks of 100 → date = `hs_meeting_start_time` else `hs_timestamp`.
3. Same two steps for `calls` (`hs_timestamp` only).
4. **Fallback union**: `engagements_last_meeting_booked` and `hs_latest_meeting_activity` are added to the meeting dates, then deduped and sorted. So a contact with no association but a meeting-activity timestamp still counts as having a meeting.

`meetings = meetingDates.length`, `calls = callDates.length`. Association failures are caught per contact, recorded in `diagnostics.notes`, and the lead survives with 0 meetings — i.e. **API errors look like "No"**.

UI: `Yes (n)` when `meetings > 0`, else `No` (`HubSpotPostClickTab.tsx` L852). `n` is total meeting records, not distinct leads.

### 2.5 Qualified vs disqualified
`isQualifiedLead()`: unqualified only if lowercased `hs_lead_status` contains `unqualified`, `dead`, `junk`, `spam`, or `not model aligned`. Everything else is qualified (lifecycle `opportunity`/`salesqualifiedlead`/`customer` is an explicit true, but the default is also true).

The "Lead status" column shows `hs_lead_status` → `lifecyclestage` → `Qualified`/`Unqualified` (`leadDetailStatus`). That's why the screenshot mixes `In progress`, `lead`, `Contact Pending - Unresponsive`, and `Unqualified - Not Model Aligned`.

Month bucketing: `toSydneyMonth(createdAt)` — Sydney calendar month of contact creation. Every monthly/attribution metric is keyed on lead-creation month, **not** click month.

---

## 3. Google Ads enrichment (`google-ads-hubspot-post-click.ts`)

Four Google Ads queries run in parallel after the HubSpot pull:

| Query | Source | Use |
| --- | --- | --- |
| `fetchClickMetadata` | `click_view` (gclid, date, campaign.name, ad_group.name), **one query per day**, GCLIDs batched 100 per `IN` clause | Contact-level campaign + ad group |
| `fetchSearchTermEvidence` | `search_term_view` (date, month, campaign, ad group, keyword text/match type, search term, clicks, cost, conversions) over the whole range | Candidate search terms |
| `fetchGoogleAdsMonthlyConversions` | selected conversion actions (or all campaigns, 14 months) | Chart's "Google Ads conversions" |
| `fetchGoogleAdsMonthlySpend` | `campaign` cost_micros by month | Spend / CPA lines |

**90-day click_view limit.** Click lookup is clamped to `today - 90d`. If the requested start is older, `diagnostics.clickViewLookbackLimited = true` and a note is added — older leads necessarily fall back to HubSpot fields. With `last_14_months` this is always true, so ~11 of 14 months have no click data.

**`click_view` returns no keyword.** `keywordText` is set to `""` in the click record (L241). So the dashboard's Keyword column is effectively always `lead.hubspotKeyword` (`keywordText || hubspotKeyword` in UI L850) — e.g. `outsource admin`, `vietnam marketing agency` in the screenshot come from HubSpot, while Campaign and Ad group come from `click_view` when the GCLID matched.

---

## 4. Attribution logic (`enrichPostClickLeadsForTest`)

Per lead:

**Step 1 — GCLID join.** `clicks.get(lead.gclid)`. A hit gives `campaignName`, `adGroupName`, click `date`/`month`. No GCLID or no click row → `click` undefined, and campaign falls back to `hubspotCampaign`, ad group to `""`/`"Unknown ad group"`.

**Step 2 — search-term evidence lookup**, first match wins:
1. Exact key `date|campaign|adGroup|keyword` (click key if matched, else lead-create-date + HubSpot campaign/keyword). `groupEvidence` indexes each evidence row under both a date key and a month key, so a month-level key also resolves here.
2. Click matched but no key hit → all evidence rows with same click date + campaign + ad group.
3. HubSpot campaign+keyword → evidence rows on the lead's create date with matching campaign + keyword.
4. Same, relaxed to the lead's **month**.
5. HubSpot keyword only → evidence rows on the lead's create date with matching keyword.

Matched rows are deduped by `date|campaign|adGroup|keyword` with clicks/spend/conversions summed, sorted by conversions → clicks → spend.

**Step 3 — confidence** (`searchTermConfidence`, drives the badge and the "Search term evidence" cell):

| Result | Confidence | Cell shows |
| --- | --- | --- |
| exactly 1 evidence row | `single_candidate` | that search term |
| >1 evidence rows | `multiple_candidates` | first 3 terms, `, …` if more |
| 0 rows but click matched | `keyword_fallback` | literal `Keyword fallback` (tooltip shows the keyword) |
| 0 rows, no click | `hubspot_source_fallback` | `hubspotKeyword` or `HubSpot paid-search source` |

Screenshot reading: rows showing real terms (`outsourced administrative services`, `digital marketing agency in vietnam, graphic designer vietnam`) are single/multiple candidates; rows showing `Keyword fallback` had a GCLID→click_view match (hence real campaign + ad group) but no search-term row on that date/campaign/ad group.

**Aggregation.** `attributionRows` groups by `month|searchTermEvidence|confidence|campaign|adGroup|keyword|matchType`, summing: `paidLeads` +1 per lead, `meetings` +1 only if the lead had ≥1 meeting (capped so meeting rate ≤ 100%), `totalMeetings` += all meetings, `qualifiedLeads`, `calls`, plus evidence-derived `spend`/`googleAdsConversions`. `monthly` does the same per Sydney month and adds `avgDaysToFirstOutreach/Mql/Sql`, measured from `firstConversionAt || createdAt`; MQL/SQL averages exclude disqualified leads.

---

## 5. Lead details table (screenshot surface)

`buildLeadDetails` sorts by `createdAt` descending; client-side filters are month, meeting (yes/no on `meetings > 0`), lead status, campaign (`campaignName || hubspotCampaign || "Unknown campaign"`), plus a free-text search across name/company/email/campaign/ad group/keyword/evidence/status. CSV export uses the same filtered set and adds Email, Meeting count, Meeting dates, and Calls columns.

Column → source:

| Column | Source |
| --- | --- |
| Created | HubSpot `createdate` |
| Company/contact | `company` else `firstname lastname` |
| Campaign | `click_view` campaign else `hs_*_source_data_1` |
| Ad group | `click_view` ad group only (`—` if unmatched) |
| Keyword | `hs_*_source_data_2` (click_view never supplies one) |
| Search term evidence | `search_term_view` join per §4 |
| Meeting? | associated meetings ∪ meeting-activity fallbacks |
| Lead status | `hs_lead_status` → `lifecyclestage` → qualified flag |

---

## 6. Known limitations

1. **Paid leads ≠ Google Ads conversions.** Conversions are ad-platform events (multiple per person, some not contacts); paid leads are HubSpot contacts HubSpot itself attributed to paid search.
2. **No contact-level search term exists.** Google separates GCLID click data from search-term reporting, so the evidence column is inference, never ground truth.
3. **90-day `click_view` window** means campaign/ad group for older months depends entirely on HubSpot source fields; ad group is blank there.
4. **Keyword is always HubSpot-sourced** because the click query doesn't select keyword fields — a candidate improvement (add `segments.keyword.info.text` to the `click_view` GAQL).
5. **Per-day click queries** — a 90-day window fires up to 90 GAQL calls per GCLID batch; this is the main latency source for the tab.
6. **Meeting counting is date-based and deduped by timestamp**; two meetings starting at the same instant collapse to one.
7. **Silent degradation**: HubSpot association errors or Google Ads query failures produce notes in `diagnostics.notes` (shown in the blue confidence box, first 3 only) rather than an error state.

Tests: `website-growth-tools/server/google-ads-hubspot-post-click.test.ts`, `server/hubspot-service.test.ts`.
