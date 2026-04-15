import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

/**
 * POST /api/client-processes/create-from-template
 *
 * Creates a new ClientProcess from a ProcessTemplate.
 * Copies all phases and steps, sets statuses to "not_started",
 * and creates an initial timeline entry.
 *
 * Auth: Payload session OR x-api-key matching AUDIT_API_KEY.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config });

    // Auth: require Payload session or API key
    const apiKey = req.headers.get("x-api-key");
    const { user } = await payload.auth({ headers: req.headers });

    if (!user && (!apiKey || apiKey !== process.env.AUDIT_API_KEY)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      templateId,
      clientId,
      salesLeadId,
      proposalId,
      clientName,
      assignedToId,
      retainerType: retainerTypeOverride,
      startDate,
      endDate,
      durationDays,
    } = body;

    // Validate required fields
    if (!templateId) {
      return NextResponse.json(
        { error: "Missing required field: templateId" },
        { status: 400 },
      );
    }
    if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
      return NextResponse.json(
        { error: "Missing required field: clientName" },
        { status: 400 },
      );
    }

    // 1. Fetch the template
    let template: any;
    try {
      template = await payload.findByID({
        collection: "process-templates" as any,
        id: templateId,
        overrideAccess: true,
      });
    } catch {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    // 2. Validate template is active
    if (!template.isActive) {
      return NextResponse.json(
        { error: "Template is not active" },
        { status: 400 },
      );
    }

    // 3. Build client process data
    const retainerType = retainerTypeOverride || template.retainerType;
    const processTitle = `${clientName.trim()} - ${template.name}`;
    const now = new Date().toISOString();

    // Copy phases and steps from the template, setting all statuses to not_started
    const phases = (template.phases || []).map((phase: any) => ({
      phaseName: phase.phaseName,
      phaseOrder: phase.phaseOrder,
      phaseDescription: phase.phaseDescription || undefined,
      weekRange: phase.weekRange || undefined,
      phaseStatus: "not_started",
      steps: (phase.steps || []).map((step: any) => ({
        stepName: step.stepName,
        stepOrder: step.stepOrder,
        stepDescription: step.stepDescription || undefined,
        stepType: step.stepType || undefined,
        stepStatus: "not_started",
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
        approvalStatus: step.requiresApproval ? "not_needed" : "not_needed",
        internalNotes: step.internalNotes || undefined,
      })),
    }));

    // Initial timeline entry
    const timeline = [
      {
        action: `Process created from template: ${template.name}`,
        performedAt: now,
        performedBy: user?.id || undefined,
        notes: `Retainer type: ${retainerType || "not specified"}`,
      },
    ];

    // 4. Create the ClientProcess doc
    const processData: Record<string, any> = {
      processTitle,
      template: template.id,
      retainerType: retainerType || undefined,
      overallStatus: "not_started",
      startedAt: now,
      phases,
      timeline,
    };

    if (clientId) processData.client = clientId;
    if (salesLeadId) processData.salesLead = salesLeadId;
    if (proposalId) processData.proposal = proposalId;
    if (assignedToId) processData.assignedTo = assignedToId;
    if (startDate) processData.startDate = startDate;
    if (endDate) processData.endDate = endDate;
    if (durationDays) processData.durationDays = durationDays;
    else if (template.durationDays) processData.durationDays = template.durationDays;

    const doc = await payload.create({
      collection: "client-processes" as any,
      data: processData as any,
      overrideAccess: true,
    });

    // 5. If salesLeadId is provided, try to link back (skip if field doesn't exist)
    if (salesLeadId) {
      try {
        await payload.update({
          collection: "sales-leads" as any,
          id: salesLeadId,
          data: { process: doc.id } as any,
          overrideAccess: true,
        });
      } catch {
        // SalesLeads may not have a process field yet — silently skip
      }
    }

    // 6. Log activity (the collection hook also logs, but we add a more descriptive one)
    logActivity(payload, {
      type: "process_started",
      title: `Process started: ${processTitle}`,
      description: `Template: ${template.name} | Retainer: ${retainerType || "not specified"}`,
      user: user?.id,
      client: clientId || undefined,
    }).catch(() => {});

    // 7. Return success
    return NextResponse.json({
      success: true,
      processId: doc.id,
      processTitle: (doc as any).processTitle,
    });
  } catch (err) {
    console.error("[client-processes/create-from-template] Error:", err);
    return NextResponse.json(
      { error: "Failed to create process", details: String(err) },
      { status: 500 },
    );
  }
}
