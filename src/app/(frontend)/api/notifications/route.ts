import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { reconcileApprovalNotifications } from "@/lib/agent-approval-notifications";

/**
 * GET /api/notifications
 *
 * Returns the logged-in user's notifications, newest first. Default page
 * size 20; pass `?limit=N&page=M` to paginate.
 *
 * The bell dropdown only ever needs the top ~10 unread; this endpoint
 * powers that as well as any future full notifications page.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await reconcileApprovalNotifications(payload);

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";

  const where: Record<string, unknown> = {
    and: [
      { recipient: { equals: user.id } },
      ...(unreadOnly ? [{ readAt: { exists: false } }] : []),
    ],
  };

  const result = await payload.find({
    collection: "notifications" as never,
    where: where as never,
    limit,
    page,
    sort: "-createdAt",
    overrideAccess: true,
    depth: 0,
  });

  return NextResponse.json({
    docs: result.docs,
    totalDocs: result.totalDocs,
    page: result.page,
    totalPages: result.totalPages,
  });
}
