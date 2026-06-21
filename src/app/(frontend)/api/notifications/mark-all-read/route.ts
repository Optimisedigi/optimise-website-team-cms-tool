import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { reconcileApprovalNotifications } from "@/lib/agent-approval-notifications";

/**
 * POST /api/notifications/mark-all-read
 *
 * Marks every unread notification for the logged-in user as read. Used by
 * the "Mark all read" button in the bell dropdown.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pending approval notifications can be backfilled lazily for older approval
  // rows/users. Materialise those rows before marking read so the red badge does
  // not come back as a synthetic pending-approval count on the next poll/login.
  await reconcileApprovalNotifications(payload);

  // Find all unread for this user, then update individually. Payload's
  // bulk-update helper requires the same filter shape; the safer path is
  // an explicit find + update loop since the volume per user stays tiny.
  const unread = await payload.find({
    collection: "notifications" as never,
    where: {
      and: [
        { recipient: { equals: user.id } },
        { readAt: { exists: false } },
      ],
    } as never,
    limit: 500,
    overrideAccess: true,
    depth: 0,
  });

  const readAt = new Date().toISOString();
  for (const row of unread.docs) {
    await payload.update({
      collection: "notifications" as never,
      id: (row as { id: number | string }).id,
      overrideAccess: true,
      data: { readAt } as never,
    });
  }

  return NextResponse.json({ ok: true, updated: unread.docs.length });
}
