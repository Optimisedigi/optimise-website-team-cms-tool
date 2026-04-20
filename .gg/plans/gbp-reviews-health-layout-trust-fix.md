# GBP Reviews for Competitors + Health Panel Layout + Trust Score Investigation

## Part 1: GBP Reviews for Manually-Added Competitors

**Problem:** CMS competitors have a `googleMapsUrl` field but GBP data (rating, review count, responds to reviews) is only populated when the Growth Tools competitor analysis API discovers the competitor. For manually-added competitors, `googleBusinessProfile` is null.

**Solution:** Add CMS override fields for GBP data on each competitor entry (same pattern as `hasMetaAds`). When the API doesn't return GBP data but the user has entered it manually, use the overrides in the display.

### Steps

1. **Add GBP override fields to the `competitors` array in `ClientProposals.ts`** (after `googleMapsUrl`, before `hasMetaAds`):
   - `gbpRating`: number (min 0, max 5, admin description "Google Business Profile rating (1.0 - 5.0)")
   - `gbpReviewCount`: number (min 0, admin description "Number of Google reviews")
   - `gbpRespondsToReviews`: checkbox (default false, admin description "Does this business respond to reviews?")

2. **Build GBP override lookup in `page.tsx`** (around line 907, after the metaAdsOverrides/manualScreenshots maps):
   - Create `gbpOverrides` Map: domain → `{ name, rating, reviewCount, category, respondsToReviews, responseRate }`
   - Populate from CMS competitors that have `gbpRating` or `gbpReviewCount` set

3. **Apply GBP overrides in the competitor merge logic** (around line 928 in `allCompetitorsWithOverrides` and line 1005 in the CMS-only stubs):
   - If a competitor has no `googleBusinessProfile` but has a GBP override, use the override
   - If a competitor has BOTH, prefer the API data (it's fresher)

4. **Add migration SQL for the new columns** in `src/app/(frontend)/api/migrate/route.ts` and `schema-migrate/route.ts`:
   - `ALTER TABLE client_proposals_competitors ADD gbp_rating numeric`
   - `ALTER TABLE client_proposals_competitors ADD gbp_review_count numeric`
   - `ALTER TABLE client_proposals_competitors ADD gbp_responds_to_reviews integer DEFAULT 0`

## Part 2: SEO Health Audit Layout — Move SerpMockup Under Gauge

**Problem:** The SerpMockup sits below the entire HealthScorePanel. User wants it underneath the score gauge on the left side.

**Solution:** Modify `HealthScorePanel` to accept optional `children` (ReactNode) that render below the gauge in the left column. Pass the SerpMockup as children on the SEO slide. Also increase the gauge size slightly and make the category bar column narrower.

### Steps

1. **Modify `HealthScorePanel` component** (line 407):
   - Add `children?: React.ReactNode` to props
   - Render `{children}` below `<RingGauge>` inside `health-panel-gauge`

2. **Move SerpMockup inside HealthScorePanel** on Slide 10 (line 1874):
   - Pass SerpMockup as children of HealthScorePanel instead of rendering it as a separate div below
   - Remove the `audit-hero-serp` wrapper div

3. **CSS changes in `report.css`**:
   - `.health-panel-gauge`: change from flex-shrink:0 to a set width (e.g. `width: 200px; flex-shrink: 0`)
   - `.health-panel-gauge` add `flex-direction: column; align-items: center;` (already has these partially)
   - `.ring-gauge`: increase width to `180px` (from 160px)
   - `.ring-gauge-svg`: increase to `160px` (from 140px)
   - `.health-bar-label`: keep as is, the narrower gauge column makes bars auto-fill the remaining space
   - Add `.health-panel-gauge .serp-mockup` styles: scale it down to fit the left column, maybe `transform: scale(0.85); margin-top: 16px;`

4. **Apply same layout to CRO Health Score** on Slide 8 (line 1991):
   - The CRO slide doesn't have a SerpMockup, but the gauge size and bar width changes apply automatically since both use `HealthScorePanel`

## Part 3: Trust & Social Proof Score Inconsistency

**Problem:** The CRO audit shows `trustScore: 0/10` but findings say "Social proof: Testimonial detected" and "Trust signal: found". The score contradicts the findings.

**Root cause:** This is a bug in the **Growth Tools CRO audit API** — the scoring logic assigns 0 to the trust category even when the findings detect trust elements. The CMS just stores and displays what the API returns. Both `trustScore` and `findings` come from the same API response (`cro.trustScore` and `cro.findings` in run-audits/route.ts line 315/320).

**Fix:** The `trustScore` field is editable in the CMS (`CroAudits.ts` line 106-110). The user can manually correct it by editing the CRO audit record. But the real fix should be in the Growth Tools API scoring logic.

**No code change needed in this CMS** — explain to the user that:
1. The score comes from the Growth Tools API and can be manually overridden in the CRO audit record
2. The Growth Tools API has a bug in its trust scoring logic that needs fixing separately

## Migration

New columns on `client_proposals_competitors`:
- `gbp_rating` numeric
- `gbp_review_count` numeric  
- `gbp_responds_to_reviews` integer DEFAULT 0

## Verification

```bash
npx tsc --noEmit
npm test
```
