import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  generateClientTimelineEmailHtml,
  generateClientTimelineEmailPlain,
} from "@/lib/client-timeline-email";

/**
 * POST /api/client-timelines/[id]/email-preview
 *
 * Returns HTML and plain-text versions of the client timeline email.
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
      collection: "client-timelines" as any,
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

    const emailData = {
      clientName: resolvedClientName,
      timelineTitle: docAny.title,
      serviceType: docAny.serviceType,
      startDate: docAny.startDate,
      endDate: docAny.endDate,
      phases: (docAny.phases ?? []).map((phase: any) => ({
        phaseName: phase.phaseName,
        weekRange: phase.weekRange,
        phaseDescription: phase.phaseDescription,
        items: (phase.items ?? []).map((item: any) => ({
          itemName: item.itemName,
          itemDescription: item.itemDescription,
          itemStatus: item.itemStatus,
          estimatedHours: item.estimatedHours ?? null,
          requiresApproval: item.requiresApproval ?? false,
          approvalStatus: item.approvalStatus ?? "not_needed",
        })),
      })),
    };

    const html = generateClientTimelineEmailHtml(emailData);
    const plain = generateClientTimelineEmailPlain(emailData);

    return NextResponse.json({ html, plain });
  } catch (err) {
    console.error("[client-timelines/email-preview] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate email", details: String(err) },
      { status: 500 },
    );
  }
}
