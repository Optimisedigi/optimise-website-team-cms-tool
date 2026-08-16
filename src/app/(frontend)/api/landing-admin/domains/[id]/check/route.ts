import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getDomainConfig, vercelConfigured } from "@/lib/vercel-domains";

export const dynamic = "force-dynamic";

/**
 * POST /api/landing-admin/domains/[id]/check
 *
 * Re-ask Vercel whether the client's DNS now points at the project. When it
 * does, flip the mapping to `live` and idempotently append
 * `https://{hostname}` to the owning property's allowedOrigins — the step
 * that was previously manual and previously forgotten, which left production
 * refusing every real visitor.
 *
 * The appended origin is constrained to exactly the https form of a hostname
 * that has just passed Vercel's own configuration check, and the append is
 * recorded in the domain's auditLog.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!vercelConfigured()) {
    return NextResponse.json({ error: "VERCEL_TOKEN is not configured" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const domain = await payload
    .findByID({ collection: "landing-domains", id, depth: 0, overrideAccess: true })
    .catch(() => null);
  if (!domain) return NextResponse.json({ error: "Unknown domain" }, { status: 404 });

  const result = await getDomainConfig(String(domain.hostname), String(domain.vercelProjectId));
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Vercel check failed" }, { status: result.status });
  }

  const now = new Date().toISOString();
  let status = domain.status;
  let originAdded = false;

  if (!result.misconfigured) {
    status = "live";

    const propertyId =
      typeof domain.property === "object" && domain.property !== null
        ? (domain.property as { id: unknown }).id
        : domain.property;
    const property = await payload
      .findByID({ collection: "landing-properties", id: String(propertyId), depth: 0, overrideAccess: true })
      .catch(() => null);

    if (property) {
      const origin = `https://${domain.hostname}`;
      const origins = Array.isArray(property.allowedOrigins) ? property.allowedOrigins : [];
      if (!origins.some((row) => (row as { origin?: unknown }).origin === origin)) {
        await payload.update({
          collection: "landing-properties",
          id: property.id,
          data: { allowedOrigins: [...origins, { origin }] },
          overrideAccess: true,
        });
        originAdded = true;
      }
    }
  }

  await payload.update({
    collection: "landing-domains",
    id: domain.id,
    data: {
      status: status as "pending-dns" | "pending-ssl" | "live" | "error",
      lastCheckedAt: now,
      ...(originAdded
        ? {
            auditLog: `${domain.auditLog ? `${domain.auditLog}\n` : ""}${now}: DNS verified by Vercel; appended https://${domain.hostname} to property allowedOrigins.`,
          }
        : {}),
    },
    overrideAccess: true,
  });

  return NextResponse.json(
    {
      id: domain.id,
      hostname: domain.hostname,
      status,
      misconfigured: result.misconfigured,
      configuredBy: result.configuredBy,
      originAdded,
      lastCheckedAt: now,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
