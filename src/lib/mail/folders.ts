/**
 * Folders the Mail view can list. Client-safe: no Gmail API calls, no server
 * imports. Each folder maps to one Gmail system label (see gmail-mail.ts).
 */

export type MailFolder = "inbox" | "sent" | "drafts";

export const MAIL_FOLDERS: readonly MailFolder[] = ["inbox", "sent", "drafts"];

export function parseMailFolder(raw: unknown): MailFolder | null {
  return typeof raw === "string" && (MAIL_FOLDERS as readonly string[]).includes(raw) ? (raw as MailFolder) : null;
}

/**
 * Tabs in the Mail view: the Gmail folders plus the CMS-held Scheduled queue
 * and Awaiting reply (sent emails with a follow-up reminder).
 */
export type MailTab = MailFolder | "scheduled" | "awaiting";

export const MAIL_TABS: readonly MailTab[] = ["inbox", "sent", "drafts", "scheduled", "awaiting"];

const TAB_LABELS: Record<MailTab, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  scheduled: "Scheduled",
  awaiting: "Awaiting reply",
};

export interface MailTabCounts {
  /** Unread Inbox threads. */
  inboxUnread: number;
  /** Draft threads. */
  drafts: number;
  /** Emails waiting in the Scheduled queue. */
  scheduled?: number;
  /** Follow-up reminders whose time has come with no reply. */
  followUpsDue?: number;
}

/**
 * Tab text with its badge, e.g. "Inbox (3)". Inbox (unread), Drafts,
 * Scheduled (waiting to send) and Awaiting reply (reminders due) carry a
 * count, and a zero or unknown count shows no badge, like Gmail. Sent never does.
 */
export function mailTabLabel(tab: MailTab, counts: MailTabCounts | null): string {
  const byTab: Partial<Record<MailTab, number | undefined>> = {
    inbox: counts?.inboxUnread,
    drafts: counts?.drafts,
    scheduled: counts?.scheduled,
    awaiting: counts?.followUpsDue,
  };
  const count = byTab[tab];
  return typeof count === "number" && Number.isFinite(count) && count > 0 ? `${TAB_LABELS[tab]} (${Math.floor(count)})` : TAB_LABELS[tab];
}

/**
 * Unread threads first, otherwise keeping Gmail's newest-first order (stable).
 * Applied when a list loads, not when a thread is opened, so a row that was
 * just read stays where it is until the next refresh.
 */
export function unreadFirst<T extends { unread: boolean }>(threads: readonly T[]): T[] {
  return [...threads.filter((thread) => thread.unread), ...threads.filter((thread) => !thread.unread)];
}
