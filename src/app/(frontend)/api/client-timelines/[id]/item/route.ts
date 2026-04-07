import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * PATCH /api/client-timelines/[id]/item
 *
 * Updates a single item's status and/or approval status within a phase.
 *
 * Body: { phaseIndex: number, itemId: string, itemStatus?: string, approvalStatus?: string }
 *
 * Auth: Payload session OR x-api-key matching AUDIT_API_KEY.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await getPayload({ config });
    const apiKey = req.headers.get("x-api-key");
    const { user } = await payload.auth({ headers: req.headers });

    if (!user && (!apiKey || apiKey !== process.env.AUDIT_API_KEY)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { phaseIndex, itemId, itemStatus, approvalStatus } = body;

    if (phaseIndex === undefined || !itemId) {
      return NextResponse.json(
        { error: "Missing phaseIndex or itemId" },
        { status: 400 },
      );
    }

    // Use raw SQL to update the item directly in the nested items table
    // (dot-path updates don't work reliably for items stored in separate tables)
    const dbClient = (payload as any).db?.client;
    if (!dbClient?.execute) {
      return NextResponse.json(
        { error: "No SQL client available" },
        { status: 500 },
      );
    }

    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const args: any[] = [];

    if (itemStatus !== undefined) {
      setClauses.push("`item_status` = ?");
      args.push(itemStatus);
      if (itemStatus === "completed") {
        setClauses.push("`completed_at` = ?");
        args.push(now);
        setClauses.push("`completed_by_id` = ?");
        args.push(user?.id ?? null);
      }
    }

    if (approvalStatus !== undefined) {
      setClauses.push("`approval_status` = ?");
      args.push(approvalStatus);
      if (approvalStatus === "approved") {
        setClauses.push("`client_approved_at` = ?");
        args.push(now);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Update the item row directly
    await dbClient.execute(
      `UPDATE \`client_timelines_phases_items\` SET ${setClauses.join(", ")} WHERE \`id\` = ?`,
      [...args, itemId],
    );

    // Recompute overallStatus
    const phasesResult = await payload.findByID({
      collection: "client-timelines" as any,
      id,
      depth: 0,
      overrideAccess: true,
    });

    const phases = (phasesResult.phases as any[]) ?? [];
    const allDone =
      phases.length > 0 &&
      phases.every((p: any) =>
        (p.items as any[]).every(
          (it) => it.itemStatus === "completed" || it.itemStatus === "skipped",
        ),
      );
    const anyActive =
      phases.some((p: any) =>
        (p.items as any[]).some(
          (it) =>
            it.itemStatus === "in_progress" ||
            (itemStatus && it.id === itemId && itemStatus === "in_progress"),
        ),
      );

    let newOverallStatus: string | null = null;
    if (itemStatus === "completed") {
      newOverallStatus = allDone ? "completed" : "in_progress";
    } else if (itemStatus === "in_progress") {
      newOverallStatus = "in_progress";
    }

    if (newOverallStatus) {
      await dbClient.execute(
        `UPDATE \`client_timelines\` SET \`overall_status\` = ? WHERE \`id\` = ?`,
        [newOverallStatus, id],
      );
    }

    const updated = await payload.findByID({
      collection: "client-timelines" as any,
      id,
      depth: 2,
      overrideAccess: true,
    });

    return NextResponse.json({ success: true, doc: updated });
  } catch (err) {
    console.error("[client-timelines/item] Error:", err);
    return NextResponse.json(
      { error: "Failed to update item", details: String(err) },
      { status: 500 },
    );
  }
}
