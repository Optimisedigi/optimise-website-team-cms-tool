# Quality Score Tab Improvements

## Overview
Three changes to the Quality Score tab on the Google Ads dashboard:

1. **Top Ads showing display ads** — Add `adType` field to the `GoogleAdsDashboardTopAd` type and filter to only show SEARCH ads by default. Also add a filter dropdown so users can toggle. Since the data comes from Growth Tools, we'll need to add the field as optional and filter when present.
2. **Top Keywords by Spend → increase to top 30** — Currently hardcoded to `.slice(0, 10)` on line 549 of `QualityScoreTab.tsx`.
3. **Brand/Generic toggle on keyword table** — Use the client's `brandKeywords` field (stored on the `clients` collection) to classify keywords and add a toggle filter.

## Analysis

### Top Ads Issue
- `GoogleAdsDashboardTopAd` in `src/lib/dashboard-types.ts` (line 129) has no `adType` field
- Growth Tools returns all ad types (SEARCH, DISPLAY, etc.) in `topAds`
- The `TopAdsSection` component in `QualityScoreTab.tsx` (line 360) renders all ads without filtering
- **Fix:** Add optional `adType` field to the type, filter out non-SEARCH ads when the field is present. This makes it backward-compatible — if Growth Tools doesn't send `adType`, all ads still show.

### Keywords Limit
- Line 549: `const sortedKeywords = [...latestKeywords].sort((a, b) => b.spend - a.spend).slice(0, 10);`
- The heading on line 662 says "Top 10 Keywords by Spend"
- **Fix:** Change slice to 30, update heading

### Brand/Generic Toggle
- Client `brandKeywords` field (textarea, one term per line) exists in `src/collections/Clients.ts` line 1637
- It's NOT currently passed to the dashboard components
- **Data flow:** `page.tsx` → `DashboardClient.tsx` → `GoogleAdsDashboard.tsx` → `QualityScoreTab.tsx`
- We need to:
  1. Select `brandKeywords` from the client in `page.tsx`
  2. Thread it through `DashboardClient` → `GoogleAdsDashboard` → `QualityScoreTab`
  3. Add a toggle (All / Generic / Brand) to the keyword table
  4. Classify keywords by checking if `keywordText` contains any brand term (case-insensitive)

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/dashboard-types.ts` | Add `adType?: string` to `GoogleAdsDashboardTopAd` |
| `src/app/(frontend)/google-dashboard/[slug]/page.tsx` | Select `brandKeywords` from client, pass as prop |
| `src/app/(frontend)/google-dashboard/[slug]/DashboardClient.tsx` | Accept & pass `brandKeywords` prop |
| `src/components/dashboards/googleads/GoogleAdsDashboard.tsx` | Accept & pass `brandKeywords` prop |
| `src/components/dashboards/googleads/QualityScoreTab.tsx` | 3 changes: filter top ads, top 30 keywords, brand/generic toggle |

## Steps

1. In `src/lib/dashboard-types.ts`, add optional `adType?: string` field to `GoogleAdsDashboardTopAd` interface (after line 140, before the closing brace on line 141)
2. In `src/components/dashboards/googleads/QualityScoreTab.tsx`, filter `topAds` in `TopAdsSection` to exclude non-search ads — if `ad.adType` is present, only show ads where `adType` is `SEARCH` (or `RESPONSIVE_SEARCH_AD`); if field is absent, show all (backward compat). Also add a small note showing the count filtered out.
3. In `src/components/dashboards/googleads/QualityScoreTab.tsx` line 549, change `.slice(0, 10)` to `.slice(0, 30)` and update the heading on line 662 from "Top 10 Keywords by Spend" to "Top 30 Keywords by Spend"
4. In `src/app/(frontend)/google-dashboard/[slug]/page.tsx`, add `brandKeywords: true` to the `select` object (line 58) and pass `brandKeywords={client.brandKeywords || ""}` as a prop to `DashboardClient`
5. In `src/app/(frontend)/google-dashboard/[slug]/DashboardClient.tsx`, add `brandKeywords?: string` to `DashboardClientProps`, accept it, and pass it to `GoogleAdsDashboard`
6. In `src/components/dashboards/googleads/GoogleAdsDashboard.tsx`, add `brandKeywords?: string` to `GoogleAdsDashboardProps`, accept it, and pass it to `QualityScoreTab` as a prop
7. In `src/components/dashboards/googleads/QualityScoreTab.tsx`, add `brandKeywords?: string` to `QualityScoreTabProps`, add a `keywordFilter` state (`"all" | "generic" | "brand"`), add a brand term matching function that splits `brandKeywords` by newline and checks if keyword text contains any term (case-insensitive), add a 3-button toggle (All / Generic / Brand) above the keyword table, and filter `sortedKeywords` based on the active filter
8. Run `npx tsc --noEmit` to verify no type errors
9. Run `npm test` to verify no test failures
