# Fix: Keyword search volumes showing 0 for location-specific keywords

## Root Cause

The `searchKeywords()` method in `website-growth-tools/server/serp-service.ts` **does not pass the location** to `googleAdsService.getSearchVolumes()`. The Google Ads Keyword Planner API always defaults to `geoTargetConstants/2840` (United States).

For Australian suburb-specific keywords like "accountant darlinghurst", "accountant redfern", etc., querying US geo-targeting returns 0 searches because nobody in the US searches for those terms.

The `locationToGeoTarget()` utility already exists in `google-ads-service.ts` — it converts `"au:sydney"` → `"geoTargetConstants/2036"` (Australia). It's just not being called.

## Fix (1 file in growth-tools)

**File:** `/Users/Pe/my-projects/website-growth-tools/server/serp-service.ts`

### Change 1: `searchKeywords()` — pass location to getSearchVolumes

Line 58: Change:
```ts
volumeMap = await googleAdsService.getSearchVolumes(keywords);
```
To:
```ts
const { locationToGeoTarget } = await import('./google-ads-service');
const geoTarget = locationToGeoTarget(location);
volumeMap = await googleAdsService.getSearchVolumes(keywords, geoTarget);
```

### Change 2: `searchKeyword()` — same fix for single-keyword path

Line 99: Change:
```ts
const volumeMap = await googleAdsService.getSearchVolumes([keyword]);
```
To:
```ts
const { locationToGeoTarget } = await import('./google-ads-service');
const geoTarget = locationToGeoTarget(location);
const volumeMap = await googleAdsService.getSearchVolumes([keyword], geoTarget);
```

Since `locationToGeoTarget` is already exported, a simpler approach is to import it at the top of the file.

## Impact

- All future keyword audits will use the correct country geo-targeting for search volumes
- Existing keyword snapshots with 0 volumes won't auto-fix — they would need to be re-run
- The SERP position lookup already uses the correct location (via Serper API `gl`/`loc` params) — only the volume lookup is broken
