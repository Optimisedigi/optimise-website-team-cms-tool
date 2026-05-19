import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { markRejected } from "@/lib/agents/_shared/approval-queue";
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

    const { id } = await params;
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
    }

    await markRejected(numericId, user.id as number);

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
        type: "agent_approval_rejected",
        title: `${reviewerName} rejected: ${row.title ?? `agent approval #${numericId}`}`,
        description: `Agent approval #${numericId} rejected.`,
        user: user.id as number,
        ...(row.client !== undefined && row.client !== null
          ? { client: row.client }
          : {}),
      });
    } catch (logErr) {
      console.error("[agent-approvals/reject] activity log failed:", logErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent-approvals/reject] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to reject" },
      { status: 500 },
    );
  }
}
