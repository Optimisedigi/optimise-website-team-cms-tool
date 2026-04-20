# Download Raw Data & Scored Report Buttons

## Context

The `rawData` field on GoogleAdsAudits stores the full Google Ads API dump (multi-MB JSON). The `scoredReport` stores the scored audit results. Currently:

- `rawData` is stripped to `null` in the `afterRead` hook (line 133-134) to avoid Vercel's 4.5MB body limit
- A migration already cleared all existing `rawData` from the DB (`clear_raw_data_for_413_fix`)
- `rawData` is only written during audit runs (line 158) and immediately stripped on next read
- `scoredReport` is NOT stripped — it's actively used by `GoogleAdsFindingCuration`, `RegenerateEmailButton`, and the presentation API
- Both fields are now `admin.hidden: true` (just set in previous step)

**Key insight:** `rawData` has already been cleared from the database for all existing records. New audits write it, but the afterRead hook nullifies it immediately. So in practice, `rawData` is effectively lost after the audit run completes and the next read happens. For the download button to work with `rawData`, we'd need to either:
1. Stop clearing it in the afterRead hook (but still hide it from admin) — costs storage
2. Accept that it's only downloadable right after the audit runs before another read

For `scoredReport`, the data IS still in the DB and actively used. A download button makes perfect sense.

## Storage Cost Analysis

Turso charges $0.50-$0.75/GB for storage overages on the Scaler/Developer plans. A typical `rawData` blob is ~1-3MB, `scoredReport` is ~50-200KB. With maybe 50-100 audits, that's:
- rawData: ~50-300MB total (pennies to store)
- scoredReport: ~2.5-20MB total (negligible)

**Verdict: Storage cost is trivial.** The reason `rawData` was cleared wasn't cost — it was the Vercel 4.5MB response body limit causing 413 errors on every admin save.

## Approach

Create an API route that fetches the field directly from the DB with `overrideAccess: true` and bypasses the `afterRead` hook by using a raw DB query or by temporarily working around the hook. Actually, Payload's `afterRead` hook runs on `findByID` — but we can use `select` to only fetch the specific field, and the hook still runs. The simplest approach: use a dedicated API route that queries the DB directly via SQL (using `req.payload.db.drizzle`) to bypass hooks entirely.

Actually, simpler: the `afterRead` hook only strips `rawData`, not `scoredReport`. For `scoredReport`, a normal `findByID` with `select` works. For `rawData`, we need to bypass the hook — but since the migration already cleared all rawData from the DB, and the afterRead hook nullifies it, **rawData is effectively unrecoverable** for existing audits. 

**Better approach:** Stop nullifying `rawData` in the afterRead hook. Instead, just keep it hidden from admin (`admin.hidden: true`). The real fix was already done — the 413 issue was caused by Payload serializing the full document on admin saves. With `admin.hidden: true`, the field isn't rendered or sent back. The afterRead hook stripping was a belt-and-suspenders approach that's now unnecessary since hidden fields aren't included in admin form payloads.

Wait — actually, `admin.hidden` only hides the field from the admin UI. Payload still loads the full document including all fields when you open an edit view. The afterRead hook strips rawData from the document before it reaches the client, which is what prevents the 413. If we remove the afterRead strip, the admin will try to serialize the full rawData on every page load and save → 413 again.

**Final approach:**
1. Keep the `afterRead` hook stripping `rawData` (necessary for 413 prevention)
2. Create a dedicated API route `/api/google-ads-audits/[id]/download-data` that queries the specific field directly via the Drizzle connection, bypassing Payload's hooks
3. Also stop clearing `rawData` in the migration (already ran, won't affect future)
4. Also change the run-audit route to NOT rely on afterRead stripping — the rawData will persist in DB and only be excluded from normal reads
5. Add a download button component to the Audit Results tab

For the query, we can use `payload.db.drizzle.run(sql\`SELECT raw_data FROM google_ads_audits WHERE id = ?\`)` to fetch just that column.

Actually checking Payload v3 + Drizzle approach — we need to use the drizzle instance. Let me check the DB setup.

## Steps

1. Create API route `src/app/(frontend)/api/google-ads-audits/[id]/download-data/route.ts` that accepts a `?field=rawData` or `?field=scoredReport` query param, authenticates the user, runs a direct SQL query via `payload.db.drizzle` to fetch only the requested JSON column (bypassing afterRead hooks), and returns it as a downloadable JSON file with `Content-Disposition: attachment` header
2. Create admin component `src/components/DownloadAuditDataButton.tsx` — a `'use client'` component using `useDocumentInfo` to get the audit ID, rendering two buttons ("Download Raw Data" and "Download Scored Report") that each call the download endpoint and trigger a browser file download
3. Register the new component in `src/collections/GoogleAdsAudits.ts` by adding a `ui` field on the Audit Results tab (after `auditPreview`, before `overallScore`) pointing to `./components/DownloadAuditDataButton`
4. Regenerate the import map with `npx payload generate:importmap` and re-add the `VercelBlobClientUploadHandler` entry if dropped
5. Run `npx tsc --noEmit` and `npm test` to verify no type or test regressions
