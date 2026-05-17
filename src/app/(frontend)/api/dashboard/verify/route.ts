import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import crypto from "crypto";
import config from "@/payload.config";
import { checkPinWithLockout } from "@/lib/pin-auth";

// HMAC-signed cookie: works across serverless instances (no shared memory needed)
const COOKIE_SECRET =
  process.env.PAYLOAD_SECRET ||
  process.env.INTERNAL_API_KEY ||
  "dashboard-fallback-secret";
const COOKIE_MAX_AGE = 4 * 60 * 60; // 4 hours in seconds

function signToken(slug: string, expiresAt: number): string {
  const payloadStr = `${slug}:${expiresAt}`;
  const sig = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(payloadStr)
    .digest("hex");
  return `${payloadStr}:${sig}`;
}

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    const padded = Buffer.alloc(bufA.length, 0);
    bufB.copy(padded, 0, 0, Math.min(bufB.length, bufA.length));
    crypto.timingSafeEqual(bufA, padded);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validateDashboardToken(
  cookieValue: string | undefined,
  requiredSlug: string,
): boolean {
  if (!cookieValue) return false;

  const parts = cookieValue.split(":");
  if (parts.length !== 3) return false;

  const [slug, expiresAtStr, sig] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);

  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;
  if (slug !== requiredSlug) return false;

  const expectedSig = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(`${slug}:${expiresAtStr}`)
    .digest("hex");

  return constantTimeCompare(sig, expectedSig);
}

/**
 * Verify a client dashboard PIN. Lockout is per-slug, persisted via
 * `checkPinWithLockout`, immune to IP rotation. The previous in-memory
 * `Map` rate limiter has been removed.
 */
export async function POST(req: NextRequest) {
  let body: { pin?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { pin, slug } = body;

  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Find client by slug
  const clientResult = await payload.find({
    collection: "clients",
    where: {
      slug: { equals: slug },
      isActive: { equals: true },
      clientPin: { exists: true },
    },
    limit: 1,
    overrideAccess: true,
    select: {
      clientPin: true,
      googleAdsCustomerId: true,
    },
  });

  const client = clientResult.docs[0] as { clientPin?: string } | undefined;
  const storedPin = client?.clientPin ?? "";

  const result = await checkPinWithLockout(`dashboard:${slug}`, pin, storedPin);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message },
      { status: result.status },
    );
  }

  // Verified — set HMAC-signed cookie (stateless, works across serverless instances)
  const expiresAt = Date.now() + COOKIE_MAX_AGE * 1000;
  const tokenValue = signToken(slug, expiresAt);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("dashboard_token", tokenValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  return res;
}
