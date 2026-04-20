# Negative Keyword Build Preview Redesign

## Summary

Redesign the `/negative-keyword-build/[slug]` client-facing preview to:
1. **Remove categories** — flatten account-wide keywords into a single flat list (similar to the CMS `FlatKeywordList` view)
2. **Add a tab for "Current Negative Keywords"** — shows the client's existing NKL (negative keyword lists from the `negative-keyword-lists` collection), so the client can see what's already set up
3. **Reframe the keyword builder list as "For Review"** — make it clear these are proposed additions that need client review/approval

## Current State

- **API route**: `src/app/(frontend)/api/negative-keyword-build/route.ts` — returns `accountWideKeywords` (array of categories, each with a `name` and `keywords` array) and `campaignSpecificKeywords`
- **Client page**: `src/app/(frontend)/negative-keyword-build/[slug]/page.tsx` → `NegativeKeywordBuildClient.tsx`
- **PIN gate**: `src/components/NegativeKeywordPinGate.tsx` — authenticates, passes `NegativeKeywordData` to children
- **Content view**: `src/components/NegativeKeywordEditorContent.tsx` — displays keywords grouped by categories with collapsible accordion sections

### Data Shapes

**`NegativeKeywordData`** (from PinGate):
- `accountWideKeywords`: Array of `{ name, totalWaste, keywords: [...] }` — grouped by categories
- `campaignSpecificKeywords`: Array of `{ campaignName, keywords: [...] }`

**`negative-keyword-lists` collection**: Each NKL has:
- `name`: string (e.g. "Brand Terms")
- `scope`: 'account' | 'campaign' | 'ad_group'
- `campaigns`: array of `{ campaignName }`
- `keywords`: array of `{ keyword, matchType ('broad'|'phrase'|'exact'), flaggedForRemoval }`
- `isActive`: boolean
- `client`: relationship to `clients`

## Architecture

### API Changes

The API needs to also return the client's existing NKL data. Since the API already has access to the `audit.client` field, we can query `negative-keyword-lists` by client ID and include it in the response.

### UI Changes

The editor content component needs a complete redesign:
- **Tab list** with two tabs: "Current Setup" and "Proposed Changes"
- **"Current Setup" tab**: Shows existing NKL records for the client — each list with its name, scope, and keywords in a simple table
- **"Proposed Changes" tab**: Shows the keyword builder output as a flat list (no categories), with the review framing ("Please review the following proposed negative keywords")

## Files to Change

- `src/app/(frontend)/api/negative-keyword-build/route.ts` — add NKL data to response
- `src/components/NegativeKeywordPinGate.tsx` — update `NegativeKeywordData` interface with NKL data
- `src/components/NegativeKeywordEditorContent.tsx` — major rewrite: tabs, flat list, NKL display

## Steps

1. Update `src/app/(frontend)/api/negative-keyword-build/route.ts` to query `negative-keyword-lists` by client ID from the audit record, return as `existingNegativeKeywordLists` array (each with `name`, `scope`, `campaigns`, `keywords`, `isActive`) alongside the existing response fields. Also flatten `accountWideKeywords` — instead of an array of categories each with keywords, return a single flat array of all keywords (with `sourceCategoryName` preserved on each keyword for reference).
2. Update the `NegativeKeywordData` interface in `src/components/NegativeKeywordPinGate.tsx` to include `existingNegativeKeywordLists` (array of `{ name, scope, campaigns, keywords: { keyword, matchType }[], isActive }`) and change `accountWideKeywords` to be a flat keyword array (no category wrapper).
3. Rewrite `src/components/NegativeKeywordEditorContent.tsx` with a tab-based layout: a tab bar at the top with "Current Setup" and "Proposed Changes" tabs. "Current Setup" tab shows each NKL record from `existingNegativeKeywordLists` as a card with its name, scope, and a simple table of keywords (keyword + match type badge — similar to `NegativeKeywordTable.tsx` CMS view). "Proposed Changes" tab shows the builder keywords as a single flat table (keyword, match type, spend, clicks columns — no category grouping), with the client editing/remove/restore controls, framed with header text like "The following negative keywords have been identified for your account. Please review and approve." Keep save/submit functionality, client notes, and the summary stats card. Remove the old category accordion UI entirely.
4. Run `npx tsc --noEmit` to verify no type errors, then run `npm test` to confirm no test failures.
