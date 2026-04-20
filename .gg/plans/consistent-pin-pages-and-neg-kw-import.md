# Consistent PIN Login Pages + Negative List Builder → Negative Keyword Lists Import

## Overview

Two changes:
1. **Consistent PIN login pages**: All client-facing PIN-gated pages should show the client/business name first, then the feature name — matching the Google Ads dashboard pattern.
2. **Negative List Builder import**: Add a note explaining this is an "Initial Campaign Build" tool, and make the "Import to Negative Keyword Lists" button more prominent after client approval.

## Analysis

### Current PIN-gated pages

| Page | Component | Current heading | Has business name? | Style |
|------|-----------|----------------|-------------------|-------|
| Google Ads Dashboard | `DashboardClient.tsx` (line 42) | `{clientName}` + "Enter your 4-digit PIN..." | ✅ Server-side | Tailwind (`className`) |
| Ad Copy Preview | `AdCopyPinGate.tsx` (line 91) | "Ad Copy Preview" | ❌ No name before auth | Inline styles |
| Negative Keyword Review (builder) | `NegativeKeywordPinGate.tsx` (line 109) | "Negative Keyword Review" | ❌ No name before auth | Inline styles |
| Negative Keywords (lists) | `NegativeKeywordsClientView.tsx` (line 134) | "Negative Keywords List" + clientName below | ✅ Server-side (but different style — light bg, card, text input) | Inline styles (light theme) |
| Audit Report | `AuditPasswordGate.tsx` (line 75) | "Audit Report" | ❌ Could get from server | Inline styles |
| Proposal | Uses `AuditPasswordGate` | "Audit Report" (wrong label!) | ❌ Could get from server | Inline styles |
| Mockup | `MockupViewer.tsx` (line 104) | `{businessName}` + "Enter your PIN to preview..." | ✅ Server-side | Inline styles (gradient bg) |

### Target pattern (from Google Ads Dashboard)
```
{Client Name}                    ← bold, white, large
{Feature Name}                   ← subtitle describing feature
Enter your 4-digit PIN...        ← instruction text
[PIN inputs]                     ← 4 separate digit boxes
```

### Strategy for getting business names

- **Ad Copy** (`/ad-copy/[slug]`): Currently a `'use client'` page. Convert to server component that fetches just `businessName` from the `google-ads-audits` collection by slug, then pass to client component.
- **Negative Keyword Build** (`/negative-keyword-build/[slug]`): Same approach — convert to server component.
- **Audit Report** (`/audits/[slug]`): Already a server component with `audit.websiteUrl` available. Pass business name to `AuditPasswordGate`.
- **Proposal** (`/proposals/[slug]`): Already a server component with `proposal.businessName`. Pass to `AuditPasswordGate`.
- **Negative Keywords Client View** (`/[clientSlug]/negative-keywords/[listSlug]`): Already has `clientName` from server. Just update the PIN gate styling to match.

### Negative List Builder Import

The import button and API (`/api/google-ads-audits/[id]/negative-list-builder/import-to-cms/route.ts`) already exist. Changes needed:
- Update the tab label from "Negative List Builder" to "Negative List Builder" with description noting it's for initial campaign build
- Add a note in the NegativeListBuilder component header
- Make the import button more prominent when status is `client_approved`

## Steps

1. Update `AuditPasswordGate.tsx` to accept optional `businessName` and `featureLabel` props, showing `businessName` as the main heading and `featureLabel` as subtitle (defaulting to current "Audit Report" behavior for backwards compat). Keep the dark theme inline style pattern but update layout to: business name → feature label → PIN instruction → inputs.

2. Update `AdCopyPinGate.tsx` to accept an optional `businessName` prop, and when provided display it as the main heading above the feature name "Ad Copy Review". Keep existing inline style pattern.

3. Update `NegativeKeywordPinGate.tsx` to accept an optional `businessName` prop, and when provided display it as the main heading above "Negative Keyword Review". Keep existing inline style pattern.

4. Update `NegativeKeywordsClientView.tsx` PIN gate (unlocked=false section, line 129-157) to match the dark theme pattern: dark background (`#0f172a`), business name as heading, "Negative Keywords" as feature label, 4-digit PIN input boxes instead of single text input. Keep existing form submission logic.

5. Convert `src/app/(frontend)/ad-copy/[slug]/page.tsx` from a `'use client'` page to a server+client split: create a new wrapper server component that fetches `businessName` from `google-ads-audits` by slug (overrideAccess, select only businessName), then renders the existing client component with `businessName` passed through. Move the `'use client'` content into a separate client component or pass businessName as a prop to `AdCopyPinGate`.

6. Convert `src/app/(frontend)/negative-keyword-build/[slug]/page.tsx` to a server component that fetches `businessName` from `google-ads-audits` by slug, then passes it to `NegativeKeywordPinGate` as a prop.

7. Update `src/app/(frontend)/audits/[slug]/page.tsx` to pass `businessName` (using `audit.websiteUrl` formatted as domain) and `featureLabel="SEO Audit Report"` to `AuditPasswordGate`.

8. Update `src/app/(frontend)/proposals/[slug]/page.tsx` to pass `businessName={proposal.businessName}` and `featureLabel="Proposal"` to `AuditPasswordGate`.

9. Update `src/app/(frontend)/google-dashboard/[slug]/DashboardClient.tsx` PIN entry screen (line 38-48) to add a feature label "Google Ads Dashboard" between the client name and the PIN instruction, for consistency with the new pattern.

10. Update `src/components/NegativeListBuilder.tsx` to add an "Initial Campaign Build" note/description at the top of the component (near the header area), explaining this is a one-off negative keyword analysis for new campaign setup, and make the "Import to CMS Negative Keyword Lists" button section more prominent when status is `client_approved` — larger button, clearer call-to-action text like "Add to Client's Negative Keyword Lists".

11. Run `npx tsc --noEmit` and `npm test` to verify all changes compile and tests pass.
