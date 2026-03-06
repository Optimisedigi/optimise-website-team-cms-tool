import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import crypto from "crypto";
import config from "@/payload.config";

// Rate limiter: 3 attempts per IP per 5 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 5 * 60_000;

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

  // Find client by slug with dashboard enabled
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

  const client = clientResult.docs[0] as any;
  if (!client) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const storedPin = client.clientPin as string;
  if (!storedPin || !constantTimeCompare(pin, storedPin)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Verified — set a session cookie so subsequent data fetches are authenticated
  const token = crypto.randomBytes(32).toString("hex");
  const res = NextResponse.json({ ok: true });

  res.cookies.set("dashboard_token", `${slug}:${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });

  // Store token server-side for validation
  dashboardTokens.set(`${slug}:${token}`, {
    slug,
    expiresAt: Date.now() + 4 * 60 * 60_000,
  });

  return res;
}

// In-memory token store (resets on deploy, which is fine for dashboard sessions)
export const dashboardTokens = new Map<
  string,
  { slug: string; expiresAt: number }
>();

export function validateDashboardToken(
  cookieValue: string | undefined,
  requiredSlug: string,
): boolean {
  if (!cookieValue) return false;
  const entry = dashboardTokens.get(cookieValue);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    dashboardTokens.delete(cookieValue);
    return false;
  }
  return entry.slug === requiredSlug;
}
