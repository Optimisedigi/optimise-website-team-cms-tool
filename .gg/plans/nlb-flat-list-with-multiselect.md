# NLB: Flat keyword list with multi-select and bulk move to NKL

## Context

The Negative List Builder currently displays keywords in three tier sections (Universal, Account-Wide, Campaign-Specific), each with expandable categories. The user wants:

1. **Flat list** — all keywords from all tiers shown in a single table, no tier groupings
2. **Multi-select with shift-click** — checkbox selection using the existing `useShiftSelect` hook
3. **Bulk move to NKL** — selected keywords can be moved to a CMS Negative Keyword List in one action

## Current State

- **KeywordTable** (line 173): Renders a single category's keywords with per-row checkboxes (toggle removed), per-row "Move to" dropdown, search, and pagination
- **CategorySection** (line 425): Wraps KeywordTable per-category with expand/collapse, groups keywords by tier
- **Three CategorySection blocks** (lines 1574-1613): Universal, Account-Wide, Campaign-Specific — each passing tier-specific callbacks
- **Data structure**: Keywords are stored nested: `nlbData.universalNegatives[catIndex].keywords[kwIndex]` — each tier has categories, each category has keywords
- **useShiftSelect** (`src/lib/useShiftSelect.ts`): Existing hook that manages shift-click range selection on a flat list of IDs
- **moveKeyword** (line 1035): Moves a single keyword — handles both internal tier moves and NKL API calls
- **pendingMoveKw**: Single keyword state for the create NKL dialog — needs to support multiple keywords

## Design

Replace the three `CategorySection` blocks with a single flat `KeywordTable`-like component that:

- Flattens all keywords from all tiers into one list, adding a `source` label (tier + category name) as a column
- Each keyword gets a unique composite ID (e.g. `universal-0-5` = tier universal, cat 0, kw index 5) for selection tracking
- Selection uses `useShiftSelect` with these composite IDs
- A bulk action bar at the top shows: "X selected" + a "Move to NKL" dropdown that sends all selected keywords to a chosen NKL (or creates a new one)
- Individual per-row "Move to" dropdowns are kept but simplified to only NKL destinations (the internal tier moves become less relevant in a flat view)
- The existing remove/keep toggle still works per-row
- The underlying `nlbData` structure stays the same — mutations still use tier+catIndex+kwIndex to update the right place

## Files to Change

- `src/components/NegativeListBuilder.tsx` — the main component (replace CategorySection usage with flat list)

## Steps

1. In `src/components/NegativeListBuilder.tsx`, add a new interface `FlatKeyword` that extends `NegativeKeyword` with `tier`, `catIndex`, `kwIndex`, and `source` (display label) fields, plus a `flatId` string. Add a `useMemo` block in the main component (after `totalKept`) that flattens all tiers' keywords into a single `FlatKeyword[]` array, computing `flatId` as `${tier}-${catIndex}-${kwIndex}` and `source` as the category/campaign name.

2. In `src/components/NegativeListBuilder.tsx`, add `selectedKwIds` state as `Set<string>` and wire up `useShiftSelect` from `src/lib/useShiftSelect.ts` with the flat keyword IDs array. Import `useShiftSelect` at the top of the file.

3. In `src/components/NegativeListBuilder.tsx`, create a new component `FlatKeywordList` that renders a single table of all flattened keywords. It should have: a search filter, a "Source" column showing the tier/category origin, the keyword/match/spend/clicks/impressions columns, a checkbox column wired to `useShiftSelect`, and the per-row "Move to" NKL dropdown (NKL destinations only, no internal tier moves). Include show-all/pagination (50 limit) like the existing KeywordTable.

4. In `src/components/NegativeListBuilder.tsx`, add a bulk action bar above the `FlatKeywordList` table that shows when `selectedKwIds.size > 0`. It should display "{count} selected" and a "Move to NKL" dropdown (same NKL destinations: existing lists + "Create New List"). When an existing NKL is chosen, iterate over all selected keywords and PATCH them into that NKL (fetch list, dedupe, append, PATCH — same logic as the single-keyword move but batched). When "Create New List" is chosen, open the existing create dialog but adapted for multiple keywords. After a successful bulk move, remove the moved keywords from their respective NLB tiers and clear the selection.

5. In `src/components/NegativeListBuilder.tsx`, replace the three `CategorySection` blocks (lines 1574-1613) in the "Section 3: Team Review" render with the new `FlatKeywordList` component, passing the flattened keywords, selection state, shift-select handler, and move/toggle callbacks. Keep the team review instruction text, save/submit buttons, and team notes textarea. The per-keyword toggle (remove/keep) should still call `toggleKeyword` with the correct tier/catIndex/kwIndex from the `FlatKeyword` metadata.

6. Update `pendingMoveKw` state type and the create NKL dialog to support multiple keywords. Change `pendingMoveKw` to an array type `{ fromTier, fromCatIndex, kwIndex, phrase, matchType }[]`. Update the dialog heading to show the count (e.g. "3 keywords will be added") and the POST body to include all pending keywords. After creation, remove all pending keywords from their NLB tiers and clear selection.

7. Run `npx tsc --noEmit` and `npm test` to verify no type errors or test regressions.
