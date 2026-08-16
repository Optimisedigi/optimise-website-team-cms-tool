import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { renderDomainInstructions } from "@/lib/landing-domain-instructions";

export const dynamic = "force-dynamic";

/**
 * GET /api/landing-admin/domains/[id]/instructions
 *
 * The copy-paste client email for one domain mapping, rendered from the DNS
 * record cached at registration time — no Vercel call, so it works even when
 * VERCEL_TOKEN is missing or Vercel is down.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const domain = await payload
    .findByID({ collection: "landing-domains", id, depth: 0, overrideAccess: true })
    .catch(() => null);
  if (!domain) return NextResponse.json({ error: "Unknown domain" }, { status: 404 });

  if (!domain.dnsRecordType || !domain.dnsRecordName || !domain.dnsRecordValue) {
    return NextResponse.json(
      { error: "No DNS record cached for this domain; re-register it to refresh from Vercel" },
      { status: 409 },
    );
  }

  const text = renderDomainInstructions({
    hostname: String(domain.hostname),
    dnsRecordType: String(domain.dnsRecordType),
    dnsRecordName: String(domain.dnsRecordName),
    dnsRecordValue: String(domain.dnsRecordValue),
    verificationTxt: domain.verificationTxt ? String(domain.verificationTxt) : null,
  });

  return new NextResponse(text, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
