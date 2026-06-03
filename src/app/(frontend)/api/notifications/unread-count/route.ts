import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { reconcileApprovalNotifications } from "@/lib/agent-approval-notifications";

/**
 * GET /api/notifications/unread-count
 *
 * Returns `{ count: number }` for the logged-in user. Used by the
 * NotificationsBell admin top-bar component to drive the red badge.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await reconcileApprovalNotifications(payload);

  const result = await payload.count({
    collection: "notifications" as never,
    where: {
      and: [
        { recipient: { equals: user.id } },
        { readAt: { exists: false } },
      ],
    } as never,
    overrideAccess: true,
  });

  return NextResponse.json({ count: result.totalDocs });
}
