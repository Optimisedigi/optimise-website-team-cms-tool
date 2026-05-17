import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { checkPinWithLockout } from "@/lib/pin-auth";

/**
 * Verify a 4-digit PIN against an audit / proposal / client-presentation
 * deck. Lockout is enforced by `checkPinWithLockout` against a per-target
 * bucket persisted in the `pin-rate-limits` collection — survives across
 * Vercel lambda instances and immune to `x-forwarded-for` rotation. The
 * previous in-memory `Map` rate limiter has been removed.
 */
export async function POST(req: NextRequest) {
  let body: { slug?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { slug, password } = body;

  if (
    !slug ||
    !password ||
    typeof slug !== "string" ||
    typeof password !== "string"
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Client-presentation decks: slug is `<clientSlug>/<deckSlug>` (e.g.
  // `away-digital/google-ads-audit`). Resolve to the client record, verify
  // the deck is listed in `presentations[]`, and compare against the
  // client's `clientPin`. This is the canonical path for new partner decks.
  if (slug.includes("/")) {
    const [clientSlug, deckSlug] = slug.split("/", 2);
    if (clientSlug && deckSlug) {
      const clientResult = await payload.find({
        collection: "clients",
        where: { slug: { equals: clientSlug } },
        limit: 1,
        overrideAccess: true,
        select: { clientPin: true, presentations: true },
      });
      const clientRow = clientResult.docs[0] as
        | {
            id: number | string;
            clientPin?: string | null;
            presentations?: { deckSlug?: string | null }[] | null;
          }
        | undefined;
      if (clientRow) {
        const hasDeck = (clientRow.presentations ?? []).some(
          (p) => p?.deckSlug === deckSlug,
        );
        if (hasDeck) {
          const result = await checkPinWithLockout(
            `audit-auth:${slug}`,
            password,
            clientRow.clientPin ?? "",
          );
          if (result.ok) {
            return NextResponse.json({ ok: true });
          }
          return NextResponse.json(
            { ok: false, error: result.message },
            { status: result.status },
          );
        }
      }
      // No matching deck → still consume an attempt against the slug so
      // attackers can't probe slug existence without burning attempts.
      const result = await checkPinWithLockout(
        `audit-auth:${slug}`,
        password,
        "",
      );
      return NextResponse.json(
        { ok: false, error: result.ok ? undefined : result.message },
        { status: result.ok ? 401 : result.status },
      );
    }
  }

  // Try seo-audits first (legacy audit reports)
  const auditResult = await payload.find({
    collection: "seo-audits",
    where: { reportSlug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
    select: { reportPassword: true },
  });

  const audit = auditResult.docs[0];

  if (audit) {
    const storedPassword = (audit as Record<string, unknown>)
      .reportPassword as string | undefined;

    const result = await checkPinWithLockout(
      `audit-auth:${slug}`,
      password,
      storedPassword ?? "",
    );
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { ok: false, error: result.message },
      { status: result.status },
    );
  }

  // Try client-proposals (presentation reports)
  const proposalResult = await payload.find({
    collection: "client-proposals",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
    select: { proposalPin: true },
  });

  const proposal = proposalResult.docs[0];

  const storedPin = proposal
    ? ((proposal as Record<string, unknown>).proposalPin as string | undefined)
    : undefined;

  const result = await checkPinWithLockout(
    `audit-auth:${slug}`,
    password,
    storedPin ?? "",
  );
  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { ok: false, error: result.message },
    { status: result.status },
  );
}
