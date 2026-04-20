# Negative Keyword Lists — All-in-One Client Preview

## Context

Currently, the client-facing negative keyword preview page (`/[clientSlug]/negative-keywords/[listSlug]`) shows a **single list** selected by its slug. The URL structure requires navigating to each individual list.

The user wants a **single page that shows ALL negative keyword lists** for that client, grouped/tabbed by scope (Account, Campaign, Ad Group). The page should:

- Show all lists on one page by default
- Have scope-based tabs/filters at the top (Account Level, Campaign Level, Ad Group Level)
- Fit as much as possible on one view
- Keep the PIN-gated access
- Keep the existing flag-for-removal functionality

## Current Structure

- **Page**: `src/app/(frontend)/[clientSlug]/negative-keywords/[listSlug]/page.tsx`
  - Server component that fetches ALL lists already, finds the matching one by slug
  - Passes all lists to `NegativeKeywordsClientView`
- **Component**: `src/components/NegativeKeywordsClientView.tsx`
  - PIN gate, then renders all lists flat (no grouping)
  - Each list rendered as a `ListCard` with scope badge, campaign pills, keywords with flag buttons
- **Flag API**: `src/app/(frontend)/api/negative-keyword-lists/flag/route.ts`
  - PIN-authenticated, toggles `flaggedForRemoval` on individual keywords

## Approach

1. **New route**: Create `src/app/(frontend)/[clientSlug]/negative-keywords/page.tsx` (no `[listSlug]`) that shows ALL lists. This becomes the primary page.
2. **Keep old route**: The `[listSlug]` route still works for backwards compatibility, but redirects or renders the same all-in-one view with that list's scope tab pre-selected.
3. **Redesign component**: Update `NegativeKeywordsClientView` to group lists by scope with tab filters.

Actually simpler: the current `[listSlug]/page.tsx` already fetches ALL lists and passes them to the component. The component already receives all lists. We just need to:

1. Create a new catch-all page at `src/app/(frontend)/[clientSlug]/negative-keywords/page.tsx` that shows all lists (no specific list required)
2. Update `NegativeKeywordsClientView` to add scope tabs and group lists by scope
3. The `[listSlug]` page continues to work — it just pre-selects the tab of that list's scope

## Steps

1. Create `src/app/(frontend)/[clientSlug]/negative-keywords/page.tsx` — a server component that fetches the client by slug, fetches ALL active negative keyword lists for that client (sorted by scope then name), and renders `NegativeKeywordsClientView` with all lists and no `activeListSlug` (so it defaults to showing all/account tab).

2. Update `src/app/(frontend)/[clientSlug]/negative-keywords/[listSlug]/page.tsx` — change it to pass `activeScope` (derived from the matched list's scope) instead of `activeListSlug` to `NegativeKeywordsClientView`, so navigating to a specific list slug pre-selects the correct scope tab.

3. Rewrite `src/components/NegativeKeywordsClientView.tsx` — add scope-based filter tabs at the top ("All Lists", "Account Level", "Campaign Level", "Ad Group Level"), group the list cards under scope headings, show tab counts (e.g. "Account Level (3)"), only show tabs that have lists, keep the PIN gate and flag functionality unchanged, and add the `activeScope` prop to pre-select a tab.

4. Run `npx tsc --noEmit` and `npm test` to verify no type errors or test regressions.
