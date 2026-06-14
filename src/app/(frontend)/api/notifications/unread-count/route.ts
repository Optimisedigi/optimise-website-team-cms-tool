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

  const unreadNotifications = await payload.find({
    collection: "notifications" as never,
    where: {
      and: [
        { recipient: { equals: user.id } },
        { readAt: { exists: false } },
      ],
    } as never,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const countedApprovalIds = new Set(
    (unreadNotifications.docs as Array<Record<string, unknown>>)
      .map((doc) => {
        const related = doc.relatedApproval;
        if (typeof related === "object" && related && "id" in related) return String(related.id);
        return related == null ? null : String(related);
      })
      .filter((value): value is string => Boolean(value)),
  );

  const pendingApprovals = await payload.find({
    collection: "agent-approval-queue" as never,
    where: { status: { equals: "pending" } } as never,
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });
  const syntheticPendingCount = (pendingApprovals.docs as Array<Record<string, unknown>>).filter(
    (approval) => !countedApprovalIds.has(String(approval.id)),
  ).length;

  return NextResponse.json({ count: unreadNotifications.totalDocs + syntheticPendingCount });
}
