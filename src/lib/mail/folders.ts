/**
 * Folders the Mail view can list. Client-safe: no Gmail API calls, no server
 * imports. Each folder maps to one Gmail system label (see gmail-mail.ts).
 */

export type MailFolder = "inbox" | "sent" | "drafts";

export const MAIL_FOLDERS: readonly MailFolder[] = ["inbox", "sent", "drafts"];

export function parseMailFolder(raw: unknown): MailFolder | null {
  return typeof raw === "string" && (MAIL_FOLDERS as readonly string[]).includes(raw) ? (raw as MailFolder) : null;
}

/** Tabs in the Mail view: the Gmail folders plus the CMS-held Scheduled queue. */
export type MailTab = MailFolder | "scheduled";

export const MAIL_TABS: readonly MailTab[] = ["inbox", "sent", "drafts", "scheduled"];

const TAB_LABELS: Record<MailTab, string> = { inbox: "Inbox", sent: "Sent", drafts: "Drafts", scheduled: "Scheduled" };

export interface MailTabCounts {
  /** Unread Inbox threads. */
  inboxUnread: number;
  /** Draft threads. */
  drafts: number;
}

/**
 * Tab text with its badge, e.g. "Inbox (3)". Only Inbox (unread) and Drafts
 * carry a count, and a zero or unknown count shows no badge, like Gmail.
 * Sent and Scheduled never do.
 */
export function mailTabLabel(tab: MailTab, counts: MailTabCounts | null): string {
  const count = tab === "inbox" ? counts?.inboxUnread : tab === "drafts" ? counts?.drafts : undefined;
  return typeof count === "number" && Number.isFinite(count) && count > 0 ? `${TAB_LABELS[tab]} (${Math.floor(count)})` : TAB_LABELS[tab];
}
