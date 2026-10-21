import { NextRequest, NextResponse } from "next/server";
import { getMessageHeaders, listMessageIdsMatching } from "@/lib/mail/gmail-mail";
import { buildMailContacts, type ContactSourceMessage } from "@/lib/mail/contacts";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/** How far back, and how many of each kind of email, the list is built from. */
const LOOKBACK_DAYS = 365;
const MAX_SENT = 150;
const MAX_RECEIVED = 150;

const SENT_QUERY = `in:sent newer_than:${LOOKBACK_DAYS}d`;
// Marketing and account mail lives in Gmail's other tabs; leave it out up front.
const RECEIVED_QUERY =
  `newer_than:${LOOKBACK_DAYS}d -in:sent -in:chats -in:drafts -in:spam -in:trash ` +
  "-category:promotions -category:social -category:updates -category:forums";

/**
 * GET /api/mail/contacts
 * People to suggest in the compose window's To, Cc and Bcc fields, built from
 * the logged-in user's own sent and received Gmail on the account in the
 * request (see lib/mail/contacts.ts for what is left out and the ranking).
 * Reads headers only (From, To, Cc and bulk/auto headers), never bodies, and
 * stores nothing. Never cached, since it is one person's address book.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id, req);
  if (token instanceof NextResponse) return token;
  try {
    const [sentIds, receivedIds] = await Promise.all([
      listMessageIdsMatching(token.accessToken, SENT_QUERY, MAX_SENT),
      listMessageIdsMatching(token.accessToken, RECEIVED_QUERY, MAX_RECEIVED),
    ]);
    const sentSet = new Set(sentIds);
    const headers = await getMessageHeaders(token.accessToken, [...sentIds, ...receivedIds.filter((id) => !sentSet.has(id))]);
    const byId = new Map(headers.map((header) => [header.messageId, header]));
    // Newest first within each list; interleave by list position so recency stays comparable.
    const ordered: ContactSourceMessage[] = [];
    for (let i = 0; i < Math.max(sentIds.length, receivedIds.length); i++) {
      const sent = sentIds[i] ? byId.get(sentIds[i]!) : undefined;
      const received = receivedIds[i] && !sentSet.has(receivedIds[i]!) ? byId.get(receivedIds[i]!) : undefined;
      if (sent) ordered.push({ ...sent, sent: true });
      if (received) ordered.push({ ...received, sent: false });
    }
    const contacts = buildMailContacts(ordered, [token.email, token.userEmail, token.account, ctx.user.email ?? ""]);
    return NextResponse.json({ contacts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return gmailErrorResponse(err, "Could not load your contacts.");
  }
}
