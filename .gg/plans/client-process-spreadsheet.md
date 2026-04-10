# Client Processes — Spreadsheet View for Phases & Steps

## Current State

The **Client Processes** collection has 3 tabs:
1. **Progress** — `ProcessTracker` component (visual pipeline + step toggle via API calls)
2. **Process Info** — metadata (title, client, template, retainer type)
3. **Phases & Steps** — raw Payload array fields (default card UI, no custom component)

The **Process Templates** already use `ProcessTemplateWorksheet` — a spreadsheet grid for phases/steps.

## Goal

Replace the "Phases & Steps" tab's default array rendering with a spreadsheet component, similar to `ProcessTemplateWorksheet` but adapted for live client processes (has `stepStatus`, `phaseStatus`, `completedAt`, `notes` fields that templates don't have).

## Plan

### 1. Create `ClientProcessWorksheet.tsx`

**File:** `src/components/ClientProcessWorksheet.tsx`

A spreadsheet component for client process phases & steps. Based on `ProcessTemplateWorksheet` pattern but with these differences:

- **Status column** — select dropdown for stepStatus (not_started / in_progress / completed / skipped)
- **Status colour coding** — row background tints based on status
- **Notes column** — inline text field for step-specific client notes
- **No email/automation columns** — keep it simple, those are template-level details
- **Phase status** — shown as badge on phase header row

**Columns:** `# | Name | Description | Type | Assignee | Status | Notes | ✕`

Uses same `useAllFormFields` + `useForm` pattern for form sync. The Progress tab's ProcessTracker (API-based toggle) stays as-is — it's the quick-action view. The spreadsheet is the detailed edit view.

### 2. Wire into ClientProcesses collection

**File:** `src/collections/ClientProcesses.ts`

Add custom Field component to the `phases` array in the "Phases & Steps" tab (line ~178):
```typescript
admin: {
  components: {
    Field: "./components/ClientProcessWorksheet",
  },
},
```

### 3. Update importMap

**File:** `src/app/(payload)/admin/importMap.js`

Add import + mapping for `ClientProcessWorksheet`.

### Files Changed

| File | Change |
|------|--------|
| `src/components/ClientProcessWorksheet.tsx` | New component (~400 lines) |
| `src/collections/ClientProcesses.ts` | Add Field component to phases array |
| `src/app/(payload)/admin/importMap.js` | Register new component |

### No migration needed
Pure UI change — same underlying array fields/DB schema.
