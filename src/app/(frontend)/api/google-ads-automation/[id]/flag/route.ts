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
const MAX_BATCH = 5000;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!userHasFeature(user, "nav:google-ads")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { note?: unknown; eventIds?: unknown; summary?: unknown } | null;
    const note = typeof body?.note === "string" ? body.note.slice(0, 1000) : "";
    // A grouped feed row (one bulk script run) flags every event in its batch.
    const batchIds = Array.isArray(body?.eventIds)
      ? [...new Set(body.eventIds.filter((v): v is number => Number.isInteger(v) && (v as number) > 0))].slice(0, MAX_BATCH)
      : [];
    const batchSummary = typeof body?.summary === "string" ? body.summary.slice(0, 300) : "";

    const { id } = await ctx.params;
    const event = (await payload
      .findByID({ collection: "google-ads-automation-events", id, depth: 0, overrideAccess: true })
      .catch(() => null)) as
      | { id: number; client?: number | null; summary?: string; customerId?: string; campaignName?: string; resourceName?: string; relatedApproval?: unknown; changeDateTime?: string }
      | null;
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Only siblings from the same client account may ride along with the primary.
    const siblingIds =
      batchIds.length > 0
        ? (
            (
              await payload.find({
                collection: "google-ads-automation-events",
                where: {
                  and: [
                    { id: { in: batchIds.filter((v) => v !== event.id) } },
                    { customerId: { equals: event.customerId ?? "" } },
                    { reviewStatus: { not_equals: "flagged" } },
                  ],
                },
                limit: MAX_BATCH,
                pagination: false,
                depth: 0,
                overrideAccess: true,
              })
            ).docs as Array<{ id: number }>
          ).map((d) => d.id)
        : [];
    const summary = siblingIds.length > 0 && batchSummary ? batchSummary : event.summary;

    if (event.relatedApproval) {
      // Batch partly flagged before: attach the rest to the same approval.
      const approvalId =
        typeof event.relatedApproval === "object" && event.relatedApproval !== null && "id" in event.relatedApproval
          ? (event.relatedApproval as { id: number }).id
          : event.relatedApproval;
      if (siblingIds.length > 0) {
        await payload.update({
          collection: "google-ads-automation-events",
          where: { id: { in: siblingIds } },
          data: { reviewStatus: "flagged", relatedApproval: approvalId as number },
          overrideAccess: true,
        });
      }
      return NextResponse.json({ ok: true, approvalId, alreadyFlagged: true, flaggedCount: 1 + siblingIds.length });
    }

    const approval = await payload.create({
      collection: "agent-approval-queue",
      data: {
        title: `Review Google change: ${summary || event.resourceName || "unnamed change"}`.slice(0, 200),
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
          summary,
          batchEventIds: siblingIds.length > 0 ? [event.id, ...siblingIds] : undefined,
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

    if (siblingIds.length > 0) {
      await payload.update({
        collection: "google-ads-automation-events",
        where: { id: { in: siblingIds } },
        data: { reviewStatus: "flagged", relatedApproval: approval.id },
        overrideAccess: true,
      });
    }

    return NextResponse.json({ ok: true, approvalId: approval.id, flaggedCount: 1 + siblingIds.length });
  } catch (error) {
    console.error("[google-ads-automation/flag]", error);
    return NextResponse.json({ error: "Failed to flag event" }, { status: 500 });
  }
}
