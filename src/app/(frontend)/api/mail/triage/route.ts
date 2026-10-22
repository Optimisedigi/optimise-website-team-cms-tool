import { NextRequest, NextResponse } from "next/server";
import { getMessageSenderSubjects, listMessageIdsMatching } from "@/lib/mail/gmail-mail";
import { hiddenSendersQuery, isHiddenSender, loadHiddenSenders } from "@/lib/mail/hidden-senders";
import { loadClientSenders } from "@/lib/mail/client-senders";
import { loadClientDomainIndex } from "@/lib/mail/store";
import { matchAddress } from "@/lib/mail/client-matching";
import { runMailModel } from "@/lib/mail/run-model";
import { groupBySender, MAX_TRIAGE_MESSAGES, triageSenders } from "@/lib/mail/triage";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

export const maxDuration = 300;

/**
 * POST /api/mail/triage
 *
 * Runs only when the user clicks "Triage unread". Lists the unread inbox
 * (same view as the Mail inbox: own sent mail and hidden senders left out),
 * reads each message's sender and subject only (Gmail metadata, never the
 * body), and asks the model to sort the SENDERS into categories, one line per
 * sender (see triage.ts). Client senders are kept out of the model call.
 *
 * Returns { categories, scanned, truncated, failedBatches }. Changes nothing
 * in Gmail: the user picks what to clear and calls /api/mail/triage/apply.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id, req);
  if (token instanceof NextResponse) return token;

  const [hiddenSenders, clientSenders] = await Promise.all([
    loadHiddenSenders(ctx.payload, ctx.user.id),
    loadClientSenders(ctx.payload, ctx.user.id),
  ]);
  const q = ["in:inbox", "is:unread", "-in:sent", hiddenSendersQuery(hiddenSenders)].filter(Boolean).join(" ");

  let messages;
  let truncated = false;
  try {
    const ids = await listMessageIdsMatching(token.accessToken, q, MAX_TRIAGE_MESSAGES + 1);
    truncated = ids.length > MAX_TRIAGE_MESSAGES;
    messages = await getMessageSenderSubjects(token.accessToken, ids.slice(0, MAX_TRIAGE_MESSAGES));
  } catch (err) {
    return gmailErrorResponse(err, "Could not read your unread emails from Gmail.");
  }

  const index = await loadClientDomainIndex(ctx.payload, [token.email, token.userEmail].filter(Boolean), { userId: ctx.user.id });
  const senders = groupBySender(messages);
  const { categories, failedBatches, batches } = await triageSenders({
    senders,
    isClient: (address) => matchAddress(index, address) !== null || isHiddenSender(address, clientSenders),
    classify: async (request) => (await runMailModel({ payload: ctx.payload, userId: ctx.user.id, request })).text,
  });
  if (batches > 0 && failedBatches === batches) {
    return NextResponse.json({ error: "The AI could not sort your inbox. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ categories, scanned: messages.length, truncated, failedBatches });
}
