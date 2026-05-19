import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { markApproved } from "@/lib/agents/_shared/approval-queue";
import { isAdmin } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Admin-only: approving an agent proposal is the gate that lets the
    // matching /apply route push live changes. Keep both behind the same
    // role check so a non-admin can't approve and then ask an admin to
    // "just press apply" without re-reviewing.
    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: "Forbidden: admin role required to approve agent proposals." },
        { status: 403 },
      );
    }

    const { id } = await params;
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
    }

    await markApproved(numericId, user.id as number);

    // Activity-log breadcrumb so the team timeline shows who actioned this
    // queue item (separate from the bell-clearing fan-out side-effect).
    try {
      const reviewerName =
        (user as { name?: string; email?: string }).name ||
        (user as { email?: string }).email ||
        `User #${user.id}`;
      const row = (await payload.findByID({
        collection: "agent-approval-queue" as never,
        id: numericId,
        depth: 0,
        overrideAccess: true,
      })) as { title?: string; client?: number | string | null };
      await logActivity(payload, {
        type: "agent_approval_approved",
        title: `${reviewerName} approved: ${row.title ?? `agent approval #${numericId}`}`,
        description: `Agent approval #${numericId} approved.`,
        user: user.id as number,
        ...(row.client !== undefined && row.client !== null
          ? { client: row.client }
          : {}),
      });
    } catch (logErr) {
      console.error("[agent-approvals/approve] activity log failed:", logErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent-approvals/approve] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to approve" },
      { status: 500 },
    );
  }
}
