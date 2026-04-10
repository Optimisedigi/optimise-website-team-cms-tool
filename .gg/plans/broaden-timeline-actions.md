# Broaden Account Timeline + Note on Process Templates

## Part 1: Broaden Timeline Action Types & Service Areas

The timeline is currently Google Ads-heavy. Expand to cover the full client lifecycle.

### Files to change:
1. **`src/components/AccountTimelineTable.tsx`** — Update `SERVICE_AREAS` and `ACTION_TYPES` arrays
2. **`src/collections/Clients.ts`** — Update the matching options in the collection schema (lines ~645-685)

### New SERVICE_AREAS:
```
Google Ads, SEO, Analytics / Tracking, Website, Social / Meta, Content, Email, Contracts / Legal, Onboarding, General
```

### New ACTION_TYPES (grouped logically):
```
── Account Lifecycle ──
Account Takeover
Account Access Granted
Client Onboarding Started
Client Onboarding Completed

── Contracts & Agreements ──
Contract Signed
Contract Renewed
Scope of Work Changed

── Meetings & Communication ──
Kickoff Meeting
Strategy Meeting
Review Meeting
Client Presentation

── Tracking & Tagging ──
Tagging Updated
Conversion Tracking Changed
GA4 Setup / Migration
GTM Setup / Updated

── Google Ads ──
Campaign Structure Proposed
Campaign Structure Implemented
Budget Changed
Negative Keyword List Added
Bid Strategy Changed
Ad Copy Updated
Landing Pages Changed

── Reporting & Dashboards ──
Dashboard Created
Reporting Started

── General ──
Strategy Change
Process Milestone
Other
```

### No migration needed
Select option values are just strings — adding new options doesn't change the DB schema.

## Part 2: Process Templates Already Use Spreadsheet Format

The `ProcessTemplates` collection already has `ProcessTemplateWorksheet` as a custom Field component (line 168 of ProcessTemplates.ts). This renders phases and steps as a spreadsheet grid — it's already done.

No changes needed here unless the user wants the **Client Processes** (live instances) to also use a spreadsheet view, which is a separate request.
