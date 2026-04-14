import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import crypto from "crypto";
import config from "@/payload.config";

// In-memory rate limiter: max 5 attempts per IP per 60 seconds
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [ip, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(ip);
  }
}

function isRateLimited(ip: string): boolean {
  cleanupExpiredEntries();
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
    // Pad shorter buffer so timingSafeEqual can compare equal-length buffers
    const padded = Buffer.alloc(bufA.length, 0);
    bufB.copy(padded, 0, 0, Math.min(bufB.length, bufA.length));
    crypto.timingSafeEqual(bufA, padded);
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
      .reportPassword as string;

    if (!storedPassword) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    if (constantTimeCompare(password, storedPassword)) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false }, { status: 401 });
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

  if (!proposal) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const storedPin = (proposal as Record<string, unknown>)
    .proposalPin as string;

  if (!storedPin) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (constantTimeCompare(password, storedPin)) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
