import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import crypto from "crypto";
import config from "@/payload.config";

// Rate limiter: 3 attempts per IP per 5 minutes (stricter due to only 10k PIN combos)
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 5 * 60_000;
const CLEANUP_INTERVAL_MS = 10 * 60_000;

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

  // Fetch all active clients and all proposals with PINs in parallel
  const [clients, proposals] = await Promise.all([
    payload.find({
      collection: "clients",
      where: {
        isActive: { equals: true },
        clientPin: { exists: true },
      },
      limit: 100,
      overrideAccess: true,
      select: {
        name: true,
        slug: true,
        clientPin: true,
        googleAdsCustomerId: true,
      },
    }),
    payload.find({
      collection: "client-proposals",
      where: {
        proposalPin: { exists: true },
      },
      limit: 100,
      overrideAccess: true,
      select: {
        businessName: true,
        proposalPin: true,
        slug: true,
        websiteMockupUrl: true,
      },
    }),
  ]);

  // Check client PINs first (constant-time comparison against ALL to prevent timing attacks)
  let matchedClientId: string | null = null;
  let matchedClientName: string | null = null;
  let matchedClientSlug: string | null = null;
  let matchedHasGoogleAds = false;

  for (const client of clients.docs) {
    const c = client as any;
    const storedPin = c.clientPin as string;
    if (!storedPin) continue;

    if (constantTimeCompare(pin, storedPin)) {
      matchedClientId = String(client.id);
      matchedClientName = c.name as string;
      matchedClientSlug = (c.slug as string) || null;
      matchedHasGoogleAds = !!(c.googleAdsCustomerId as string);
    }
  }

  // Check proposal PINs (always iterate all to prevent timing attacks)
  let matchedProposalId: string | null = null;
  let matchedProposalName: string | null = null;
  let matchedProposalSlug: string | null = null;
  let matchedMockupUrl: string | null = null;

  for (const proposal of proposals.docs) {
    const p = proposal as any;
    const storedPin = p.proposalPin as string;
    if (!storedPin) continue;

    if (constantTimeCompare(pin, storedPin)) {
      matchedProposalId = String(proposal.id);
      matchedProposalName = p.businessName as string;
      matchedProposalSlug = (p.slug as string) || null;
      matchedMockupUrl = (p.websiteMockupUrl as string) || null;
    }
  }

  // Client match takes priority
  if (matchedClientId) {
    const [seoResult, croResult, kwResult, gadsResult] = await Promise.all([
      payload.find({
        collection: "seo-audits",
        where: { client: { equals: matchedClientId } },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "cro-audits",
        where: { client: { equals: matchedClientId } },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "keyword-snapshots",
        where: { client: { equals: matchedClientId } },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "google-ads-audits",
        where: {
          client: { equals: matchedClientId },
          presentationPublished: { equals: true },
        },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
        select: {
          slug: true,
          presentationPin: true,
          overallScore: true,
          businessName: true,
          createdAt: true,
        },
      }),
    ]);

    const seoAudit = seoResult.docs[0] ?? null;
    const croAudit = croResult.docs[0] ?? null;
    const kwSnapshot = kwResult.docs[0] ?? null;
    const gadsAudit = gadsResult.docs[0] ?? null;

    if (!seoAudit && !croAudit && !kwSnapshot && !gadsAudit) {
      return NextResponse.json(
        { ok: false, error: "No audit report found." },
        { status: 404 }
      );
    }

    // Strip sensitive fields from SEO audit
    let safeAudit = null;
    if (seoAudit) {
      const {
        reportPassword: _pw,
        customerEmail: _email,
        visitorIp: _ip,
        visitorFingerprint: _fp,
        ...rest
      } = seoAudit as unknown as Record<string, unknown>;
      safeAudit = rest;
    }

    // Strip sensitive fields from CRO audit
    let safeCroAudit = null;
    if (croAudit) {
      const {
        customerEmail: _email,
        visitorIp: _ip,
        visitorFingerprint: _fp,
        ...rest
      } = croAudit as unknown as Record<string, unknown>;
      safeCroAudit = rest;
    }

    return NextResponse.json({
      ok: true,
      clientName: matchedClientName,
      audit: safeAudit,
      croAudit: safeCroAudit,
      keywordSnapshot: kwSnapshot,
      competitorAnalysis: null,
      googleAdsAudit: gadsAudit
        ? {
            slug: (gadsAudit as any).slug,
            pin: (gadsAudit as any).presentationPin,
            businessName: (gadsAudit as any).businessName,
            overallScore: (gadsAudit as any).overallScore,
            createdAt: (gadsAudit as any).createdAt,
          }
        : null,
      googleAdsDashboard: matchedHasGoogleAds && matchedClientSlug
        ? { slug: matchedClientSlug, url: `/google-dashboard/${matchedClientSlug}` }
        : null,
    });
  }

  // Proposal match
  if (matchedProposalId) {
    const [seoResult, croResult, kwResult, compResult, gadsResult] = await Promise.all([
      payload.find({
        collection: "seo-audits",
        where: { proposal: { equals: matchedProposalId } },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "cro-audits",
        where: { proposal: { equals: matchedProposalId } },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "keyword-snapshots",
        where: { proposal: { equals: matchedProposalId } },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "competitor-analyses",
        where: { proposal: { equals: matchedProposalId } },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "google-ads-audits",
        where: {
          proposal: { equals: matchedProposalId },
          presentationPublished: { equals: true },
        },
        sort: "-createdAt",
        limit: 1,
        overrideAccess: true,
        select: {
          slug: true,
          presentationPin: true,
          overallScore: true,
          businessName: true,
          createdAt: true,
        },
      }),
    ]);

    const seoAudit = seoResult.docs[0] ?? null;
    const croAudit = croResult.docs[0] ?? null;
    const kwSnapshot = kwResult.docs[0] ?? null;
    const compAnalysis = compResult.docs[0] ?? null;
    const gadsAudit = gadsResult.docs[0] ?? null;

    if (!seoAudit && !croAudit && !kwSnapshot && !compAnalysis && !gadsAudit && !matchedMockupUrl) {
      return NextResponse.json(
        { ok: false, error: "No audit report found." },
        { status: 404 }
      );
    }

    // Strip sensitive fields from SEO audit
    let safeAudit = null;
    if (seoAudit) {
      const {
        reportPassword: _pw,
        customerEmail: _email,
        visitorIp: _ip,
        visitorFingerprint: _fp,
        ...rest
      } = seoAudit as unknown as Record<string, unknown>;
      safeAudit = rest;
    }

    // Strip sensitive fields from CRO audit
    let safeCroAudit = null;
    if (croAudit) {
      const {
        customerEmail: _email,
        visitorIp: _ip,
        visitorFingerprint: _fp,
        ...rest
      } = croAudit as unknown as Record<string, unknown>;
      safeCroAudit = rest;
    }

    return NextResponse.json({
      ok: true,
      clientName: matchedProposalName,
      proposalSlug: matchedProposalSlug,
      websiteMockupUrl: matchedMockupUrl,
      audit: safeAudit,
      croAudit: safeCroAudit,
      keywordSnapshot: kwSnapshot,
      competitorAnalysis: compAnalysis,
      googleAdsAudit: gadsAudit
        ? {
            slug: (gadsAudit as any).slug,
            pin: (gadsAudit as any).presentationPin,
            businessName: (gadsAudit as any).businessName,
            overallScore: (gadsAudit as any).overallScore,
            createdAt: (gadsAudit as any).createdAt,
          }
        : null,
    });
  }

  // No match
  return NextResponse.json({ ok: false }, { status: 401 });
}
