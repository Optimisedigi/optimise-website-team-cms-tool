# Client Timeline Feature Plan

## What We're Building

A **client-facing timeline feature** — simplified, shareable progress trackers for clients that show what's being done over a ~90-day onboarding/management period. Clients see a clean table with checkboxes (✅ done items). The team can mark items complete in the CMS and generate a polished email summary to paste into a client update.

Two clients to start: **Berenson** and **MTP** (Google Ads).

---

## Data Model

### `client-timeline-templates` (template, reusable)

Stores the phase/item skeleton — copied into ClientTimelines when created.

| Field | Type | Notes |
|---|---|---|
| `name` | text | e.g. "Google Ads 90-Day Onboarding" |
| `slug` | text (unique) | auto-generated from name |
| `serviceType` | select | google_ads, seo, meta_ads, cro, general |
| `durationDays` | number | default 90 |
| `description` | textarea | Brief overview shown to client |
| `isDefault` | checkbox | Default template for service type |
| `isActive` | checkbox | Enable/disable |
| `phases[]` | array | |
| `phases[].phaseName` | text | e.g. "Quick Wins" |
| `phases[].phaseOrder` | number | display order |
| `phases[].weekRange` | text | e.g. "Weeks 1–2" |
| `phases[].phaseDescription` | textarea | Client-facing description |
| `phases[].items[]` | array | |
| `phases[].items[].itemName` | text | The task/activity |
| `phases[].items[].itemOrder` | number | |
| `phases[].itemDescription` | textarea | Detail (optional) |
| `phases[].items[].requiresApproval` | checkbox | "Your approval needed" badge |
| `phases[].items[].internalNotes` | textarea | Team-only notes |

---

### `client-timelines` (per-client instance)

One per client per service type (e.g. Berenson Google Ads, MTP Google Ads).

| Field | Type | Notes |
|---|---|---|
| `client` | relationship → clients | Required |
| `template` | relationship → client-timeline-templates | Which template was used |
| `serviceType` | select | mirrors template |
| `title` | text | e.g. "Berenson — Google Ads 90-Day Timeline" |
| `startDate` | date | Timeline start |
| `endDate` | date | Computed from start + durationDays |
| `overallStatus` | select | not_started, in_progress, completed |
| `phases[]` | array | Copied from template, with tracking fields |
| `phases[].items[].itemStatus` | select | not_started, in_progress, completed, skipped |
| `phases[].items[].completedAt` | date | |
| `phases[].items[].completedBy` | relationship → users | |
| `phases[].items[].approvalStatus` | select | pending_approval, approved, not_needed |
| `phases[].items[].clientApprovedAt` | date | |
| `phases[].items[].internalNotes` | textarea | Team-only notes (kept from template) |
| `lastSharedAt` | date | When email was last sent |
| `sharedCount` | number | How many times shared |
| `notes` | textarea | General notes for this timeline |

**No virtual `completionPercentage` field** — computed in the UI component and API responses.

---

## Google Ads 90-Day Template (seed data)

### Phase 1 — Quick Wins (Weeks 1–2)
- [ ] Remove contact page view conversion action
- [ ] Fix form tracking
- [ ] Add phone call duration filter
- [ ] Add themed negative keyword lists to stop wasted spend
- [ ] Fix geo targeting, pause irrelevant keywords *(requires approval)*
- [ ] Submit geo-targeting changes for your approval *(requires approval)*

### Phase 2 — Campaign Analysis + Structure Proposal (Weeks 1–3)
- [ ] Analyse landing pages and map out keyword themes
- [ ] Propose new campaign structure *(requires approval)*
- [ ] Advise on brand-specific landing pages (topline)

### Phase 3 — Campaign Build + Ad Copy (Weeks 3–4)
- [ ] Build out campaigns, ad groups, keywords, audiences, extensions
- [ ] Create dedicated brand ads with brand messaging
- [ ] Share ad copy drafts for your review *(requires approval)*
- [ ] Negative keyword list deep dive
- [ ] Go live with new structure *(requires approval)*

### Phase 4 — Launch + Monitor (Weeks 4–5)
- [ ] Daily monitoring for the first couple of weeks
- [ ] Ongoing ad copy optimisation
- [ ] Approve ad copy before launch *(requires approval)*
- [ ] Monthly dashboard shared

### Phase 5 — Ongoing Optimisations (Beyond Week 5)
- [ ] Ongoing account optimisations
- [ ] Ad copy A/B tests
- [ ] Testing placements
- [ ] Advise on brand-specific landing pages (in-depth)
- [ ] Dashboard refinements
- [ ] Generic to GA4 deep dives for scale
- [ ] Organic vs paid search analysis

---

## Implementation Order

### 1. Collections
- `src/collections/ClientTimelineTemplates.ts` — template schema
- `src/collections/ClientTimelines.ts` — instance schema

### 2. Migration
- `src/migrations/20260410_120000_add_client_timeline_templates_and_client_timelines.ts`
- Update `src/migrations/index.ts`

### 3. payload.config.ts
- Import and register both collections

### 4. Email Generator
- `src/lib/client-timeline-email.ts` — generates styled HTML email with:
  - Header: client name, timeline title, date range
  - Progress bar: expected % vs actual %
  - Phases table: phase name | items with ✅/⬜ | approval badges
  - Notes section for each phase
  - Copy-paste plain text fallback

### 5. Admin UI Components
- `src/components/ClientTimelineTracker.tsx` — main editor:
  - Lists phases and items with status toggles
  - Approval status controls
  - Completion tracking (who, when)
  - Progress summary (X of Y items complete)
  - "Share with Client" button → opens email preview modal
- `src/components/ClientTimelineEmailPreview.tsx` — modal:
  - Shows rendered email HTML preview
  - Copy HTML button
  - Copy plain text button
  - "Mark as Shared" button → updates lastSharedAt + sharedCount

### 6. API Routes
- `PATCH /api/client-timelines/[id]/item` — update single item status
  - Body: `{ phaseIndex, itemIndex, itemStatus, approvalStatus }`
- `POST /api/client-timelines/[id]/email-preview` — returns HTML + plain text
- `POST /api/client-timelines/[id]/share` — marks as shared (updates lastSharedAt, sharedCount)

### 7. Seed Script
- Seed the "Google Ads 90-Day Onboarding" template
- Create ClientTimeline instances for Berenson and MTP from that template

---

## Conventions

- Follow exact patterns from `ProcessTemplates.ts` and `ClientProcesses.ts`
- Auth: Payload session OR `x-api-key` matching `AUDIT_API_KEY`
- Use `overrideAccess: true` on all server-side Payload calls
- `logActivity()` for major events (timeline created, item completed, shared)
- Phase/item orders normalized via `beforeChange` hook
- Migration: `sqliteAdapter` schema syntax (id, name TEXT, ...)

---

## Post-Build Steps

1. Run `npx payload migrate` (or `POST /api/migrate`) to create tables
2. Run seed script
3. Test in admin UI: open a ClientTimeline, mark items complete, preview email
4. Test copy-paste into email client
