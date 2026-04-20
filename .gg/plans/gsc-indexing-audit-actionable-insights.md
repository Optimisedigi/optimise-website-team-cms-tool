# GSC Indexing Audit — Actionable Insights & Export

## Problem Summary

The current GSC Indexing Audit has three key issues:

1. **Indexed 404s show as healthy (green)**: Pages with `coverageState === "Submitted and indexed"` are counted as "Indexed" and show green, even when their `pageFetchState` is `NOT_FOUND`. Google has indexed stale/dead pages — these need attention, not a green badge.

2. **No actionable insights**: The UI shows status badges and generic advice, but doesn't group issues into prioritised action items with specific next steps (e.g. "These 12 indexed 404 pages need redirects to existing pages").

3. **No export**: There's no way to export a redirect/action plan as a markdown file that an AI agent or developer could directly use to implement fixes.

## Analysis of Current Code

### Summary Stats Bug (`src/lib/gsc-indexing.ts` lines 13-31)
`buildSummaryStats()` only checks `coverageState`. A page with `coverageState === "Submitted and indexed"` but `pageFetchState === "NOT_FOUND"` is counted as "indexed" (healthy). This is the root cause of the green badge for 404 pages.

### StatusBadge Bug (`src/components/GscIndexingAuditResults.tsx` lines 593-642)
The `StatusBadge` component colors `"Submitted and indexed"` green regardless of `pageFetchState`. These "indexed but broken" pages need a different visual treatment.

### Filter Logic (`src/components/GscIndexingAuditResults.tsx` lines 169-199)
The `"indexed"` filter shows ALL `"Submitted and indexed"` pages as one happy group. Indexed 404s get lost in there.

## Design

### New Category: "Indexed but Problematic"
Introduce a new derived status concept. When `coverageState === "Submitted and indexed"` but `pageFetchState` is `NOT_FOUND`, `SOFT_404`, `SERVER_ERROR`, etc., the page should be flagged as **"Indexed — Needs Fix"** rather than healthy indexed.

### Updated Summary Stats
Expand `buildSummaryStats()` to track:
- `indexed` — truly healthy indexed pages (fetch state is SUCCESSFUL)
- `indexedProblematic` — indexed but with problematic fetch states (404, soft 404, server error)
- `notIndexed` — not indexed
- `byReason` — unchanged (coverage state breakdown for not-indexed)
- `byFetchIssue` — new: fetch state breakdown for problematic indexed pages

### Actionable Insights Panel
A new section at the top of the Results tab, above the existing summary cards, showing prioritised action groups:

1. **🔴 Indexed 404s → Need Redirects** (highest priority)
   - Lists pages that Google has indexed but return 404
   - For each, attempts a smart redirect suggestion based on URL path similarity to indexed healthy pages
   - "Export Redirect Plan" button

2. **🟠 Crawled but Not Indexed** (medium priority)
   - Pages Google crawled but chose not to index
   - Actionable: improve content, add internal links

3. **🟠 Unknown to Google** (medium priority)
   - Pages Google doesn't know about
   - Actionable: submit sitemap, request indexing

4. **🟡 Duplicate/Redirect Issues** (lower priority)
   - Duplicate pages, redirect chains
   - Actionable: set canonical tags, fix redirects

### Smart Redirect Suggestions
For 404 pages, generate redirect suggestions by:
- Extracting the URL path segments
- Matching against healthy indexed pages by finding the closest path (e.g., `/google-ads-agency` → `/services/google-ads` if it exists)
- If no good match, suggest the site's homepage as fallback
- Allow manual override of the suggestion in the UI

### Markdown Export
An "Export Action Plan" button that generates a markdown file containing:
- Summary statistics
- Redirect rules table (from → to) for 404 pages
- Other action items grouped by priority
- Formatted so an AI agent can parse and execute the changes

This export can be used:
- By an AI agent to implement redirects in a Next.js config or `.htaccess`
- As a brief to hand to a developer
- As documentation of what needs fixing

## Files to Change

| File | Change |
|------|--------|
| `src/lib/gsc-indexing.ts` | Update `buildSummaryStats()` to separate indexed-healthy from indexed-problematic |
| `src/components/GscIndexingAuditResults.tsx` | Major UI overhaul: actionable insights panel, updated summary cards, new filters for indexed-problematic, smart redirect suggestions, markdown export button |
| `src/lib/gsc-service.ts` | No changes needed (InspectionResult already has `pageFetchState`) |
| API routes | No changes needed (data already contains all needed fields) |

## Risks & Mitigations

- **No new collections/migrations**: All changes are to the UI and summary stat computation. The underlying data model (`inspectionResults` JSON array) already contains `pageFetchState` — we're just using it.
- **Backwards compatibility**: Old audits with the current `summaryStats` shape will still work because we derive the new stats from `inspectionResults` at render time, not from the stored `summaryStats`.
- **Redirect suggestions are heuristic**: URL path matching is best-effort. The UI allows manual override, and the export makes it clear these are suggestions.

## Steps

1. Update `buildSummaryStats()` in `src/lib/gsc-indexing.ts` to add `indexedProblematic` and `byFetchIssue` fields that separate truly healthy indexed pages from indexed pages with problematic fetch states (NOT_FOUND, SOFT_404, SERVER_ERROR, etc.), keeping backward compatibility with existing data.

2. In `src/components/GscIndexingAuditResults.tsx`, add a `getRedirectSuggestion()` utility function that takes a 404 URL path and a list of healthy indexed URLs, and returns the best redirect target by matching path segments (longest common subsequence of path parts), falling back to the site root if no good match exists.

3. In `src/components/GscIndexingAuditResults.tsx`, add a `generateActionPlanMarkdown()` function that takes inspection results and summary stats and produces a markdown string with: a header with audit date and site URL, a summary stats section, a redirect rules table (from URL → suggested target) for indexed 404 pages, sections for each issue category (crawled not indexed, unknown to Google, duplicates, etc.) with the affected URLs listed, and notes for an AI agent on how to implement the fixes.

4. In `src/components/GscIndexingAuditResults.tsx`, update the summary cards section to show 5 cards instead of 4: "Healthy Indexed" (green, only pages with successful fetch), "Indexed — Needs Fix" (red/orange, indexed but with 404/5xx/soft-404 fetch states), "Not Indexed" (existing), "Errors" (existing), "Total Inspected" (existing). Derive these counts at render time from the inspectionResults array so old audits without the updated summaryStats still work.

5. In `src/components/GscIndexingAuditResults.tsx`, add a new "Actionable Insights" panel between the summary cards and the "Why Pages Are Not Indexed" table. This panel shows prioritised issue groups as collapsible sections: (a) "Indexed 404s — Need Redirects" showing each 404 URL with its smart redirect suggestion and an edit input to override, (b) "Crawled but Not Indexed" with the count and action advice, (c) "Unknown to Google" with count and action advice, (d) "Duplicate / Redirect Issues" with count and action advice. Each section shows its URL count as a badge.

6. In `src/components/GscIndexingAuditResults.tsx`, update the filter buttons to add a new "Indexed Issues" filter that shows only `coverageState === "Submitted and indexed"` pages where `pageFetchState` is NOT "SUCCESSFUL". Update the existing "Indexed" filter button label to "Healthy Indexed" and make it only show pages where both coverageState is "Submitted and indexed" AND pageFetchState is "SUCCESSFUL".

7. In `src/components/GscIndexingAuditResults.tsx`, update the `StatusBadge` component to show an orange/red badge (not green) when `coverageState === "Submitted and indexed"` but `pageFetchState` indicates a problem (NOT_FOUND, SOFT_404, SERVER_ERROR, etc.). Pass `pageFetchState` as a prop to StatusBadge and add conditional coloring. Update the label for these to show "Indexed (404)" or "Indexed (Server Error)" etc.

8. In `src/components/GscIndexingAuditResults.tsx`, add an "Export Action Plan" button in the Actionable Insights panel header that calls `generateActionPlanMarkdown()` and triggers a file download of `{site-domain}-indexing-action-plan.md`. Use the same Blob/URL.createObjectURL pattern from `src/components/CampaignProposalPreview.tsx` lines 370-378.

9. Run `npx tsc --noEmit` to verify there are no TypeScript errors, then run `npm test` to verify all tests pass.
