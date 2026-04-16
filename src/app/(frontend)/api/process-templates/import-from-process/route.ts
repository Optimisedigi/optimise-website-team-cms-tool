import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * POST /api/process-templates/import-from-process
 *
 * One-off utility: reads a ClientProcess by ID and creates a new
 * ProcessTemplate from its phases and steps. Strips runtime fields
 * (statuses, completedAt, etc.) so the template is a clean blueprint.
 *
 * Body: { clientProcessId: string, templateName?: string }
 * Auth: Payload session required.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { clientProcessId, templateName } = body;

    if (!clientProcessId) {
      return NextResponse.json(
        { error: "Missing clientProcessId" },
        { status: 400 },
      );
    }

    // Fetch the client process
    let process: any;
    try {
      process = await payload.findByID({
        collection: "client-processes" as any,
        id: clientProcessId,
        overrideAccess: true,
      });
    } catch {
      return NextResponse.json(
        { error: "Client process not found" },
        { status: 404 },
      );
    }

    // Map phases and steps into template format (strip runtime fields)
    const phases = (process.phases || []).map((phase: any, pi: number) => ({
      phaseName: phase.phaseName,
      phaseOrder: phase.phaseOrder ?? pi + 1,
      phaseDescription: phase.phaseDescription || undefined,
      weekRange: phase.weekRange || undefined,
      steps: (phase.steps || []).map((step: any, si: number) => ({
        stepName: step.stepName,
        stepOrder: step.stepOrder ?? si + 1,
        stepDescription: step.stepDescription || undefined,
        stepType: step.stepType || undefined,
        defaultAssignee: step.defaultAssignee || undefined,
        estimatedDuration: step.estimatedDuration || undefined,
        isAutomatable: step.isAutomatable || false,
        automationNotes: step.automationNotes || undefined,
        emailTemplateSubject: step.emailTemplateSubject || undefined,
        emailTemplateBody: step.emailTemplateBody || undefined,
        reminderDays: step.reminderDays ?? undefined,
        requiredBeforeNext: step.requiredBeforeNext || false,
        clientVisible: step.clientVisible || false,
        clientLabel: step.clientLabel || undefined,
        requiresApproval: step.requiresApproval || false,
      })),
    }));

    const name =
      templateName ||
      `${process.processTitle || "Imported"} (Template)`.replace(
        /\s*-\s*Google Ads$/i,
        "",
      );

    // Create the template
    const template = await payload.create({
      collection: "process-templates" as any,
      data: {
        name,
        retainerType: process.retainerType || "google_ads_only",
        description: `Imported from client process: ${process.processTitle}`,
        isActive: true,
        isDefault: false,
        phases,
      },
      overrideAccess: true,
    });

    const totalSteps = phases.reduce(
      (n: number, p: any) => n + (p.steps?.length || 0),
      0,
    );

    return NextResponse.json({
      ok: true,
      templateId: template.id,
      name,
      phasesCount: phases.length,
      stepsCount: totalSteps,
      message: `Created template "${name}" with ${phases.length} phases and ${totalSteps} steps`,
    });
  } catch (err) {
    console.error("[import-from-process] Error:", err);
    return NextResponse.json(
      { error: "Failed to import", details: String(err) },
      { status: 500 },
    );
  }
}
