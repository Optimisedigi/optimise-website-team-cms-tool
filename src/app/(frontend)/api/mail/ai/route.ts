import { NextRequest, NextResponse } from "next/server";
import { getFullMessage, getThreadMessages } from "@/lib/mail/gmail-mail";
import { buildMailModelRequest, cleanDraftHistory, MailModelRequestError } from "@/lib/mail/model-request";
import { runMailModel } from "@/lib/mail/run-model";
import { extractEmailHeaders } from "@/lib/gmail-draft-parsing";
import { cleanSuggestedSubject, ensureHiGreeting, greetingName } from "@/lib/mail/greeting";
import { gmailErrorResponse, parseGmailId, readJson, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * POST /api/mail/ai
 * Body: { action: "reply", gmailMessageId: string, instruction?: string, history?, currentDraft? }
 *     | { action: "draft", instruction: string, history?, currentDraft?, suggestSubject? }
 *
 * Returns { text, subject?, model }. suggestSubject (new email, first request,
 * empty subject line) also asks for a subject, returned separately. The body
 * always opens with "Hi" (plus the sender's first name for replies).
 *
 * history/currentDraft let the user keep refining the draft (OptiMate-style):
 * earlier instructions + drafts and the draft as currently edited. They are the
 * user's own text; the only mailbox content is still the one selected email.
 *
 * includeThread (reply only, opt-in checkbox): also send the other messages of
 * the selected email's thread. The thread id comes from the selected message as
 * Gmail returns it, never from the request, so no other thread can be pulled in.
 *
 * Runs only when the user clicks "Reply with AI" / "Draft with AI". For a
 * reply, the server fetches exactly the one selected message by id; nothing
 * else from the mailbox is loaded or sent. Returns editable text. Never sends.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson<{
    action?: unknown;
    gmailMessageId?: unknown;
    instruction?: unknown;
    history?: unknown;
    currentDraft?: unknown;
    includeThread?: unknown;
    suggestSubject?: unknown;
  }>(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const action = body.action === "reply" || body.action === "draft" ? body.action : null;
  if (!action) return NextResponse.json({ error: "action must be reply or draft." }, { status: 400 });
  const instruction = typeof body.instruction === "string" ? body.instruction : "";
  const history = cleanDraftHistory(body.history);
  const currentDraft = typeof body.currentDraft === "string" ? body.currentDraft : "";

  let request;
  // First name for the "Hi <name>," greeting: the person being replied to.
  let name = "";
  try {
    if (action === "draft") {
      if (body.gmailMessageId !== undefined && body.gmailMessageId !== null && body.gmailMessageId !== "") {
        return NextResponse.json({ error: "A new draft does not take an email." }, { status: 400 });
      }
      request = buildMailModelRequest({
        action: "draft",
        instruction,
        history,
        currentDraft,
        suggestSubject: body.suggestSubject === true,
      });
    } else {
      const gmailMessageId = parseGmailId(body.gmailMessageId);
      if (!gmailMessageId) {
        return NextResponse.json({ error: "Select exactly one email to reply to." }, { status: 400 });
      }
      const token = await requireGmailToken(ctx.user.id);
      if (token instanceof NextResponse) return token;
      let message;
      let thread: Awaited<ReturnType<typeof getThreadMessages>> | null = null;
      try {
        message = await getFullMessage(token.accessToken, gmailMessageId);
        if (body.includeThread === true && message.threadId) {
          thread = await getThreadMessages(token.accessToken, message.threadId);
        }
      } catch (err) {
        return gmailErrorResponse(err, "Could not load that email from Gmail.");
      }
      // Replying to our own sent message goes to its recipient, so greet them instead.
      const own = [token.email, token.userEmail].filter(Boolean).map((address) => address.toLowerCase());
      const fromOwn = own.some((address) => message.from.toLowerCase().includes(address));
      name = greetingName(fromOwn ? message.to : message.from);
      const toModelEmail = (m: typeof message) => ({
        gmailMessageId: m.messageId,
        from: m.from,
        to: m.to,
        cc: m.cc,
        subject: m.subject,
        date: m.date,
        body: m.body,
      });
      request = buildMailModelRequest({
        action: "reply",
        instruction,
        history,
        currentDraft,
        email: toModelEmail(message),
        thread: thread ? thread.filter((m) => m.threadId === message.threadId).map(toModelEmail) : null,
      });
    }
  } catch (err) {
    if (err instanceof MailModelRequestError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const result = await runMailModel({ payload: ctx.payload, userId: ctx.user.id, request });
    let text = result.text;
    let subject = "";
    if (request.suggestSubject) {
      const headers = extractEmailHeaders(text.replace(/^\s+/, ""));
      subject = cleanSuggestedSubject(headers.subject);
      if (headers.subject !== undefined) text = headers.body;
    }
    text = ensureHiGreeting(text, name);
    return NextResponse.json({ text, ...(subject ? { subject } : {}), model: result.model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed.";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
