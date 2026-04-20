# Google Ads Tab Reorder & Negative Keyword Lists Integration

## Analysis

### Request 1: Tab Reorder (Budget Management & Ad Extensions)

The current tab order in `src/collections/GoogleAdsAudits.ts` is:
1. Client Info, 2. Audit Control, 3. Audit Results, 4. Finding Curation, 5. Presentation, 6. Campaign Proposal, **7. Ad Copy**, **8. Budget Management**, **9. Ad Extensions**, 10. Negative List Builder, 11. History, 12. Action Items, 13. Automations, 14. Sweep History, 15. Performance Reports, 16. Weekly Reports, 17. OptiMate, 18. Chat

Budget Management and Ad Extensions are **already** right after Ad Copy (tabs 8, 9). However, the user says they appear "at the back" — this is likely because there are 18 tabs total and they visually scroll off. The user's intent is confirmed: they should be right after Ad Copy, which they already are. **No change needed here.**

### Request 2: Add Negative Keyword Lists within Google Ads Audits

Currently:
- **Negative Keyword Lists** is a standalone collection (`src/collections/NegativeKeywordLists.ts`) that appears in the sidebar under "Growth Tools"
- The Client's "Google Ads" tab already has a `join` field showing NKL records for that client
- The Google Ads Audits collection does NOT have NKL records shown — it only has the Negative List Builder

The user wants:
- A **new tab** within Google Ads Audits that shows the negative keyword lists for that client
- This gives the team a single place to manage everything Google Ads related

**Approach:** Add a new tab "Negative Keyword Lists" to the Google Ads Audits collection with a UI component that fetches and displays NKL records for the linked client. Since Google Ads Audits has a `client` relationship field, the component can use it to query NKL records.

The component will:
- Show all NKL records for the linked client (fetched via API)
- Link to each NKL record for editing
- Allow creating a new NKL from within the audit
- Show status info (keyword count, scope, active status)

### Request 3: Push from Negative List Builder to Negative Keyword Lists

This already exists via the `import-to-cms` route. The user wants more flexibility:
- Push to an **existing** NKL for the client, or create a new one
- This is an enhancement to the existing NLB component

The current import creates lists with fixed names like "Universal Negatives (Builder)". The enhancement should let the user choose to push to an existing list or create a new one, directly from the NLB UI.

**Approach:** In the NLB component, enhance the "Add to Client's Negative Keyword Lists" section to:
- Show existing NKL records for the client
- Let the user select which list(s) to push to (merge into existing or create new)
- Add a "Create New List" option

## Files to Modify

- `src/collections/GoogleAdsAudits.ts` — Add new "Negative Keyword Lists" tab (line ~990, after Negative List Builder)
- `src/components/NegativeListBuilder.tsx` — Enhance import section with list picker
- New: `src/components/GoogleAdsNegativeKeywordLists.tsx` — UI component for NKL tab in Google Ads Audits

## Risks

- The Google Ads Audits collection already has 18 tabs — adding another could make the tab bar even harder to navigate. But the user explicitly wants this.
- The `OpenNegativeListBuilderButton` references `#tab-8` which will shift if tabs are reordered. Since we're adding a tab AFTER NLB (not before), the index won't shift.
- Tab numbering: NLB is currently tab index 9 (0-based). Adding a new tab after it would push History to index 11, etc. Need to verify `OpenNegativeListBuilderButton` still links correctly.

## Steps

1. Create `src/components/GoogleAdsNegativeKeywordLists.tsx` — a UI component that reads the linked `client` from the current Google Ads Audit doc, fetches all `negative-keyword-lists` records for that client, and displays them in a card-based list with name, scope, keyword count, active status, and links to edit each one. Include a "Create New List" button that opens the NKL create page pre-filled with the client ID.

2. In `src/collections/GoogleAdsAudits.ts`, add a new tab "Negative Keyword Lists" right after the "Negative List Builder" tab (~line 1021), containing a single UI field pointing to `./components/GoogleAdsNegativeKeywordLists`.

3. In `src/components/NegativeListBuilder.tsx`, enhance the "Add to Client's Negative Keyword Lists" import section: fetch existing NKL records for the linked client, display them as selectable targets, and add options to either merge keywords into an existing list or create a new list. Replace the single "Add to Client's Negative Keyword Lists" button with a dropdown/selector showing existing lists plus a "Create New List" option.

4. Update the tab index reference in `src/components/OpenNegativeListBuilderButton.tsx` — the NLB tab was `#tab-8` (0-indexed) but with the new tab inserted after NLB, verify and adjust if needed (should still be `#tab-8` since the new tab goes after NLB, not before).

5. Run `npx tsc --noEmit` and `npm test` to verify no type errors or test failures.
