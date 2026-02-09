import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import crypto from "crypto";
import config from "@/payload.config";

// In-memory rate limiter: max 5 attempts per IP per 60 seconds
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep timing constant
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

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

  const result = await payload.find({
    collection: "seo-audits",
    where: { reportSlug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
    select: { reportPassword: true },
  });

  const audit = result.docs[0];

  // Return same error for missing audit and wrong password to prevent enumeration
  if (!audit) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const storedPassword = (audit as Record<string, unknown>)
    .reportPassword as string;

  // If no password is set on the report, deny access (admin must set one)
  if (!storedPassword) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (constantTimeCompare(password, storedPassword)) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
