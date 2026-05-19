import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * AI Visibility ad-hoc run from a ClientProposal.
 *
 * Proxies to Growth Tools at `POST /api/ai-visibility/run-once`. Requires
 * `ga4PropertyId` on the proposal because the snapshot is pulled from GA4
 * referral data. On a 2xx response Growth Tools returns the captured
 * snapshot; we persist it into `ai-visibility-snapshots` with the proposal
 * linkage so convertToClient can re-point it later.
 */
export const maxDuration = 60;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY",
      },
      { status: 500 },
    );
  }

  let proposal: any;
  try {
    proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  const websiteUrl = (proposal?.websiteUrl as string | undefined)?.trim();
  const ga4PropertyId = (
    proposal?.ga4PropertyId as string | undefined
  )?.trim();

  if (!websiteUrl) {
    return NextResponse.json(
      { error: "Proposal is missing its website URL." },
      { status: 400 },
    );
  }
  if (!ga4PropertyId) {
    return NextResponse.json(
      {
        error:
          "Proposal is missing GA4 property ID. Add it on the Prospect tab.",
      },
      { status: 400 },
    );
  }

  let snapshot: Record<string, any> | null = null;
  try {
    const res = await fetch(
      `${GROWTH_TOOLS_URL}/api/ai-visibility/run-once`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          proposalId: id,
          websiteUrl,
          ga4PropertyId,
        }),
      },
    );

    if (res.status === 404) {
      return NextResponse.json(
        {
          error:
            "Growth Tools doesn't expose /api/ai-visibility/run-once yet \u2014 the button will work once that endpoint ships.",
        },
        { status: 502 },
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Growth Tools failed (${res.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`,
        },
        { status: 502 },
      );
    }

    snapshot = (await res.json().catch(() => null)) as Record<
      string,
      any
    > | null;
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Failed to reach Growth Tools: ${err?.message || "network error"}`,
      },
      { status: 502 },
    );
  }

  if (!snapshot || typeof snapshot !== "object") {
    return NextResponse.json(
      { error: "Growth Tools returned an empty response." },
      { status: 502 },
    );
  }

  const clientId =
    typeof proposal.client === "object"
      ? proposal.client?.id
      : proposal.client;

  const nowIso = new Date().toISOString();
  const snapshotData: Record<string, any> = {
    ...snapshot,
    proposal: id,
    client: clientId ?? undefined,
    propertyId: snapshot.propertyId ?? ga4PropertyId,
    periodStart: snapshot.periodStart ?? nowIso.slice(0, 10),
    periodEnd: snapshot.periodEnd ?? nowIso.slice(0, 10),
    totalSessions: snapshot.totalSessions ?? 0,
    totalUsers: snapshot.totalUsers ?? 0,
    totalConversions: snapshot.totalConversions ?? 0,
    fetchedAt: snapshot.fetchedAt ?? nowIso,
  };

  let created: any;
  try {
    created = await payload.create({
      collection: "ai-visibility-snapshots",
      data: snapshotData as any,
      overrideAccess: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Snapshot created upstream but failed to persist locally: ${err?.message || err}`,
      },
      { status: 500 },
    );
  }

  try {
    await payload.update({
      collection: "client-proposals",
      id,
      data: { latestAiVisibilitySnapshot: created.id } as any,
      overrideAccess: true,
    });
  } catch {
    // Non-fatal.
  }

  return NextResponse.json({ ok: true, snapshotId: created.id });
}
