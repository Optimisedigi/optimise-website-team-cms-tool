import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

const VALID_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "skipped",
  "blocked",
] as const;

/**
 * PATCH /api/client-processes/[id]/step
 *
 * Updates a specific step within a client process phase.
 * Auto-computes phase status, overall status, current phase,
 * completion percentage, and adds timeline entries.
 *
 * Auth: Payload session OR x-api-key matching AUDIT_API_KEY.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await getPayload({ config });

    // Auth: require Payload session or API key
    const apiKey = req.headers.get("x-api-key");
    const { user } = await payload.auth({ headers: req.headers });

    if (!user && (!apiKey || apiKey !== process.env.AUDIT_API_KEY)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      phaseIndex,
      stepIndex,
      status,
      actualNotes,
      outcome,
      emailDraft,
      emailSentAt,
      isBlocked,
      blockedReason,
      assignedToId,
      approvalStatus,
      estimatedHours,
    } = body;

    // Validate required fields
    if (phaseIndex == null || typeof phaseIndex !== "number") {
      return NextResponse.json(
        { error: "Missing or invalid required field: phaseIndex" },
        { status: 400 },
      );
    }
    if (stepIndex == null || typeof stepIndex !== "number") {
      return NextResponse.json(
        { error: "Missing or invalid required field: stepIndex" },
        { status: 400 },
      );
    }

    // Validate status if provided
    if (
      status !== undefined &&
      !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])
    ) {
      return NextResponse.json(
        {
          error: `Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // 1. Fetch the client process
    let doc: any;
    try {
      doc = await payload.findByID({
        collection: "client-processes" as any,
        id,
        overrideAccess: true,
      });
    } catch {
      return NextResponse.json(
        { error: "Client process not found" },
        { status: 404 },
      );
    }

    const phases: any[] = doc.phases || [];

    // 2. Validate bounds
    if (phaseIndex < 0 || phaseIndex >= phases.length) {
      return NextResponse.json(
        {
          error: `phaseIndex ${phaseIndex} out of bounds (0-${phases.length - 1})`,
        },
        { status: 400 },
      );
    }

    const phase = phases[phaseIndex];
    const steps: any[] = phase.steps || [];

    if (stepIndex < 0 || stepIndex >= steps.length) {
      return NextResponse.json(
        {
          error: `stepIndex ${stepIndex} out of bounds (0-${steps.length - 1})`,
        },
        { status: 400 },
      );
    }

    const step = steps[stepIndex];
    const previousStatus = step.stepStatus;
    const now = new Date().toISOString();

    // 3. Update the specific step with provided fields
    if (status !== undefined) step.stepStatus = status;
    if (actualNotes !== undefined) step.notes = actualNotes;
    if (outcome !== undefined) step.outcome = outcome;
    if (emailDraft !== undefined) step.emailDraft = emailDraft;
    if (emailSentAt !== undefined) step.emailSentAt = emailSentAt;
    if (isBlocked !== undefined) step.isBlocked = isBlocked;
    if (blockedReason !== undefined) step.blockedReason = blockedReason;
    if (assignedToId !== undefined) step.defaultAssignee = assignedToId;
    if (approvalStatus !== undefined) step.approvalStatus = approvalStatus;
    if (estimatedHours !== undefined) step.estimatedHours = estimatedHours;

    // If approval status changed to "approved", set clientApprovedAt
    if (approvalStatus === "approved" && !step.clientApprovedAt) {
      step.clientApprovedAt = now;
    }

    // 4. If status changed to "in_progress" and no startedAt, set it
    if (status === "in_progress" && !step.startedAt) {
      step.startedAt = now;
    }

    // 5. If status changed to "completed", set completedAt and completedBy
    if (status === "completed") {
      step.completedAt = now;
      if (user?.id) step.completedBy = user.id;
    }

    // 6. Auto-compute phase status
    const allStepsCompleted = steps.every(
      (s: any) => s.stepStatus === "completed" || s.stepStatus === "skipped",
    );
    const anyStepInProgress = steps.some(
      (s: any) => s.stepStatus === "in_progress",
    );

    if (allStepsCompleted) {
      phase.phaseStatus = "completed";
      if (!phase.phaseCompletedAt) {
        phase.phaseCompletedAt = now;
      }
    } else if (anyStepInProgress || status === "completed") {
      // If any step is in_progress, or we just completed one (but not all), phase is in_progress
      phase.phaseStatus = "in_progress";
      if (!phase.phaseStartedAt) {
        phase.phaseStartedAt = now;
      }
    }

    // 7. If any step in a phase is "in_progress", ensure phaseStatus and phaseStartedAt
    for (const p of phases) {
      const pSteps: any[] = p.steps || [];
      const hasInProgress = pSteps.some(
        (s: any) => s.stepStatus === "in_progress",
      );
      if (hasInProgress && p.phaseStatus !== "in_progress") {
        p.phaseStatus = "in_progress";
        if (!p.phaseStartedAt) {
          p.phaseStartedAt = now;
        }
      }
    }

    // 8. Auto-compute currentPhase
    let currentPhase: string | null = null;
    for (const p of phases) {
      if (p.phaseStatus === "in_progress") {
        currentPhase = p.phaseName;
        break;
      }
    }
    if (!currentPhase) {
      for (const p of phases) {
        if (p.phaseStatus === "not_started") {
          currentPhase = p.phaseName;
          break;
        }
      }
    }

    // 9. Auto-compute overallStatus
    const previousOverallStatus = doc.overallStatus;
    const allPhasesCompleted = phases.every(
      (p: any) => p.phaseStatus === "completed" || p.phaseStatus === "skipped",
    );
    const anyPhaseInProgress = phases.some(
      (p: any) => p.phaseStatus === "in_progress",
    );

    let overallStatus: string;
    if (allPhasesCompleted) {
      overallStatus = "completed";
    } else if (anyPhaseInProgress) {
      overallStatus = "in_progress";
    } else {
      overallStatus = doc.overallStatus || "not_started";
    }

    // 10. Add timeline entry
    const timeline: any[] = doc.timeline || [];
    const newAction =
      status !== undefined && status !== previousStatus
        ? `Step '${step.stepName}' marked as ${status}`
        : `Step '${step.stepName}' updated`;

    timeline.push({
      action: newAction,
      performedAt: now,
      performedBy: user?.id || undefined,
      notes: actualNotes || outcome || undefined,
    });

    // 11. If overallStatus changed to "completed", set completedAt
    const updateData: Record<string, any> = {
      phases,
      timeline,
      overallStatus,
    };

    if (overallStatus === "completed" && previousOverallStatus !== "completed") {
      updateData.completedAt = now;
    }

    // If process moves to in_progress and hasn't started yet, set startedAt
    if (
      overallStatus === "in_progress" &&
      previousOverallStatus === "not_started" &&
      !doc.startedAt
    ) {
      updateData.startedAt = now;
    }

    // 12. Save via payload.update
    await payload.update({
      collection: "client-processes" as any,
      id,
      data: updateData as any,
      overrideAccess: true,
    });

    // 13. Log to ActivityLog when step is completed
    if (status === "completed") {
      const clientId =
        typeof doc.client === "object" ? doc.client?.id : doc.client;

      logActivity(payload, {
        type: "process_step_completed",
        title: `Step completed: ${step.stepName}`,
        description: `Phase: ${phase.phaseName} | Process: ${doc.processTitle}`,
        user: user?.id,
        client: clientId || undefined,
      }).catch(() => {});
    }

    // 14. Compute completion percentage
    const totalSteps = phases.reduce(
      (sum: number, p: any) => sum + (p.steps?.length || 0),
      0,
    );
    const completedSteps = phases.reduce(
      (sum: number, p: any) =>
        sum +
        (p.steps || []).filter(
          (s: any) =>
            s.stepStatus === "completed" || s.stepStatus === "skipped",
        ).length,
      0,
    );
    const completionPercentage =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    return NextResponse.json({
      success: true,
      currentPhase,
      overallStatus,
      completionPercentage,
    });
  } catch (err) {
    console.error("[client-processes/[id]/step] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update step", details: String(err) },
      { status: 500 },
    );
  }
}
