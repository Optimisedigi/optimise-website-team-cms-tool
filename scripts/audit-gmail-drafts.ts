/**
 * Lists recent Gmail drafts with subject and creation time, so a test run's
 * side effects on a real mailbox can be audited and cleaned up.
 *
 * Read-only by default. Pass --delete-ids <id,id,...> to remove specific
 * drafts by draft id (never by subject match, to avoid deleting real work).
 *
 * Usage:
 *   npm run optimate:audit-drafts -- --user 1
 *   npm run optimate:audit-drafts -- --user 1 --since 2026-08-10
 *   npm run optimate:audit-drafts -- --user 1 --delete-ids r123,r456
 */

import { google } from "googleapis";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";

interface DraftRow {
  draftId: string;
  messageId: string;
  subject: string;
  to: string;
  internalDate: number;
  created: string;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const userArg = argv.indexOf("--user");
  const userId = userArg >= 0 ? Number(argv[userArg + 1]) : 1;
  const sinceArg = argv.indexOf("--since");
  const since = sinceArg >= 0 ? new Date(`${argv[sinceArg + 1]}T00:00:00Z`).getTime() : null;
  const deleteArg = argv.indexOf("--delete-ids");
  const deleteIds =
    deleteArg >= 0
      ? String(argv[deleteArg + 1] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const token = await getValidGmailToken(userId);
  if (!token.ok) throw new Error(`Gmail token unavailable: ${token.reason}`);

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token.accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  if (deleteIds.length > 0) {
    console.log(`Deleting ${deleteIds.length} draft(s)...`);
    for (const id of deleteIds) {
      try {
        await gmail.users.drafts.delete({ userId: "me", id });
        console.log(`  deleted ${id}`);
      } catch (error) {
        console.error(`  FAILED ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return;
  }

  const list = await gmail.users.drafts.list({ userId: "me", maxResults: 200 });
  const drafts = list.data.drafts ?? [];
  console.log(`Total drafts in mailbox: ${drafts.length}\n`);

  const rows: DraftRow[] = [];
  for (const draft of drafts) {
    if (!draft.id) continue;
    const full = await gmail.users.drafts.get({
      userId: "me",
      id: draft.id,
      format: "metadata",
    });
    const message = full.data.message;
    const internalDate = Number(message?.internalDate ?? 0);
    if (since && internalDate < since) continue;
    rows.push({
      draftId: draft.id,
      messageId: String(message?.id ?? ""),
      subject: headerValue(message?.payload, "Subject") ?? "(no subject)",
      to: headerValue(message?.payload, "To") ?? "(no recipient)",
      internalDate,
      created: new Date(internalDate).toISOString(),
    });
  }

  rows.sort((a, b) => b.internalDate - a.internalDate);

  console.log(`Showing ${rows.length} draft(s)${since ? ` created since ${argv[sinceArg + 1]}` : ""}:\n`);
  for (const row of rows) {
    console.log(`  ${row.created}  ${row.draftId}`);
    console.log(`     subject: ${row.subject}`);
    console.log(`     to:      ${row.to}`);
  }

  // Group by subject so duplicate report drafts are obvious.
  const bySubject = new Map<string, DraftRow[]>();
  for (const row of rows) {
    const existing = bySubject.get(row.subject) ?? [];
    existing.push(row);
    bySubject.set(row.subject, existing);
  }
  const duplicates = [...bySubject.entries()].filter(([, list]) => list.length > 1);
  if (duplicates.length > 0) {
    console.log(`\nDUPLICATE SUBJECTS (${duplicates.length}):`);
    for (const [subject, list] of duplicates) {
      console.log(`  ${list.length}x  ${subject}`);
      for (const row of list) console.log(`        ${row.created}  ${row.draftId}`);
    }
  }
}

function headerValue(payload: unknown, name: string): string | null {
  const headers = (payload as { headers?: Array<{ name?: string; value?: string }> })?.headers ?? [];
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
