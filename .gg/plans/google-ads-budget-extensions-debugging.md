# Google Ads Budget & Extensions - Debugging Notes

## The Problem

After implementing Google Ads Budget Management and Ad Extensions features, the Google Ads edit page in Payload admin showed a **blank screen**. This blocked access to all client records.

## Root Cause

Payload CMS requires a `payload_locked_documents_rels` table with Foreign Key columns for every collection. When we added two new collections:
- `GoogleAdsCampaignBudgets`
- `GoogleAdsAdExtensions`

Payload expected columns in `payload_locked_documents_rels`:
- `google_ads_campaign_budgets_id`
- `google_ads_ad_extensions_id`

These columns didn't exist in production, causing a database error that rendered the entire edit page blank.

## Why Schema Migration Fails

There's a chicken-and-egg problem:
1. The new collections are registered in `payload.config.ts`
2. Payload tries to query `payload_locked_documents` on every admin page load
3. The query fails because the FK columns are missing
4. This causes a 500 error before any migration can run
5. Migrations can't complete, so the columns never get created

## Workaround Applied

Both new collections are **disabled** in `payload.config.ts`:

```typescript
// payload.config.ts
// import { GoogleAdsCampaignBudgets } from "./collections/GoogleAdsCampaignBudgets";
// import { GoogleAdsAdExtensions } from "./collections/GoogleAdsAdExtensions";

// In collections array:
// Hidden (no group impact)
GscSnapshots, GscDaily, 
// Temporarily disabled: GoogleAdsCampaignBudgets, GoogleAdsAdExtensions,
```

The tabs in `GoogleAdsAudits.ts` are also commented out.

## What Exists in Codebase

The following files were created and are ready to be re-enabled once the database issue is fixed:

### Collections
- `src/collections/GoogleAdsCampaignBudgets.ts`
- `src/collections/GoogleAdsAdExtensions.ts`

### UI Components
- `src/components/GoogleAdsBudgetManagement.tsx`
- `src/components/GoogleAdsAdExtensions.tsx`
- `src/components/GoogleAdsSitelinkDialog.tsx`
- `src/components/GoogleAdsSnippetDialog.tsx`
- `src/components/GoogleAdsLocationTargeting.tsx`
- `src/components/GoogleAdsMetricsTable.tsx`

### API Routes
- `src/app/(frontend)/api/google-ads-budgets/[id]/list/route.ts`
- `src/app/(frontend)/api/google-ads-budgets/[id]/update/route.ts`
- `src/app/(frontend)/api/google-ads-budgets/[id]/refresh-metrics/route.ts`
- `src/app/(frontend)/api/google-ads-budgets/[id]/push/route.ts`
- `src/app/(frontend)/api/google-ads-extensions/[id]/list/route.ts`
- `src/app/(frontend)/api/google-ads-extensions/[id]/create/route.ts`
- `src/app/(frontend)/api/google-ads-extensions/[id]/assign/route.ts`
- `src/app/(frontend)/api/google-ads-extensions/[id]/delete/route.ts`
- `src/app/(frontend)/api/google-ads-extensions/[id]/sync/route.ts`

### Migrations
- `src/migrations/20260411_120000_add_budget_and_extension_locked_docs.ts`
- `src/migrations/20260411_130000_add_budget_extension_tables.ts`
- `src/migrations/20260411_140000_add_missing_ad_extensions_column.ts`

### Direct SQL Fix Endpoint
- `src/app/(frontend)/api/fix-locked-docs/route.ts` - Direct SQL migration endpoint

## Solution Needed

Need to manually add the missing FK columns to production database before re-enabling:

```sql
ALTER TABLE payload_locked_documents_rels 
  ADD COLUMN google_ads_campaign_budgets_id integer;

ALTER TABLE payload_locked_documents_rels 
  ADD COLUMN google_ads_ad_extensions_id integer;

CREATE TABLE IF NOT EXISTS google_ads_campaign_budgets (...);
CREATE TABLE IF NOT EXISTS google_ads_ad_extensions (...);
```

## Next Steps

1. Manually run SQL against production Turso database to add missing columns
2. Re-enable collections in `payload.config.ts`
3. Uncomment tabs in `GoogleAdsAudits.ts`
4. Regenerate importMap
5. Test Google Ads edit page works with new tabs
