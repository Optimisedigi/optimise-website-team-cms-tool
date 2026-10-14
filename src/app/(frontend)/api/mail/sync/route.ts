import { NextRequest, NextResponse } from "next/server";
import { syncMailbox } from "@/lib/mail/store";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * POST /api/mail/sync
 *
 * Called when Mail opens and on the Refresh button. Incremental Gmail history
 * sync; stores client-matched emails (deduped by Gmail message id). Plain
 * code only: this route never calls a model.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;

  try {
    const result = await syncMailbox({
      payload: ctx.payload,
      userId: ctx.user.id,
      accessToken: token.accessToken,
      userEmail: token.userEmail,
    });
    return NextResponse.json(result);
  } catch (err) {
    return gmailErrorResponse(err, "Mail sync failed.");
  }
}
