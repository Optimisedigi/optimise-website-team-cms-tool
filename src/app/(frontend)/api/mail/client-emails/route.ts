import { NextRequest, NextResponse } from "next/server";
import { requireMailUser } from "@/lib/mail/route-helpers";

/**
 * GET /api/mail/client-emails?clientId=123
 *
 * The client's saved emails and confirmed email summaries, for the client
 * profile's Emails tab. Read from the CMS database only (no Gmail, no model).
 * Collection access limits non-admins to emails from their own mailbox.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const clientId = Number(req.nextUrl.searchParams.get("clientId"));
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  const [emails, summaries] = await Promise.all([
    ctx.payload.find({
      collection: "client-emails",
      where: { client: { equals: clientId } },
      sort: "-date",
      limit: 200,
      depth: 0,
      overrideAccess: false,
      user: ctx.user,
      select: {
        gmailMessageId: true, gmailThreadId: true, direction: true, matchedBy: true, matchedOn: true,
        from: true, to: true, cc: true, subject: true, date: true, body: true, gmailLink: true,
      },
    } as never),
    ctx.payload.find({
      collection: "client-email-summaries",
      where: { client: { equals: clientId } },
      sort: "-emailDate",
      limit: 200,
      depth: 0,
      overrideAccess: false,
      user: ctx.user,
    } as never),
  ]);

  return NextResponse.json({
    emails: (emails as { docs: unknown[] }).docs,
    summaries: (summaries as { docs: unknown[] }).docs,
  });
}
