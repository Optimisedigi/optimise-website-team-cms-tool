import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * POST /api/notifications/[id]/mark-read
 *
 * Flips `readAt` to now on a single notification. The recipient check
 * happens via the collection's `update` access — non-admin users cannot
 * mark someone else's notifications as read.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const cfg = await config;
  const payload = await getPayload({ config: cfg });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Older approval rows can appear in the bell as synthetic fallback IDs until
  // notification fan-out/reconciliation has materialised them. Make those
  // dismissible by creating/updating the current user's real notification row.
  if (id.startsWith("approval-")) {
    const approvalId = id.slice("approval-".length);
    if (!approvalId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await payload.find({
      collection: "notifications" as never,
      where: {
        and: [
          { recipient: { equals: user.id } },
          { kind: { equals: "agent-approval-pending" } },
          { relatedApproval: { equals: approvalId } },
        ],
      } as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const readAt = new Date().toISOString();
    const existingRow = existing.docs[0] as { id: number | string } | undefined;
    if (existingRow) {
      await payload.update({
        collection: "notifications" as never,
        id: existingRow.id,
        overrideAccess: true,
        data: { readAt } as never,
      });
      return NextResponse.json({ ok: true });
    }

    let approval: { title?: string; agentName?: string };
    try {
      approval = (await payload.findByID({
        collection: "agent-approval-queue" as never,
        id: approvalId as never,
        depth: 0,
        overrideAccess: true,
      })) as unknown as { title?: string; agentName?: string };
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const title = String(approval.title ?? "Agent approval");
    await payload.create({
      collection: "notifications" as never,
      overrideAccess: true,
      data: {
        recipient: user.id,
        kind: "agent-approval-pending",
        title: `Approval needed: ${title}`,
        body: String(approval.agentName ?? "OptiMate"),
        url: `/admin/agent-approvals/${approvalId}`,
        relatedApproval: approvalId,
        readAt,
      } as never,
    });
    return NextResponse.json({ ok: true });
  }

  // Load with overrideAccess so we can verify ownership ourselves.
  let row: { recipient?: number | string | { id: number | string } } | null;
  try {
    row = (await payload.findByID({
      collection: "notifications" as never,
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { recipient?: number | string | { id: number | string } };
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recipientId =
    typeof row?.recipient === "object" ? row.recipient.id : row?.recipient;
  const isAdmin = (user as { role?: string }).role === "admin";
  if (!isAdmin && recipientId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await payload.update({
    collection: "notifications" as never,
    id,
    overrideAccess: true,
    data: { readAt: new Date().toISOString() } as never,
  });

  return NextResponse.json({ ok: true });
}
