import { NextRequest, NextResponse } from "next/server";
import { getFullMessage } from "@/lib/mail/gmail-mail";
import { buildMailModelRequest, MailModelRequestError } from "@/lib/mail/model-request";
import { runMailModel } from "@/lib/mail/run-model";
import { gmailErrorResponse, parseGmailId, readJson, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * POST /api/mail/ai
 * Body: { action: "reply", gmailMessageId: string, instruction?: string }
 *     | { action: "draft", instruction: string }
 *
 * Runs only when the user clicks "Reply with AI" / "Draft with AI". For a
 * reply, the server fetches exactly the one selected message by id; nothing
 * else from the mailbox is loaded or sent. Returns editable text. Never sends.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson<{ action?: unknown; gmailMessageId?: unknown; instruction?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const action = body.action === "reply" || body.action === "draft" ? body.action : null;
  if (!action) return NextResponse.json({ error: "action must be reply or draft." }, { status: 400 });
  const instruction = typeof body.instruction === "string" ? body.instruction : "";

  let request;
  try {
    if (action === "draft") {
      if (body.gmailMessageId !== undefined && body.gmailMessageId !== null && body.gmailMessageId !== "") {
        return NextResponse.json({ error: "A new draft does not take an email." }, { status: 400 });
      }
      request = buildMailModelRequest({ action: "draft", instruction });
    } else {
      const gmailMessageId = parseGmailId(body.gmailMessageId);
      if (!gmailMessageId) {
        return NextResponse.json({ error: "Select exactly one email to reply to." }, { status: 400 });
      }
      const token = await requireGmailToken(ctx.user.id);
      if (token instanceof NextResponse) return token;
      let message;
      try {
        message = await getFullMessage(token.accessToken, gmailMessageId);
      } catch (err) {
        return gmailErrorResponse(err, "Could not load that email from Gmail.");
      }
      request = buildMailModelRequest({
        action: "reply",
        instruction,
        email: {
          gmailMessageId: message.messageId,
          from: message.from,
          to: message.to,
          cc: message.cc,
          subject: message.subject,
          date: message.date,
          body: message.body,
        },
      });
    }
  } catch (err) {
    if (err instanceof MailModelRequestError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const result = await runMailModel({ payload: ctx.payload, userId: ctx.user.id, request });
    return NextResponse.json({ text: result.text, model: result.model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed.";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
