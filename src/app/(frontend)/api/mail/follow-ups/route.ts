import { NextRequest, NextResponse } from "next/server";
import { followUpDb, listFollowUps } from "@/lib/mail/follow-ups";
import { requireMailUser } from "@/lib/mail/route-helpers";

/**
 * GET /api/mail/follow-ups
 * The user's open "Remind me if no reply" trackers (waiting or due), soonest
 * reminder first, for the Awaiting reply tab. Read from the CMS only; no
 * Gmail call, so the list still shows when Gmail is disconnected.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const items = await listFollowUps(followUpDb(ctx.payload), ctx.user.id);
  return NextResponse.json({ items, now: new Date().toISOString() });
}
