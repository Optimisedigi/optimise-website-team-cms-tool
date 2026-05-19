import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * SERP Displacement ad-hoc run from a ClientProposal.
 *
 * Proxies to Growth Tools at `POST /api/serp-displacement/run-once` with
 * the proposal's website URL, target location, and a single test keyword
 * (first keywordCategories entry, falling back to businessName). On a 2xx
 * response Growth Tools is expected to return a JSON body containing the
 * captured snapshot row; we persist it into `serp-displacement-snapshots`
 * with the proposal linkage so the convertToClient hook can re-point it
 * to the new client later.
 *
 * If Growth Tools doesn't yet expose the run-once endpoint (404/501), the
 * error is surfaced verbatim to the button so the team knows what's
 * missing rather than seeing a silent failure.
 */
export const maxDuration = 60;

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function pickFirstKeyword(proposal: any): string | null {
  const cats = proposal?.keywordCategories as
    | Array<{ keywords?: string }>
    | undefined;
  if (cats && cats.length > 0) {
    for (const c of cats) {
      const first = (c?.keywords ?? "")
        .split(/\r?\n/)
        .map((k: string) => k.trim())
        .find((k: string) => k.length > 0);
      if (first) return first;
    }
  }
  const legacy = (proposal?.keywords as string | undefined) ?? "";
  const fromLegacy = legacy
    .split(/\r?\n/)
    .map((k: string) => k.trim())
    .find((k: string) => k.length > 0);
  if (fromLegacy) return fromLegacy;
  return (proposal?.businessName as string | undefined)?.trim() || null;
}

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
  const location = (proposal?.targetLocation as string | undefined)?.trim();
  const keyword = pickFirstKeyword(proposal);

  if (!websiteUrl) {
    return NextResponse.json(
      { error: "Proposal is missing its website URL." },
      { status: 400 },
    );
  }
  if (!location) {
    return NextResponse.json(
      { error: "Proposal is missing a target location." },
      { status: 400 },
    );
  }
  if (!keyword) {
    return NextResponse.json(
      {
        error:
          "Proposal needs at least one keyword (keywordCategories) or a businessName.",
      },
      { status: 400 },
    );
  }

  // Call Growth Tools to capture the snapshot. The endpoint is expected
  // to return the captured snapshot as JSON.
  let snapshot: Record<string, any> | null = null;
  try {
    const res = await fetch(
      `${GROWTH_TOOLS_URL}/api/serp-displacement/run-once`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          proposalId: id,
          websiteUrl,
          keyword,
          location,
          device: "desktop",
        }),
      },
    );

    if (res.status === 404) {
      return NextResponse.json(
        {
          error:
            "Growth Tools doesn't expose /api/serp-displacement/run-once yet \u2014 the button will work once that endpoint ships.",
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

  // Persist the snapshot into our collection, linked to the proposal.
  // The proposal may already have a client (post-conversion); link both.
  const clientId =
    typeof proposal.client === "object"
      ? proposal.client?.id
      : proposal.client;

  const snapshotData: Record<string, any> = {
    ...snapshot,
    proposal: id,
    client: clientId ?? undefined,
    keyword: snapshot.keyword ?? keyword,
    location: snapshot.location ?? location,
    device: snapshot.device ?? "desktop",
    capturedAt: snapshot.capturedAt ?? new Date().toISOString(),
  };

  let created: any;
  try {
    created = await payload.create({
      collection: "serp-displacement-snapshots",
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

  // Surface the most-recent snapshot on the proposal for quick navigation.
  try {
    await payload.update({
      collection: "client-proposals",
      id,
      data: { latestSerpDisplacementSnapshot: created.id } as any,
      overrideAccess: true,
    });
  } catch {
    // Non-fatal — the snapshot is still saved and reachable.
  }

  return NextResponse.json({ ok: true, snapshotId: created.id });
}
