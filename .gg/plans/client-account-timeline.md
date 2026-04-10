# Client Account Timeline — Implementation Plan

## Summary

Add an **"Account Timeline"** tab to the Clients collection — a structured, date-ordered log of significant account milestones and changes. This is distinct from the existing "Notes" tab (which is for general notes/meetings/feedback). The timeline is specifically for **dated actions** that impact account data and need to be referenced historically — like when tagging was updated, when the account was taken over, when campaign structure changed, etc.

## Design Decision: Why a new tab, not reuse Notes?

The Notes tab is general-purpose (meetings, wins, issues, feedback). The account timeline has a fundamentally different purpose:
- **Structured action types** — predefined categories that can be filtered/queried later
- **Service-specific** — scoped to a service area (Google Ads, SEO, Analytics, etc.)
- **Timeline-focused** — ordered by date, designed for "when did we do X?" lookups
- **Future-proof** — action types can be expanded as new automations and integrations come online

Keeping them separate means the Notes tab stays clean for human communication, and the timeline becomes a reliable operational log.

## Architecture

**Approach: Array field on Clients collection** (same pattern as `clientNotes`, `retainerHistory`, `oneOffProjects`)

No new collection needed — this is client-specific data that belongs on the client record. An array field with structured rows gives:
- Easy add/edit in the admin UI
- Sorted display (newest first by default)
- Filterable by action type and service area
- No additional locked_documents_rels work

## Implementation

### Step 1: Add `accountTimeline` array field to Clients.ts

**File:** `src/collections/Clients.ts`

Add a new tab **"Account Timeline"** after the "Notes" tab (line ~615), before "Processes" tab. The tab contains a single array field:

```typescript
{
  label: "Account Timeline",
  fields: [
    {
      name: "accountTimeline",
      type: "array",
      dbName: "client_account_timeline",
      admin: {
        description: "Log of significant account milestones — tagging changes, account takeovers, campaign restructures, etc.",
        initCollapsed: false,
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "date",
              type: "date",
              required: true,
              defaultValue: () => new Date().toISOString(),
              admin: {
                width: "25%",
                date: {
                  pickerAppearance: "dayOnly",
                  displayFormat: "d MMM yyyy",
                },
              },
            },
            {
              name: "serviceArea",
              type: "select",
              defaultValue: "google_ads",
              admin: {
                width: "25%",
                description: "Which service this relates to",
              },
              options: [
                { label: "Google Ads", value: "google_ads" },
                { label: "SEO", value: "seo" },
                { label: "Analytics / Tracking", value: "analytics" },
                { label: "Website", value: "website" },
                { label: "Social / Meta", value: "social" },
                { label: "General", value: "general" },
              ],
            },
            {
              name: "actionType",
              type: "select",
              required: true,
              admin: {
                width: "50%",
                description: "What happened",
              },
              options: [
                // Account lifecycle
                { label: "Account Takeover", value: "account_takeover" },
                { label: "Account Access Granted", value: "access_granted" },
                
                // Tracking & tagging
                { label: "Tagging Updated", value: "tagging_updated" },
                { label: "Conversion Tracking Changed", value: "conversion_tracking_changed" },
                { label: "GA4 Setup / Migration", value: "ga4_setup" },
                { label: "GTM Setup / Updated", value: "gtm_updated" },
                
                // Google Ads specific
                { label: "Campaign Structure Proposed", value: "campaign_structure_proposed" },
                { label: "Campaign Structure Implemented", value: "campaign_structure_implemented" },
                { label: "Budget Changed", value: "budget_changed" },
                { label: "Negative Keyword List Added", value: "negative_keywords_added" },
                { label: "Bid Strategy Changed", value: "bid_strategy_changed" },
                { label: "Ad Copy Updated", value: "ad_copy_updated" },
                { label: "Landing Pages Changed", value: "landing_pages_changed" },
                
                // Reporting & dashboards
                { label: "Dashboard Created", value: "dashboard_created" },
                { label: "Reporting Started", value: "reporting_started" },
                
                // General
                { label: "Strategy Change", value: "strategy_change" },
                { label: "Other", value: "other" },
              ],
            },
          ],
        },
        {
          name: "description",
          type: "textarea",
          required: true,
          admin: {
            description: "Details of what was done and any context for future reference",
          },
        },
        {
          name: "addedBy",
          type: "text",
          admin: {
            description: "Who logged this entry",
          },
        },
      ],
    },
  ],
},
```

**Insert location:** After the "Notes" tab (after line 615) and before "Processes" tab (currently line 617).

### Step 2: Migration file

**File:** `src/migrations/20260325_120000_add_client_account_timeline.ts`

Payload stores arrays as separate tables. The table name is derived from the `dbName` or collection + field name. With `dbName: "client_account_timeline"`, the table will be `client_account_timeline`.

```typescript
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_account_timeline\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`date\` text NOT NULL,
    \`service_area\` text DEFAULT 'google_ads',
    \`action_type\` text NOT NULL,
    \`description\` text NOT NULL,
    \`added_by\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_account_timeline_order_idx\` ON \`client_account_timeline\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_account_timeline_parent_id_idx\` ON \`client_account_timeline\` (\`_parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`client_account_timeline\`;`)
}
```

### Step 3: Register migration

**File:** `src/migrations/index.ts`

Add import and entry for the new migration at the end of the list.

### Step 4: Type check & test

- Run `npx tsc --noEmit` to verify no type errors
- Run `npm test` to verify no test failures
- The dev server should show the new "Account Timeline" tab on client records

### Step 5: Deploy

After deploy, hit `POST /api/migrate` with `x-api-key` header to run the migration on production.

## Files Changed

| File | Change |
|------|--------|
| `src/collections/Clients.ts` | Add "Account Timeline" tab with `accountTimeline` array field (~70 lines) |
| `src/migrations/20260325_120000_add_client_account_timeline.ts` | New migration file |
| `src/migrations/index.ts` | Register new migration |

## No changes needed

- No new collection → no `payload_locked_documents_rels` update
- No new components needed — all standard Payload fields
- No importMap changes
- No API route changes

## Action Type Categories (for future reference)

The `actionType` select is designed to be expanded. Future additions might include:
- `audience_targeting_changed`
- `remarketing_setup`
- `shopping_feed_updated`
- `seo_audit_implemented`
- `backlink_campaign_started`
- `schema_markup_added`

These can be added to the options list without any migration since select values are just strings.

## Risk Assessment

**Low risk:**
- Array field on existing collection — well-established pattern (same as `clientNotes`, `retainerHistory`)
- No changes to existing fields or data
- Migration is additive only (CREATE TABLE IF NOT EXISTS)
- No new dependencies
