import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const RESOLVED_APPROVAL_STATUSES = new Set(["approved", "rejected", "applied", "failed"]);

function approvalNotificationTitlePrefix(status: unknown): string {
  switch (status) {
    case "pending":
      return "Approval needed";
    case "approved":
      return "Approval approved";
    case "rejected":
      return "Approval rejected";
    case "applied":
      return "Approval applied";
    case "failed":
      return "Approval failed";
    default:
      return "Approval resolved";
  }
}

function approvalToNotificationDoc(approval: Record<string, unknown>) {
  const id = String(approval.id);
  const status = String(approval.status ?? "pending");
  const title = String(approval.title ?? "Agent approval");
  const createdAt = typeof approval.updatedAt === "string"
    ? approval.updatedAt
    : typeof approval.createdAt === "string"
      ? approval.createdAt
      : new Date().toISOString();
  return {
    id: `approval-${id}`,
    kind: "agent-approval-pending",
    title: `${approvalNotificationTitlePrefix(status)}: ${title}`,
    body: String(approval.agentName ?? "OptiMate"),
    url: `/admin/agent-approvals/${id}`,
    readAt: RESOLVED_APPROVAL_STATUSES.has(status) ? createdAt : null,
    createdAt,
  };
}

function approvalActivityToNotificationDoc(row: Record<string, unknown>) {
  const id = String(row.id);
  const type = String(row.type ?? "");
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString();
  const title = String(row.title ?? "Agent Approval");
  const description = typeof row.description === "string" ? row.description : null;
  return {
    id: `activity-${id}`,
    kind: "agent-approval-pending",
    title: type === "agent_approval_rejected" ? "Approval rejected" : "Approval approved",
    body: description || title,
    url: "/admin/agent-approvals",
    readAt: createdAt,
    createdAt,
  };
}

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

  const [approvalRows, approvalActivityRows, notificationResult] = await Promise.all([
    payload.find({
      collection: "agent-approval-queue" as never,
      where: {
        or: [
          { status: { equals: "pending" } },
          { status: { equals: "approved" } },
          { status: { equals: "rejected" } },
          { status: { equals: "applied" } },
          { status: { equals: "failed" } },
        ],
      } as never,
      limit: 10,
      sort: "-updatedAt",
      overrideAccess: true,
      depth: 0,
      pagination: false,
      select: {
        id: true,
        status: true,
        title: true,
        agentName: true,
        createdAt: true,
        updatedAt: true,
      } as never,
    }),
    payload.find({
      collection: "activity-log" as never,
      where: {
        or: [
          { type: { equals: "agent_approval_approved" } },
          { type: { equals: "agent_approval_rejected" } },
        ],
      } as never,
      limit: 10,
      sort: "-createdAt",
      overrideAccess: true,
      depth: 0,
      pagination: false,
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        createdAt: true,
      } as never,
    }),
    payload.find({
      collection: "notifications" as never,
      where: where as never,
      limit,
      page,
      sort: "-createdAt",
      overrideAccess: true,
      depth: 0,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        url: true,
        readAt: true,
        createdAt: true,
        relatedApproval: true,
      } as never,
    }).catch((err: unknown) => {
      payload.logger?.error?.({
        msg: "notifications find failed; returning approval fallback rows",
        error: err instanceof Error ? err.message : String(err),
      });
      return { docs: [], totalDocs: 0, totalPages: 1 };
    }),
  ]);

  const notificationDocs = notificationResult.docs as Array<Record<string, unknown>>;
  const totalDocs = notificationResult.totalDocs ?? notificationDocs.length;
  const totalPages = notificationResult.totalPages ?? 1;
  const existingApprovalIds = new Set(
    notificationDocs
      .map((doc) => {
        const related = doc.relatedApproval;
        if (typeof related === "object" && related && "id" in related) return String(related.id);
        return related == null ? null : String(related);
      })
      .filter((value): value is string => Boolean(value)),
  );
  const syntheticApprovalDocs = (approvalRows.docs as Array<Record<string, unknown>>)
    .filter((approval) => !existingApprovalIds.has(String(approval.id)))
    .map(approvalToNotificationDoc);
  const syntheticActivityDocs = (approvalActivityRows.docs as Array<Record<string, unknown>>).map(
    approvalActivityToNotificationDoc,
  );
  const seenIds = new Set<string>();
  const docs = [...notificationDocs, ...syntheticApprovalDocs, ...syntheticActivityDocs]
    .filter((doc) => !unreadOnly || !doc.readAt)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .filter((doc) => {
      const id = String(doc.id);
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    })
    .slice(0, limit);

  return NextResponse.json({
    docs,
    totalDocs: Math.max(totalDocs, docs.length),
    page,
    totalPages,
  });
}
