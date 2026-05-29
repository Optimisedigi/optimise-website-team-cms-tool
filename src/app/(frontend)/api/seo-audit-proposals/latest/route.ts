import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Returns the latest SEO Audit Proposal run for a client or proposal, including
 * the stored report so the Client-doc "View" + "Copy Email" buttons can act on
 * it without the report being part of the Client form.
 *
 * Query: ?clientId=<id> OR ?proposalId=<id>
 */
export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  const proposalId = req.nextUrl.searchParams.get("proposalId");
  if (!clientId && !proposalId) {
    return NextResponse.json({ error: "clientId or proposalId is required" }, { status: 400 });
  }

  const where = clientId
    ? { client: { equals: Number(clientId) } }
    : { proposal: { equals: Number(proposalId) } };

  try {
    let result = await payload.find({
      collection: "seo-audit-proposals",
      where: where as any,
      sort: "-createdAt",
      limit: 1,
      overrideAccess: true,
    });

    // If a proposal was manually linked on the Client/Client Proposal record before
    // the reverse relationship was populated, still surface that linked run.
    if (result.docs.length === 0 && clientId) {
      const client = await payload.findByID({ collection: "clients", id: Number(clientId), overrideAccess: true });
      const linked = Array.isArray((client as any).seoAuditProposals)
        ? (client as any).seoAuditProposals[0]
        : null;
      const linkedId = typeof linked === "object" && linked ? linked.id : linked;
      if (linkedId) {
        const doc = await payload.findByID({ collection: "seo-audit-proposals", id: linkedId, overrideAccess: true });
        result = { docs: [doc] } as typeof result;
      }
    }

    if (result.docs.length === 0 && proposalId) {
      const proposal = await payload.findByID({ collection: "client-proposals", id: Number(proposalId), overrideAccess: true });
      const linked = (proposal as any).seoAuditProposal;
      const linkedId = typeof linked === "object" && linked ? linked.id : linked;
      if (linkedId) {
        const doc = await payload.findByID({ collection: "seo-audit-proposals", id: linkedId, overrideAccess: true });
        result = { docs: [doc] } as typeof result;
      }
    }

    const doc = result.docs[0];
    if (!doc) return NextResponse.json({ found: false });

    const d = doc as any;
    return NextResponse.json({
      found: true,
      id: d.id,
      reportSlug: d.reportSlug ?? null,
      status: d.status ?? null,
      websiteUrl: d.websiteUrl ?? null,
      report: d.report ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch latest run" }, { status: 500 });
  }
}
