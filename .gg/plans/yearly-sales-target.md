# Yearly Sales Target Progress Bar

## Overview
Add a yearly sales target to the agency client record, and display a visual green progress bar at the very top of the admin dashboard showing how the agency is tracking toward that target by 31 December.

## What We're Building
1. **New fields on the agency client** — `yearlySalesTarget` (dollar amount) and `targetDeadline` (date, defaults to Dec 31 of current year)
2. **Dashboard API** — Return the target data alongside existing dashboard data
3. **Progress bar component** — A green bar at the very top of the dashboard showing: current YTD revenue vs target, percentage, and days remaining until the deadline

---

## Implementation Steps

### Step 1: Add fields to the Clients collection (agency-only)
**File:** `src/collections/Clients.ts`

Add two new fields inside the "Business" tab, conditionally shown only when `isAgency` is true (opposite of the existing revenue fields which hide when `isAgency`).

After the `isAgency` checkbox field (line ~218), add within the Business tab fields:

```ts
{
  name: "yearlySalesTarget",
  type: "number",
  min: 0,
  admin: {
    description: "Yearly revenue target ($). Shown as a progress bar on the dashboard.",
    step: 1,
    condition: (data: any) => !!data?.isAgency,
  },
},
{
  name: "targetDeadlineDate",
  type: "date",
  admin: {
    description: "Target deadline (defaults to Dec 31 of current year if not set)",
    condition: (data: any) => !!data?.isAgency,
    date: {
      pickerAppearance: "dayOnly",
      displayFormat: "d MMM yyyy",
    },
  },
},
```

**No migration needed** — these are simple number/date columns on an existing table. SQLite will handle them with the push behavior (actually, `push: false` means we DO need a migration). However, we should add these via migration.

### Step 2: Create a migration for the new columns
**File:** `src/migrations/YYYYMMDD_HHMMSS_add_yearly_target.ts` (use appropriate timestamp)

Add columns `yearly_sales_target` (real) and `target_deadline_date` (text) to the `clients` table. Follow the pattern of existing migrations.

### Step 3: Update the Dashboard API route
**File:** `src/app/(frontend)/api/dashboard/route.ts`

Inside the `GET` handler, after existing queries, fetch the agency client's target:

```ts
// Fetch agency yearly sales target
let salesTarget: { target: number; deadline: string } | null = null;
try {
  const agencyClient = await payload.find({
    collection: "clients",
    where: { isAgency: { equals: true } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const agency = agencyClient.docs[0] as any;
  if (agency?.yearlySalesTarget && agency.yearlySalesTarget > 0) {
    salesTarget = {
      target: agency.yearlySalesTarget,
      deadline: agency.targetDeadlineDate || `${now.getFullYear()}-12-31T00:00:00.000Z`,
    };
  }
} catch { /* agency not configured */ }
```

Add `salesTarget` to the JSON response:

```ts
return NextResponse.json({
  ...existingFields,
  salesTarget,
});
```

### Step 4: Update the Dashboard component
**File:** `src/components/Dashboard.tsx`

**4a. Add type:**
```ts
interface DashboardData {
  // ...existing fields...
  salesTarget?: {
    target: number
    deadline: string
  } | null
}
```

**4b. Add the progress bar** — insert right after the header div and BEFORE the `od-dash__layout` div (line ~269). This puts it at the very top, full-width above the grid:

```tsx
{/* Yearly Sales Target Progress Bar */}
{data.salesTarget && data.salesTarget.target > 0 && (
  <YearlySalesTargetBar
    target={data.salesTarget.target}
    current={data.ytdRevenue}
    deadline={data.salesTarget.deadline}
  />
)}
```

**4c. Create the `YearlySalesTargetBar` sub-component** within Dashboard.tsx (following the pattern of other sub-components like `GscCard`, `ActivityFeed`, etc.):

```tsx
function YearlySalesTargetBar({ target, current, deadline }: { target: number; current: number; deadline: string }) {
  const percentage = Math.min(100, Math.round((current / target) * 100))
  const remaining = target - current
  const deadlineDate = new Date(deadline)
  const now = new Date()
  const daysRemaining = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  const isAhead = percentage >= ((now.getMonth() + 1) / 12) * 100 // rough pace check
  
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
            🎯 Yearly Sales Target
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: percentage >= 100 ? '#22c55e' : '#6b7280' }}>
            {percentage}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#6b7280' }}>
          <span>
            <strong style={{ color: '#111827' }}>${current.toLocaleString()}</strong> / ${target.toLocaleString()}
          </span>
          <span>
            ${remaining > 0 ? `$${remaining.toLocaleString()} to go` : '🎉 Target reached!'}
          </span>
          <span>
            {daysRemaining} days left · {deadlineDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{
        height: 12,
        background: '#f3f4f6',
        borderRadius: 6,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          height: '100%',
          width: `${percentage}%`,
          background: percentage >= 100 ? '#22c55e' : 'linear-gradient(90deg, #22c55e, #4ade80)',
          borderRadius: 6,
          transition: 'width 1s ease-in-out',
        }} />
        {/* Pace marker — where you should be based on time elapsed */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: `${Math.round(((now.getMonth() + (now.getDate() / 30)) / 12) * 100)}%`,
          width: 2,
          height: '100%',
          background: '#9ca3af',
          opacity: 0.6,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#9ca3af' }}>
        <span>Jan</span>
        <span style={{ opacity: 0.6 }}>▲ Expected pace</span>
        <span>Dec 31</span>
      </div>
    </div>
  )
}
```

### Step 5: Add CSS (minimal — mostly inline following existing patterns)
**File:** `src/app/(payload)/custom.scss`

No new CSS needed — the progress bar uses inline styles consistent with the rest of the Dashboard.tsx component (which is predominantly inline-styled).

---

## Data Flow

```
Agency Client (isAgency: true)
  └→ yearlySalesTarget: 160000
  └→ targetDeadlineDate: 2026-12-31

Dashboard API (/api/dashboard)
  └→ Fetches agency client's target fields
  └→ Returns { salesTarget: { target: 160000, deadline: "2026-12-31" } }
  └→ Already returns ytdRevenue (retainers × months + one-off projects YTD)

Dashboard Component
  └→ Reads data.salesTarget + data.ytdRevenue
  └→ Renders green progress bar at top showing $X / $160,000
```

## Migration Details

Since `push: false`, we need a migration to add the two columns. The migration SQL:

```sql
ALTER TABLE clients ADD COLUMN yearly_sales_target real;
ALTER TABLE clients ADD COLUMN target_deadline_date text;
```

Need to check the existing migration files to determine the naming pattern and index.

## Files Changed

| File | Change |
|------|--------|
| `src/collections/Clients.ts` | Add `yearlySalesTarget` + `targetDeadlineDate` fields (agency-only) |
| `src/migrations/XXXXXX_add_yearly_target.ts` | Migration to add columns |
| `src/migrations/index.ts` | Register the new migration |
| `src/app/(frontend)/api/dashboard/route.ts` | Fetch + return `salesTarget` in API response |
| `src/components/Dashboard.tsx` | Add `YearlySalesTargetBar` component + render at top of dashboard |

## Verification

1. `npx tsc --noEmit` — no type errors
2. `npm test` — all tests pass
3. Start dev server → go to agency client → see yearly target fields
4. Set target to 160000, deadline to 31 Dec 2026
5. Dashboard shows green progress bar at top with YTD revenue vs $160,000
6. Progress bar shows: current amount, percentage, remaining, days left, pace marker

## Risk / Notes

- **No new collection** — just two fields on the existing `clients` table, so no `payload_locked_documents_rels` changes needed.
- **Migration required** — `push: false` means we must add columns manually. Run `POST /api/migrate` after deploy.
- The `ytdRevenue` calculation already exists and is correct for this purpose — it includes retainer months + one-off projects for the current calendar year.
- The pace marker (grey line) gives a visual "where you should be" reference based on time elapsed in the year.
