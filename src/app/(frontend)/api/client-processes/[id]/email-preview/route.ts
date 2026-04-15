import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  generateClientTimelineEmailHtml,
  generateClientTimelineEmailPlain,
} from "@/lib/client-timeline-email";

/**
 * POST /api/client-processes/[id]/email-preview
 *
 * Returns HTML and plain-text versions of the client-facing process email.
 * Filters to steps with clientVisible: true only.
 * Uses clientLabel (if set) instead of stepName for client-friendly display.
 *
 * Body: { clientName?: string }
 *
 * Auth: Payload session OR x-api-key matching AUDIT_API_KEY.
 */
export async function POST(
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
    const body = await req.json().catch(() => ({}));
    const { clientName } = body;

    const doc = await payload.findByID({
      collection: "client-processes" as any,
      id,
      depth: 2,
      overrideAccess: true,
    });

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const docAny = doc as any;
    const resolvedClientName =
      clientName ??
      (typeof docAny.client === "object"
        ? docAny.client?.name ?? "Client"
        : "Client");

    // Map retainerType to a display-friendly service type label
    const retainerToService: Record<string, string> = {
      google_ads_only: "google_ads",
      meta_ads_only: "meta_ads",
      seo_only: "seo",
      website_build_only: "general",
      website_seo: "seo",
      website_seo_google_ads: "general",
      full_integration: "general",
      ai_automations: "general",
      custom: "general",
    };
    const serviceType =
      retainerToService[docAny.retainerType] ?? "general";

    // Filter to client-visible steps only, map to email data format
    const emailData = {
      clientName: resolvedClientName,
      timelineTitle: docAny.processTitle,
      serviceType,
      startDate: docAny.startDate,
      endDate: docAny.endDate,
      phases: (docAny.phases ?? [])
        .map((phase: any) => {
          const visibleSteps = (phase.steps ?? []).filter(
            (step: any) => step.clientVisible,
          );
          if (visibleSteps.length === 0) return null;

          return {
            phaseName: phase.phaseName,
            weekRange: phase.weekRange,
            phaseDescription: phase.phaseDescription,
            items: visibleSteps.map((step: any) => ({
              itemName: step.clientLabel || step.stepName,
              itemDescription: step.stepDescription,
              itemStatus: step.stepStatus,
              estimatedHours: step.estimatedHours ?? null,
              requiresApproval: step.requiresApproval ?? false,
              approvalStatus: step.approvalStatus ?? "not_needed",
            })),
          };
        })
        .filter(Boolean),
    };

    const html = generateClientTimelineEmailHtml(emailData);
    const plain = generateClientTimelineEmailPlain(emailData);

    return NextResponse.json({ html, plain });
  } catch (err) {
    console.error("[client-processes/email-preview] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate email", details: String(err) },
      { status: 500 },
    );
  }
}
