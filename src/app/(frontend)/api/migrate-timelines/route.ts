import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * POST /api/migrate-timelines
 *
 * One-off migration: reads all records from the old client_timelines table
 * and creates corresponding Client Processes with all items as client-visible steps.
 *
 * Auth: x-api-key matching AUDIT_API_KEY.
 *
 * DELETE THIS ROUTE after migration is complete.
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.AUDIT_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await getPayload({ config });
    const client = (payload.db as any).client;

    if (!client) {
      return NextResponse.json({ error: "No LibSQL client" }, { status: 500 });
    }

    // 1. Read all client timelines
    const timelines = await client.execute(
      "SELECT * FROM client_timelines ORDER BY id",
    );

    if (!timelines.rows || timelines.rows.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No client timelines found to migrate",
        migrated: [],
      });
    }

    const migrated: any[] = [];

    for (const tl of timelines.rows) {
      const tlId = tl.id;
      const title = tl.title ?? "Untitled Timeline";
      const clientId = tl.client_id;
      const serviceType = tl.service_type;
      const overallStatus = tl.overall_status ?? "not_started";
      const startDate = tl.start_date;
      const endDate = tl.end_date;
      const lastSharedAt = tl.last_shared_at;
      const sharedCount = tl.shared_count ?? 0;

      // 2. Read phases for this timeline
      const phasesResult = await client.execute({
        sql: "SELECT * FROM client_timelines_phases WHERE _parent_id = ? ORDER BY _order",
        args: [tlId],
      });

      const phases: any[] = [];

      for (const phase of phasesResult.rows || []) {
        // 3. Read items for this phase
        const itemsResult = await client.execute({
          sql: "SELECT * FROM client_timelines_phases_items WHERE _parent_id = ? ORDER BY _order",
          args: [phase.id],
        });

        const steps = (itemsResult.rows || []).map((item: any, idx: number) => ({
          stepName: item.item_name ?? "Untitled",
          stepOrder: idx + 1,
          stepDescription: item.item_description ?? undefined,
          stepType: "action" as const,
          stepStatus: item.item_status ?? "not_started",
          completedAt: item.completed_at ?? undefined,
          completedBy: item.completed_by_id ?? undefined,
          estimatedHours: item.estimated_hours ?? undefined,
          requiredBeforeNext: false,
          clientVisible: true,
          clientLabel: undefined,
          requiresApproval: item.requires_approval ? true : false,
          approvalStatus: item.approval_status ?? "not_needed",
          clientApprovedAt: item.client_approved_at ?? undefined,
          internalNotes: item.internal_notes ?? undefined,
        }));

        phases.push({
          phaseName: phase.phase_name ?? "Untitled Phase",
          phaseOrder: (phase.phase_order as number) ?? phases.length + 1,
          phaseDescription: phase.phase_description ?? undefined,
          weekRange: phase.week_range ?? undefined,
          phaseStatus:
            steps.every((s: any) => s.stepStatus === "completed" || s.stepStatus === "skipped")
              ? "completed"
              : steps.some((s: any) => s.stepStatus === "in_progress" || s.stepStatus === "completed")
                ? "in_progress"
                : "not_started",
          steps,
        });
      }

      // 4. Map serviceType to retainerType
      const serviceToRetainer: Record<string, string> = {
        google_ads: "google_ads_only",
        seo: "seo_only",
        meta_ads: "meta_ads_only",
        cro: "custom",
        general: "custom",
      };

      // 5. Create the Client Process
      const processData: Record<string, any> = {
        processTitle: title,
        retainerType: serviceToRetainer[serviceType] ?? "custom",
        overallStatus:
          overallStatus === "completed"
            ? "completed"
            : overallStatus === "in_progress"
              ? "in_progress"
              : overallStatus === "on_hold"
                ? "on_hold"
                : "not_started",
        phases,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        lastSharedAt: lastSharedAt ?? undefined,
        sharedCount: sharedCount ?? 0,
        timeline: [
          {
            action: `Migrated from Client Timeline #${tlId}`,
            performedAt: new Date().toISOString(),
            notes: `Original service type: ${serviceType}`,
          },
        ],
      };

      if (clientId) processData.client = clientId;

      const doc = await payload.create({
        collection: "client-processes" as any,
        data: processData as any,
        overrideAccess: true,
      });

      migrated.push({
        oldTimelineId: tlId,
        oldTitle: title,
        newProcessId: doc.id,
        newProcessTitle: (doc as any).processTitle,
        clientId,
        phaseCount: phases.length,
        stepCount: phases.reduce((s: number, p: any) => s + p.steps.length, 0),
      });
    }

    return NextResponse.json({
      ok: true,
      message: `Migrated ${migrated.length} timeline(s) to client processes`,
      migrated,
    });
  } catch (err) {
    console.error("[migrate-timelines] Error:", err);
    return NextResponse.json(
      { error: "Migration failed", details: String(err) },
      { status: 500 },
    );
  }
}
