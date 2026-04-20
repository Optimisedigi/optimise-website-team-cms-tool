# Negative List Builder — Save Edits Without Advancing Status

## Problem

When editing keywords in the Negative List Builder (changing phrases, match types, adding/removing keywords) during team review, the only way to persist changes is "Submit Team Review" which also advances the status to `team_approved`. There's no way to save incremental edits — if you navigate away, all changes are lost.

## Solution

Add a **"Save Changes"** button that persists the current keyword data to the database without changing the status. This sits alongside the existing "Submit Team Review" button and gives the team a way to save work-in-progress.

Also add a dirty-state tracker so the button highlights when there are unsaved changes.

## Steps

1. Add a new API route `src/app/(frontend)/api/google-ads-audits/[id]/negative-list-builder/save-edits/route.ts` that accepts the 3 keyword arrays (universalNegatives, accountWideNegatives, campaignSpecificNegatives) and saves them to the document's `negativeListBuilder` field WITHOUT changing the status. Auth-gated to logged-in users only.

2. In `src/components/NegativeListBuilder.tsx`, add a `dirty` state flag that becomes `true` whenever `changePhrase`, `changeMatchType`, `toggleKeyword`, `bulkAction`, `moveKeyword`, or `addKeyword` are called. Add a `handleSaveEdits` function that calls the new API endpoint. Add a "Save Changes" button next to the "Submit Team Review" button (visible when `canTeamReview` is true). The button should show as highlighted/prominent when `dirty` is true. Reset `dirty` to false after a successful save. Also reset `dirty` after a successful team review submission.
