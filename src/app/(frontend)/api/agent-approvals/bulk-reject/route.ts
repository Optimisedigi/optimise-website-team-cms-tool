import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { markRejected } from "@/lib/agents/_shared/approval-queue";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "No approval ids supplied" }, { status: 400 });
    }

    const reviewerName =
      (user as { name?: string; email?: string }).name ||
      (user as { email?: string }).email ||
      `User #${user.id}`;
    let rejected = 0;
    const failed: Array<{ id: number; error: string }> = [];

    for (const id of ids) {
      try {
        const row = (await payload.findByID({
          collection: "agent-approval-queue" as never,
          id,
          depth: 0,
          overrideAccess: true,
        })) as { title?: string; client?: number | string | null; status?: string };

        if (row.status !== "pending") continue;
        await markRejected(id, user.id as number);
        rejected++;

        try {
          await logActivity(payload, {
            type: "agent_approval_rejected",
            title: `${reviewerName} bulk rejected: ${row.title ?? `agent approval #${id}`}`,
            description: `Agent approval #${id} rejected in bulk.`,
            user: user.id as number,
            ...(row.client !== undefined && row.client !== null ? { client: row.client } : {}),
          });
        } catch (logErr) {
          console.error("[agent-approvals/bulk-reject] activity log failed:", logErr);
        }
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : "Failed to reject" });
      }
    }

    return NextResponse.json({ ok: failed.length === 0, rejected, failed });
  } catch (err) {
    console.error("[agent-approvals/bulk-reject] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reject approvals" },
      { status: 500 },
    );
  }
}
