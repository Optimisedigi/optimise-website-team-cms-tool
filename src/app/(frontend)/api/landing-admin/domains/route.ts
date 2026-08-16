import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  addProjectDomain,
  getDomainConfig,
  isValidHostname,
  vercelConfigured,
  DEFAULT_VERCEL_PROJECT,
} from "@/lib/vercel-domains";
import { deriveDnsRecord, renderDomainInstructions } from "@/lib/landing-domain-instructions";

export const dynamic = "force-dynamic";

/**
 * POST /api/landing-admin/domains
 *
 * Attach a custom hostname to the landing Vercel project and store the
 * mapping with the exact DNS record the client must create.
 *
 * Body: { propertyId: number|string, hostname: string, pathHint?: string }
 *
 * Payload admin session only. Fails closed with 503 when VERCEL_TOKEN is
 * absent rather than storing a mapping whose DNS record was never derived.
 */
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!vercelConfigured()) {
    return NextResponse.json({ error: "VERCEL_TOKEN is not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    propertyId?: unknown;
    hostname?: unknown;
    pathHint?: unknown;
  } | null;

  const hostname = String(body?.hostname ?? "").trim().toLowerCase();
  if (!isValidHostname(hostname)) {
    return NextResponse.json(
      { error: "hostname must be a bare lowercase hostname like hire.example.com" },
      { status: 400 },
    );
  }

  const propertyId = body?.propertyId;
  if (propertyId === undefined || propertyId === null || propertyId === "") {
    return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
  }

  const property = await payload
    .findByID({ collection: "landing-properties", id: String(propertyId), depth: 0, overrideAccess: true })
    .catch(() => null);
  if (!property) return NextResponse.json({ error: "Unknown property" }, { status: 404 });

  const added = await addProjectDomain(DEFAULT_VERCEL_PROJECT, hostname);
  if (!added.ok) {
    return NextResponse.json({ error: added.error ?? "Vercel refused the domain" }, { status: added.status });
  }

  const domainConfig = await getDomainConfig(hostname, DEFAULT_VERCEL_PROJECT);
  const record = deriveDnsRecord(hostname, domainConfig.recommendedCNAME);
  if (!record) {
    return NextResponse.json(
      { error: "Vercel returned no CNAME target for this hostname; cannot produce instructions" },
      { status: 502 },
    );
  }

  const verificationTxt = added.verification.find((v) => v.type === "TXT")?.value ?? "";
  const status = added.verified && !domainConfig.misconfigured ? "live" : "pending-dns";

  const data = {
    property: property.id,
    hostname,
    vercelProjectId: DEFAULT_VERCEL_PROJECT,
    status: status as "pending-dns" | "live",
    dnsRecordType: record.type,
    dnsRecordName: record.name,
    dnsRecordValue: record.value,
    verificationTxt,
    lastCheckedAt: new Date().toISOString(),
    pathHint: typeof body?.pathHint === "string" ? body.pathHint.slice(0, 120) : "",
  };

  // Re-registering an existing hostname updates the row rather than failing,
  // so a mapping can always be refreshed from Vercel's current answer.
  const existing = await payload.find({
    collection: "landing-domains",
    where: { hostname: { equals: hostname } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });

  const doc = existing.docs[0]
    ? await payload.update({ collection: "landing-domains", id: existing.docs[0].id, data, overrideAccess: true })
    : await payload.create({ collection: "landing-domains", data, overrideAccess: true });

  return NextResponse.json(
    {
      domain: {
        id: doc.id,
        hostname,
        status: doc.status,
        dnsRecordType: record.type,
        dnsRecordName: record.name,
        dnsRecordValue: record.value,
        verificationTxt: verificationTxt || null,
      },
      instructions: renderDomainInstructions({
        hostname,
        dnsRecordType: record.type,
        dnsRecordName: record.name,
        dnsRecordValue: record.value,
        verificationTxt,
      }),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
