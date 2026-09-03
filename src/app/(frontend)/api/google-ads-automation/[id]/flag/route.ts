import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";

import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

/**
 * Flag one Google-made change for human review: writes an approval-queue row
 * (the existing human-review surface owns the follow-up) and links it back.
 * Reverting a change is deliberately out of scope — that is a money-moving
 * mutation and belongs behind the goal-agent risk tiers.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!userHasFeature(user, "nav:google-ads")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { note?: unknown } | null;
    const note = typeof body?.note === "string" ? body.note.slice(0, 1000) : "";

    const { id } = await ctx.params;
    const event = (await payload
      .findByID({ collection: "google-ads-automation-events", id, depth: 0, overrideAccess: true })
      .catch(() => null)) as
      | { id: number; client?: number | null; summary?: string; customerId?: string; campaignName?: string; resourceName?: string; relatedApproval?: unknown; changeDateTime?: string }
      | null;
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (event.relatedApproval) {
      return NextResponse.json({ ok: true, approvalId: event.relatedApproval, alreadyFlagged: true });
    }

    const approval = await payload.create({
      collection: "agent-approval-queue",
      data: {
        title: `Review Google change: ${event.summary || event.resourceName || "unnamed change"}`.slice(0, 200),
        agentName: "google-automation-watchtower",
        client: event.client ?? undefined,
        proposalType: "google-automation-review",
        agentRunId: `watchtower-${event.id}`,
        proposalPayload: {
          automationEventId: event.id,
          customerId: event.customerId,
          campaignName: event.campaignName,
          resourceName: event.resourceName,
          changeDateTime: event.changeDateTime,
          summary: event.summary,
          note,
          flaggedByUserId: user.id,
        },
        status: "pending",
      },
      overrideAccess: true,
    });

    await payload.update({
      collection: "google-ads-automation-events",
      id: event.id,
      data: { reviewStatus: "flagged", relatedApproval: approval.id },
      overrideAccess: true,
    });

    return NextResponse.json({ ok: true, approvalId: approval.id });
  } catch (error) {
    console.error("[google-ads-automation/flag]", error);
    return NextResponse.json({ error: "Failed to flag event" }, { status: 500 });
  }
}
