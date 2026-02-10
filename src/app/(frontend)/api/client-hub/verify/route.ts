import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import crypto from "crypto";
import config from "@/payload.config";

// Rate limiter: 3 attempts per IP per 5 minutes (stricter due to only 10k PIN combos)
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

  let body: { pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { pin } = body;

  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Fetch all active clients that have a PIN set
  const clients = await payload.find({
    collection: "clients",
    where: {
      isActive: { equals: true },
      clientPin: { exists: true },
    },
    limit: 100,
    overrideAccess: true,
    select: {
      name: true,
      clientPin: true,
    },
  });

  // Compare against ALL clients to prevent timing-based enumeration
  let matchedClientId: string | null = null;
  let matchedClientName: string | null = null;

  for (const client of clients.docs) {
    const storedPin = (client as Record<string, unknown>).clientPin as string;
    if (!storedPin) continue;

    if (constantTimeCompare(pin, storedPin)) {
      matchedClientId = String(client.id);
      matchedClientName = (client as Record<string, unknown>).name as string;
    }
  }

  if (!matchedClientId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Fetch the latest audit for this client
  const audits = await payload.find({
    collection: "seo-audits",
    where: {
      client: { equals: matchedClientId },
    },
    sort: "-createdAt",
    limit: 1,
    overrideAccess: true,
  });

  const audit = audits.docs[0];

  if (!audit) {
    return NextResponse.json(
      { ok: false, error: "No audit report found." },
      { status: 404 }
    );
  }

  // Strip sensitive fields before returning
  const {
    reportPassword: _pw,
    customerEmail: _email,
    visitorIp: _ip,
    visitorFingerprint: _fp,
    ...safeAudit
  } = audit as unknown as Record<string, unknown>;

  return NextResponse.json({
    ok: true,
    clientName: matchedClientName,
    audit: safeAudit,
  });
}
