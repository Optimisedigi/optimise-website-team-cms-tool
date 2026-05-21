/**
 * Discovery Briefing PIN auth endpoint.
 *
 * Verifies a 4-digit PIN against the parent record of a public discovery
 * briefing route:
 *
 *   /client/<slug>/discovery/<paddedId>            → uses `clients.clientPin`
 *   /client-proposal/<slug>/discovery/<paddedId>   → uses `client_proposals.proposalPin`,
 *                                                     falling back to the linked client's
 *                                                     `clientPin` when the proposal has none.
 *
 * The gate is only consulted when the briefing's `requirePin` toggle is on
 * (set per-record in the CMS). Admin sessions bypass the gate at the page
 * level — this endpoint is only hit by the public PIN component.
 *
 * Rate-limited via the shared `checkPinWithLockout` helper (5 attempts /
 * 15 min per target) — same bucket strategy as `/api/audit-auth`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { checkPinWithLockout } from "@/lib/pin-auth";
import { resolveScopedBriefing } from "@/lib/discovery-briefing/route-utils";

interface RequestBody {
  scope?: unknown;
  slug?: unknown;
  briefingId?: unknown;
  password?: unknown;
}

function parseBody(body: RequestBody):
  | {
      ok: true;
      scope: "client" | "proposal";
      slug: string;
      briefingId: string;
      password: string;
    }
  | { ok: false } {
  const { scope, slug, briefingId, password } = body;
  if (
    typeof scope !== "string" ||
    (scope !== "client" && scope !== "proposal") ||
    typeof slug !== "string" ||
    typeof briefingId !== "string" ||
    typeof password !== "string" ||
    !slug ||
    !briefingId ||
    !password
  ) {
    return { ok: false };
  }
  return { ok: true, scope, slug, briefingId, password };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Resolve the parent + briefing in the exact same way the page route does
  // so the PIN we compare against is the same one the page's gate decision
  // was based on. We deliberately do NOT short-circuit on `requirePin === false`
  // here — if the user is hitting this endpoint, the page rendered the gate,
  // and the lockout bucket should still accrue attempts to deter probing.
  const resolved = await resolveScopedBriefing({
    payload,
    scope: parsed.scope,
    slug: parsed.slug,
    briefingId: parsed.briefingId,
  });

  // Bucket key is shared across all attempts against this briefing (per scope
  // + slug + padded id) so the counter accumulates correctly even if the
  // briefing hasn't been created yet (padded id "000").
  const bucketKey = `discovery-auth:${parsed.scope}:${parsed.slug}:${parsed.briefingId}`;

  // If the parent doesn't exist or there's no PIN configured, still burn an
  // attempt so probing doesn't reveal existence.
  const expectedPin =
    resolved.ok && resolved.requirePin ? resolved.pinToMatch : "";

  const result = await checkPinWithLockout(
    bucketKey,
    parsed.password,
    expectedPin,
  );

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { ok: false, error: result.message },
    { status: result.status },
  );
}
