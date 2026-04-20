# Migrate Xero Scheduled Sends from File to Database

## Problem
Scheduled sends are stored in `.xero-scheduled-sends.json` on the Railway filesystem. Every redeploy wipes the file, losing all scheduled sends.

## Solution
Add a `xero_scheduled_sends` Postgres table. Replace file read/write in `xero-service.ts` with database queries. The `PgStorage` auto-pushes schema on startup, so the table will be created automatically.

## Files to change (Growth Tools repo)
- `shared/schema.ts` — add `xeroScheduledSends` table + types
- `server/xero-service.ts` — replace file-based methods with DB queries
- `server/storage.ts` — no changes needed (xero-service talks to DB directly, same as rate-limit records)

## Steps

1. In `shared/schema.ts`, add a `xero_scheduled_sends` pgTable after the `coreUpdateApprovalTokens` table with columns: `id` (serial PK), `invoiceId` (text, unique, not null), `sendDate` (text, not null — YYYY-MM-DD format), `description` (text, not null), `createdAt` (text, not null). Export the table, the select type `XeroScheduledSendRow`, and the insert type `InsertXeroScheduledSend`.

2. In `server/xero-service.ts`, replace the file-based scheduled sends methods with database queries: import `db` from `./db.js` and the new `xeroScheduledSends` table from `@shared/schema`. Change `getScheduledSends()` to an async method that selects all rows from the table. Change `scheduleSend()` to async, using an upsert (delete existing by invoiceId + insert). Change `saveScheduledSends()` to a private async method that replaces all rows (used by `processScheduledSends` to remove processed sends). Remove the `SCHEDULED_SENDS_FILE` constant and the `fs` imports for `existsSync`/`readFileSync`/`writeFileSync` (keep any that are still used by token storage). Update `processScheduledSends()` to delete processed rows individually rather than rewriting all remaining rows.

3. In `server/routes.ts`, update the two scheduled-sends route handlers to await the now-async `getScheduledSends()` and `scheduleSend()` calls. The GET handler on line 2403 needs `await xeroService.getScheduledSends()`. The POST schedule-send handler on line 2392 needs `await xeroService.scheduleSend(...)`.

4. In `server/index.ts`, update the scheduler call on line 142 — `processScheduledSends()` is already async and already awaited, so no change needed there.

5. Verify the build passes locally with `npm run check && npm run build`, then commit and push to trigger Railway auto-deploy. The `PgStorage.pushSchema()` will auto-create the `xero_scheduled_sends` table on startup.
