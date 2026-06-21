import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

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

  const [unreadNotifications, userApprovalNotifications, pendingApprovals] = await Promise.all([
    payload.find({
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
      select: {
        id: true,
      } as never,
    }),
    payload.find({
      collection: "notifications" as never,
      where: {
        and: [
          { recipient: { equals: user.id } },
          { kind: { equals: "agent-approval-pending" } },
          { relatedApproval: { exists: true } },
        ],
      } as never,
      limit: 500,
      depth: 0,
      overrideAccess: true,
      select: {
        id: true,
        readAt: true,
        relatedApproval: true,
      } as never,
    }),
    payload.find({
      collection: "agent-approval-queue" as never,
      where: { status: { equals: "pending" } } as never,
      limit: 200,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: {
        id: true,
      } as never,
    }),
  ]);

  const visibleApprovalIds = new Set(
    (userApprovalNotifications.docs as Array<Record<string, unknown>>)
      .filter((doc) => !doc.readAt)
      .map((doc) => {
        const related = doc.relatedApproval;
        if (typeof related === "object" && related && "id" in related) return String(related.id);
        return related == null ? null : String(related);
      })
      .filter((value): value is string => Boolean(value)),
  );
  const dismissedApprovalIds = new Set(
    (userApprovalNotifications.docs as Array<Record<string, unknown>>)
      .filter((doc) => Boolean(doc.readAt))
      .map((doc) => {
        const related = doc.relatedApproval;
        if (typeof related === "object" && related && "id" in related) return String(related.id);
        return related == null ? null : String(related);
      })
      .filter((value): value is string => Boolean(value)),
  );

  const syntheticPendingCount = (pendingApprovals.docs as Array<Record<string, unknown>>).filter((approval) => {
    const id = String(approval.id);
    return !visibleApprovalIds.has(id) && !dismissedApprovalIds.has(id);
  }).length;

  return NextResponse.json({ count: unreadNotifications.totalDocs + syntheticPendingCount });
}
