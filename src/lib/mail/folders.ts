/**
 * Folders the Mail view can list. Client-safe: no Gmail API calls, no server
 * imports. Each folder maps to one Gmail system label (see gmail-mail.ts).
 */

export type MailFolder = "inbox" | "sent" | "drafts";

export const MAIL_FOLDERS: readonly MailFolder[] = ["inbox", "sent", "drafts"];

export function parseMailFolder(raw: unknown): MailFolder | null {
  return typeof raw === "string" && (MAIL_FOLDERS as readonly string[]).includes(raw) ? (raw as MailFolder) : null;
}
