# Google Dashboard: Quality Score Fix + Auction Insights by Ad Group

## Analysis

### Issue 1: Quality Score 500 Error

**Root cause:** The client-side API route (`/api/dashboard/quality-scores`) calls Growth Tools at the **wrong URL** and is **missing the `customerId` parameter**.

- **Server-side fetch (works)** in `src/app/(frontend)/google-dashboard/[slug]/page.tsx` line 87:
  ```
  ${growthUrl}/api/google-ads/quality-scores/${slug}?customerId=${client.googleAdsCustomerId}
  ```

- **Client-side API route (broken)** in `src/app/(frontend)/api/dashboard/quality-scores/route.ts` line 27:
  ```
  ${GROWTH_TOOLS_URL}/api/google-ads/dashboard/${slug}/quality-scores
  ```
  - Wrong URL path (`/dashboard/${slug}/quality-scores` vs `/quality-scores/${slug}`)
  - Missing `customerId` query parameter

**Fix:** The API route needs to:
- Look up the client's `googleAdsCustomerId` from the database using the slug
- Use the correct Growth Tools URL pattern: `/api/google-ads/quality-scores/${slug}?customerId=...`

### Issue 2: Auction Insights by Ad Group

**Current state:** `CompetitorAnalysis.tsx` shows auction insights grouped by **campaign** only. The data type `GoogleAdsDashboardAuctionInsight` has `campaignName` + `competitors[]`.

**What the user wants:** Ability to see auction insights at the **ad group** level too, since ad groups give more granular competitor visibility.

**Approach:** This requires Growth Tools to provide ad-group-level auction insight data. Since Growth Tools is an external service we control, we need to:
- Update the dashboard types to support ad-group-level auction insights
- Update the `CompetitorAnalysis.tsx` UI to show a campaign → ad group drill-down
- The Growth Tools API will need to be updated separately to return `adGroupInsights` in the dashboard data

For now, we'll add the **types and UI** to support ad-group-level data when Growth Tools starts returning it. The UI will gracefully fall back to campaign-level when ad group data isn't available.

## Steps

1. Fix the Quality Score API route in `src/app/(frontend)/api/dashboard/quality-scores/route.ts`: change the Growth Tools URL from `/api/google-ads/dashboard/${slug}/quality-scores` to `/api/google-ads/quality-scores/${slug}`, add Payload lookup to get `customerId` from the client's `googleAdsCustomerId` field using the slug, and pass it as a query parameter
2. Add `GoogleAdsDashboardAdGroupAuctionInsight` type to `src/lib/dashboard-types.ts` with fields `campaignName`, `adGroupName`, and `competitors[]`, and add an optional `adGroupAuctionInsights` field to `GoogleAdsDashboardData`
3. Update `src/components/dashboards/googleads/CompetitorAnalysis.tsx` to accept optional `adGroupAuctionInsights` prop, add a toggle/selector to switch between campaign-level and ad-group-level views, and show ad-group-level auction insights in a campaign → ad group expandable drill-down when the data is available (fall back gracefully to current campaign-only view when not)
4. Update `src/components/dashboards/googleads/GoogleAdsDashboard.tsx` to pass the new `adGroupAuctionInsights` data (from `data.adGroupAuctionInsights`) to the `CompetitorAnalysis` component
5. Run `npx tsc --noEmit` and `npm test` to verify no type errors or test failures
