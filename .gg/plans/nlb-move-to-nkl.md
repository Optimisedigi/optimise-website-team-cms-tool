# NLB "Move to" → Integrate with CMS Negative Keyword Lists

## Context

The Negative List Builder (NLB) in the Google Ads audit has a **"Move to"** dropdown per keyword that currently only moves keywords between internal tiers (Universal ↔ Account-Wide ↔ Campaign groups). These tiers only exist within the NLB builder JSON — they're not connected to the actual CMS Negative Keyword Lists (NKLs) that get synced to Google Ads.

The user wants the "Move to" dropdown to also offer **existing CMS Negative Keyword Lists** as destinations, and the ability to **create new NKL lists** directly from the builder. This connects the builder's review workflow directly to the operational NKL system, which uses `campaignRegex` to auto-assign lists to matching campaigns.

## Current State

- **NLB `moveKeyword`** (line 1012-1065 in `NegativeListBuilder.tsx`): Moves a keyword between tiers within the `nlbData` JSON only — no CMS writes.
- **NLB `getMoveDestinations`** (line 1067-1090): Returns destinations: "Account-Wide Negatives" + each campaign from the proposal. Only internal tiers.
- **`existingNKLs`** state (line 512): Already fetched — `{ id, name, scope, keywordCount }[]` — available but only used in the import section at the bottom.
- **`MoveDestination` interface** (line 165-169): `{ label, tier: 'universal' | 'accountWide' | 'campaign', catIndex }` — no NKL reference.

## Design

Extend the "Move to" dropdown to have two groups of destinations:

**Group 1 — Internal tiers (existing behavior):**
- Account-Wide Negatives
- Campaign: {name} (for each campaign)

**Group 2 — CMS Negative Keyword Lists:**
- Each existing NKL: "{name} ({keywordCount} kws, {scope})"
- "+ Create New List" — prompts for a name and campaign regex, creates the NKL, and adds the keyword to it

When a keyword is moved to a CMS NKL, two things happen:
- The keyword is removed from its current NLB tier (same as today)
- The keyword is **added to the CMS NKL** via PATCH API call (same merge logic already used in `handleMergeToExisting`)

For "Create New List", we show a small inline form (name + regex) that creates the list and adds the keyword. After creation, the new list appears in the dropdown for subsequent moves.

## Files to Change

- `src/components/NegativeListBuilder.tsx` — the main component

## Steps

1. In `src/components/NegativeListBuilder.tsx`, extend the `MoveDestination` interface (line 165-169) to add an optional `nklId` field for CMS NKL targets and a `nklCreate` boolean flag for the "create new list" option. Change the type to: `{ label: string; tier: 'universal' | 'accountWide' | 'campaign' | 'nkl'; catIndex: number; nklId?: string; nklCreate?: boolean }`.

2. In `src/components/NegativeListBuilder.tsx`, update the `getMoveDestinations` function (line 1067-1090) to append existing NKL lists from the `existingNKLs` state as additional move destinations with `tier: 'nkl'` and `nklId` set, plus a final "+ Create New List" entry with `tier: 'nkl'` and `nklCreate: true`. Group them under an optgroup label "Negative Keyword Lists" in the dropdown.

3. In `src/components/NegativeListBuilder.tsx`, update the `KeywordTable` component's "Move to" `<select>` (lines 333-350) to render the destinations in two `<optgroup>` sections: "Move Within Builder" for the existing tier destinations, and "Send to Negative Keyword List" for the NKL destinations (including "+ Create New List").

4. In `src/components/NegativeListBuilder.tsx`, update the `moveKeyword` function (line 1012-1065) to handle `dest.tier === 'nkl'`. When `nklId` is set, remove the keyword from its current NLB tier (existing logic), then PATCH the NKL via `/api/negative-keyword-lists/{nklId}` to add the keyword (fetch current keywords, check for duplicates by phrase+matchType, append if new, PATCH back). Show success/error via setMessage/setError. When `nklCreate` is true, set a state flag (`showCreateNKLDialog`) and store the pending keyword info (`pendingMoveKw`) so Step 5's dialog can complete the action.

5. In `src/components/NegativeListBuilder.tsx`, add a small inline dialog/modal component for "Create New List" that appears when `showCreateNKLDialog` is true. It should have fields for: list name (text input), scope (select: account/campaign/ad_group), and campaign regex (text input with the same help text from the collection config). On submit: POST to `/api/negative-keyword-lists` to create the list with the pending keyword included, add the new list to `existingNKLs` state, remove the keyword from its NLB tier, close the dialog, and show a success message.

6. Run `npx tsc --noEmit` and `npm test` to verify no type errors or test regressions.
